// Analiza săptămânală «trecere prin Sîngerei» pentru Ion (ION-251). Ion, 07.10.2026: «se poate să nu treacă prin
// Sîngerei dacă microbuzul a fost plin fie la tur fie la retur» — plin «din Bălți sau din Chișinău», judecat «după
// numărare», iar analitica «mie inițial» (privat, nimic în grupe).
//
// Sursa numărării: counting_sessions / counting_entries (migr. 021, 025) — operatorii OPERATOR_CAMERE numără pe
// camerele din salon, pe fiecare oprire a cursei, încărcarea DUPĂ oprire (total_passengers). Direcția «tur» = spre
// Chișinău (Bălți vine înaintea Sîngerei), «retur» = din Chișinău (Chișinău e prima oprire) — aceleași sensuri ca
// route_stop_passes (going_north=false / true).
//
// «Plin» = încărcarea pe tronsonul care intră în Sîngerei (total_passengers la ultima oprire numărată dinaintea
// Sîngerei) ≥ locurile mașinii: cu salonul plin nu avea cine urca în Sîngerei. Locurile = vehicles.passenger_seats
// (migr. 424); pentru microbuzele interurbane coloana e aproape goală, deci implicit app_config.bus_seat_capacity
// (20, aceeași valoare ca «Locuri în Bălți», migr. 497). «Plin din» = oprirea de la care salonul a stat plin fără
// întrerupere până la Sîngerei (Chișinău / Bălți / alta).
// Logica e pură; citirea și trimiterea stau în /api/cron/mejgorod-singerei-saptamana.

import { escapeHtml } from '../telegram-notify';
import { SINGEREI } from './neconformitati';

export interface OprireNumarata {
  stop_order: number;
  stop_name_ro: string;
  total_passengers: number;
}

export interface Plin {
  /** pasagerii pe tronsonul care intră în Sîngerei */
  incarcare: number;
  locuri: number;
  plin: boolean;
  /** de la ce oprire salonul a stat plin până la Sîngerei; null dacă nu e plin */
  plinDin: string | null;
}

/** null = numărarea sensului nu are Sîngerei sau nicio oprire înaintea ei (nu se poate judeca). */
export function plinLaSingerei(opriri: OprireNumarata[], locuri: number): Plin | null {
  const o = [...opriri].sort((a, b) => a.stop_order - b.stop_order);
  const i = o.findIndex((x) => x.stop_name_ro === SINGEREI);
  if (i <= 0) return null;
  const incarcare = o[i - 1].total_passengers;
  const plin = incarcare >= locuri;
  let j = i - 1;
  if (plin) while (j > 0 && o[j - 1].total_passengers >= locuri) j--;
  return { incarcare, locuri, plin, plinDin: plin ? o[j].stop_name_ro : null };
}

export type Verdict = 'plin' | 'abatere' | 'nenumarat';

export interface CursaFaraSingerei {
  date: string;
  ruta: number;
  /** true = din Chișinău (retur) */
  retur: boolean;
  driver_id: string | null;
  vehicle_id: string | null;
  verdict: Verdict;
  plin: Plin | null;
}

/** Verdictul unei curse care n-a trecut prin Sîngerei, din numărarea sensului ei (undefined = nenumărat). */
export function judeca(
  c: Omit<CursaFaraSingerei, 'verdict' | 'plin'>,
  opriri: OprireNumarata[] | undefined,
  locuri: number,
): CursaFaraSingerei {
  const p = opriri?.length ? plinLaSingerei(opriri, locuri) : null;
  return { ...c, plin: p, verdict: p == null ? 'nenumarat' : p.plin ? 'plin' : 'abatere' };
}

export interface RandRezumat {
  cheie: string;
  total: number;
  abatere: number;
  plin: number;
  nenumarat: number;
}

/** Rezumatul pe șofer / mașină / rută: întâi cine are cele mai multe abateri reale. */
export function rezumat(rows: CursaFaraSingerei[], cheie: (r: CursaFaraSingerei) => string): RandRezumat[] {
  const m = new Map<string, RandRezumat>();
  for (const r of rows) {
    const k = cheie(r);
    const x = m.get(k) ?? { cheie: k, total: 0, abatere: 0, plin: 0, nenumarat: 0 };
    x.total++;
    x[r.verdict]++;
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => b.abatere - a.abatere || b.total - a.total || a.cheie.localeCompare(b.cheie, 'ro'));
}

