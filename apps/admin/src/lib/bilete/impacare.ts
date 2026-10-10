import 'server-only';
import type { BileteComanda } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { cancelCheckout, findCheckoutByOrderId } from '@/lib/maib/client';
import { sincronizeazaStare } from '@/lib/maib/sincronizare';
import { intentiiScadente, proceseazaIntentia } from './refund-intentii';
import { executaOferta } from './retur-bot';
import { leagaSesiuneExistenta, stareSoferCursa } from './comenzi';
import { emailConfigurat, trimiteEmailBilet } from './email';
import { smsRestante, trimiteSmsConfirmare } from './sms';
import { alertaBilete } from './alerte-tab';
import { ruleazaEchipajul, type RaportEchipaj } from './echipaj-job';
import { mesajAlerte, type AlertaPentruMesaj } from './alerte-mesaj';
import { alertaSesiuneNeinchisa, deciziaSesiune, INCERCARI_MAX, inFereastraFaraSofer, REFUND_NECUNOSCUT_ALERTA_MS, sesiuneDeInchis, sesiuneInchisa, VARSTA_MIN_MS } from './impacare-reguli';

// Împăcarea comenzilor de bilete cu banca (ION-196, pasul 5), pe cron la 10 minute. Patru treburi, fiecare cu cotă
// și toate într-un buget de timp; nimic de aici nu creează sesiuni sau refund-uri noi — doar citește starea reală
// (maib) și o aplică prin funcțiile comune (sincronizeazaStare emite biletele; finalizeazaRefund închide refund-ul).
//   A. comenzi deschise după rezervare (30 min) sau după plecare FĂRĂ sesiune: căutarea după orderId întâi;
//      găsită → legată și închisă ca la B; nicio sesiune / închisă → «expirata» (după 3 încercări de creare + alertă).
//   B. aceleași CU sesiune: verificare → cancel → reverificare → «expirata» doar pe închidere confirmată (560, C2);
//      B2: comenzile deja «expirata» cu sesiunea încă deschisă la bancă — se închide și sesiunea.
//      Revizia 10.10: ora verificării se scrie ÎNAINTEA băncii (L3); 3 cancel-uri fără efect → o alertă (M4).
//   C. intențiile de refund (558): un pas fiecare — trimitere, împăcare cu banca după un rezultat necunoscut, finalizare;
//      C2: ofertele de returnare din bot consumate și neexecutate se reiau automat.
//   D. cursă fără șofer la < 3 h de plecare pentru comenzi plătite → alertă (o dată pe comandă).

export interface ContorJob { procesate: number; aplicate: number; erori: number }
export interface RaportImpacare {
  dry: boolean;
  fara_checkout: ContorJob;
  cu_checkout: ContorJob;
  refund: ContorJob;
  cursa_fara_sofer: ContorJob;
  email: ContorJob;
  alerte: ContorJob;
  /** G (migr. 538): echipajul cursei trimis clientului în chat după bifa dispecerului și la fiecare schimbare. */
  echipaj?: RaportEchipaj;
  durata_ms: number;
  oprit_de_buget: boolean;
}

const COTE = { fara_checkout: 10, cu_checkout: 10, refund: 10, cursa_fara_sofer: 20, email: 10 };
const PARALEL = 5;

async function inLoturi<T>(items: T[], fn: (x: T) => Promise<void>, contor: ContorJob): Promise<void> {
  for (let i = 0; i < items.length; i += PARALEL) {
    await Promise.all(items.slice(i, i + PARALEL).map(async (x) => {
      contor.procesate += 1;
      try { await fn(x); } catch (e) { contor.erori += 1; console.error('[bilete/impacare]', e instanceof Error ? e.message : e); }
    }));
  }
}

async function alertaOData(comandaId: string, tip: string, detalii: string, dry: boolean): Promise<boolean> {
  const db = getSupabase();
  const { data } = await db.from('bilete_alerte').select('id').eq('comanda_id', comandaId).eq('tip', tip).limit(1);
  if (data && data.length) return false;
  if (!dry) await db.from('bilete_alerte').insert({ comanda_id: comandaId, tip, detalii });
  return true;
}

