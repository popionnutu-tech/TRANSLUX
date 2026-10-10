import 'server-only';
import type { BileteComanda } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { elibereazaRefund, executaRefund, revendicaRefund } from '@/lib/maib/refund';
import { ComandaError } from './comenzi';
import { garantieActiva, inFereastraGarantiei, poateAnulaPasager } from './refund-reguli';
import { chisinauTodayIso } from '@/lib/chisinau-time';

// Anularea comenzii de bilete și returnarea banilor — O SINGURĂ funcție-EXECUTOR (ION-194), chemată de dispecer
// (/plati, apoi /bilete), de sistem (cursă anulată) și de AI-ul din botul Telegram (pasul 6b). Decizia DACĂ se
// returnează NU e aici: Ion (03.10): «validarea la refund doar prin Telegram și trebuie să dăm AI să decidă când se
// face refund — dacă întârzie clientul la rută, nu facem». Aici stau doar regulile tari, care nu se negociază:
// biletul scanat «urcat» nu se mai returnează (funcția din bază refuză), anulare doar pe toată comanda, iar pentru
// sursa «pasager»/«ai» rămâne limita de timp (app_config.bilete_anulare_pasager_min, implicit 120) ca plasă.
// NU există anulare publică de pe site.
//
// Ordinea: 1) comanda → «anulata» + biletele «anulat», atomic în bază (bilete_anuleaza, migr. 487);
//          2) revendicarea refund-ului pe checkout; 3) banca. Refuz EXPLICIT al băncii → comanda revine «platita»
//          (bilete_reactiveaza). Timeout/5xx → rămâne «anulata» + refund «Necunoscut» + alertă; împăcarea decide.

export type SursaAnulare = 'pasager' | 'admin' | 'sistem' | 'ai';

export { poateAnulaPasager };

/** Garanția de lansare (Ion, 07.10): activă cât app_config.bilete_garantie_100_pana >= azi (Chișinău). */
export async function garantieLansareActiva(): Promise<boolean> {
  const { data } = await getSupabase().from("app_config").select("value").eq("key", "bilete_garantie_100_pana").maybeSingle();
  return garantieActiva(data?.value as string | null, chisinauTodayIso());
}

async function minuteAnularePasager(): Promise<number> {
  const { data } = await getSupabase().from('app_config').select('value').eq('key', 'bilete_anulare_pasager_min').maybeSingle();
  const n = Number(data?.value);
  return Number.isFinite(n) && n >= 0 ? n : 240; // grila lui Ion (05.10): sub 4 h nu se restituie nimic
}

export interface RezultatAnulare {
  comanda: BileteComanda;
  /** `creat` = banca a acceptat cererea (se finalizează la «Verifică refund-ul» / împăcare); `necunoscut` = de împăcat. */
  refund: 'creat' | 'necunoscut' | 'fara_plata';
  refundId?: string;
  /** 546: suma fixată la anulare (poate fi grila − reducerea returului). */
  suma?: number;
}

