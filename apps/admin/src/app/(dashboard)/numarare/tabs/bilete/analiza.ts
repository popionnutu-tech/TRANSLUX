// ION-159: regulile pure ale vederilor «Orar», «Față de anul trecut» și «Cine merge pe rută».
// Fără Date cu fus orar: zilele sunt șiruri 'YYYY-MM-DD' (ziua cursei Mobilet).

import type { ClientiRoute, ClientiTronson, ClientiZi, Leg, OrarLeg, OrarRoute, TendintaLuna } from './types';
import { addDays, median, pctChange, shiftMonth } from './periods';

export const LEG_LABEL: Record<Leg, string> = {
  nord_chisinau: 'Nord → Chișinău',
  chisinau_nord: 'Chișinău → Nord',
};

/** «02:35 - 07:00» → «02:35» (ora plecării din capăt). */
export function depTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const s = t.split(' - ')[0]?.trim();
  return s && /^\d{1,2}:\d{2}$/.test(s) ? s.padStart(5, '0') : null;
}

/** «13:20» → 13,33 (ore din zi). */
export function hourOf(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
}

export function legTime(r: Pick<OrarRoute, 'time_nord' | 'time_chisinau'>, leg: Leg): string | null {
  return depTime(leg === 'nord_chisinau' ? r.time_nord : r.time_chisinau);
}

export const perDeparture = (l: Pick<OrarLeg, 'bilete' | 'plecari'>) => (l.plecari > 0 ? l.bilete / l.plecari : null);

// ─── săptămânile: anul acesta și anul trecut pe aceeași grilă ───

const DAY = 86_400_000;
const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

/** Lunea săptămânii zilei (ISO). */
export function mondayOf(d: string): string {
  const dow = (new Date(utc(d)).getUTCDay() + 6) % 7; // 0 = luni
  return addDays(d, -dow);
}

/**
 * 52 de săptămâni întregi care se termină cel târziu în `to`, plus aceleași 52 cu 364 de zile în urmă.
 * Săptămâna lipsă = gol (null), nu zero: înainte de 2026 nu se știe dacă ruta a circulat fără bilete.
 */
export function weekGrid(series: [string, number][] | null, to: string, n = 52) {
  const map = new Map((series ?? []).map(([w, v]) => [w, v]));
  // ultima săptămână întreagă: duminica ei ≤ to
  let last = mondayOf(to);
  if (addDays(last, 6) > to) last = addDays(last, -7);
  const weeks: string[] = [];
  for (let k = n - 1; k >= 0; k--) weeks.push(addDays(last, -7 * k));
  return {
    weeks,
    cur: weeks.map(w => map.get(w) ?? null),
    prev: weeks.map(w => map.get(addDays(w, -364)) ?? null),
  };
}

// ─── «Cine merge pe rută»: ponderea celorlalți în drumul făcut ───

export const MIN_ELIGIBILE = 8;

export interface OthersShare { min: number; max: number }

/** Ceilalți din drumul făcut (om × km), ca interval: 1 − TIKI max … 1 − TIKI min. */
export function othersShare(r: Pick<ClientiRoute, 'om_km_numarat' | 'om_km_tiki_min' | 'om_km_tiki_max'>): OthersShare | null {
  const tot = r.om_km_numarat ?? 0;
  if (tot <= 0 || r.om_km_tiki_min == null || r.om_km_tiki_max == null) return null;
  const lo = Math.max(0, Math.min(1, 1 - r.om_km_tiki_max / tot));
  const hi = Math.max(0, Math.min(1, 1 - r.om_km_tiki_min / tot));
  return { min: lo * 100, max: hi * 100 };
}

/** «26 %» sau «26–28 %» (fără ±, fără ~). */
export function fmtRangePct(s: OthersShare | null): string {
  if (!s) return '—';
  const a = Math.round(s.min), b = Math.round(s.max);
  return a === b ? `${a} %` : `${a}–${b} %`;
}

export const enoughData = (r: Pick<ClientiRoute, 'picioare_eligibile'>) => r.picioare_eligibile >= MIN_ELIGIBILE;

// ─── «De decis»: semnalele din Orar ───

export interface Signal {
  route_id: number;
  leg: Leg;
  kind: 'slaba' | 'fara_bilete';
  score: number;
  text: string;
  others: OthersShare | null;
}

