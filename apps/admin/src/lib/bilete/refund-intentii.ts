import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { getPayment, getRefund, refundPayment, MaibError } from '@/lib/maib/client';
import { deciziaRefund } from '@/lib/maib/refund-decizie';
import {
  baniiAuAjuns, clasificaUrma, deciziaVerificare, decizieRefundStrain, dupaRefundStrain, LINISTE_DUPA_TRIMITERE_MS, pasul,
  pauzaDupaRefuz, poateTrimite, RECITIRE_BLOCATA_MS, RECITIRE_NECLAR_MS, refuzClarMaib, STARI_INCHISE, TERMEN_REVENDICARE_S,
  urmaBanca, VERIFICARE_CREAT_MS, INCERCARI_MAX, type StareIntentie, type UrmaBanca,
} from './refund-intentii-reguli';

// Workerul intenției de refund (migr. 558; dezbaterea Claude ⇄ Codex 10.10.2026: N2 + C3 + Codex C1). Ion, 10.10.2026:
// «dispecer nu va fi» — banii se întorc singuri, oricine a pornit returnarea (anularea din bot / site / panou / sistem,
// plata târzie). Intenția e scrisă în tranzacția anulării; de aici:
//   revendicata        → getPayment (urma de bază + verificări) → «trimisa_necunoscut» ÎNAINTE de POST → refundPayment →
//                        «creata» (refund_id) | «refuzata» (refuz clar, pauză, apoi din nou) | rămâne necunoscută;
//   trimisa_necunoscut → după 10 min de liniște, getPayment: urma are suma → «creata»; nicio mișcare → «de_trimis» (abia
//                        acum se poate retrimite); mișcare parțială → nimic automat, vizibilă și recitită;
//   creata             → getRefund (sau urma, fără id): Accepted → finalizarea tuturor membrilor în «returnata»;
//                        Rejected → «refuzata» DOAR dacă banca arată zero mișcare (altfel «blocata»);
//                        Manual → «blocata» (revizia 10.10, H2): nicio retrimitere, recitit la 6 h, o alertă;
//   blocata (refund_id)→ doar citire: Accepted → finalizare; altfel rămâne blocată.
// Revizia 10.10 (H1): înaintea POST-ului se caută un refund străin pe plată (codul vechi, în fereastra migrație → deploy,
// trimite singur): același refund → preluat («creata» cu id-ul lui); bani străini nepotriviți → «blocata»; marcaj vechi
// fără id → se așteaptă liniștea, apoi zero mișcare la bancă = se poate trimite.
// Orice scriere de aici e condiționată de revendicarea curentă (revendicare_id): un worker întârziat nu strică nimic.

interface Intentie {
  id: string;
  checkout_id: string;
  comenzi: string[];
  suma: number;
  motiv: string;
  origine: string;
  stare: StareIntentie;
  revendicare_id: string | null;
  incercari: number;
  refund_id: string | null;
  suma_estimata?: boolean;
  banca_returnat: number | null;
  banca_cerut: number | null;
  banca_returnabil: number | null;
  trimisa_la: string | null;
  creata_la: string;
}

export interface RezultatIntentie {
  stare: StareIntentie | 'ocupata';
  refundId?: string | null;
  motiv?: string;
  incercari?: number;
}

const acum = () => new Date().toISOString();
const peste = (ms: number) => new Date(Date.now() + ms).toISOString();

async function revendica(id: string): Promise<Intentie | null> {
  const { data, error } = await getSupabase().rpc('bilete_refund_revendica', { p_id: id, p_termen_s: TERMEN_REVENDICARE_S });
  if (error) throw new Error(`bilete_refund_revendica: ${error.message}`);
  const r = (Array.isArray(data) ? data[0] : data) as Intentie | null;
  return r && r.id ? { ...r, suma: Number(r.suma) } : null;
}

/** Scriere condiționată de revendicarea curentă; false = altcineva a preluat-o între timp. */
async function scrie(i: Intentie, upd: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await getSupabase().from('bilete_refund_intentii').update({ ...upd, actualizata_la: acum() })
    .eq('id', i.id).eq('revendicare_id', i.revendicare_id as string).select('id');
  if (error) throw new Error(`bilete_refund_intentii: ${error.message}`);
  return Boolean(data && data.length);
}

