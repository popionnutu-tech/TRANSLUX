// Biletele bătute de șoferi din aparat (terminal TIKI): citirea exportului «carrier-2-sales-*.csv».
// Totul e pur (fără rețea, fără Date/fus orar) ca să ruleze la fel în browser, pe server și în teste.
// Regulile vin din analiza exporturilor 2025–2026 (Ion, 30.09): ora cursei stă fie în față
// («6:00 Criva - Chisinau/Larga»), fie la coadă («Chisinau - Criva 10:10»); cursa care pleacă din
// Chișinău e «tur»; «Anulare X.X» sunt vânzări reale fără cursă; TEST / Copy of se aruncă.

export const TIKI_HEADER = [
  'Data', 'Bilet', 'Rută', 'De la', 'Până la', 'Vânzător', 'Vehicul', 'Șofer', 'Canal', 'Plată', 'Vândut, lei',
] as const;

export type Direction = 'tur' | 'retur' | 'necunoscut';

export interface TikiRow {
  ticket_no: string;
  sale_ts: string;        // '2026-09-30T15:46:00' — ora locală (Chișinău), fără fus orar
  sale_date: string;      // '2026-09-30'
  route_raw: string;
  route_name: string;     // fără oră, cu cratimele normalizate: «Chisinau - Criva/Larga»
  route_time: string | null; // '06:00'
  direction: Direction;
  from_station: string | null;
  to_station: string | null;
  pair: string | null;    // «Chisinau - Balti» (ordonată, fără sens)
  price: number;
  payment: string | null;
  channel: string | null;
  seller: string | null;
  driver_name: string | null;
  vehicle: string | null;
  is_anulare: boolean;
}

export type ExcludeReason = 'test' | 'data_invalida' | 'pret_invalid' | 'fara_bilet';

export interface ParseResult {
  rows: TikiRow[];
  excluded: Record<ExcludeReason, number>;
  duplicatesInFile: number;
  totalLines: number;
  dateMin: string | null;
  dateMax: string | null;
}

/** Parser CSV cu separator «;», ghilimele (cu "" în interior), CRLF și BOM. */
export function parseCsv(text: string, sep = ';'): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') out.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') out.push(row); }
  return out;
}

/** «30.09.2026 15:46» → { ts: '2026-09-30T15:46:00', date: '2026-09-30' } (fără conversie de fus orar). */
export function parseRoDateTime(s: string): { ts: string; date: string } | null {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*$/.exec(s);
  if (!m) return null;
  const [, d, mo, y, h = '0', mi = '0', se = '0'] = m;
  const dd = +d, mm = +mo, hh = +h, mn = +mi, ss = +se;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || hh > 23 || mn > 59 || ss > 59) return null;
  const p2 = (n: number) => String(n).padStart(2, '0');
  const date = `${y}-${p2(mm)}-${p2(dd)}`;
  return { ts: `${date}T${p2(hh)}:${p2(mn)}:${p2(ss)}`, date };
}

export function parsePrice(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100) / 100;
}

const TIME_RE = /(\d{1,2}):(\d{2})/;

/** Cursa din export → nume curat, ora, direcția. */
export function parseRoute(raw: string): {
  name: string; time: string | null; direction: Direction; isAnulare: boolean; excluded: boolean;
} {
  const r = raw.trim().replace(/\s+/g, ' ');
  if (/test/i.test(r) || /^copy of/i.test(r)) {
    return { name: r, time: null, direction: 'necunoscut', isAnulare: false, excluded: true };
  }
  if (/^anulare\b/i.test(r)) {
    return { name: 'Anulare', time: null, direction: 'necunoscut', isAnulare: true, excluded: false };
  }
  let time: string | null = null;
  const tm = TIME_RE.exec(r);
  if (tm) time = `${tm[1].padStart(2, '0')}:${tm[2]}`;
  const name = r
    .replace(/^\d{1,2}:\d{2}\s*/, '')
    .replace(/\s*\d{1,2}:\d{2}$/, '')
    .replace(/\s*-\s*/g, ' - ')
    .trim();
  const direction: Direction = /^chi[sș]in[aă]u\b/i.test(name) ? 'tur' : 'retur';
  return { name, time, direction, isAnulare: false, excluded: false };
}

/** Stația din export: «Chisinau GA» → «Chisinau», «Ocnita (sat)» → «Ocnita», «—» → null. */
export function normalizeStation(s: string | null | undefined): string | null {
  if (s == null) return null;
  let t = s.trim().replace(/\s+/g, ' ');
  if (!t || t === '—' || t === '-' || t === '–') return null;
  t = t.replace(/\s+GA$/i, '');
  if (/^ocnita \(sat\)$/i.test(t)) t = 'Ocnita';
  return t;
}

function stationRank(s: string): number {
  const k = s.toLowerCase();
  if (k === 'chisinau') return 0;
  if (k === 'balti') return 1;
  return 2;
}

/** Tipul biletului = perechea de stații, fără sens: Chișinău primul, apoi Bălți, apoi alfabetic. */
export function pairKey(a: string, b: string): string {
  const [x, y] = [a, b].sort((p, q) => stationRank(p) - stationRank(q) || p.localeCompare(q, 'ro'));
  return `${x} - ${y}`;
}