export async function anuleazaSiReturneaza(
  comandaId: string,
  opt: {
    sursa: SursaAnulare; motiv: string;
    /** ION-244: suma din oferta botului (grila); OBLIGATORIE pentru sursa «ai», absentă = integral (admin/sistem). */
    suma?: number;
    /** ION-244: momentul validării ofertei în bază — «acum» pentru plasa de timp (fără a doua comparație pe alt ceas). */
    acumMs?: number;
    /** 546: anularea e din vina noastră (cursă anulată, greșeala firmei) → turul nu pierde reducerea dată returului. */
    vinaNoastra?: boolean;
    /** 546: anulează și returul cu reducere legat de acest tur (fiecare cu grila lui, fără scădere). */
    siReturul?: boolean;
    /** 546: suma după grilă pentru returul legat, când `siReturul` (absentă = integral). */
    sumaRetur?: number;
  },
): Promise<RezultatAnulare> {
  const db = getSupabase();
  const motiv = opt.motiv.trim();
  if (!motiv) throw new ComandaError('validare', 'motivul e obligatoriu');
  if (opt.sursa === 'ai' && !(opt.suma != null && opt.suma > 0)) throw new ComandaError('validare', 'returnarea din bot cere suma ofertei');

  const { data: c0, error: e0 } = await db.from('bilete_comenzi').select('*').eq('id', comandaId).maybeSingle();
  if (e0) throw new Error(`bilete_comenzi: ${e0.message}`);
  if (!c0) throw new ComandaError('validare', 'comandă inexistentă');
  const inainte = c0 as BileteComanda;
  if (inainte.status === 'anulata' || inainte.status === 'returnata') {
    return { comanda: inainte, refund: 'fara_plata' };
  }
  if (!(inainte.status === 'platita' || inainte.status === 'platita_fara_bilet')) {
    throw new ComandaError('validare', `comanda e ${inainte.status}, nu se poate anula`);
  }
  // 548: tur-returul plătit o dată (Ion, 10.10: «poate să facă returul doar până a începe cursa la tur») — se anulează doar
  // din tur, ambele bilete, într-un singur refund, până la plecarea turului; după, doar dispecerul cu «vina noastră».
  // Excepția (audit H2): cursa de retur anulată de firmă — returul singur, refund parțial pe plata turului.
  const returSingur = inainte.in_pachet === true && (opt.sursa === 'sistem' || (opt.sursa === 'admin' && opt.vinaNoastra === true));
  if (inainte.in_pachet && !returSingur) throw new ComandaError('inchis', 'biletul de retur din tur-retur se anulează doar împreună cu turul, din biletul tur (sau cu «vina noastră»)');
  const { data: rp } = await db.from('bilete_comenzi').select('id').eq('comanda_tur_id', comandaId).eq('in_pachet', true)
    .in('status', ['platita', 'platita_fara_bilet']).limit(1);
  const pachet = (rp || []).length > 0;
  if (pachet) {
    if (opt.sursa === 'ai' || opt.sursa === 'pasager') throw new ComandaError('inchis', 'tur-returul se anulează prin dispecer');
    if (Date.now() >= Date.parse(inainte.departure_at) && !(opt.sursa === 'admin' && opt.vinaNoastra) && opt.sursa !== 'sistem') {
      throw new ComandaError('inchis', 'tur-returul se poate anula doar până la plecarea cursei tur (după, doar cu «vina noastră»)');
    }
  }
  if (opt.sursa === 'pasager' || opt.sursa === 'ai') {
    const acum = opt.acumMs ?? Date.now();
    // Garanția de lansare (Ion, 07.10): biletul nefolosit se returnează și după plecare, până la plecare + 24 h;
    // «nefolosit» îl verifică bilete_anuleaza (BILET_URCAT), atomic.
    if (await garantieLansareActiva()) {
      if (!inFereastraGarantiei(inainte.departure_at, acum)) {
        throw new ComandaError('inchis', 'returnarea în garanția de lansare se cere cel târziu la 24 de ore după plecare; sună la dispecerat');
      }
    } else {
      const min = await minuteAnularePasager();
      if (!poateAnulaPasager(inainte.departure_at, acum, min)) {
        throw new ComandaError('inchis', `anularea online se poate face până cu ${min} de minute înaintea plecării; sună la dispecerat`);
      }
    }
  }

  // 1. Anularea, atomic, în bază (refuză dacă vreun bilet e urcat). 546: suma refund-ului se fixează în aceeași
  // tranzacție — turul cu un retur redus plătit pierde reducerea dată returului («doar turul»), afară de «vina noastră»
  // (sursa «sistem» = cursă anulată de firmă); «siReturul» anulează și returul, fiecare cu grila lui.
  const grila = opt.suma ?? Number(inainte.total);
  const { data: rez, error: e1 } = await db.rpc('bilete_anuleaza', {
    p_id: comandaId, p_sursa: opt.sursa, p_motiv: motiv, p_grila: grila,
    p_vina_noastra: opt.vinaNoastra ?? opt.sursa === 'sistem', p_si_returul: pachet || (opt.siReturul ?? false), p_grila_retur: opt.siReturul ? (opt.sumaRetur ?? null) : null,
  });
  if (e1) {
    if (/BILET_URCAT|RETUR_URCAT/.test(e1.message)) throw new ComandaError('inchis', 'un bilet din comandă (sau din returul legat) e deja scanat la urcare; nu se mai returnează');
    if (/STARE_/.test(e1.message)) throw new ComandaError('validare', 'comanda nu e într-o stare care se poate anula');
    if (/GRILA/.test(e1.message)) throw new ComandaError('validare', 'suma returnării nu e validă');
    throw new Error(`bilete_anuleaza: ${e1.message}`);
  }
  const randuri = (Array.isArray(rez) ? rez : []) as Array<{ id: string; suma: number | null; scazut?: number; deja?: boolean }>;
  // Altă cerere a anulat-o între citire și apel (dublu-clic, /plati + /bilete): ea trimite banii cu suma fixată de ea;
  // aici nu se trimite nimic, ca să nu plece grila întreagă peste suma cu reducerea scăzută (audit M1).
  if (randuri[0]?.deja) {
    const { data: cd } = await db.from('bilete_comenzi').select('*').eq('id', comandaId).single();
    return { comanda: (cd ?? inainte) as BileteComanda, refund: 'necunoscut' };
  }
  const { data: c1, error: eC } = await db.from('bilete_comenzi').select('*').eq('id', comandaId).single();
  if (eC) throw new Error(`bilete_comenzi: ${eC.message}`);
  const comanda = c1 as BileteComanda;
  const sumaTur = Number(randuri[0]?.suma ?? grila);
  if (returSingur) {
    const { data: t } = await db.from('bilete_comenzi').select('checkout_id').eq('id', inainte.comanda_tur_id!).single();
    return { ...(await returneazaBanii({ ...comanda, checkout_id: (t as { checkout_id: string | null } | null)?.checkout_id ?? null } as BileteComanda, motiv, sumaTur)), suma: sumaTur };
  }
  // 548: pachetul are o singură plată → un singur refund, cu suma ambelor rânduri, pe sesiunea turului.
  if (pachet) {
    const sumaPachet = randuri.reduce((a, r) => a + Number(r.suma ?? 0), 0);
    return { ...(await returneazaBanii(comanda, motiv, sumaPachet)), suma: sumaPachet };
  }
  // Returul anulat împreună cu turul: banii lui pe sesiunea lui (fără compensări între sesiuni).
  for (const r of randuri.slice(1)) {
    const { data: cr } = await db.from('bilete_comenzi').select('*').eq('id', r.id).single();
    if (cr) await returneazaBanii(cr as BileteComanda, `${motiv} (returul legat)`, Number(r.suma ?? 0)).catch(async (e: unknown) => {
      await db.from('bilete_alerte').insert({ comanda_id: r.id, tip: 'refund_necunoscut', detalii: `returul legat: ${e instanceof Error ? e.message : String(e)}` });
    });
  }
  if (opt.sursa === 'admin' && Date.parse(inainte.departure_at) < Date.now()) {
    await db.from('bilete_alerte').insert({ comanda_id: comandaId, tip: 'refund_pe_zi_confirmata', detalii: `refund de admin după plecarea cursei (${inainte.departure_at}): ${motiv}` });
  }

  return { ...(await returneazaBanii(comanda, motiv, sumaTur)), suma: sumaTur };
}