/** Eliberează revendicarea, păstrând starea; `dupaMs` = când se poate relua. */
async function elibereaza(i: Intentie, dupaMs: number, eroare?: string): Promise<void> {
  await scrie(i, { revendicare_id: null, revendicata_pana: null, urmatoarea_la: peste(dupaMs), ...(eroare ? { ultima_eroare: eroare.slice(0, 500) } : {}) });
}

async function alertaOData(i: Intentie, tip: 'refund_respins' | 'refund_necunoscut', detalii: string): Promise<void> {
  const db = getSupabase();
  const marcaj = `intentia ${i.id}:`;
  const { data } = await db.from('bilete_alerte').select('id').eq('comanda_id', i.comenzi[0]).eq('tip', tip).like('detalii', `${marcaj}%`).limit(1);
  if (data && data.length) return;
  await db.from('bilete_alerte').insert({ comanda_id: i.comenzi[0], tip, detalii: `${marcaj} ${detalii}`.slice(0, 1000) });
}

/** Copia stării pe rândul plății (/plati, botul — stareRetur — și verificările din SQL o citesc de acolo). */
async function oglindaPlata(checkoutId: string, upd: Record<string, unknown>): Promise<void> {
  const { error } = await getSupabase().from('maib_checkouts').update({ ...upd, updated_at: acum() }).eq('checkout_id', checkoutId);
  if (error) console.error('[refund-intentii] maib_checkouts:', error.message);
}

// L1 (revizia 10.10): 429/408 nu sunt refuzuri clare — rezultat necunoscut, împăcare și pauză; comanda nu se reactivează.
const refuzClar = (e: unknown) => e instanceof MaibError && refuzClarMaib(e.status);
const mesaj = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function refuza(i: Intentie, motiv: string, incercari: number): Promise<RezultatIntentie> {
  const pauza = pauzaDupaRefuz(incercari);
  const ok = await scrie(i, {
    stare: 'refuzata', incercari, revendicare_id: null, revendicata_pana: null, ultima_eroare: motiv.slice(0, 500),
    urmatoarea_la: pauza == null ? 'infinity' : peste(pauza),
  });
  if (ok) {
    await oglindaPlata(i.checkout_id, { refund_status: 'Rejected' });
    if (pauza == null) {
      await alertaOData(i, 'refund_respins', `banca refuză returnarea a ${i.suma} lei după ${incercari} încercări (${motiv}); intenția e blocată în /bilete → «Returnări de bani»`);
    }
  }
  return { stare: 'refuzata', motiv, incercari };
}

/**
 * H1/H2 (revizia 10.10): nimic automat — fără retrimitere. Cu refund la bancă (Manual) se recitește rar (doar citire);
 * fără (refund străin nepotrivit) rămâne până la «Reîncearcă» din /bilete. Vizibilă în «Returnări de bani în curs»,
 * o alertă pe intenție.
 */
async function blocheaza(i: Intentie, motiv: string, refundId: string | null, extra: Record<string, unknown> = {}): Promise<RezultatIntentie> {
  // Fără refund-ul nostru la bancă: «infinity» = nicio revendicare (SQL) până la «Reîncearcă»; refund_id-ul vechi (al unei
  // încercări refuzate) rămâne, ca să fie recunoscut în continuare drept al nostru.
  const ok = await scrie(i, {
    stare: 'blocata', ...(refundId ? { refund_id: refundId } : {}), revendicare_id: null, revendicata_pana: null,
    ultima_eroare: motiv.slice(0, 500), urmatoarea_la: refundId ? peste(RECITIRE_BLOCATA_MS) : 'infinity', ...extra,
  });
  if (ok) await alertaOData(i, refundId ? 'refund_respins' : 'refund_necunoscut', `${i.suma} lei: ${motiv}; nu se retrimite nimic automat — intenția e blocată în /bilete → «Returnări de bani în curs»`);
  return { stare: 'blocata', refundId, motiv };
}

/** Preia refund-ul găsit la bancă (al fluxului vechi): «creata» cu id-ul lui; workerul doar îl urmărește. */
async function adopta(i: Intentie, refundId: string, baza: UrmaBanca): Promise<RezultatIntentie> {
  const ok = await scrie(i, {
    stare: 'creata', refund_id: refundId, revendicare_id: null, revendicata_pana: null, urmatoarea_la: acum(),
    banca_returnat: baza.returnat, banca_cerut: baza.cerut, banca_returnabil: baza.returnabil,
    ultima_eroare: `refund-ul ${refundId} există deja la bancă (alt mecanism): preluat, nu se retrimite`,
  });
  return ok ? { stare: 'creata', refundId } : { stare: 'ocupata' };
}