const clean = (s: string | undefined) => {
  const t = (s ?? '').trim();
  return t && t !== '—' ? t : null;
};

/** Un rând din CSV (în ordinea TIKI_HEADER) → bilet normalizat sau motivul excluderii. */
export function normalizeRow(cols: string[]): TikiRow | { excluded: ExcludeReason } {
  const [data, bilet, ruta, de, pana, vanzator, vehicul, sofer, canal, plata, suma] = cols;
  const ticket = (bilet ?? '').trim();
  if (!ticket) return { excluded: 'fara_bilet' };
  const route = parseRoute(ruta ?? '');
  if (route.excluded) return { excluded: 'test' };
  // Rândurile de probă ale furnizorului: «TEST TEST» pe mașina «TEST 000».
  if (/\btest\b/i.test(sofer ?? '') || /^test\b/i.test((vehicul ?? '').trim())) return { excluded: 'test' };
  const dt = parseRoDateTime(data ?? '');
  if (!dt) return { excluded: 'data_invalida' };
  const price = parsePrice(suma ?? '');
  if (price === null) return { excluded: 'pret_invalid' };
  const from = normalizeStation(de);
  const to = normalizeStation(pana);
  return {
    ticket_no: ticket,
    sale_ts: dt.ts,
    sale_date: dt.date,
    route_raw: (ruta ?? '').trim(),
    route_name: route.name,
    route_time: route.time,
    direction: route.direction,
    from_station: from,
    to_station: to,
    pair: from && to ? pairKey(from, to) : null,
    price,
    payment: clean(plata),
    channel: clean(canal),
    seller: clean(vanzator),
    driver_name: clean(sofer)?.replace(/\s+/g, ' ').toUpperCase() ?? null,
    vehicle: clean(vehicul)?.replace(/\s+/g, ' ').toUpperCase() ?? null,
    is_anulare: route.isAnulare,
  };
}

export function checkHeader(header: string[]): string | null {
  const h = header.map(s => s.trim());
  const missing = TIKI_HEADER.filter((c, i) => h[i] !== c);
  if (missing.length) {
    return `Fișierul nu pare un export de vânzări din aparat. Coloane așteptate: ${TIKI_HEADER.join('; ')}`;
  }
  return null;
}

/** Cheia unui bilet: aparatul refolosește numerele (ex. «31-12-155» pe 13.11.2025 și pe 28.02.2026, alt preț),
 *  deci biletul e numărul + cursa + mașina + șoferul + prețul. Ora nu intră: același bilet apare în
 *  exporturi diferite cu un minut diferență. Aceeași cheie e coloana generată tiki_tickets.ticket_key (migr. 448). */
export function ticketKey(r: Pick<TikiRow, 'ticket_no' | 'route_raw' | 'vehicle' | 'driver_name' | 'price'>): string {
  return [r.ticket_no, r.route_raw, r.vehicle ?? '', r.driver_name ?? '', r.price].join('|');
}

/** Tot fișierul: antet, rânduri, excluderi, dubluri (același bilet de mai multe ori, după ticketKey). */
export function parseTikiExport(text: string): ParseResult | { error: string } {
  const table = parseCsv(text);
  if (!table.length) return { error: 'Fișierul e gol.' };
  const headerErr = checkHeader(table[0]);
  if (headerErr) return { error: headerErr };
  const excluded: Record<ExcludeReason, number> = { test: 0, data_invalida: 0, pret_invalid: 0, fara_bilet: 0 };
  const seen = new Set<string>();
  const rows: TikiRow[] = [];
  let dup = 0;
  let dateMin: string | null = null;
  let dateMax: string | null = null;
  for (let i = 1; i < table.length; i++) {
    const r = normalizeRow(table[i]);
    if ('excluded' in r) { excluded[r.excluded]++; continue; }
    const key = ticketKey(r);
    if (seen.has(key)) { dup++; continue; }
    seen.add(key);
    rows.push(r);
    if (!dateMin || r.sale_date < dateMin) dateMin = r.sale_date;
    if (!dateMax || r.sale_date > dateMax) dateMax = r.sale_date;
  }
  return { rows, excluded, duplicatesInFile: dup, totalLines: table.length - 1, dateMin, dateMax };
}

/** Lunile atinse de un interval, ca 'YYYY-MM' (pentru recalculul lunar după import). */
export function monthsBetween(from: string, to: string): string[] {
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const [ty, tm] = to.slice(0, 7).split('-').map(Number);
  const out: string[] = [];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Rândul ca tablou compact (trimis la server în bucăți) și înapoi. */
export const ROW_FIELDS = [
  'ticket_no', 'sale_ts', 'sale_date', 'route_raw', 'route_name', 'route_time', 'direction',
  'from_station', 'to_station', 'pair', 'price', 'payment', 'channel', 'seller', 'driver_name', 'vehicle', 'is_anulare',
] as const satisfies readonly (keyof TikiRow)[];

export type PackedRow = (string | number | boolean | null)[];

export function packRow(r: TikiRow): PackedRow {
  return ROW_FIELDS.map(f => r[f]);
}

export function unpackRow(a: PackedRow): TikiRow {
  const o: Record<string, unknown> = {};
  ROW_FIELDS.forEach((f, i) => { o[f] = a[i]; });
  return o as unknown as TikiRow;
}