async function expira(comandaId: string, dry: boolean): Promise<void> {
  if (dry) return;
  // Revizia 10.10 (M3): returul din pachet (548) n-are sesiune proprie — expiră doar odată cu turul lui, aici.
  await getSupabase().from('bilete_comenzi')
    .update({ status: 'expirata', creare_in_curs_la: null, updated_at: new Date().toISOString() })
    .or(`id.eq.${comandaId},and(comanda_tur_id.eq.${comandaId},in_pachet.eq.true)`).in('status', ['noua', 'eroare_creare']);
}

/**
 * 560: o sesiune maib a unei comenzi, după regula verificare → cancel eligibil → reverificare → expirare locală doar pe
 * închidere confirmată fără plată. O plată găsită (Completed) a trecut deja prin bilete_marcheaza_platita (sincronizarea):
 * bilet dacă e la timp și mai e loc, altfel banii înapoi automat (558/560).
 */
async function inchideSesiunea(comandaId: string, checkoutId: string, deInchis: boolean): Promise<'platita' | 'expira' | 'asteapta'> {
  const citeste = async (): Promise<string | null> => {
    const r = await sincronizeazaStare(checkoutId);
    if (!r.ok) throw new Error(r.eroare);
    return r.rand?.status ?? (r.mesaj ? 'Expired' : null);
  };
  let d = deciziaSesiune(await citeste(), deInchis);
  if (d === 'anuleaza') {
    // Cancel-ul e refuzat de bancă pe stările finale; o plată în curs câștigă — de aceea reverificăm, nu presupunem.
    await cancelCheckout(checkoutId).catch((e) => console.warn('[bilete/impacare] cancel', checkoutId, e instanceof Error ? e.message : e));
    d = deciziaSesiune(await citeste(), deInchis, true);
    // Revizia 10.10 (M4): sesiunea tot deschisă după cancel → numărăm; la 3, o alertă pe comandă. Împăcarea continuă să
    // încerce la fiecare rând al rotației (nimic nu se oprește).
    if (d === 'asteapta') await sesiuneNeinchisa(comandaId, checkoutId);
  }
  if (d === 'expira') await expira(comandaId, false);
  return d === 'anuleaza' ? 'asteapta' : d;
}

async function sesiuneNeinchisa(comandaId: string, checkoutId: string): Promise<void> {
  const db = getSupabase();
  const { data } = await db.from('bilete_comenzi').select('inchidere_esuata').eq('id', comandaId).maybeSingle();
  const n = Number((data as { inchidere_esuata?: number } | null)?.inchidere_esuata ?? 0) + 1;
  await db.from('bilete_comenzi').update({ inchidere_esuata: n }).eq('id', comandaId);
  if (alertaSesiuneNeinchisa(n)) {
    await alertaOData(comandaId, 'sesiune_neinchisa', `sesiunea maib ${checkoutId} rămâne deschisă după ${n} încercări de închidere; împăcarea încearcă în continuare`, false);
  }
}

