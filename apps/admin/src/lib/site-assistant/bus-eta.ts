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
  // Pe pagini, ca routePasses: flota întreagă pe 14 zile e azi ~510 rânduri, aproape de plafon.
  const data: { assignment_date: string; vehicle_id: string | null; vehicle_id_retur: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    let q = getSupabase().from('daily_assignments').select('assignment_date, vehicle_id, vehicle_id_retur').gte('assignment_date', since);
    if (routeId != null) q = q.eq('crm_route_id', routeId);
    const { data: page, error } = await q.order('assignment_date').order('crm_route_id').range(from, from + 999);
    if (error || !page) break;
    data.push(...page);
    if (page.length < 1000) break;
  }
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

// ---------------------------------------------------------------------------
// Ora REALĂ pe fiecare oprire, din trecerile GPS (route_stop_passes, migr. 393).
// Ion, 23.09: «după engine ruta de seară era 23:00 din Edineț la Briceni, după real el
// a trecut Edinețul mai devreme». Graficul e o promisiune veche; trecerile sunt faptul.
// ---------------------------------------------------------------------------

export interface PassRow { date: string; stop_order: number; passed_at: string; offset_min: number }

/** Ultimele zile cântăresc mai mult: dacă au destule treceri, doar ele (obiceiul s-a schimbat). */
const RECENT_DAYS = 7;
const MIN_RECENT = 4;
const MIN_ALL = 5;
/** Ora reală trecută cu mai mult de atât, fără punct GPS = autobuzul a trecut deja. */
export const PASSED_GRACE_MIN = 5;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Abaterea tipică (minute) a opririi față de grafic; null = prea puține treceri. */
export function typicalOffset(rows: PassRow[], stopOrder: number, today: string): number | null {
  const mine = rows.filter((r) => r.stop_order === stopOrder);
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const recent = mine.filter((r) => r.date >= since);
  const off = recent.length >= MIN_RECENT ? median(recent.map((r) => r.offset_min))
    : mine.length >= MIN_ALL ? median(mine.map((r) => r.offset_min)) : null;
  // Abaterea uriașă spune mai degrabă că mașina a mers pe altă cursă decât că rutiera
  // vine cu o oră mai devreme: nu riscăm să trimitem omul în stație degeaba — rămâne graficul.
  if (off == null || Math.abs(off) > MAX_OFFSET_MIN) return null;
  return Math.round(off);
}
/** Peste atât, abaterea tipică nu se crede (24.09: 11 opriri din 1778, toate curse încurcate). */
export const MAX_OFFSET_MIN = 45;

/** Durata tipică (minute) de la oprirea A la oprirea B, din zilele în care s-au prins amândouă. */
export function typicalLeg(rows: PassRow[], a: number, b: number): number | null {
  const byDay = new Map<string, Map<number, number>>();
  for (const r of rows) {
    if (r.stop_order !== a && r.stop_order !== b) continue;
    const m = byDay.get(r.date) ?? new Map<number, number>();
    m.set(r.stop_order, Date.parse(r.passed_at));
    byDay.set(r.date, m);
  }
  const mins: number[] = [];
  for (const m of byDay.values()) {
    const ta = m.get(a), tb = m.get(b);
    if (ta != null && tb != null && tb > ta) mins.push((tb - ta) / 60_000);
  }
  return mins.length >= MIN_ALL ? median(mins) : null;
}

const passCache = new Map<string, { at: number; rows: PassRow[] }>();
export async function routePasses(routeId: number, goingNorth: boolean): Promise<PassRow[]> {
  const key = `${routeId}:${goingNorth}`;
  const hit = passCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
  // Pe pagini: PostgREST taie tăcut la 1000 de rânduri (24.09, crm_stop_fares în
  // windowsFor — ruta 28 rămânea fără fereastră). Azi sunt ~40 de opriri × 15 zile, dar
  // o rută mai lungă sau o istorie mai lungă ar trece pragul fără niciun semn.
  const rows: PassRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase()
      .from('route_stop_passes')
      .select('date, stop_order, passed_at, offset_min')
      .eq('crm_route_id', routeId).eq('going_north', goingNorth).gte('date', since)
      .order('date').order('stop_order')
      .range(from, from + 999);
    if (error || !data) break;
    rows.push(...(data as PassRow[]));
    if (data.length < 1000) break;
  }
  passCache.set(key, { at: Date.now(), rows });
  return rows;
}

