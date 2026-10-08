import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { dataOraChisinau } from './email-mesaj';
import { echipajeZile, trimiteLaClient } from './echipaj';
import { cheieEchipaj, deTrimis, inFereastraTelefon, mesajEchipaj, type FelMesaj } from './echipaj-reguli';

// Jobul G al împăcării (migr. 538; Ion, 08.10.2026: «să se trimită în chat actualizat la client»): după bifa
// dispecerului clientul legat de Telegram primește echipajul cursei lui, iar la fiecare schimbare — mesajul nou.
// Parcurgerea e completă (paginat), trimiterile — cel mult 15 pe tick, secvențial, cu bugetul verificat înaintea
// fiecăreia (critica C2, C3). Planul: docs/plans/2026-10-08-echipaj-pe-bilet.md.

export interface RaportEchipaj { verificate: number; de_trimis: number; trimise: number; blocate: number; temporare: number; erori: number }

interface RandComanda {
  id: string; trip_date: string; crm_route_id: number; going_north: boolean; departure_at: string; lang: string | null;
  from_name: string; to_name: string; telegram_id: number | string; telegram_verificat_pentru: number | string | null;
  test: boolean; proba_fizica: boolean; echipaj_trimis: string | null; echipaj_mesaje: number;
  echipaj_revendicat_la: string | null;
}

const TRIMITERI_MAX = 15;
const PAGINA = 1000;
const REZERVA_MS = 6000;
const REVENDICARE_MS = 2 * 60_000;
const COLOANE = 'id, trip_date, crm_route_id, going_north, departure_at, lang, from_name, to_name, telegram_id, telegram_verificat_pentru, test, proba_fizica, echipaj_trimis, echipaj_mesaje, echipaj_revendicat_la';

export async function ruleazaEchipajul(opt: { dry: boolean; ramasMs: () => number; nowMs?: number }): Promise<RaportEchipaj> {
  const r: RaportEchipaj = { verificate: 0, de_trimis: 0, trimise: 0, blocate: 0, temporare: 0, erori: 0 };
  const db = getSupabase();
  const acum = opt.nowMs ?? Date.now();
  // 1. Toate comenzile eligibile, paginat (PostgREST dă cel mult 1.000 pe cerere).
  const comenzi: RandComanda[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await db.from('bilete_comenzi').select(COLOANE)
      .eq('status', 'platita').not('telegram_id', 'is', null).is('echipaj_refuzat_la', null)
      .or('test.eq.false,proba_fizica.eq.true')
      .gt('departure_at', new Date(acum).toISOString()).lt('departure_at', new Date(acum + 48 * 3_600_000).toISOString())
      .order('departure_at').order('id').range(de, de + PAGINA - 1);
    if (error) { r.erori += 1; return r; }
    comenzi.push(...((data ?? []) as RandComanda[]));
    if ((data ?? []).length < PAGINA) break;
  }
  r.verificate = comenzi.length;
  if (!comenzi.length) return r;

  // 2. Un singur lot de citiri ale graficului; ce e de trimis — în memorie.
  let echipaje;
  try { echipaje = await echipajeZile(db, comenzi.map((c) => c.trip_date)); } catch { r.erori += 1; return r; }
  const ora = Number(new Date(acum).toLocaleString('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', hour12: false }));
  const deTrimisLista: Array<{ c: RandComanda; nou: string; fel: FelMesaj; text: string }> = [];
  for (const c of comenzi) {
    const e = echipaje(c);
    if (!e) continue;
    const cuTelefon = Number(c.telegram_verificat_pentru) === Number(c.telegram_id) && inFereastraTelefon(c.departure_at, acum);
    const nou = cheieEchipaj(e, cuTelefon);
    const fel = deTrimis({ trimis: c.echipaj_trimis, nou, mesaje: c.echipaj_mesaje ?? 0, oraChisinau: ora, pleacaInMs: Date.parse(c.departure_at) - acum });
    if (!fel) continue;
    const lang = c.lang === 'ru' ? 'ru' : 'ro';
    deTrimisLista.push({ c, nou, fel, text: mesajEchipaj({ lang, fel, from: c.from_name, to: c.to_name, plecare: dataOraChisinau(c.departure_at, lang), e, cuTelefon }) });
  }
  r.de_trimis = deTrimisLista.length;
  if (opt.dry) return r;

  // 3. Cel mult 15 trimiteri, cea mai apropiată plecare întâi (lista e deja ordonată), secvențial, cu bugetul verificat.
  for (const x of deTrimisLista.slice(0, TRIMITERI_MAX)) {
    if (opt.ramasMs() < REZERVA_MS) break;
    const momentRev = new Date().toISOString();
    let q = db.from('bilete_comenzi').update({ echipaj_revendicat_la: momentRev }).eq('id', x.c.id)
      .or(`echipaj_revendicat_la.is.null,echipaj_revendicat_la.lt.${new Date(Date.now() - REVENDICARE_MS).toISOString()}`);
    q = x.c.echipaj_trimis == null ? q.is('echipaj_trimis', null) : q.eq('echipaj_trimis', x.c.echipaj_trimis);
    const { data: rev, error: eRev } = await q.select('id');
    if (eRev) { r.erori += 1; continue; }
    if (!rev?.length) continue; // altcineva o trimite chiar acum, sau s-a schimbat între timp
    const rez = await trimiteLaClient(Number(x.c.telegram_id), x.text);
    const elib = { echipaj_revendicat_la: null };
    if (rez === 'trimis' || rez === 'incert') {
      await db.from('bilete_comenzi').update({
        ...elib, echipaj_trimis: x.nou, echipaj_trimis_la: new Date().toISOString(), echipaj_mesaje: (x.c.echipaj_mesaje ?? 0) + 1,
      }).eq('id', x.c.id).eq('echipaj_revendicat_la', momentRev);
      r.trimise += 1;
    } else if (rez === 'blocat') {
      await db.from('bilete_comenzi').update({ ...elib, echipaj_refuzat_la: new Date().toISOString() }).eq('id', x.c.id).eq('echipaj_revendicat_la', momentRev);
      r.blocate += 1;
    } else {
      await db.from('bilete_comenzi').update(elib).eq('id', x.c.id).eq('echipaj_revendicat_la', momentRev);
      r.temporare += 1;
    }
  }
  return r;
}
