// «Locuri în Bălți» (ION-181): aritmetica pură a matricei — gruparea coloanelor pe luni → săptămâni → zile (ca în
// Google Sheets: fiecare grup se închide într-o singură coloană), mediile ponderate pe curse și treapta de culoare.
// Datele sunt șiruri 'YYYY-MM-DD'; fără Date cu fus orar.

import { addDays } from './periods';

/**
 * Sumele unei celule (pe toate cursele din ea); mediile se fac la afișare. verif = Σ (20 − oamenii numărați la ieșirea
 * din Bălți), verificarea din Numărare (ION-216).
 */
export interface Cell { n: number; libere: number; urca: number; verif: number }
export interface CellMean { n: number; libere: number; urca: number; vinde: number; plin: boolean; verif: number }

export const LOCURI = 20;

export type ColKind = 'day' | 'week' | 'month' | 'period' | 'dow';
export interface Column { key: string; kind: ColKind; dates: string[]; label: string; title: string }
export interface Week { key: string; label: string; iso: number; dates: string[] }
export interface Month { key: string; label: string; weeks: Week[] }

export const ZERO: Cell = { n: 0, libere: 0, urca: 0, verif: 0 };

export function addCell(a: Cell, b: Cell | undefined): Cell {
  if (!b) return a;
  return { n: a.n + b.n, libere: a.libere + b.libere, urca: a.urca + b.urca, verif: a.verif + b.verif };
}

export function mean(c: Cell): CellMean | null {
  if (!c.n) return null;
  const libere = c.libere / c.n;
  const urca = c.urca / c.n;
  return { n: c.n, libere, urca, vinde: Math.max(0, libere - urca), plin: urca > libere, verif: c.verif / c.n };
}

/**
 * Totalul pe toate graficele, media pe zi (ION-213 → ION-214, Ion: «totalul tot media, i.e. media pe o sâmbătă din 4»):
 * pe fiecare zi a coloanei se adună toate cursele zilei, apoi media pe zilele cu curse. «Mai putem vinde» se ia pe
 * fiecare grafic al zilei și se adună: cursa plină nu scade din locurile altora. n = zilele cu curse.
 */
export function totalRoutes(idx: CellIndex, routes: string[], dates: string[]): CellMean | null {
  let zile = 0, libere = 0, urca = 0, vinde = 0, verif = 0;
  for (const d of dates) {
    let are = false;
    for (const r of routes) {
      const c = idx.get(cellKey(r, d));
      const m = c && mean(c);
      if (!m) continue;
      are = true;
      libere += c.libere; urca += c.urca; vinde += m.vinde * m.n; verif += c.verif;
    }
    if (are) zile++;
  }
  if (!zile) return null;
  return { n: zile, libere: libere / zile, urca: urca / zile, vinde: vinde / zile, plin: false, verif: verif / zile };
}

const DAY = 86_400_000;
const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

/** 1 = luni … 7 = duminică. */
export function isoDow(d: string): number {
  const x = new Date(toUtc(d)).getUTCDay();
  return x === 0 ? 7 : x;
}

export function isoWeek(d: string): number {
  const t = new Date(toUtc(d));
  t.setUTCDate(t.getUTCDate() + 4 - isoDow(d));
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - y0) / DAY + 1) / 7);
}

export const DOW_RO = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];
export const DOW_LONG = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];
const MONTHS_LONG = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

export function monthLabelLong(month: string): string {
  return `${MONTHS_LONG[+month.slice(5, 7) - 1]} ${month.slice(0, 4)}`;
}
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/**
 * Calendarul perioadei: luni → săptămâni (luni–duminică; o săptămână ruptă de schimbarea lunii apare în ambele luni,
 * fiecare cu zilele ei) → zile. Fiecare nivel se poate închide separat.
 */
export function buildCalendar(from: string, to: string): Month[] {
  const months: Month[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const mk = d.slice(0, 7);
    let m = months[months.length - 1];
    if (!m || m.key !== mk) { m = { key: mk, label: monthLabelLong(mk), weeks: [] }; months.push(m); }
    const wk = addDays(d, 1 - isoDow(d)); // luni-ul săptămânii
    let w = m.weeks[m.weeks.length - 1];
    if (!w || w.key !== wk) { w = { key: wk, label: '', iso: isoWeek(d), dates: [] }; m.weeks.push(w); }
    w.dates.push(d);
  }
  for (const m of months) for (const w of m.weeks) {
    const a = w.dates[0], b = w.dates[w.dates.length - 1];
    w.label = a === b ? dm(a) : `${dm(a)}–${dm(b)}`;
  }
  return months;
}