export interface GeoStop { name: string; lat: number; lon: number; stop_order: number }
export interface RealEta { eta: string; eta_min: number; eta_source: 'gps' | 'istoric' }

/** «HH:MM» de azi (ora Chișinăului) + minute → instant. */
function todayAt(hhmm: string, plusMin: number, now: number): number {
  const [h, m] = hhmm.split(':').map(Number);
  const local = new Date(now).toLocaleString('sv-SE', { timeZone: 'Europe/Chisinau' });
  const nowLocalMin = Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
  let delta = h * 60 + m - nowLocalMin;
  if (delta < -720) delta += 1440;
  if (delta > 720) delta -= 1440;
  return now + (delta + plusMin) * 60_000 - (now % 60_000);
}

const clock = (t: number) => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * Ora orientativă la care cursa ajunge în localitatea omului:
 *   - autobuzul e pe drum (are punct): km rămași × ritmul REAL al tronsonului dintre
 *     ultima oprire trecută și oprirea omului (din treceri); fără istoric — ritmul rutei;
 *   - n-a pornit: ora din grafic + abaterea tipică a opririi omului.
 * null = nu avem din ce spune altceva decât graficul.
 */
export async function realEta(args: {
  routeId: number; shape: LatLon[]; stops: GeoStop[]; fromName: string; toName: string;
  scheduled: string; pos?: { lat: number; lon: number; atIso: string } | null; today: string; now?: number;
}): Promise<(RealEta & { passed?: false }) | { passed: true } | null> {
  const now = args.now ?? Date.now();
  const same = (a: string, b: string) => a.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === b.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const from = args.stops.find((s) => same(s.name, args.fromName));
  const to = args.stops.find((s) => same(s.name, args.toName));
  if (!from || !to || from.stop_order === to.stop_order) return null;
  const goingNorth = from.stop_order > to.stop_order; // ca în searchTrips
  const rows = await routePasses(args.routeId, goingNorth).catch(() => [] as PassRow[]);

  if (args.pos) {
    const rem = remainingKm(args.shape, [args.pos.lat, args.pos.lon], [from.lat, from.lon], [to.lat, to.lon]);
    if (!rem) return null;
    if (rem.passed) return { passed: true };
    // Ultima oprire trecută: cea mai apropiată de autobuz, în urma lui, pe sensul cursei.
    const bi = nearestIndex(args.shape, [args.pos.lat, args.pos.lon]).i;
    const fi = nearestIndex(args.shape, [from.lat, from.lon]).i;
    const dir = Math.sign(nearestIndex(args.shape, [to.lat, to.lon]).i - fi) || 1;
    let prev: { s: GeoStop; i: number } | null = null;
    for (const s of args.stops) {
      const i = nearestIndex(args.shape, [s.lat, s.lon]).i;
      if ((bi - i) * dir >= 0 && (!prev || (i - prev.i) * dir > 0)) prev = { s, i };
    }
    let pace: number | null = null;
    if (prev && prev.i !== fi) {
      const leg = typicalLeg(rows, prev.s.stop_order, from.stop_order);
      let legKm = 0;
      for (let i = prev.i; i !== fi; i += dir) legKm += haversineKm(args.shape[i], args.shape[i + dir]);
      if (leg && legKm > 0.5) pace = leg / legKm;
    }
    pace ??= await routePace(args.routeId);
    if (!pace) return null;
    const t = Date.parse(args.pos.atIso) + rem.km * pace * 60_000;
    return { eta: clock(t), eta_min: Math.max(0, Math.round((t - now) / 60_000)), eta_source: 'gps' };
  }

  const off = typicalOffset(rows, from.stop_order, args.today);
  if (off == null) return null;
  const t = todayAt(args.scheduled, off, now);
  // Ora reală a trecut de mult și n-avem punct care să spună că întârzie: autobuzul a
  // trecut deja prin localitatea omului (prod 23.09: cursele de 18:10 și 19:20 din
  // Chișinău, încă pe drum spre nord, apăreau la 23:14 cu «~18:18 · acum»).
  if (t < now - PASSED_GRACE_MIN * 60_000) return { passed: true };
  return { eta: clock(t), eta_min: Math.max(0, Math.round((t - now) / 60_000)), eta_source: 'istoric' };
}
