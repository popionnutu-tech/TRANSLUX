// Regulile analitice ale tab-ului «Bilete aparat»: cu ce se compară o perioadă, ce perioade nu sunt
// de încredere și ce zile arată anormal. Pur (fără Date cu fus orar): datele sunt șiruri 'YYYY-MM-DD'.

export interface DateRange { from: string; to: string }

/** Perioade în care data din export NU e ziua vânzării (terminalele s-au sincronizat în bloc). */
// Toate exporturile TIKI (01.10) dau aceleași zile: biletele din golurile de mai jos stau pe ziua sincronizării.
export const UNRELIABLE_RANGES: (DateRange & { reason: string })[] = [
  {
    from: '2025-05-08',
    to: '2025-05-12',
    reason: 'Terminalele s-au sincronizat în bloc (12 mai): biletele din 9–11 mai au data sincronizării, nu a vânzării.',
  },
  {
    from: '2025-12-01',
    to: '2026-01-17',
    reason: 'Terminalele s-au sincronizat în bloc (6, 15–17 ianuarie): data din export e ziua sincronizării, nu a vânzării.',
  },
  {
    from: '2026-04-02',
    to: '2026-04-24',
    reason: 'Terminalele s-au sincronizat în bloc (23–24 aprilie): biletele din 2–22 aprilie au data sincronizării, nu a vânzării.',
  },
];

const DAY = 86_400_000;
const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);

export function addDays(d: string, n: number): string {
  return fromUtc(toUtc(d) + n * DAY);
}

export function daysInclusive(r: DateRange): number {
  return Math.round((toUtc(r.to) - toUtc(r.from)) / DAY) + 1;
}

/** Aceeași lungime, imediat înainte. */
export function previousPeriod(r: DateRange): DateRange {
  const n = daysInclusive(r);
  return { from: addDays(r.from, -n), to: addDays(r.from, -1) };
}

/** Aceleași zile cu un an în urmă (29 februarie → 28 februarie). */
export function shiftYear(d: string, years: number): string {
  const y = +d.slice(0, 4) + years;
  const m = d.slice(5, 7);
  let day = +d.slice(8, 10);
  if (m === '02' && day === 29) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    if (!leap) day = 28;
  }
  return `${y}-${m}-${String(day).padStart(2, '0')}`;
}

export function sameRangeLastYear(r: DateRange): DateRange {
  return { from: shiftYear(r.from, -1), to: shiftYear(r.to, -1) };
}

/** Taie intervalul la ultima zi cu date: comparațiile se fac pe aceleași zile, nu lună plină vs lună parțială. */
export function clampToData(r: DateRange, lastDataDate: string | null): DateRange {
  if (!lastDataDate || r.to <= lastDataDate) return r;
  return { from: r.from, to: lastDataDate < r.from ? r.from : lastDataDate };
}

export function overlaps(a: DateRange, b: DateRange): boolean {
  return a.from <= b.to && b.from <= a.to;
}

export function unreliableOverlap(r: DateRange): (DateRange & { reason: string }) | null {
  return UNRELIABLE_RANGES.find(u => overlaps(r, u)) ?? null;
}

export function isUnreliableMonth(month: string): boolean {
  const from = `${month}-01`;
  return !!unreliableOverlap({ from, to: addDays(shiftMonth(from, 1), -1) });
}

export function shiftMonth(d: string, n: number): string {
  let y = +d.slice(0, 4);
  let m = +d.slice(5, 7) + n;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/** Variația în procente; null dacă baza e 0 sau lipsește. */
export function pctChange(cur: number | null | undefined, base: number | null | undefined): number | null {
  if (cur == null || base == null || base === 0) return null;
  return ((cur - base) / base) * 100;
}

/**
 * Zile cu volum anormal: peste `factor` × mediana zilelor din jur (±14 zile).
 * Prinde sincronizările în bloc (ex. 16.01.2026 cu 17.924 de bilete față de ~700 într-o zi obișnuită).
 */
export function anomalousDays(
  daily: { d: string; tickets: number }[],
  factor = 3,
  window = 14,
): { d: string; tickets: number; median: number }[] {
  const sorted = [...daily].sort((a, b) => a.d.localeCompare(b.d));
  const out: { d: string; tickets: number; median: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const lo = addDays(sorted[i].d, -window);
    const hi = addDays(sorted[i].d, window);
    const around = sorted.filter((x, j) => j !== i && x.d >= lo && x.d <= hi).map(x => x.tickets);
    const pool = around.length >= 5 ? around : sorted.filter((_, j) => j !== i).map(x => x.tickets);
    if (!pool.length) continue;
    const med = median(pool);
    if (med > 0 && sorted[i].tickets > factor * med) out.push({ ...sorted[i], median: med });
  }
  return out;
}

export function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Indicele «ține clienții»: biletele reale ale șoferului (sau ale cursei) raportate la cât ar fi vândut
 * un șofer mediu pe aceleași curse (aceeași rută + oră), în aceleași zile. 1,00 = media; nu depinde
 * de faptul că unul lucrează pe o rută mare și altul pe una mică.
 */
export function retentionIndex(actual: number, expected: number): number | null {
  if (!expected) return null;
  return actual / expected;
}

export function retentionLabel(idx: number | null): { text: string; tone: 'good' | 'ok' | 'bad' | 'na' } {
  if (idx == null) return { text: '—', tone: 'na' };
  if (idx >= 1.1) return { text: 'Ține bine clienții', tone: 'good' };
  if (idx >= 0.9) return { text: 'În medie', tone: 'ok' };
  return { text: 'Sub medie', tone: 'bad' };
}

export type Preset = 'luna_curenta' | 'luna_trecuta' | 'ultimele_30' | 'ultimele_90' | 'anul_curent';

/** Presetări raportate la ultima zi cu date (nu la azi), ca «luna curentă» să nu fie goală. */
export function presetRange(p: Preset, anchor: string): DateRange {
  const monthStart = `${anchor.slice(0, 7)}-01`;
  switch (p) {
    case 'luna_curenta': return { from: monthStart, to: anchor };
    case 'luna_trecuta': {
      const from = shiftMonth(monthStart, -1);
      return { from, to: addDays(monthStart, -1) };
    }
    case 'ultimele_30': return { from: addDays(anchor, -29), to: anchor };
    case 'ultimele_90': return { from: addDays(anchor, -89), to: anchor };
    case 'anul_curent': return { from: `${anchor.slice(0, 4)}-01-01`, to: anchor };
  }
}

export const MONTHS_RO = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec'];

export function monthLabel(month: string): string {
  return `${MONTHS_RO[+month.slice(5, 7) - 1]} ${month.slice(0, 4)}`;
}

export function fmtDate(d: string): string {
  return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
}