/**
 * Cel mult `max` semnale. Niciodată pe o etichetă comună (vândută de mașinile a două rute).
 * - «slabă»: bilete pe plecare sub jumătate din mediana coridorului (același sens), și în scădere față de
 *   aceleași etichete anul trecut (sau fără comparație — spus în cuvinte);
 * - «fără bilete»: din grafic, cel puțin un sfert din plecări fără niciun bilet.
 * `routes` trebuie să vină pe un interval care se oprește cu 14 zile înaintea ultimei zile sincronizate.
 */
export function orarSignals(
  routes: OrarRoute[],
  others: Map<number, OthersShare | null> = new Map(),
  max = 5,
): Signal[] {
  const out: Signal[] = [];
  const corridorMedian = new Map<string, number>();
  const groups = new Map<string, number[]>();
  for (const r of routes) for (const l of r.picioare) {
    const pd = perDeparture(l);
    if (pd == null || l.plecari < MIN_ELIGIBILE) continue;
    const k = `${r.coridor}|${l.leg}`;
    groups.set(k, [...(groups.get(k) ?? []), pd]);
  }
  groups.forEach((v, k) => { if (v.length >= 3) corridorMedian.set(k, median(v)); });

  for (const r of routes) for (const l of r.picioare) {
    if (l.eticheta_comuna || l.plecari < MIN_ELIGIBILE) continue;
    const when = `${r.nume} ${legTime(r, l.leg) ?? ''}`.trim();
    const sens = LEG_LABEL[l.leg];
    const oth = others.get(r.route_id) ?? null;
    const pd = perDeparture(l);
    const med = corridorMedian.get(`${r.coridor}|${l.leg}`);
    if (pd != null && med && pd < 0.5 * med) {
      const yoy = l.bilete_an_trecut ? pctChange(l.bilete, l.bilete_an_trecut) : null;
      const falling = yoy != null && yoy <= -10;
      if (yoy == null || falling) {
        const ly = yoy == null ? 'fără comparație cu anul trecut' : `${Math.round(yoy)} % față de aceleași plecări anul trecut`;
        out.push({
          route_id: r.route_id, leg: l.leg, kind: 'slaba', score: 1 - pd / med + (falling ? 0.5 : 0), others: oth,
          text: `${when} (${sens}): ${fmt1(pd)} bilete pe plecare, iar în coridorul ${r.coridor} mediana e ${fmt1(med)}; ${ly}.`,
        });
        continue;
      }
    }
    if (l.din_grafic && l.plecari_fara_bilete / l.plecari >= 0.25) {
      out.push({
        route_id: r.route_id, leg: l.leg, kind: 'fara_bilete', score: l.plecari_fara_bilete / l.plecari, others: oth,
        text: `${when} (${sens}): ${l.plecari_fara_bilete} din ${l.plecari} plecări din grafic fără niciun bilet TIKI.`,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}

const fmt1 = (n: number) => n.toFixed(1).replace('.', ',');

// ─── «Față de anul trecut» ───

export type TendWindow = '12luni' | 'luna' | 'an';

export function daysInMonth(m: string): number {
  return +addDays(shiftMonth(`${m}-01`, 1), -1).slice(8, 10);
}

export const prevYearMonth = (m: string) => `${+m.slice(0, 4) - 1}${m.slice(4)}`;

/** Lunile ferestrei, ultima = luna ultimei zile. */
export function windowMonths(w: TendWindow, lastMonth: string): string[] {
  const n = w === 'luna' ? 1 : w === 'an' ? +lastMonth.slice(5, 7) : 12;
  const out: string[] = [];
  for (let k = n - 1; k >= 0; k--) out.push(shiftMonth(`${lastMonth}-01`, -k).slice(0, 7));
  return out;
}

export interface Totals { bilete: number; lei: number }

/**
 * Totalurile pe lunile date și pe aceleași luni cu un an în urmă. Luna în curs (parțială) se compară pe aceleași
 * zile: anul trecut pro rata pe zi (ca «Comparație lunară» de până acum). `missing` = lunile anului trecut fără date.
 */
export function compareMonths(
  rows: TendintaLuna[], months: string[], ultimaZi: string, coridor?: (c: string) => boolean,
): { cur: Totals; prev: Totals; missing: string[]; partialDays: number | null } {
  const lastMonth = ultimaZi.slice(0, 7);
  const lastDay = +ultimaZi.slice(8, 10);
  const partial = lastDay < daysInMonth(lastMonth) ? lastDay : null;
  const by = new Map<string, Totals>();
  for (const r of rows) {
    if (coridor && !coridor(r.coridor)) continue;
    const t = by.get(r.luna) ?? { bilete: 0, lei: 0 };
    t.bilete += r.bilete; t.lei += r.lei;
    by.set(r.luna, t);
  }
  const cur = { bilete: 0, lei: 0 }, prev = { bilete: 0, lei: 0 };
  const missing: string[] = [];
  for (const m of months) {
    const c = by.get(m), p = by.get(prevYearMonth(m));
    if (c) { cur.bilete += c.bilete; cur.lei += c.lei; }
    if (!p) { missing.push(prevYearMonth(m)); continue; }
    const f = m === lastMonth && partial ? partial / daysInMonth(prevYearMonth(m)) : 1;
    prev.bilete += p.bilete * f; prev.lei += p.lei * f;
  }
  return { cur, prev, missing, partialDays: months.includes(lastMonth) ? partial : null };
}

/** Lunile anului trecut în care ~7 % din bilete erau «Anulare» (fără cursă reală). */
export const ANULARE_MONTHS = new Set(['2024-12', '2025-01', '2025-02', '2025-03']);

/** Lunile cu treaptă de tarif: prețul modal Chișinău–Bălți schimbat cu cel puțin 2 % față de luna dinainte. */
export function tariffSteps(tarif: { luna: string; pret: number }[]): Map<string, number> {
  const s = [...tarif].sort((a, b) => a.luna.localeCompare(b.luna));
  const out = new Map<string, number>();
  for (let i = 1; i < s.length; i++) {
    if (s[i - 1].pret > 0 && Math.abs(s[i].pret / s[i - 1].pret - 1) >= 0.02) out.set(s[i].luna, s[i].pret);
  }
  return out;
}

// ─── «Cine merge pe rută»: profilul pe tronsoane și zilele ───

export interface Seg { from: string; to: string; km0: number; km1: number; numarat: number; tikiMin: number; tikiMax: number; zile: number }

/** Tronsoanele unui picior în ordinea mersului (oprirea → următoarea), fără ultima oprire. */
export function legSegments(rows: ClientiTronson[], leg: Leg): Seg[] {
  const s = rows.filter(r => r.leg === leg).sort((a, b) => a.stop_order - b.stop_order);
  const out: Seg[] = [];
  for (let i = 0; i < s.length - 1; i++) {
    const km1 = s[i].km_next ?? s[i + 1].km;
    if (km1 <= s[i].km) continue;
    out.push({ from: s[i].stop, to: s[i + 1].stop, km0: s[i].km, km1, numarat: s[i].numarat, tikiMin: s[i].tiki_min, tikiMax: s[i].tiki_max, zile: s[i].zile });
  }
  return out;
}

/**
 * Unde urcă / coboară ceilalți, în net: schimbarea diferenței numărați − TIKI (mijlocul intervalului) de la un tronson
 * la următorul, la oprirea dintre ele. Doar unde schimbarea e de cel puțin `min` oameni pe plecare. Perechile nu se știu.
 */
export function netMarks(segs: Seg[], min = 1): { stop: string; km: number; delta: number }[] {
  const out: { stop: string; km: number; delta: number }[] = [];
  let prev = 0;
  segs.forEach(s => {
    const d = Math.max(0, s.numarat - (s.tikiMin + s.tikiMax) / 2);
    const delta = d - prev;
    if (Math.abs(delta) >= min) out.push({ stop: s.from, km: s.km0, delta });
    prev = d;
  });
  return out;
}

export type DayState = 'ok' | 'necunoscut' | 'neconcordanta' | 'fara';

/** O zi pe ruta aleasă, pe picioarele alese: TIKI, ceilalți (cel puțin) și starea. */
export function dayCell(rows: ClientiZi[]): { tiki: number; others: number | null; numarati: number | null; state: DayState } {
  if (!rows.length) return { tiki: 0, others: null, numarati: null, state: 'fara' };
  const tiki = rows.reduce((a, r) => a + r.oameni_tiki, 0);
  if (rows.some(r => !r.eligibil)) return { tiki, others: null, numarati: null, state: 'necunoscut' };
  const numarati = rows.reduce((a, r) => a + r.oameni_numarati, 0);
  const mismatch = rows.some(r => r.oameni_tiki > r.oameni_numarati);
  const others = rows.reduce((a, r) => a + Math.max(0, r.oameni_numarati - r.oameni_tiki), 0);
  return { tiki, others, numarati, state: mismatch ? 'neconcordanta' : 'ok' };
}
