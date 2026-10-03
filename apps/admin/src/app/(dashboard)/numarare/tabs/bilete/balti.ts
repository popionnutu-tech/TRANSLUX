// «Locuri în Bălți» (ION-181): aritmetica pură a matricei — gruparea coloanelor pe luni → săptămâni → zile (ca în
// Google Sheets: fiecare grup se închide într-o singură coloană), mediile ponderate pe curse și treapta de culoare.
// Datele sunt șiruri 'YYYY-MM-DD'; fără Date cu fus orar.

import { addDays } from './periods';

/**
 * Sumele unei celule (pe toate cursele din ea); mediile se fac la afișare (ION-220, după revizia Claude + GPT):
 *   vinde = Σ max(20 − numărați la ieșirea din Bălți, 0), plafonat pe fiecare plecare, apoi media;
 *   libere / urca = doar pe plecările cu bilete Mobilet atribuite (nLib), altfel necunoscute;
 *   plin = plecările cu 20 sau mai mulți numărați; nepotr = plecările cu mai multe bilete din Bălți decât numărați.
 */
export interface Cell { n: number; vinde: number; plin: number; nLib: number; libere: number; urca: number; nepotr: number }
export interface CellMean {
  n: number; vinde: number; libere: number | null; urca: number | null; plin: boolean; nepotr: number;
  /** doar la total: curse numărate și curse din grafic în zilele coloanei */
  numarate?: number; programate?: number;
}

export const LOCURI = 20;

export type ColKind = 'day' | 'week' | 'month' | 'period' | 'dow';
export interface Column { key: string; kind: ColKind; dates: string[]; label: string; title: string }
export interface Week { key: string; label: string; iso: number; dates: string[] }
export interface Month { key: string; label: string; weeks: Week[] }

export const ZERO: Cell = { n: 0, vinde: 0, plin: 0, nLib: 0, libere: 0, urca: 0, nepotr: 0 };

export function addCell(a: Cell, b: Cell | undefined): Cell {
  if (!b) return a;
  return {
    n: a.n + b.n, vinde: a.vinde + b.vinde, plin: a.plin + b.plin, nLib: a.nLib + b.nLib,
    libere: a.libere + b.libere, urca: a.urca + b.urca, nepotr: a.nepotr + b.nepotr,
  };
}

export function mean(c: Cell): CellMean | null {
  if (!c.n) return null;
  return {
    n: c.n, vinde: c.vinde / c.n, plin: c.plin === c.n, nepotr: c.nepotr,
    libere: c.nLib ? c.libere / c.nLib : null, urca: c.nLib ? c.urca / c.nLib : null,
  };
}

/**
 * Totalul pe toate graficele, media pe zi (ION-214; acoperirea ION-220). Pe fiecare zi a coloanei se iau graficele din
 * grafic (program): cel numărat intră cu cifrele lui, cel nenumărat cu media lui în aceeași coloană (dacă are), ca o zi
 * numărată incomplet să nu scadă totalul; apoi media pe zile (ex. media celor 4 sâmbete). Fără program pe o zi, intră
 * graficele numărate. numarate / programate se arată la hover.
 */
export function totalRoutes(idx: CellIndex, prog: Set<string>, routes: string[], dates: string[]): CellMean | null {
  const medii = new Map<string, CellMean | null>(routes.map(r => [r, mean(sumCells(idx, [r], dates))]));
  let zile = 0, vinde = 0, libere = 0, urca = 0, nLibZile = 0, numarate = 0, programate = 0, nepotr = 0;
  for (const d of dates) {
    let are = false, zLib = 0, zUrca = 0, libOk = true;
    let zVinde = 0;
    for (const r of routes) {
      const c = idx.get(cellKey(r, d));
      const inProgram = prog.has(cellKey(r, d)) || !!c;
      if (!inProgram) continue;
      programate++;
      const m = c ? mean(c) : medii.get(r) ?? null;
      if (!m) { libOk = false; continue; }
      if (c) { numarate++; nepotr += c.nepotr; }
      are = true;
      zVinde += m.vinde;
      if (m.libere == null || m.urca == null) libOk = false;
      else { zLib += m.libere; zUrca += m.urca; }
    }
    if (!are) continue;
    zile++;
    vinde += zVinde;
    if (libOk) { nLibZile++; libere += zLib; urca += zUrca; }
  }
  if (!zile) return null;
  return {
    n: zile, vinde: vinde / zile, plin: false, nepotr,
    libere: nLibZile ? libere / nLibZile : null, urca: nLibZile ? urca / nLibZile : null,
    numarate, programate,
  };
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

export interface ZiBalti { r: string; d: string; la_plecare: number; vinde: number; urca: number | null; libere: number | null }

export function indexCells(zile: ZiBalti[]): CellIndex {
  const m: CellIndex = new Map();
  for (const z of zile) {
    const lib = z.urca != null && z.libere != null;
    m.set(cellKey(z.r, z.d), {
      n: 1, vinde: Number(z.vinde), plin: z.la_plecare >= LOCURI ? 1 : 0, nLib: lib ? 1 : 0,
      libere: lib ? Number(z.libere) : 0, urca: lib ? Number(z.urca) : 0,
      nepotr: lib && Number(z.urca) > z.la_plecare ? 1 : 0,
    });
  }
  return m;
}

export const programSet = (program: { r: string; d: string }[]) => new Set(program.map(p => cellKey(p.r, p.d)));

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