/** Cheile grupurilor închise; implicit toate săptămânile închise, lunile deschise. */
export function defaultClosed(cal: Month[]): Set<string> {
  const s = new Set<string>();
  for (const m of cal) for (const w of m.weeks) s.add(`w:${m.key}:${w.key}`);
  return s;
}

export function weekKey(m: Month, w: Week): string { return `w:${m.key}:${w.key}`; }
export function monthKey(m: Month): string { return `m:${m.key}`; }

/** Coloanele vizibile ale calendarului după ce s-au închis grupurile. */
export function calendarColumns(cal: Month[], closed: Set<string>): Column[] {
  const cols: Column[] = [];
  for (const m of cal) {
    if (closed.has(monthKey(m))) {
      cols.push({ key: monthKey(m), kind: 'month', dates: m.weeks.flatMap(w => w.dates), label: 'media', title: m.label });
      continue;
    }
    for (const w of m.weeks) {
      if (closed.has(weekKey(m, w))) {
        cols.push({ key: weekKey(m, w), kind: 'week', dates: w.dates, label: 'media', title: `săptămâna ${w.iso}, ${w.label}` });
      } else {
        for (const d of w.dates) {
          cols.push({ key: `d:${d}`, kind: 'day', dates: [d], label: `${DOW_RO[isoDow(d) - 1]} ${+d.slice(8, 10)}`, title: `${DOW_LONG[isoDow(d) - 1]} ${dm(d)}.${d.slice(0, 4)}` });
        }
      }
    }
  }
  return cols;
}

/** Câte coloane vizibile acoperă o lună / o săptămână (pentru colSpan în antet). */
export function monthSpan(m: Month, closed: Set<string>): number {
  if (closed.has(monthKey(m))) return 1;
  return m.weeks.reduce((s, w) => s + weekSpan(m, w, closed), 0);
}
export function weekSpan(m: Month, w: Week, closed: Set<string>): number {
  return closed.has(weekKey(m, w)) ? 1 : w.dates.length;
}

/** Cele 7 coloane ale modului «zile ale săptămânii», cu zilele perioadei care cad în fiecare. */
export function weekdayColumns(from: string, to: string): Column[] {
  const cols: Column[] = DOW_LONG.map((l, i) => ({ key: `dow:${i + 1}`, kind: 'dow', dates: [], label: l, title: `toate zilele de ${l}` }));
  for (let d = from; d <= to; d = addDays(d, 1)) cols[isoDow(d) - 1].dates.push(d);
  return cols;
}

export type CellIndex = Map<string, Cell>;
export const cellKey = (r: string, d: string) => `${r}|${d}`;

export function indexCells(
  zile: { r: string; d: string; n: number; libere: number; urca: number; la_plecare?: number | null }[],
): CellIndex {
  const m: CellIndex = new Map();
  for (const z of zile) {
    const verif = Math.max(0, LOCURI - (z.la_plecare ?? LOCURI)) * z.n;
    m.set(cellKey(z.r, z.d), { n: z.n, libere: Number(z.libere), urca: Number(z.urca), verif });
  }
  return m;
}

/** Suma celulelor unei rute (sau ale tuturor rutelor) pe zilele unei coloane. */
export function sumCells(idx: CellIndex, routes: string[], dates: string[]): Cell {
  let acc = ZERO;
  for (const r of routes) for (const d of dates) acc = addCell(acc, idx.get(cellKey(r, d)));
  return acc;
}

/** Treapta de culoare 0…5 pentru «mai putem vinde», pe scara 0–20 locuri (20 de locuri în rutieră, ION-213). */
export function step(vinde: number, max = 20): number {
  return Math.min(5, Math.max(0, Math.floor((vinde / max) * 6)));
}

/** '2:35' → '02:35'. */
export function fmtOra(ora: string): string {
  const [h = '', m = ''] = ora.split(':');
  return `${h.padStart(2, '0')}:${m}`;
}

export const nf1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