/** Ce știm noi despre plată: refund_id-urile intențiilor, dacă am trimis vreodată, suma pe care banca o poate arăta. */
async function intentiileNoastre(i: Intentie): Promise<{ noastre: Set<string>; atinsa: boolean; cunoscut: number }> {
  const { data, error } = await getSupabase().from('bilete_refund_intentii').select('id, stare, suma, refund_id, incercari, trimisa_la')
    .eq('checkout_id', i.checkout_id);
  if (error) throw new Error(`bilete_refund_intentii: ${error.message}`);
  const rows = (data || []) as { id: string; stare: StareIntentie; suma: number; refund_id: string | null; incercari: number; trimisa_la: string | null }[];
  return {
    noastre: new Set(rows.map((r) => r.refund_id).filter((x): x is string => Boolean(x))),
    atinsa: rows.some((r) => r.incercari > 0 || r.trimisa_la != null || r.refund_id != null),
    cunoscut: rows.filter((r) => r.id !== i.id && ['creata', 'finalizata', 'finalizata_de_altul', 'blocata'].includes(r.stare))
      .reduce((a, r) => a + Number(r.suma), 0),
  };
}

async function trimite(i: Intentie): Promise<RezultatIntentie> {
  const db = getSupabase();
  const { data: ck } = await db.from('maib_checkouts').select('checkout_id, payment_id, amount, refund_id, refund_status, updated_at').eq('checkout_id', i.checkout_id).maybeSingle();
  if (!ck?.payment_id) return refuza(i, 'plata nu are paymentId la maib', i.incercari + 1);
  let p;
  try { p = await getPayment(ck.payment_id); } catch (e) {
    // Nimic trimis: se reia; o eroare de citire nu e un refuz.
    await scrie(i, { stare: 'de_trimis', revendicare_id: null, revendicata_pana: null, urmatoarea_la: peste(5 * 60_000), ultima_eroare: `getPayment: ${mesaj(e)}`.slice(0, 500) });
    return { stare: 'de_trimis', motiv: mesaj(e) };
  }
  const baza = urmaBanca(p);
  // H1: refund străin pe plată (fluxul vechi, în fereastra migrație → deploy)? Niciodată a doua trimitere peste el.
  const noi = await intentiileNoastre(i);
  const st = decizieRefundStrain({
    marcaj: { refundId: (ck.refund_id as string | null) ?? null, refundStatus: (ck.refund_status as string | null) ?? null, actualizatMs: Date.parse(String(ck.updated_at ?? '')) || 0 },
    noastre: noi.noastre, atinsa: noi.atinsa, cunoscut: noi.cunoscut, urma: baza, sumaPlatii: Number(ck.amount ?? p.amount), suma: i.suma, nowMs: Date.now(),
  });
  if (st.fel === 'adopta') return adopta(i, st.refundId, baza);
  if (st.fel === 'blocheaza') return blocheaza(i, st.motiv, null);
  if (st.fel === 'asteapta') {
    await scrie(i, { stare: 'de_trimis', revendicare_id: null, revendicata_pana: null, urmatoarea_la: peste(st.ms), ultima_eroare: 'pe plată e un refund vechi în curs (fără id): se așteaptă liniștea, apoi împăcarea' });
    return { stare: 'de_trimis' };
  }
  if (st.fel === 'verifica_strain') {
    let r;
    try { r = await getRefund(st.refundId); } catch (e) {
      await scrie(i, { stare: 'de_trimis', revendicare_id: null, revendicata_pana: null, urmatoarea_la: peste(5 * 60_000), ultima_eroare: `getRefund (străin): ${mesaj(e)}`.slice(0, 500) });
      return { stare: 'de_trimis', motiv: mesaj(e) };
    }
    const d = dupaRefundStrain({ status: r.status, amount: r.amount == null ? null : Number(r.amount) }, i.suma);
    if (d === 'adopta') return adopta(i, st.refundId, baza);
    if (d === 'blocheaza') return blocheaza(i, `pe plată e refund-ul ${st.refundId} (${r.status}, ${r.amount} lei), care nu e al acestei intenții`, null);
  }
  const v = poateTrimite(p, i.suma);
  if (!v.ok) return refuza(i, v.motiv, i.incercari + 1);
  const incercari = i.incercari + 1;
  // ÎNAINTE de POST: de aici încolo, orice întrerupere duce la împăcare, nu la retrimitere.
  const marcat = await scrie(i, {
    stare: 'trimisa_necunoscut', incercari, trimisa_la: acum(), urmatoarea_la: peste(LINISTE_DUPA_TRIMITERE_MS),
    banca_returnat: baza.returnat, banca_cerut: baza.cerut, banca_returnabil: baza.returnabil, ultima_eroare: null,
  });
  if (!marcat) return { stare: 'ocupata' };
  try {
    const r = await refundPayment(ck.payment_id, i.suma, i.motiv);
    await scrie(i, { stare: 'creata', refund_id: r.refundId, revendicare_id: null, revendicata_pana: null, urmatoarea_la: peste(2 * 60_000) });
    await oglindaPlata(i.checkout_id, { refund_id: r.refundId, refund_status: r.status, refund_reason: i.motiv.slice(0, 500) });
    return { stare: 'creata', refundId: r.refundId, incercari };
  } catch (e) {
    if (refuzClar(e)) return refuza(i, mesaj(e), incercari);
    await elibereaza(i, LINISTE_DUPA_TRIMITERE_MS, `refundPayment fără răspuns clar: ${mesaj(e)}`);
    await oglindaPlata(i.checkout_id, { refund_status: 'Necunoscut' });
    return { stare: 'trimisa_necunoscut', motiv: mesaj(e), incercari };
  }
}