const ZILE_RO = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'];
/** «2026-09-28» → «Lu 28.09» */
export function ziScurta(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  return `${ZILE_RO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

export interface NumeAnaliza {
  sofer: (id: string | null) => string | null;
  masina: (id: string | null) => string | null;
}

export interface ContextAnaliza {
  /** «28.09–04.10.2026» */
  perioada: string;
  /** cursele cu GPS judecate în săptămână */
  curseJudecate: number;
  locuriImplicite: number;
  /** zilele fără route_stop_passes («dd.mm»): cursele lor nu s-au putut judeca */
  zileFaraGps?: string[];
}

const TELEGRAM_MAX = 3800;

/** Împarte rândurile în mesaje sub limita Telegram, fără să rupă un rând. */
export function inMesaje(linii: string[], max = TELEGRAM_MAX): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const l of linii) {
    if (cur.length && len + l.length + 1 > max) { out.push(cur.join('\n')); cur = []; len = 0; }
    cur.push(l);
    len += l.length + 1;
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

/** Analiza pe română, HTML, pentru privatul lui Ion; unul sau mai multe mesaje. */
export function textAnaliza(rows: CursaFaraSingerei[], ctx: ContextAnaliza, n: NumeAnaliza): string[] {
  const nr = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  const sofer = (id: string | null) => n.sofer(id) ?? 'șofer necunoscut';
  const masina = (id: string | null) => n.masina(id) ?? 'mașină necunoscută';
  const l: string[] = [
    `🔎 <b>Sîngerei — săptămâna ${escapeHtml(ctx.perioada)}</b>`,
    `Curse interurbane cu GPS: ${ctx.curseJudecate}. Fără trecere prin Sîngerei (nici centru, nici oprire la Intersecția Vrănești): <b>${rows.length}</b>`,
    `❌ nepline — abatere: <b>${nr('abatere')}</b>`,
    `✅ pline la intrarea în Sîngerei — scoase din analiză: <b>${nr('plin')}</b>`,
    `❔ nenumărate pe camere: <b>${nr('nenumarat')}</b>`,
    `<i>Plin = pasagerii numărați pe camere pe tronsonul dinainte de Sîngerei ≥ locurile mașinii (${ctx.locuriImplicite} locuri pe toate microbuzele).</i>`,
  ];
  if (ctx.zileFaraGps?.length) l.push(`⚠️ Zile fără GPS (nejudecate): ${ctx.zileFaraGps.join(', ')}`);
  if (!rows.length) return inMesaje(l);
  const bloc = (titlu: string, rr: RandRezumat[]) => {
    l.push('', `<b>${titlu}</b> (abateri · pline · nenumărate)`);
    for (const r of rr) l.push(`${escapeHtml(r.cheie)} — ${r.abatere} · ${r.plin} · ${r.nenumarat}`);
  };
  bloc('Pe șofer', rezumat(rows, (r) => sofer(r.driver_id)));
  bloc('Pe mașină', rezumat(rows, (r) => masina(r.vehicle_id)));
  bloc('Pe rută', rezumat(rows, (r) => `Ruta ${r.ruta}`).sort((a, b) => b.abatere - a.abatere || Number(a.cheie.slice(5)) - Number(b.cheie.slice(5))));
  // Ion, 07.10 («3. ok»): în listă doar cursele pline și cele nenumărate; abaterile rămân ca număr pe șofer / mașină / rută
  l.push('', '<b>Cursele pline și nenumărate</b> (tur = spre Chișinău, retur = din Chișinău; pasageri/locuri la intrarea în Sîngerei)');
  const sortate = rows.filter((r) => r.verdict !== 'abatere').sort((a, b) => a.date.localeCompare(b.date) || a.ruta - b.ruta || Number(a.retur) - Number(b.retur));
  let zi = '';
  for (const r of sortate) {
    if (r.date !== zi) { zi = r.date; l.push(`<u>${ziScurta(r.date)}</u>`); }
    const cine = `${escapeHtml(sofer(r.driver_id))} · ${escapeHtml(masina(r.vehicle_id))}`;
    const p = r.plin;
    const verdict = r.verdict === 'nenumarat' ? '❔ nenumărat'
      : r.verdict === 'plin' ? `✅ ${p!.incarcare}/${p!.locuri} plin din ${escapeHtml(p!.plinDin ?? '')}`
      : `❌ ${p!.incarcare}/${p!.locuri}`;
    l.push(`R${r.ruta} ${r.retur ? 'retur' : 'tur'} · ${cine} — ${verdict}`);
  }
  return inMesaje(l);
}
