import 'server-only';
import type { BileteComanda } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { findCheckoutByOrderId, getPayment } from '@/lib/maib/client';
import { sincronizeazaStare } from '@/lib/maib/sincronizare';
import { finalizeazaRefund, verificaSiFinalizeazaRefund } from '@/lib/maib/refund';
import { leagaSesiuneExistenta, stareSoferCursa } from './comenzi';
import { emailConfigurat, trimiteEmailBilet } from './email';
import { smsRestante, trimiteSmsConfirmare } from './sms';
import { alertaBilete } from './alerte-tab';
import { ruleazaEchipajul, type RaportEchipaj } from './echipaj-job';
import { mesajAlerte, type AlertaPentruMesaj } from './alerte-mesaj';
import { INCERCARI_MAX, inFereastraFaraSofer, REFUND_NECUNOSCUT_ALERTA_MS, sesiuneInchisa, VARSTA_MIN_MS } from './impacare-reguli';

// Împăcarea comenzilor de bilete cu banca (ION-196, pasul 5), pe cron la 10 minute. Patru treburi, fiecare cu cotă
// și toate într-un buget de timp; nimic de aici nu creează sesiuni sau refund-uri noi — doar citește starea reală
// (maib) și o aplică prin funcțiile comune (sincronizeazaStare emite biletele; finalizeazaRefund închide refund-ul).
//   A. comenzi deschise > 30 min FĂRĂ sesiune: sesiunea există la maib? → se leagă (și se plătește, dacă e cazul);
//      nu există / e închisă → «expirata»; peste 3 încercări → «expirata» + alertă.
//   B. comenzi deschise > 30 min CU sesiune: starea de la maib (bilete la Completed/Executed; «expirata» la Expired…).
//   C. comenzi anulate cu refund nefinalizat: refund_id → finalizare; «Necunoscut» → getPayment.refundedAmount;
//      fără răspuns > 24 h → alertă (o dată).
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

const COTE = { fara_checkout: 10, cu_checkout: 10, refund: 5, cursa_fara_sofer: 20, email: 10 };
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

  // A. fără sesiune
  // M3: fără retururile din pachet — căutarea la bancă după id-ul lor nu găsește nimic și le-ar expira pe nedrept,
  // eliberând cota cât turul e încă deschis la bancă. Ele urmează turul (expira, mai sus).
  const { data: faraCk } = await db.from('bilete_comenzi').select('*')
    .in('status', ['noua', 'eroare_creare']).is('checkout_id', null).eq('in_pachet', false).lt('created_at', prag)
    .order('created_at').limit(COTE.fara_checkout);
  await inLoturi((faraCk || []) as BileteComanda[], async (c) => {
    if (c.creare_incercari >= INCERCARI_MAX) {
      await expira(c.id, opt.dry);
      await alertaOData(c.id, 'creare_esuata', `după ${c.creare_incercari} încercări fără sesiune maib`, opt.dry);
      raport.fara_checkout.aplicate += 1;
      return;
    }
    const gasit = await findCheckoutByOrderId(c.id);
    if (!gasit || sesiuneInchisa(gasit.status)) {
      await expira(c.id, opt.dry);
      raport.fara_checkout.aplicate += 1;
      return;
    }
    if (opt.dry) return;
    const legat = await leagaSesiuneExistenta(c, gasit, 'impacare');
    if (legat) {
      const r = await sincronizeazaStare(gasit.id); // emite biletele dacă e Completed/Executed
      if (!r.ok) throw new Error(r.eroare);
      raport.fara_checkout.aplicate += 1;
    }
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

  // B. cu sesiune
  const { data: cuCk } = await db.from('bilete_comenzi').select('id, checkout_id')
    .in('status', ['noua', 'eroare_creare']).not('checkout_id', 'is', null).lt('created_at', prag)
    .order('created_at').limit(COTE.cu_checkout);
  await inLoturi((cuCk || []) as { id: string; checkout_id: string }[], async (c) => {
    if (opt.dry) return;
    const r = await sincronizeazaStare(c.checkout_id);
    if (!r.ok) throw new Error(r.eroare);
    const stare = r.rand?.status ?? (r.mesaj ? 'Expired' : null);
    if (sesiuneInchisa(stare)) await expira(c.id, false);
    raport.cu_checkout.aplicate += 1;
  }, raport.cu_checkout);
  if (!maiAmTimp()) { raport.oprit_de_buget = true; raport.durata_ms = Date.now() - start; return raport; }

  // C. refund-uri nefinalizate
  const { data: anulate } = await db.from('bilete_comenzi').select('id, checkout_id, cancelled_at')
    .eq('status', 'anulata').is('refund_finalizat_la', null).not('checkout_id', 'is', null)
    .order('cancelled_at').limit(COTE.refund);
  await inLoturi((anulate || []) as { id: string; checkout_id: string; cancelled_at: string | null }[], async (c) => {
    const { data: ck } = await db.from('maib_checkouts').select('checkout_id, refund_id, refund_status, payment_id').eq('checkout_id', c.checkout_id).maybeSingle();
    if (!ck) return;
    if (opt.dry) return;
    if (ck.refund_id) {
      await verificaSiFinalizeazaRefund(ck);
      raport.refund.aplicate += 1;
      return;
    }
    if (ck.payment_id) {
      const p = await getPayment(ck.payment_id);
      if (Number(p.refundedAmount ?? 0) > 0) {
        await finalizeazaRefund(ck.checkout_id, { status: 'Accepted', refundedAmount: Number(p.refundedAmount), paymentStatus: p.status });
        raport.refund.aplicate += 1;
        return;
      }
    }
    const vechime = c.cancelled_at ? Date.now() - Date.parse(c.cancelled_at) : 0;
    if (vechime > REFUND_NECUNOSCUT_ALERTA_MS) {
      if (await alertaOData(c.id, 'refund_necunoscut', 'anulată de peste 24 h fără refund confirmat la bancă', false)) raport.refund.aplicate += 1;
    }
  }, raport.refund);
  if (!maiAmTimp()) { raport.oprit_de_buget = true; raport.durata_ms = Date.now() - start; return raport; }

  // C2. Returnări din bot rămase nedeterminate (ION-244, corectura 16′): oferta consumată de peste 2 min, fără rezultat,
  // iar comanda încă «platita» — funcția a murit între consumare și anulare. Dispecerul decide; alertă o dată pe comandă.
  if (!opt.dry) {
    const { data: blocate } = await db.from('bilete_retur_oferte').select('id, comanda_id, suma')
      .not('folosita_la', 'is', null).is('rezultat', null).lt('folosita_la', new Date(Date.now() - 2 * 60_000).toISOString()).limit(10);
    for (const o of (blocate || []) as { id: string; comanda_id: string; suma: number }[]) {
      const { data: c } = await db.from('bilete_comenzi').select('status').eq('id', o.comanda_id).maybeSingle();
      if (c?.status !== 'platita') continue;
      if (await alertaOData(o.comanda_id, 'retur_cerere', `returnare din bot confirmată (oferta ${o.id}, ${Number(o.suma)} lei), dar neexecutată — verifică și returnează din /bilete`, false)) raport.refund.aplicate += 1;
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