function bazaIntentiei(i: Intentie): UrmaBanca {
  return { returnat: Number(i.banca_returnat ?? 0), cerut: Number(i.banca_cerut ?? 0), returnabil: i.banca_returnabil == null ? null : Number(i.banca_returnabil) };
}

async function impaca(i: Intentie): Promise<RezultatIntentie> {
  const trimisa = i.trimisa_la ? Date.parse(i.trimisa_la) : 0;
  if (Date.now() < trimisa + LINISTE_DUPA_TRIMITERE_MS) {
    await elibereaza(i, trimisa + LINISTE_DUPA_TRIMITERE_MS - Date.now());
    return { stare: 'trimisa_necunoscut' };
  }
  const { data: ck } = await getSupabase().from('maib_checkouts').select('payment_id').eq('checkout_id', i.checkout_id).maybeSingle();
  if (!ck?.payment_id) { await elibereaza(i, RECITIRE_NECLAR_MS, 'plata fără paymentId'); return { stare: 'trimisa_necunoscut' }; }
  let p;
  try { p = await getPayment(ck.payment_id); } catch (e) { await elibereaza(i, 5 * 60_000, `getPayment: ${mesaj(e)}`); return { stare: 'trimisa_necunoscut' }; }
  const cls = clasificaUrma(bazaIntentiei(i), urmaBanca(p), i.suma);
  if (cls === 'exista') {
    // Refund-ul există la bancă (fără id la noi): nu se retrimite; se verifică imediat.
    await scrie(i, { stare: 'creata', urmatoarea_la: acum() });
    return verifica({ ...i, stare: 'creata' });
  }
  if (cls === 'lipseste') {
    if (i.incercari >= INCERCARI_MAX) return refuza(i, 'banca n-a înregistrat refund-ul după toate încercările', i.incercari);
    await scrie(i, { stare: 'de_trimis', revendicare_id: null, revendicata_pana: null, urmatoarea_la: acum(), ultima_eroare: 'banca n-are urmă după 10 min: se retrimite' });
    return { stare: 'de_trimis' };
  }
  await elibereaza(i, RECITIRE_NECLAR_MS, `urmă parțială la bancă (returnat ${p.refundedAmount ?? 0}, cerut ${p.requestedRefundAmount ?? 0}); nu se retrimite`);
  await alertaOData(i, 'refund_necunoscut', `urma băncii nu se potrivește cu ${i.suma} lei; nu se retrimite, se recitește din oră în oră`);
  return { stare: 'trimisa_necunoscut', motiv: 'neclar' };
}