export async function ruleazaImpacarea(opt: { dry: boolean; bugetMs?: number }): Promise<RaportImpacare> {
  const start = Date.now();
  const buget = opt.bugetMs ?? 20_000;
  const db = getSupabase();
  const prag = new Date(Date.now() - VARSTA_MIN_MS).toISOString();
  const raport: RaportImpacare = {
    dry: opt.dry,
    fara_checkout: { procesate: 0, aplicate: 0, erori: 0 },
    cu_checkout: { procesate: 0, aplicate: 0, erori: 0 },
    refund: { procesate: 0, aplicate: 0, erori: 0 },
    cursa_fara_sofer: { procesate: 0, aplicate: 0, erori: 0 },
    email: { procesate: 0, aplicate: 0, erori: 0 },
    alerte: { procesate: 0, aplicate: 0, erori: 0 },
    durata_ms: 0,
    oprit_de_buget: false,
  };
  const maiAmTimp = () => Date.now() - start < buget;

  // 560 (C2, Ion 10.10: «dispecer nu va fi»): o comandă se uită la bancă după ce rezervarea a expirat (30 min, neprelungită)
  // SAU după plecarea cursei. Ordinea pe sesiune: recuperarea după orderId → verificare → cancel (doar
  // dacă trebuie închisă) → reverificare → «expirata» la noi doar când banca confirmă închiderea fără plată. Rotația:
  // cea mai demult verificată întâi (impacare_verificata_la), scrisă și la eroare — nicio comandă nu rămâne în spate.
  const acumMs = Date.now();
  const pragPlecare = new Date(acumMs).toISOString();
  const pragCreare = new Date(acumMs - 2 * 60_000).toISOString();
  const marcheazaVerificata = async (id: string) => {
    if (!opt.dry) await db.from('bilete_comenzi').update({ impacare_verificata_la: new Date().toISOString() }).eq('id', id);
  };

  // A. fără sesiune la noi: căutarea după orderId ÎNTÂI (Codex C2: checkout_id NULL nu dovedește lipsa sesiunii la bancă)
  // M3: fără retururile din pachet — căutarea la bancă după id-ul lor nu găsește nimic; ele urmează turul (expira).
  const { data: faraCk } = await db.from('bilete_comenzi').select('*')
    .in('status', ['noua', 'eroare_creare']).is('checkout_id', null).eq('in_pachet', false).lt('created_at', pragCreare)
    .or(`created_at.lt.${prag},departure_at.lt.${pragPlecare}`)
    .order('impacare_verificata_la', { ascending: true, nullsFirst: true }).order('created_at').limit(COTE.fara_checkout);
  await inLoturi((faraCk || []) as BileteComanda[], async (c) => {
    // L3 (revizia 10.10): ora verificării se scrie ÎNAINTEA drumului la bancă — o funcție oprită la jumătate (timeout
    // Vercel) nu lasă comanda în fața rotației, s-o reia mereu prima și să le înfometeze pe celelalte.
    await marcheazaVerificata(c.id);
    const gasit = await findCheckoutByOrderId(c.id);
    if (!gasit) {
      // Banca nu are nicio sesiune pentru comandă: se închide (după 3 încercări de creare, și cu alertă).
      if (c.creare_in_curs_la && Date.parse(c.creare_in_curs_la) > Date.now() - 2 * 60_000) return; // crearea e chiar acum în lucru
      await expira(c.id, opt.dry);
      if (c.creare_incercari >= INCERCARI_MAX) await alertaOData(c.id, 'creare_esuata', `după ${c.creare_incercari} încercări fără sesiune maib`, opt.dry);
      raport.fara_checkout.aplicate += 1;
      return;
    }
    if (sesiuneInchisa(gasit.status)) {
      await expira(c.id, opt.dry);
      raport.fara_checkout.aplicate += 1;
      return;
    }
    if (opt.dry) return;
    if (!(await leagaSesiuneExistenta(c, gasit, 'impacare'))) return;
    await inchideSesiunea(c.id, gasit.id, sesiuneDeInchis(c, Date.now()));
    raport.fara_checkout.aplicate += 1;
  }, raport.fara_checkout);
  // M3: retururi din pachet rămase deschise după ce turul lor a expirat pe altă cale → expiră și ele.
  const { data: orfane } = await db.from('bilete_comenzi').select('id, comanda_tur_id')
    .in('status', ['noua', 'eroare_creare']).eq('in_pachet', true).lt('created_at', prag).limit(500); // fără ordinea «cele mai vechi N»: retururile cu turul încă deschis n-au voie să le înfometeze pe orfane
  const turIds = [...new Set(((orfane || []) as { comanda_tur_id: string | null }[]).map((o) => o.comanda_tur_id).filter((x): x is string => !!x))];
  if (turIds.length > 0 && !opt.dry) {
    const { data: tururi } = await db.from('bilete_comenzi').select('id, status').in('id', turIds);
    const expirate = ((tururi || []) as { id: string; status: string }[]).filter((t) => t.status === 'expirata').map((t) => t.id);
    if (expirate.length > 0) {
      await db.from('bilete_comenzi').update({ status: 'expirata', creare_in_curs_la: null, updated_at: new Date().toISOString() })
        .in('comanda_tur_id', expirate).eq('in_pachet', true).in('status', ['noua', 'eroare_creare']);
    }
  }
  if (!maiAmTimp()) { raport.oprit_de_buget = true; raport.durata_ms = Date.now() - start; return raport; }

  // B. cu sesiune: rotația echitabilă (cea mai demult verificată întâi), închiderea sesiunilor expirate sau după plecare.
  const { data: cuCk } = await db.from('bilete_comenzi').select('id, checkout_id, status, created_at, departure_at')
    .in('status', ['noua', 'eroare_creare']).not('checkout_id', 'is', null)
    .or(`created_at.lt.${prag},departure_at.lt.${pragPlecare}`)
    .order('impacare_verificata_la', { ascending: true, nullsFirst: true }).order('created_at').limit(COTE.cu_checkout);
  await inLoturi((cuCk || []) as { id: string; checkout_id: string; status: string; created_at: string; departure_at: string }[], async (c) => {
    await marcheazaVerificata(c.id); // L3: înaintea băncii
    if (opt.dry) return;
    await inchideSesiunea(c.id, c.checkout_id, sesiuneDeInchis(c, Date.now()));
    raport.cu_checkout.aplicate += 1;
  }, raport.cu_checkout);

  // B2. comenzi deja «expirata» la noi cu sesiunea încă deschisă la bancă (expirate pe altă cale): se închide și sesiunea,
  // ca omul să nu mai poată plăti. Rotația după maib_checkouts.updated_at (atins și la eroare).
  if (!opt.dry && maiAmTimp()) {
    const { data: deschise } = await db.from('maib_checkouts').select('checkout_id')
      .or('status.ilike.waitingforinit,status.ilike.initialized,status.ilike.paymentmethodselected')
      .lt('created_at', prag).order('updated_at').limit(COTE.cu_checkout);
    const ids = ((deschise || []) as { checkout_id: string }[]).map((x) => x.checkout_id);
    const { data: expirate } = ids.length
      ? await db.from('bilete_comenzi').select('id, checkout_id').in('checkout_id', ids).eq('status', 'expirata')
      : { data: [] as { id: string; checkout_id: string }[] };
    await inLoturi((expirate || []) as { id: string; checkout_id: string }[], async (c) => {
      await db.from('maib_checkouts').update({ updated_at: new Date().toISOString() }).eq('checkout_id', c.checkout_id); // L3: înaintea băncii
      await inchideSesiunea(c.id, c.checkout_id, true);
      raport.cu_checkout.aplicate += 1;
    }, raport.cu_checkout);
  }
  if (!maiAmTimp()) { raport.oprit_de_buget = true; raport.durata_ms = Date.now() - start; return raport; }

  // C. intențiile de refund (558; dezbaterea Claude ⇄ Codex 10.10, N2/C3/C1 — «dispecer nu va fi»): fiecare intenție
  // scadentă face un pas (trimitere / împăcare cu banca / finalizare). Revendicarea din SQL lasă un singur worker.
  if (!opt.dry) {
    const ids = await intentiiScadente(COTE.refund);
    await inLoturi(ids, async (id) => {
      const r = await proceseazaIntentia(id);
      if (r.stare !== 'ocupata') raport.refund.aplicate += 1;
    }, raport.refund);
    // Plasă: o anulare fără intenție n-ar trebui să existe după 558 (bilete_anuleaza o scrie în aceeași tranzacție).
    const { data: fara } = await db.from('bilete_comenzi').select('id, cancelled_at')
      .eq('status', 'anulata').is('refund_finalizat_la', null).lt('cancelled_at', new Date(Date.now() - REFUND_NECUNOSCUT_ALERTA_MS).toISOString())
      .order('cancelled_at').limit(COTE.refund);
    for (const c of (fara || []) as { id: string }[]) {
      const { count } = await db.from('bilete_refund_intentii').select('id', { count: 'exact', head: true }).contains('comenzi', [c.id]);
      if ((count ?? 0) === 0) await alertaOData(c.id, 'refund_necunoscut', 'anulată de peste 24 h fără intenție de refund (558)', false);
    }
  }
  if (!maiAmTimp()) { raport.oprit_de_buget = true; raport.durata_ms = Date.now() - start; return raport; }

  // C2. Returnări din bot consumate, dar neexecutate (ION-244, corectura 16′): funcția a murit între consumarea ofertei și
  // anulare, iar comanda e încă «platita». Codex C1 (10.10): se reiau automat, cu suma și momentul validării ofertei —
  // aceeași cale ca butonul din bot (executaOferta), fără dispecer.
  if (!opt.dry) {
    const { data: blocate } = await db.from('bilete_retur_oferte').select('id, comanda_id, suma, noimi, validata_la')
      .not('folosita_la', 'is', null).is('rezultat', null).lt('folosita_la', new Date(Date.now() - 2 * 60_000).toISOString()).limit(5);
    for (const o of (blocate || []) as { id: string; comanda_id: string; suma: number; noimi: number | null; validata_la: string | null }[]) {
      if (!maiAmTimp()) break;
      const { data: c } = await db.from('bilete_comenzi').select('status').eq('id', o.comanda_id).maybeSingle();
      if (c?.status !== 'platita' || !o.validata_la) {
        // Anularea a ajuns în bază (intenția o duce mai departe) sau comanda nu mai e de anulat: se închide oferta.
        await db.from('bilete_retur_oferte').update({ rezultat: c?.status === 'anulata' || c?.status === 'returnata' ? 'necunoscut' : `refuz:stare_${c?.status ?? 'lipsa'}` })
          .eq('id', o.id).is('rezultat', null);
        continue;
      }
      try {
        const rez = await executaOferta({ id: o.id, comanda_id: o.comanda_id, suma: Number(o.suma), noimi: o.noimi, validata_la: o.validata_la });
        raport.refund.aplicate += 1;
        if (rez.startsWith('refuz:') || rez === 'eroare') console.warn('[impacare] oferta reluată', o.id, rez);
      } catch (e) {
        raport.refund.erori += 1;
        console.error('[impacare] oferta reluată', o.id, e instanceof Error ? e.message : e);
      }
    }
  }

  // D. cursă fără șofer la < 3 h
  const acum = Date.now();
  const { data: platite } = await db.from('bilete_comenzi').select('id, trip_date, crm_route_id, going_north, departure_at')
    .eq('status', 'platita').eq('test', false)
    .gt('departure_at', new Date(acum).toISOString()).lt('departure_at', new Date(acum + 3 * 60 * 60_000).toISOString())
    .limit(COTE.cursa_fara_sofer);
  await inLoturi((platite || []) as Pick<BileteComanda, 'id' | 'trip_date' | 'crm_route_id' | 'going_north' | 'departure_at'>[], async (c) => {
    if (!inFereastraFaraSofer(c.departure_at, acum)) return;
    const st = await stareSoferCursa(c.trip_date, c.crm_route_id, c.going_north);
    // Ion, 09.10: vânzarea doar la șoferii legați — dacă între timp cursa a primit un șofer nelegat, Ion află (o dată).
    if (st === 'nelegat') {
      if (await alertaOData(c.id, 'sofer_nelegat', `plecare ${c.departure_at}, ruta ${c.crm_route_id} ${c.going_north ? 'retur' : 'tur'}: șoferul din grafic nu e legat de Telegram — nu vede pasagerul online`, opt.dry)) raport.cursa_fara_sofer.aplicate += 1;
      return;
    }
    if (st === 'legat') return;
    if (await alertaOData(c.id, 'cursa_fara_sofer', `plecare ${c.departure_at}, ruta ${c.crm_route_id} ${c.going_north ? 'retur' : 'tur'} fără șofer în grafic`, opt.dry)) raport.cursa_fara_sofer.aplicate += 1;
  }, raport.cursa_fara_sofer);

  // E. e-mailuri restante (ION-201): plătite de > 2 min, cu e-mail, netrimise, sub 3 încercări. Prinde plățile
  // sincronizate din pagina biletului, «Emite biletele» și eșecurile trimiterii din callback.
  if (emailConfigurat() && maiAmTimp()) {
    const { data: restante } = await db.from('bilete_comenzi').select('id')
      .eq('status', 'platita').not('email', 'is', null).is('email_trimis_la', null).lt('email_incercari', 3)
      .lt('paid_at', new Date(Date.now() - 2 * 60_000).toISOString())
      .order('paid_at').limit(COTE.email);
    await inLoturi((restante || []) as { id: string }[], async (c) => {
      if (opt.dry) return;
      if ((await trimiteEmailBilet(c.id)) === 'trimis') raport.email.aplicate += 1;
    }, raport.email);
  }

  // E2. SMS-urile de confirmare rămase (552): plătite în ultimele 2 ore, fără rând în bilete_sms. Doar cu date SMS.
  if (maiAmTimp() && !opt.dry) {
    for (const id of await smsRestante().catch(() => [])) {
      if (!maiAmTimp()) break;
      await trimiteSmsConfirmare(id).catch((e) => console.error('[impacare] sms', id, e instanceof Error ? e.message : e));
    }
  }

  // F. alertele la Ion (ION-207): nenotificate → un mesaj Telegram la ADMIN; marcate doar dacă mesajul a plecat.
  // O citire și un mesaj. Dacă bugetul s-a terminat mai sus, alertele pleacă la tick-ul următor (10 min).
  {
    const { data: noi } = await db.from("bilete_alerte").select("id, tip, detalii, moment, comanda_id")
      .is("notificat_la", null).order("id").limit(50);
    const lista = (noi || []) as { id: number; tip: string; detalii: string | null; moment: string; comanda_id: string | null }[];
    raport.alerte.procesate = lista.length;
    if (lista.length > 0 && !opt.dry) {
      const ids = [...new Set(lista.map((a) => a.comanda_id).filter((x): x is string => Boolean(x)))];
      const { data: comenzi } = ids.length
        ? await db.from("bilete_comenzi").select("id, from_name, to_name, departure_at, passenger_name, phone, total").in("id", ids)
        : { data: [] as { id: string; from_name: string; to_name: string; departure_at: string; passenger_name: string; phone: string; total: number }[] };
      const harta = new Map((comenzi || []).map((c) => [c.id, c]));
      const pentruMesaj: AlertaPentruMesaj[] = lista.map((a) => ({ tip: a.tip, detalii: a.detalii, moment: a.moment, comanda: a.comanda_id ? harta.get(a.comanda_id) ?? null : null }));
      const baza = (process.env.ADMIN_URL || "https://central-hub-md.vercel.app").replace(/\/+$/, "");
      if (await alertaBilete(mesajAlerte(pentruMesaj, `${baza}/bilete`))) {
        await db.from("bilete_alerte").update({ notificat_la: new Date().toISOString() }).in("id", lista.map((a) => a.id)).is("notificat_la", null);
        raport.alerte.aplicate = lista.length;
      } else {
        raport.alerte.erori = 1;
      }
    }
  }

  // G. echipajul în chat (migr. 538), ULTIMUL: are nevoie de timp pentru trimiteri și nu are voie să-i ia timpul lui F.
  if (maiAmTimp()) {
    try { raport.echipaj = await ruleazaEchipajul({ dry: opt.dry, ramasMs: () => buget - (Date.now() - start) }); }
    catch (e) { console.error('[impacare] echipaj:', e); raport.echipaj = { verificate: 0, de_trimis: 0, trimise: 0, blocate: 0, temporare: 0, erori: 1 }; }
  }

  raport.durata_ms = Date.now() - start;
  return raport;
}
