// Ora orientativă la care ajunge rutiera în localitatea omului (Ion, 23.09: «să arate
// ora exactă orientativ când ajunge rutiera, nu cea din engine, în baza la GPS din trecut
// — în cât timp în mediu mașina face acești km»).
//
// ora = ora ultimului punct GPS + km rămași pe drum × minute pe km ale rutei.
//   * km rămași: pe linia rutei (route_shapes, migr. 392), de la punctul autobuzului
//     până la oprirea omului — nu în linie dreaptă.
//   * minute pe km: din istoricul GPS al mașinilor puse pe ruta asta în ultimele
//     14 zile (lde_gps_stops): timpul de mers între opriri plus opririle scurte de pe
//     traseu, împărțit la km. Rută cu prea puțin istoric → media întregii flote
//     interurbane, calculată la fel.

import { getSupabase } from '@/lib/supabase';

export type LatLon = [number, number];

const R_KM = 6371;
export function haversineKm(a: LatLon, b: LatLon): number {
  const [la1, lo1] = a.map((x) => (x * Math.PI) / 180);
  const [la2, lo2] = b.map((x) => (x * Math.PI) / 180);
  const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

/** Vârful liniei cel mai apropiat de punct, cu distanța până la el. */
export function nearestIndex(shape: LatLon[], p: LatLon): { i: number; km: number } {
  let best = 0, bestKm = Infinity;
  for (let i = 0; i < shape.length; i++) {
    const d = haversineKm(shape[i], p);
    if (d < bestKm) { bestKm = d; best = i; }
  }
  return { i: best, km: bestKm };
}

/** Autobuzul mai departe de atât de linia rutei = nu e pe traseu (ocol, depou): fără oră. */
export const OFF_ROUTE_KM = 3;

/**
 * Km pe drum de la autobuz până la oprirea omului, în sensul cursei (spre `to`).
 * `passed` = autobuzul a trecut deja de oprire; null = nu se poate spune (în afara liniei).
 */
export function remainingKm(shape: LatLon[], bus: LatLon, from: LatLon, to: LatLon):
  { km: number; passed: false } | { passed: true } | null {
  if (shape.length < 2) return null;
  const b = nearestIndex(shape, bus);
  if (b.km > OFF_ROUTE_KM) return null;
  const f = nearestIndex(shape, from).i;
  const t = nearestIndex(shape, to).i;
  if (f === t) return null;
  const dir = Math.sign(t - f);
  if ((f - b.i) * dir < 0) return { passed: true };
  let km = 0;
  for (let i = b.i; i !== f; i += dir) km += haversineKm(shape[i], shape[i + dir]);
  return { km, passed: false };
}

export interface StopRow {
  vehicle_id: string; date: string; seq: number;
  arrival_at: string; departure_at: string; dwell_min: number | null; km_from_prev: number | null;
}

// Pragurile care curăță istoricul: un segment scurt sau o viteză imposibilă e zgomot
// de GPS; o oprire lungă e capăt de cursă (așteptare în autogară), nu drum.
const MIN_SEG_KM = 2;
const MIN_KMH = 15;
const MAX_KMH = 110;
const MAX_DWELL_MIN = 15;

/** Minute pe km din opririle GPS: mers + opriri scurte de pe traseu, / km. null = prea puțin. */
export function paceFromStops(rows: StopRow[], minKm = 100): { minPerKm: number; km: number } | null {
  const byDay = new Map<string, StopRow[]>();
  for (const r of rows) {
    const k = `${r.vehicle_id}|${r.date}`;
    const list = byDay.get(k) ?? [];
    list.push(r);
    byDay.set(k, list);
  }
  let min = 0, km = 0;
  for (const list of byDay.values()) {
    list.sort((a, b) => a.seq - b.seq);
    for (let i = 1; i < list.length; i++) {
      const segKm = Number(list[i].km_from_prev ?? 0);
      const segMin = (Date.parse(list[i].arrival_at) - Date.parse(list[i - 1].departure_at)) / 60_000;
      if (!(segKm >= MIN_SEG_KM) || !(segMin > 0)) continue;
      const kmh = (segKm / segMin) * 60;
      if (kmh < MIN_KMH || kmh > MAX_KMH) continue;
      // Oprirea de la capătul segmentului intră doar dacă e pe traseu (scurtă) și nu e ultima.
      const dwell = i < list.length - 1 ? Number(list[i].dwell_min ?? 0) : 0;
      min += segMin + (dwell > 0 && dwell <= MAX_DWELL_MIN ? dwell : 0);
      km += segKm;
    }
  }
  return km >= minKm ? { minPerKm: min / km, km } : null;
}

const HISTORY_DAYS = 14;
const TTL_MS = 6 * 60 * 60_000;
const cache = new Map<string, { at: number; pace: number | null }>();

async function pagedStops(vehicleIds: string[], since: string): Promise<StopRow[]> {
  const out: StopRow[] = [];
  // PostgREST taie la 1000 de rânduri (memoria «Supabase max rows 1000»): pe pagini.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase()
      .from('lde_gps_stops')
      .select('vehicle_id, date, seq, arrival_at, departure_at, dwell_min, km_from_prev')
      .in('vehicle_id', vehicleIds)
      .gte('date', since)
      .order('vehicle_id').order('date').order('seq')
      .range(from, from + 999);
    if (error || !data) break;
    out.push(...(data as StopRow[]));
    if (data.length < 1000) break;
  }
  return out;
}

async function computePace(routeId: number | null): Promise<number | null> {
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
  let q = getSupabase().from('daily_assignments').select('assignment_date, vehicle_id, vehicle_id_retur').gte('assignment_date', since);
  if (routeId != null) q = q.eq('crm_route_id', routeId);
  const { data } = await q.limit(1000);
  const pairs = new Set<string>();
  const vehicles = new Set<string>();
  for (const a of data ?? []) {
    for (const v of [a.vehicle_id, a.vehicle_id_retur]) {
      if (!v) continue;
      pairs.add(`${v}|${a.assignment_date}`);
      vehicles.add(v as string);
    }
  }
  if (vehicles.size === 0) return null;
  // Doar zilele în care mașina chiar era pe ruta asta — altă zi ar fi altă rută.
  const rows = (await pagedStops([...vehicles], since)).filter((r) => pairs.has(`${r.vehicle_id}|${r.date}`));
  return paceFromStops(rows)?.minPerKm ?? null;
}

async function cached(key: string, fn: () => Promise<number | null>): Promise<number | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.pace;
  const pace = await fn().catch(() => null);
  cache.set(key, { at: Date.now(), pace });
  return pace;
}

/** Minute pe km pentru rută; fără istoric suficient — media flotei interurbane. */
export async function routePace(routeId: number): Promise<number | null> {
  return (await cached(`r${routeId}`, () => computePace(routeId))) ?? cached('fleet', () => computePace(null));
}

export interface Eta { eta: string; eta_min: number }

/**
 * Ora orientativă de sosire în localitatea omului; `passed` dacă autobuzul a trecut deja.
 * `atIso` = ora punctului GPS: ora se socotește de la el, nu de la «acum».
 */
export function etaFrom(km: number, minPerKm: number, atIso: string, now = Date.now()): Eta {
  const arrive = Date.parse(atIso) + km * minPerKm * 60_000;
  const eta = new Date(arrive).toLocaleTimeString('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });
  return { eta, eta_min: Math.max(0, Math.round((arrive - now) / 60_000)) };
}