async function finalizeaza(i: Intentie, paymentId: string | null, sumaBanca: number | null = null): Promise<RezultatIntentie> {
  // Importul din fluxul vechi (558) are suma estimată: se scrie cea confirmată de bancă.
  const { error } = await getSupabase().rpc('bilete_refund_finalizeaza', { p_id: i.id, p_revendicare: i.revendicare_id, p_suma: i.suma_estimata ? sumaBanca : null });
  if (error) throw new Error(`bilete_refund_finalizeaza: ${error.message}`);
  const upd: Record<string, unknown> = { refund_status: 'Accepted' };
  if (paymentId) {
    const p = await getPayment(paymentId).catch(() => null);
    if (p) { upd.refunded_amount = Number(p.refundedAmount ?? 0); upd.payment_status = p.status; }
  }
  await oglindaPlata(i.checkout_id, upd);
  return { stare: 'finalizata', refundId: i.refund_id };
}

async function verifica(i: Intentie): Promise<RezultatIntentie> {
  const { data: ck } = await getSupabase().from('maib_checkouts').select('payment_id').eq('checkout_id', i.checkout_id).maybeSingle();
  const paymentId = (ck?.payment_id as string | null) ?? null;
  if (i.refund_id) {
    let r;
    try { r = await getRefund(i.refund_id); } catch (e) { await elibereaza(i, 5 * 60_000, `getRefund: ${mesaj(e)}`); return { stare: 'creata' }; }
    const d = deciziaRefund(r.status);
    const sumaBanca = r.amount == null ? null : Number(r.amount);
    if (d === 'returnata') return finalizeaza(i, paymentId, sumaBanca);
    // H2 (revizia 10.10): Manual = banca lucrează de mână, banii pot încă pleca → «blocata», fără retrimitere.
    // Rejected → retrimitere doar dacă banca arată zero mișcare față de urma de dinaintea POST-ului (ca la împăcare).
    let urmaAcum: UrmaBanca | null = null;
    if (d === 'respins' && paymentId) urmaAcum = await getPayment(paymentId).then(urmaBanca).catch(() => null);
    const v = deciziaVerificare(r.status, bazaIntentiei(i), urmaAcum, i.suma);
    if (v === 'refuza') return refuza(i, `maib: refund ${i.refund_id} ${r.status}`, i.incercari);
    if (v === 'blocheaza') {
      await oglindaPlata(i.checkout_id, { refund_status: r.status });
      return blocheaza(i, d === 'manual' ? `maib: refund ${i.refund_id} în «Manual» (procesare de mână la bancă)` : `maib: refund ${i.refund_id} ${r.status}, dar banca arată mișcare pe plată`, i.refund_id);
    }
    await elibereaza(i, i.stare === 'blocata' ? RECITIRE_BLOCATA_MS : VERIFICARE_CREAT_MS);
    await oglindaPlata(i.checkout_id, { refund_status: r.status });
    return { stare: i.stare, refundId: i.refund_id };
  }
  if (!paymentId) { await elibereaza(i, RECITIRE_NECLAR_MS); return { stare: 'creata' }; }
  let p;
  try { p = await getPayment(paymentId); } catch (e) { await elibereaza(i, 5 * 60_000, `getPayment: ${mesaj(e)}`); return { stare: 'creata' }; }
  if (baniiAuAjuns(bazaIntentiei(i), urmaBanca(p), i.suma)) return finalizeaza(i, paymentId);
  await elibereaza(i, VERIFICARE_CREAT_MS);
  return { stare: 'creata' };
}

/**
 * Un pas pentru intenția dată (cel mult o trimitere la bancă). Sigur de chemat de oricâte ori și din oricâte locuri
 * (anularea, callback-ul, cron-ul, butonul din panou): revendicarea din SQL lasă un singur worker.
 */
export async function proceseazaIntentia(id: string): Promise<RezultatIntentie> {
  const i = await revendica(id);
  if (!i) {
    const { data } = await getSupabase().from('bilete_refund_intentii').select('stare, refund_id, ultima_eroare, incercari').eq('id', id).maybeSingle();
    return data ? { stare: data.stare as StareIntentie, refundId: data.refund_id, motiv: data.ultima_eroare ?? undefined, incercari: data.incercari } : { stare: 'ocupata' };
  }
  try {
    switch (pasul(i.stare)) {
      case 'trimite': return await trimite(i);
      case 'impaca': return await impaca(i);
      case 'verifica': return await verifica(i);
      default: return { stare: i.stare };
    }
  } catch (e) {
    // Eroare neprevăzută (baza): starea rămâne cum e, revendicarea se eliberează, cron-ul reia.
    await elibereaza(i, 5 * 60_000, mesaj(e)).catch(() => undefined);
    throw e;
  }
}

