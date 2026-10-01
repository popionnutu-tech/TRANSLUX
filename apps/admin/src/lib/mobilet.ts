// Cabinetul Mobilet (cabinet-v2.mobilet.md) — API-ul din spatele lui, webapi.goticket.md, pentru contul transportatorului.
// Ion, 01.10: «fă ca o dată în zi, pe ziua de ieri, să lucreze automatizarea: să intre pe site și să colecteze datele de
// bilete». Căile și câmpurile sunt cele pe care le cheamă chiar pagina cabinetului (Rapoarte → Vânzări de bilete):
// login POST /auth/login/userpass {username, password} → {token}; vânzări GET /reports/carrier/reports/sales;
// curse GET /reports/carrier/trips. Credențialele doar din env (MOBILET_USER / MOBILET_PASS), niciodată în cod.

import { TIKI_HEADER } from '@/app/(dashboard)/numarare/tabs/bilete/ticketParse';

const API = 'https://webapi.goticket.md';
const TIMEOUT_MS = 60_000;

export interface MobiletSale {
  id: number;
  number: string;
  date: string;          // '30.09.2026 21:51' — ziua vânzării (în perioadele sincronizate în bloc: ziua sincronizării)
  soldAt: string;
  tripId: number | null;
  route: string;
  seller: string | null;
  vehicle: string | null;
  driver: string | null;
  payment: number | null;
  fromPoint: string | null;
  toPoint: string | null;
  channel: string | null;
  amount: number;
}

export interface MobiletTrip {
  tripId: number;
  date: string;          // '2026-04-01' — ziua reală a cursei
  depTime: string | null;
  routeName: string;
  fromPoint: string | null;
  toPoint: string | null;
  vehicle: string | null;
  driver: string | null;
  state: number | null;
  ticketsSold: number | null;
  seats: number | null;
  plannedOrg: string | null;
  actualOrg: string | null;
  swap: unknown;
  withdrawReason: string | null;
}

// Codurile de plată din API, potrivite cu exportul CSV pe 30.09.2026 (4 → 764 bilete / 122.254,24 lei = «Numerar»;
// 5 → 69 / 12.622,78 = «Card POS») și pe 15.10.2025 (0 = «Altă metodă de plată», 951 de bilete).
const PAYMENT: Record<number, string> = { 0: 'Altă metodă de plată', 4: 'Numerar', 5: 'Card POS' };
const CHANNEL: Record<string, string> = { TERMINAL: 'Terminal' };

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(`${API}${path}`, {
    ...rest,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Mobilet ${path.split('?')[0]}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function mobiletLogin(): Promise<string> {
  const username = process.env.MOBILET_USER;
  const password = process.env.MOBILET_PASS;
  if (!username || !password) throw new Error('MOBILET_USER / MOBILET_PASS lipsesc din env');
  const r = await call<{ token?: string }>('/auth/login/userpass', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (!r.token) throw new Error('Mobilet: login fără token');
  return r.token;
}

/** Toate vânzările din interval (ziua vânzării), pe pagini de 50.000 ca pagina cabinetului. */
export async function mobiletSales(token: string, from: string, to: string): Promise<MobiletSale[]> {
  const out: MobiletSale[] = [];
  for (let page = 0; page < 50; page++) {
    const q = new URLSearchParams({ dateFrom: from, dateTo: to, page: String(page), pageSize: '50000' });
    const r = await call<{ items: MobiletSale[]; total: number; pageSize: number }>(
      `/reports/carrier/reports/sales?${q}`, { token });
    out.push(...r.items);
    if (out.length >= r.total || r.items.length === 0) break;
  }
  return out;
}

/** Cursele din interval (ziua cursei). */
export async function mobiletTrips(token: string, from: string, to: string): Promise<MobiletTrip[]> {
  const q = new URLSearchParams({ dateFrom: from, dateTo: to });
  const r = await call<{ items: MobiletTrip[] }>(`/reports/carrier/trips?${q}`, { token });
  return r.items ?? [];
}

export interface MobiletTripSales {
  id: number;            // = tripId din vânzări
  name: string;          // 'Chisinau - Criva/Larga 12:30'
  vehicle: string | null;
  driver: string | null;
  date: string | null;   // '10.04.2026 11:21' — plecarea reală a cursei
  tickets: number | null;
}

/** Raportul «Vânzări pe curse»: are ziua reală a cursei și înainte de 02.2026, unde /reports/carrier/trips e gol
 *  (01.10: 0 curse pe 12.2024–10.2025, 12 în 12.2025), iar vânzările din blocurile sincronizate sunt datate pe ziua
 *  sincronizării. */
export async function mobiletTripSales(token: string, from: string, to: string): Promise<MobiletTripSales[]> {
  const out: MobiletTripSales[] = [];
  for (let page = 0; page < 50; page++) {
    const q = new URLSearchParams({ dateFrom: from, dateTo: to, page: String(page), pageSize: '50000' });
    const r = await call<{ items: MobiletTripSales[]; total: number }>(`/reports/carrier/reports/trips?${q}`, { token });
    out.push(...r.items);
    if (out.length >= r.total || r.items.length === 0) break;
  }
  return out;
}

/** Vânzarea din API → rândul exportului CSV (ordinea TIKI_HEADER), ca să treacă prin același normalizeRow. */
export function saleToCsvCols(s: MobiletSale): string[] {
  const cols: Record<(typeof TIKI_HEADER)[number], string> = {
    'Data': s.date ?? '',
    'Bilet': s.number ?? '',
    'Rută': s.route ?? '',
    'De la': s.fromPoint ?? '—',
    'Până la': s.toPoint ?? '—',
    'Vânzător': s.seller ?? '',
    'Vehicul': s.vehicle ?? '',
    'Șofer': s.driver ?? '',
    'Canal': s.channel ? CHANNEL[s.channel] ?? s.channel : '',
    'Plată': s.payment == null ? '' : PAYMENT[s.payment] ?? `cod ${s.payment}`,
    'Vândut, lei': String(s.amount ?? ''),
  };
  return TIKI_HEADER.map(h => cols[h]);
}