/** Marcajul alertei «refund-ul plății comune e deja folosit»: finalizeazaRefund nu marchează «returnata» comanda cu el. */
export const MARCAJ_PACHET_OCUPAT = 'PACHET_REFUND_OCUPAT';

/** Comanda împarte sesiunea maib cu alt bilet din tur-retur (ea e returul din pachet, sau turul are un retur în pachet). */
async function sesiuneComunaPachet(comanda: BileteComanda): Promise<boolean> {
  if (comanda.in_pachet) return true;
  const { count } = await getSupabase().from('bilete_comenzi').select('id', { count: 'exact', head: true })
    .eq('comanda_tur_id', comanda.id).eq('in_pachet', true);
  return (count ?? 0) > 0;
}

/**
 * Pașii 2–3 pentru o comandă deja anulată: revendicarea refund-ului, banca, iar la refuz reactivarea. `suma` = suma
 * fixată de bilete_anuleaza. 0 lei → nimic de trimis la bancă.
 */
async function returneazaBanii(comanda: BileteComanda, motiv: string, suma: number): Promise<RezultatAnulare> {
  const db = getSupabase();
  const comandaId = comanda.id;
  if (!(suma > 0)) {
    await db.from('bilete_comenzi').update({ refund_finalizat_la: new Date().toISOString() }).eq('id', comandaId).is('refund_finalizat_la', null);
    return { comanda, refund: 'fara_plata' };
  }
  // 2. Banii. Fără sesiune/plată (platita_fara_bilet fără legătură) → nu există ce returna automat.
  if (!comanda.checkout_id) {
    await db.from('bilete_alerte').insert({ comanda_id: comandaId, tip: 'refund_necunoscut', detalii: 'comanda anulată n-are sesiune maib legată; refund de mână' });
    return { comanda, refund: 'necunoscut' };
  }
  const { data: ck } = await db.from('maib_checkouts').select('checkout_id, payment_id, amount, refund_id, refund_status').eq('checkout_id', comanda.checkout_id).maybeSingle();
  if (!ck) throw new Error('sesiunea maib a comenzii lipsește din bază');
  if (ck.refund_id) {
    // Revizia 10.10 (H2): sesiunea unui tur-retur (548) e comună celor două bilete și ține un singur refund. Dacă returul
    // a fost deja returnat singur, refund-ul existent e al LUI — turul nu e «creat», banii lui trebuie trimiși de mână.
    // (O reluare a aceleiași anulări nu ajunge aici: comanda e deja «anulata» și anuleazaSiReturneaza iese mai devreme.)
    if (await sesiuneComunaPachet(comanda)) {
      await db.from('bilete_alerte').insert({
        comanda_id: comandaId, tip: 'refund_necunoscut',
        detalii: `${MARCAJ_PACHET_OCUPAT}: plata tur-retur are deja refund-ul ${ck.refund_id} (alt bilet din pachet); de returnat de mână ${suma} lei`,
      });
      return { comanda, refund: 'necunoscut' };
    }
    return { comanda, refund: 'creat', refundId: ck.refund_id }; // deja cerut (reluare)
  }

  const rev = await revendicaRefund(ck.checkout_id, motiv);
  if (rev.eroare) throw new Error(`revendicare refund: ${rev.eroare}`);
  if (!rev.ok) {
    // H2 (revizia, cursa rară): refund-ul plății comune e revendicat chiar acum de celălalt bilet din pachet → marcaj +
    // alertă, ca finalizarea să nu dea «returnata» acestei comenzi din refund-ul altuia.
    if (await sesiuneComunaPachet(comanda)) {
      await db.from('bilete_alerte').insert({
        comanda_id: comandaId, tip: 'refund_necunoscut',
        detalii: `${MARCAJ_PACHET_OCUPAT}: refund-ul plății tur-retur e în lucru pentru alt bilet din pachet; de returnat de mână ${suma} lei`,
      });
    }
    return { comanda, refund: 'necunoscut' }; // altcineva îl are în lucru chiar acum
  }

  const r = await executaRefund({ checkout_id: ck.checkout_id, payment_id: ck.payment_id, amount: Number(ck.amount) }, motiv, suma < Number(ck.amount) ? suma : undefined);
  if (r.fel === 'creat') return { comanda, refund: 'creat', refundId: r.refundId };
  if (r.fel === 'necunoscut') {
    await db.from('bilete_alerte').insert({ comanda_id: comandaId, tip: 'refund_necunoscut', detalii: r.motiv });
    return { comanda, refund: 'necunoscut' };
  }
  // 3. Refuz explicit: eliberăm revendicarea și readucem comanda (biletele redevin valide).
  await elibereazaRefund(ck.checkout_id);
  const { data: c2, error: e2 } = await db.rpc('bilete_reactiveaza', { p_id: comandaId });
  if (e2) {
    await db.from('bilete_alerte').insert({ comanda_id: comandaId, tip: 'refund_respins', detalii: `banca a refuzat (${r.motiv}) și reactivarea a eșuat: ${e2.message}` });
    throw new ComandaError('maib', `banca a refuzat returnarea (${r.motiv}); comanda a rămas anulată — dispecerul decide`);
  }
  void c2;
  throw new ComandaError('maib', `banca a refuzat returnarea: ${r.motiv}; biletele rămân valabile`);
}