/** Intențiile unei plăți (butonul «Verifică refund-ul», callback-ul): le aduce la rând acum și face câte un pas. */
export async function proceseazaIntentiilePlatii(checkoutId: string, opt: { grabeste?: boolean } = {}): Promise<RezultatIntentie[]> {
  const db = getSupabase();
  if (opt.grabeste) {
    // Fără cele blocate (pauză «infinity») și fără liniștea de după un POST necunoscut (impaca o respectă oricum).
    await db.from('bilete_refund_intentii').update({ urmatoarea_la: acum() }).eq('checkout_id', checkoutId)
      .in('stare', ['de_trimis', 'creata', 'trimisa_necunoscut', 'blocata']).neq('urmatoarea_la', 'infinity');
  }
  const { data } = await db.from('bilete_refund_intentii').select('id').eq('checkout_id', checkoutId)
    .not('stare', 'in', `(${STARI_INCHISE.join(',')})`).order('creata_la');
  const rez: RezultatIntentie[] = [];
  for (const r of (data || []) as { id: string }[]) rez.push(await proceseazaIntentia(r.id));
  return rez;
}

/** Coada pentru cron (împăcarea): intențiile scadente, cele mai vechi întâi. */
export async function intentiiScadente(limita: number): Promise<string[]> {
  const { data, error } = await getSupabase().from('bilete_refund_intentii').select('id')
    .not('stare', 'in', `(${STARI_INCHISE.join(',')})`).lte('urmatoarea_la', acum())
    .or(`revendicata_pana.is.null,revendicata_pana.lt.${acum()}`)
    .order('urmatoarea_la').limit(limita);
  if (error) throw new Error(`bilete_refund_intentii: ${error.message}`);
  return ((data || []) as { id: string }[]).map((x) => x.id);
}

export interface IntentieVizibila {
  id: string; checkout_id: string; comenzi: string[]; suma: number; motiv: string; origine: string; stare: StareIntentie;
  incercari: number; refund_id: string | null; ultima_eroare: string | null; urmatoarea_la: string; creata_la: string;
}

/** Ce vede Ion în /bilete: intențiile încă nefinalizate (în curs, refuzate, blocate). */
export async function intentiiDeschise(limita = 50): Promise<IntentieVizibila[]> {
  const { data } = await getSupabase().from('bilete_refund_intentii')
    .select('id, checkout_id, comenzi, suma, motiv, origine, stare, incercari, refund_id, ultima_eroare, urmatoarea_la, creata_la')
    .not('stare', 'in', `(${STARI_INCHISE.join(',')})`).order('creata_la', { ascending: false }).limit(limita);
  return ((data || []) as IntentieVizibila[]).map((x) => ({ ...x, suma: Number(x.suma) }));
}

/**
 * Butonul «Reîncearcă acum» (după răspunsul maib la D6 sau după o pauză): intențiile refuzate; și cele blocate de un refund
 * străin (fără refund_id) — trimiterea refăce verificarea H1, deci nu pleacă nimic dacă urma străină e încă acolo. Cele
 * blocate în «Manual» (cu refund_id) doar se recitesc acum.
 */
export async function reincearcaIntentia(id: string): Promise<RezultatIntentie> {
  const db = getSupabase();
  await db.from('bilete_refund_intentii').update({ urmatoarea_la: acum(), actualizata_la: acum() }).eq('id', id).eq('stare', 'refuzata');
  await db.from('bilete_refund_intentii').update({ stare: 'de_trimis', urmatoarea_la: acum(), actualizata_la: acum() }).eq('id', id).eq('stare', 'blocata').eq('urmatoarea_la', 'infinity');
  await db.from('bilete_refund_intentii').update({ urmatoarea_la: acum(), actualizata_la: acum() }).eq('id', id).eq('stare', 'blocata');
  return proceseazaIntentia(id);
}
