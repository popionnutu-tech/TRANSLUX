'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { syncWeather } from '@/lib/weather';

// ─── Types ───

export interface DriverPerformanceRow {
  driver_id: string;
  driver_name: string;
  route_name: string;
  crm_route_id: number;
  sessions_count: number;
  avg_passengers: number;
  baseline_passengers: number | null;
  performance_pct: number | null;
  total_revenue: number;
  baseline_revenue: number | null;
  is_stable: boolean;
  sample_count: number;
  total_km_driven: number;
  avg_revenue_per_km: number | null;
}

export interface RouteEtalon {
  crm_route_id: number;
  route_name: string;
  time_chisinau: string;
  time_nord: string;
  day_etalons: [number | null, number | null, number | null, number | null, number | null, number | null, number | null]; // Mon-Sun
  total_etalon: number | null;
  stable_driver_name: string | null;
  stable_driver_sessions: number;
  total_sample: number;
}

export interface EmptyTripRow {
  route_name: string;
  crm_route_id: number;
  time_chisinau: string;
  time_nord: string;
  avg_passengers: number;
  baseline: number | null;
  load_pct: number | null;
  sessions_count: number;
  empty_sessions: number;
  day_avg: [number, number, number, number, number, number, number]; // Mon-Sun (pasageri×opriri)
  rain_sessions: number;
  rain_avg_passengers: number | null;
  // Real passenger metrics (added in migration 037)
  unique_passengers_avg: number;
  passenger_km_avg: number;
  load_factor_pct: number | null;
  revenue_per_km: number | null;
  route_length_km: number | null;
}

export type RouteQuadrant = 'star' | 'efficient_small' | 'underperform_large' | 'candidate_to_close';

export interface RouteScorecardRow {
  crm_route_id: number;
  route_name: string;
  time_chisinau: string;
  total_revenue: number;
  avg_load_factor_pct: number | null;
  total_unique_passengers: number;
  total_passenger_km: number;
  sessions_count: number;
  avg_revenue_per_km: number | null;
  route_length_km: number | null;
  quadrant: RouteQuadrant;
}

export interface DriverScorecardRow {
  driver_id: string;
  driver_name: string;
  sessions_count: number;
  total_km_driven: number;
  total_revenue: number;
  total_unique_passengers: number;
  avg_revenue_per_km: number | null;
  pct_vs_route_norm: number | null; // sample_count-weighted
  sample_count: number;
}

export interface OverviewKPI {
  total_unique_passengers: number;
  total_passenger_km: number;
  total_revenue: number;
  avg_load_factor_pct: number | null;
  sessions_count: number;
  avg_revenue_per_km: number | null;
  // Deltas vs previous equal-length period
  delta_passengers_pct: number | null;
  delta_revenue_pct: number | null;
  delta_load_factor_pct: number | null;
  delta_revenue_per_km_pct: number | null;
}

export interface DemandSupplyRow {
  route: string;
  search_count: number;
  call_count: number;
  avg_actual_passengers: number | null;
  conversion_rate: number;
  gap_score: number | null;
  sessions_count: number;
}

export interface RevenueOverview {
  total_revenue: number;
  total_sessions: number;
  avg_revenue_per_session: number;
  best_route: { name: string; revenue: number } | null;
  worst_route: { name: string; revenue: number } | null;
}

export interface RouteOption {
  id: number;
  dest_to_ro: string;
  time_chisinau: string;
  time_nord: string;
}

// ─── Helpers ───

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't')
    .replace(/[ăâ]/g, 'a')
    .replace(/[î]/g, 'i')
    .trim();
}

// DOW: JS getDay() returns 0=Sun, Postgres EXTRACT(DOW) also 0=Sun.
// We display Mon-Sun (0-6 in our UI array), so map: pg dow 1→idx 0 (Mon), ... pg dow 0→idx 6 (Sun)
function pgDowToIdx(dow: number): number {
  return dow === 0 ? 6 : dow - 1;
}

interface SessionRow {
  session_id: string;
  assignment_date: string;
  crm_route_id: number;
  route_name: string;
  time_chisinau: string;
  time_nord: string;
  driver_id: string | null;
  driver_name: string | null;
  total_passengers: number;
  total_lei: number;
  dow: number;
  season: string;
  rain_heavy: boolean;
  // New metrics from v_session_metrics (migration 037)
  unique_passengers: number;
  passenger_km: number;
  route_length_km: number;
  revenue_per_km: number | null;
  load_factor_pct: number | null;
}

interface BaselineRow {
  crm_route_id: number;
  season: string;
  dow: number;
  rain_heavy: boolean;
  avg_passengers: number;
  avg_revenue_lei: number;
  sample_count: number;
}

async function fetchSessions(dateFrom: string, dateTo: string): Promise<SessionRow[]> {
  const PAGE = 1000;
  const rows: SessionRow[] = [];
  let offset = 0;
  const sb = getSupabase();
  while (true) {
    const { data } = await sb
      .from('v_session_metrics')
      .select('session_id, assignment_date, crm_route_id, route_name, time_chisinau, time_nord, driver_id, driver_name, total_passengers, total_lei, dow, season, rain_heavy, unique_passengers, passenger_km, route_length_km, revenue_per_km, load_factor_pct')
      .gte('assignment_date', dateFrom)
      .lte('assignment_date', dateTo)
      .order('assignment_date', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    // Coerce numeric strings from view to numbers
    rows.push(...(data.map((r: Record<string, unknown>) => ({
      ...r,
      passenger_km: Number(r.passenger_km ?? 0),
      route_length_km: Number(r.route_length_km ?? 0),
      revenue_per_km: r.revenue_per_km !== null && r.revenue_per_km !== undefined ? Number(r.revenue_per_km) : null,
      load_factor_pct: r.load_factor_pct !== null && r.load_factor_pct !== undefined ? Number(r.load_factor_pct) : null,
    })) as SessionRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

async function fetchBaselines(): Promise<BaselineRow[]> {
  const { data } = await getSupabase()
    .from('route_baselines')
    .select('crm_route_id, season, dow, rain_heavy, avg_passengers, avg_revenue_lei, sample_count');
  return (data || []) as BaselineRow[];
}

function findBaseline(
  baselines: BaselineRow[],
  routeId: number,
  season: string,
  dow: number,
  rainHeavy: boolean
): { avg_passengers: number; avg_revenue_lei: number; sample_count: number } | null {
  // 1. Exact match
  let match = baselines.find(b =>
    b.crm_route_id === routeId && b.season === season && b.dow === dow && b.rain_heavy === rainHeavy && b.sample_count >= 3
  );
  if (match) return match;

  // 2. Same route + season + dow, any weather
  const sameSeasonDow = baselines.filter(b =>
    b.crm_route_id === routeId && b.season === season && b.dow === dow
  );
  if (sameSeasonDow.length > 0) {
    const totalSamples = sameSeasonDow.reduce((s, b) => s + b.sample_count, 0);
    if (totalSamples >= 3) {
      const avgP = sameSeasonDow.reduce((s, b) => s + b.avg_passengers * b.sample_count, 0) / totalSamples;
      const avgR = sameSeasonDow.reduce((s, b) => s + b.avg_revenue_lei * b.sample_count, 0) / totalSamples;
      return { avg_passengers: avgP, avg_revenue_lei: avgR, sample_count: totalSamples };
    }
  }

  // 3. Same route + dow, any season
  const sameDow = baselines.filter(b => b.crm_route_id === routeId && b.dow === dow);
  if (sameDow.length > 0) {
    const totalSamples = sameDow.reduce((s, b) => s + b.sample_count, 0);
    if (totalSamples >= 3) {
      const avgP = sameDow.reduce((s, b) => s + b.avg_passengers * b.sample_count, 0) / totalSamples;
      const avgR = sameDow.reduce((s, b) => s + b.avg_revenue_lei * b.sample_count, 0) / totalSamples;
      return { avg_passengers: avgP, avg_revenue_lei: avgR, sample_count: totalSamples };
    }
  }

  // 4. Same route, overall average
  const sameRoute = baselines.filter(b => b.crm_route_id === routeId);
  if (sameRoute.length > 0) {
    const totalSamples = sameRoute.reduce((s, b) => s + b.sample_count, 0);
    const avgP = sameRoute.reduce((s, b) => s + b.avg_passengers * b.sample_count, 0) / totalSamples;
    const avgR = sameRoute.reduce((s, b) => s + b.avg_revenue_lei * b.sample_count, 0) / totalSamples;
    return { avg_passengers: avgP, avg_revenue_lei: avgR, sample_count: totalSamples };
  }

  return null;
}

// ─── Actions ───

export async function recalculateBaselines(): Promise<{ weatherDays: number; baselinesCount: number }> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  // Find date range of counting data
  const { data: range } = await sb
    .from('counting_sessions')
    .select('assignment_date')
    .eq('status', 'completed')
    .order('assignment_date', { ascending: true })
    .limit(1);

  if (!range || range.length === 0) return { weatherDays: 0, baselinesCount: 0 };

  const dateFrom = range[0].assignment_date;
  const dateTo = new Date().toISOString().slice(0, 10);

  // Sync weather for the full period
  const weatherDays = await syncWeather(dateFrom, dateTo);

  // Recompute baselines
  await sb.rpc('compute_route_baselines');

  const { count } = await sb
    .from('route_baselines')
    .select('*', { count: 'exact', head: true });

  return { weatherDays, baselinesCount: count || 0 };
}

export async function getRoutesList(): Promise<RouteOption[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data } = await getSupabase()
    .from('crm_routes')
    .select('id, dest_to_ro, time_chisinau, time_nord')
    .eq('active', true)
    .order('id');
  return (data || []) as RouteOption[];
}

export async function getDriverPerformance(
  dateFrom: string,
  dateTo: string,
  routeId?: number
): Promise<DriverPerformanceRow[]> {
  requireRole(await verifySession(), 'ADMIN');

  const [sessions, baselines] = await Promise.all([fetchSessions(dateFrom, dateTo), fetchBaselines()]);

  // Find stable driver per route (most sessions in period)
  const routeDriverCounts = new Map<string, Map<string, { name: string; count: number }>>();
  for (const s of sessions) {
    if (!s.driver_id) continue;
    const key = String(s.crm_route_id);
    if (!routeDriverCounts.has(key)) routeDriverCounts.set(key, new Map());
    const dmap = routeDriverCounts.get(key)!;
    const existing = dmap.get(s.driver_id);
    if (existing) existing.count++;
    else dmap.set(s.driver_id, { name: s.driver_name || '', count: 1 });
  }
  const stableDrivers = new Map<number, string>(); // routeId → driverId
  for (const [routeKey, dmap] of routeDriverCounts) {
    let maxCount = 0;
    let maxDriverId = '';
    for (const [driverId, info] of dmap) {
      if (info.count > maxCount) { maxCount = info.count; maxDriverId = driverId; }
    }
    if (maxDriverId) stableDrivers.set(Number(routeKey), maxDriverId);
  }

  // Group sessions by driver × route
  const groups = new Map<string, {
    driver_id: string; driver_name: string; route_name: string; crm_route_id: number;
    passengers: number[]; revenues: number[]; baselinePassengers: number[]; baselineRevenues: number[];
    sampleCounts: number[];
    routeKms: number[]; revenuesPerKm: number[];
  }>();

  for (const s of sessions) {
    if (!s.driver_id) continue;
    if (routeId && s.crm_route_id !== routeId) continue;

    const key = `${s.driver_id}::${s.crm_route_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        driver_id: s.driver_id, driver_name: s.driver_name || '?',
        route_name: s.route_name, crm_route_id: s.crm_route_id,
        passengers: [], revenues: [], baselinePassengers: [], baselineRevenues: [], sampleCounts: [],
        routeKms: [], revenuesPerKm: [],
      });
    }
    const g = groups.get(key)!;
    g.passengers.push(s.total_passengers);
    g.revenues.push(s.total_lei);
    g.routeKms.push(s.route_length_km || 0);
    if (s.revenue_per_km !== null) g.revenuesPerKm.push(s.revenue_per_km);

    const bl = findBaseline(baselines, s.crm_route_id, s.season, s.dow, s.rain_heavy);
    g.baselinePassengers.push(bl?.avg_passengers ?? 0);
    g.baselineRevenues.push(bl?.avg_revenue_lei ?? 0);
    g.sampleCounts.push(bl?.sample_count ?? 0);
  }

  const result: DriverPerformanceRow[] = [];
  for (const g of groups.values()) {
    const n = g.passengers.length;
    const avgPax = g.passengers.reduce((a, b) => a + b, 0) / n;
    const totalRev = g.revenues.reduce((a, b) => a + b, 0);
    const totalKm = g.routeKms.reduce((a, b) => a + b, 0);
    const avgRpk = g.revenuesPerKm.length > 0
      ? g.revenuesPerKm.reduce((a, b) => a + b, 0) / g.revenuesPerKm.length
      : null;

    const hasBaseline = g.sampleCounts.some(c => c > 0);
    let blPax: number | null = null;
    let blRev: number | null = null;
    let perfPct: number | null = null;
    let minSample = 0;

    if (hasBaseline) {
      const validBl = g.baselinePassengers.filter((_, i) => g.sampleCounts[i] > 0);
      blPax = validBl.reduce((a, b) => a + b, 0) / validBl.length;
      const validBlR = g.baselineRevenues.filter((_, i) => g.sampleCounts[i] > 0);
      blRev = validBlR.reduce((a, b) => a + b, 0) / validBlR.length;
      minSample = Math.min(...g.sampleCounts.filter(c => c > 0));
      if (blPax > 0) perfPct = Math.round((avgPax / blPax) * 100);
    }

    result.push({
      driver_id: g.driver_id,
      driver_name: g.driver_name,
      route_name: g.route_name,
      crm_route_id: g.crm_route_id,
      sessions_count: n,
      avg_passengers: Math.round(avgPax * 10) / 10,
      baseline_passengers: blPax !== null ? Math.round(blPax * 10) / 10 : null,
      performance_pct: perfPct,
      total_revenue: Math.round(totalRev),
      baseline_revenue: blRev !== null ? Math.round(blRev * n) : null,
      is_stable: stableDrivers.get(g.crm_route_id) === g.driver_id,
      sample_count: minSample,
      total_km_driven: Math.round(totalKm),
      avg_revenue_per_km: avgRpk !== null ? Math.round(avgRpk * 100) / 100 : null,
    });
  }

  result.sort((a, b) => {
    if (a.performance_pct === null && b.performance_pct === null) return 0;
    if (a.performance_pct === null) return 1;
    if (b.performance_pct === null) return -1;
    return b.performance_pct - a.performance_pct;
  });

  return result;
}

export async function getRouteEtalons(): Promise<RouteEtalon[]> {
  requireRole(await verifySession(), 'ADMIN');

  const [baselines, routes] = await Promise.all([
    fetchBaselines(),
    getRoutesList(),
  ]);

  // Also fetch stable drivers
  const sb = getSupabase();
  const { data: sessionData } = await sb
    .from('v_session_full')
    .select('crm_route_id, driver_id, driver_name');

  // Count sessions per driver per route
  const driverCounts = new Map<number, Map<string, { name: string; count: number }>>();
  for (const s of (sessionData || []) as { crm_route_id: number; driver_id: string | null; driver_name: string | null }[]) {
    if (!s.driver_id) continue;
    if (!driverCounts.has(s.crm_route_id)) driverCounts.set(s.crm_route_id, new Map());
    const dm = driverCounts.get(s.crm_route_id)!;
    const ex = dm.get(s.driver_id);
    if (ex) ex.count++;
    else dm.set(s.driver_id, { name: s.driver_name || '?', count: 1 });
  }

  return routes.map(r => {
    const rb = baselines.filter(b => b.crm_route_id === r.id);
    const totalSample = rb.reduce((s, b) => s + b.sample_count, 0);

    // Day etalons (Mon=idx0 ... Sun=idx6). Aggregate across seasons/weather for each dow.
    const dayEtalons: [number | null, number | null, number | null, number | null, number | null, number | null, number | null] = [null, null, null, null, null, null, null];
    for (let pgDow = 0; pgDow <= 6; pgDow++) {
      const dayBaselines = rb.filter(b => b.dow === pgDow);
      if (dayBaselines.length > 0) {
        const totalN = dayBaselines.reduce((s, b) => s + b.sample_count, 0);
        const wavg = dayBaselines.reduce((s, b) => s + b.avg_passengers * b.sample_count, 0) / totalN;
        dayEtalons[pgDowToIdx(pgDow)] = Math.round(wavg * 10) / 10;
      }
    }

    // Total etalon (weighted avg of all baselines)
    let totalEtalon: number | null = null;
    if (totalSample > 0) {
      totalEtalon = Math.round(
        rb.reduce((s, b) => s + b.avg_passengers * b.sample_count, 0) / totalSample * 10
      ) / 10;
    }

    // Stable driver
    let stableDriverName: string | null = null;
    let stableDriverSessions = 0;
    const dm = driverCounts.get(r.id);
    if (dm) {
      for (const [, info] of dm) {
        if (info.count > stableDriverSessions) {
          stableDriverSessions = info.count;
          stableDriverName = info.name;
        }
      }
    }

    return {
      crm_route_id: r.id,
      route_name: r.dest_to_ro,
      time_chisinau: r.time_chisinau,
      time_nord: r.time_nord,
      day_etalons: dayEtalons,
      total_etalon: totalEtalon,
      stable_driver_name: stableDriverName,
      stable_driver_sessions: stableDriverSessions,
      total_sample: totalSample,
    };
  });
}

export async function getEmptyTripsAnalysis(
  dateFrom: string,
  dateTo: string
): Promise<EmptyTripRow[]> {
  requireRole(await verifySession(), 'ADMIN');

  const [sessions, baselines] = await Promise.all([fetchSessions(dateFrom, dateTo), fetchBaselines()]);

  // Group by route
  const groups = new Map<number, {
    route_name: string; crm_route_id: number; time_chisinau: string; time_nord: string;
    sessions: SessionRow[];
  }>();

  for (const s of sessions) {
    if (!groups.has(s.crm_route_id)) {
      groups.set(s.crm_route_id, {
        route_name: s.route_name, crm_route_id: s.crm_route_id,
        time_chisinau: s.time_chisinau, time_nord: s.time_nord,
        sessions: [],
      });
    }
    groups.get(s.crm_route_id)!.sessions.push(s);
  }

  const result: EmptyTripRow[] = [];
  for (const g of groups.values()) {
    const n = g.sessions.length;
    const avgPax = g.sessions.reduce((a, s) => a + s.total_passengers, 0) / n;

    // Day averages (Mon-Sun)
    const dayTotals: number[] = [0, 0, 0, 0, 0, 0, 0];
    const dayCounts: number[] = [0, 0, 0, 0, 0, 0, 0];
    for (const s of g.sessions) {
      const idx = pgDowToIdx(s.dow);
      dayTotals[idx] += s.total_passengers;
      dayCounts[idx]++;
    }
    const dayAvg: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 7; i++) {
      dayAvg[i] = dayCounts[i] > 0 ? Math.round(dayTotals[i] / dayCounts[i] * 10) / 10 : 0;
    }

    // Overall baseline for route
    const routeBaselines = baselines.filter(b => b.crm_route_id === g.crm_route_id);
    let baseline: number | null = null;
    if (routeBaselines.length > 0) {
      const totalN = routeBaselines.reduce((s, b) => s + b.sample_count, 0);
      baseline = Math.round(routeBaselines.reduce((s, b) => s + b.avg_passengers * b.sample_count, 0) / totalN * 10) / 10;
    }

    // Count empty sessions (< 50% of their specific baseline)
    let emptyCount = 0;
    for (const s of g.sessions) {
      const bl = findBaseline(baselines, s.crm_route_id, s.season, s.dow, s.rain_heavy);
      if (bl && bl.avg_passengers > 0 && s.total_passengers < bl.avg_passengers * 0.5) {
        emptyCount++;
      }
    }

    // Rain sessions
    const rainSessions = g.sessions.filter(s => s.rain_heavy);
    const rainAvg = rainSessions.length > 0
      ? Math.round(rainSessions.reduce((a, s) => a + s.total_passengers, 0) / rainSessions.length * 10) / 10
      : null;

    const loadPct = baseline && baseline > 0 ? Math.round((avgPax / baseline) * 100) : null;

    // New metrics from v_session_metrics
    const avgUniquePax = g.sessions.reduce((a, s) => a + (s.unique_passengers || 0), 0) / n;
    const avgPaxKm = g.sessions.reduce((a, s) => a + (s.passenger_km || 0), 0) / n;
    const withLoad = g.sessions.filter(s => s.load_factor_pct !== null);
    const avgLoadFactor = withLoad.length > 0
      ? withLoad.reduce((a, s) => a + (s.load_factor_pct as number), 0) / withLoad.length
      : null;
    const withRpk = g.sessions.filter(s => s.revenue_per_km !== null);
    const avgRpk = withRpk.length > 0
      ? withRpk.reduce((a, s) => a + (s.revenue_per_km as number), 0) / withRpk.length
      : null;
    const routeLenKm = g.sessions[0]?.route_length_km ?? null;

    result.push({
      route_name: g.route_name,
      crm_route_id: g.crm_route_id,
      time_chisinau: g.time_chisinau,
      time_nord: g.time_nord,
      avg_passengers: Math.round(avgPax * 10) / 10,
      baseline,
      load_pct: loadPct,
      sessions_count: n,
      empty_sessions: emptyCount,
      day_avg: dayAvg,
      rain_sessions: rainSessions.length,
      rain_avg_passengers: rainAvg,
      unique_passengers_avg: Math.round(avgUniquePax * 10) / 10,
      passenger_km_avg: Math.round(avgPaxKm),
      load_factor_pct: avgLoadFactor !== null ? Math.round(avgLoadFactor * 10) / 10 : null,
      revenue_per_km: avgRpk !== null ? Math.round(avgRpk * 100) / 100 : null,
      route_length_km: routeLenKm,
    });
  }

  result.sort((a, b) => {
    if (a.load_pct === null && b.load_pct === null) return 0;
    if (a.load_pct === null) return 1;
    if (b.load_pct === null) return -1;
    return a.load_pct - b.load_pct;
  });

  return result;
}

// ─── Overview KPI, Route & Driver Scorecards (added in migration 037 rollout) ───

export async function getOverviewKPI(dateFrom: string, dateTo: string): Promise<OverviewKPI> {
  requireRole(await verifySession(), 'ADMIN');

  // Compute equal-length previous period for delta
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const diffMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 86400_000);
  const prevFrom = new Date(prevTo.getTime() - diffMs);
  const prevFromStr = prevFrom.toISOString().slice(0, 10);
  const prevToStr = prevTo.toISOString().slice(0, 10);

  const [current, previous] = await Promise.all([
    fetchSessions(dateFrom, dateTo),
    fetchSessions(prevFromStr, prevToStr),
  ]);

  const aggregate = (sessions: SessionRow[]) => {
    const n = sessions.length;
    if (n === 0) return {
      total_unique_passengers: 0, total_passenger_km: 0, total_revenue: 0,
      avg_load_factor_pct: null as number | null,
      sessions_count: 0, avg_revenue_per_km: null as number | null,
    };
    const totalUnique = sessions.reduce((a, s) => a + (s.unique_passengers || 0), 0);
    const totalPaxKm = sessions.reduce((a, s) => a + (s.passenger_km || 0), 0);
    const totalRev = sessions.reduce((a, s) => a + s.total_lei, 0);
    const withLoad = sessions.filter(s => s.load_factor_pct !== null);
    const avgLoad = withLoad.length > 0
      ? withLoad.reduce((a, s) => a + (s.load_factor_pct as number), 0) / withLoad.length
      : null;
    const withRpk = sessions.filter(s => s.revenue_per_km !== null);
    const avgRpk = withRpk.length > 0
      ? withRpk.reduce((a, s) => a + (s.revenue_per_km as number), 0) / withRpk.length
      : null;
    return {
      total_unique_passengers: totalUnique,
      total_passenger_km: Math.round(totalPaxKm),
      total_revenue: Math.round(totalRev),
      avg_load_factor_pct: avgLoad !== null ? Math.round(avgLoad * 10) / 10 : null,
      sessions_count: n,
      avg_revenue_per_km: avgRpk !== null ? Math.round(avgRpk * 100) / 100 : null,
    };
  };

  const cur = aggregate(current);
  const prev = aggregate(previous);

  const pctDelta = (c: number, p: number): number | null => {
    if (p === 0) return null;
    return Math.round(((c - p) / p) * 1000) / 10;
  };

  return {
    ...cur,
    delta_passengers_pct: pctDelta(cur.total_unique_passengers, prev.total_unique_passengers),
    delta_revenue_pct: pctDelta(cur.total_revenue, prev.total_revenue),
    delta_load_factor_pct: cur.avg_load_factor_pct !== null && prev.avg_load_factor_pct !== null && prev.avg_load_factor_pct !== 0
      ? pctDelta(cur.avg_load_factor_pct, prev.avg_load_factor_pct)
      : null,
    delta_revenue_per_km_pct: cur.avg_revenue_per_km !== null && prev.avg_revenue_per_km !== null && prev.avg_revenue_per_km !== 0
      ? pctDelta(cur.avg_revenue_per_km, prev.avg_revenue_per_km)
      : null,
  };
}

function classifyQuadrant(revenue: number, loadPct: number | null, medianRevenue: number): RouteQuadrant {
  const highRev = revenue >= medianRevenue;
  const highLoad = loadPct !== null && loadPct >= 50;
  if (highRev && highLoad) return 'star';
  if (!highRev && highLoad) return 'efficient_small';
  if (highRev && !highLoad) return 'underperform_large';
  return 'candidate_to_close';
}

export async function getRouteScorecard(dateFrom: string, dateTo: string): Promise<RouteScorecardRow[]> {
  requireRole(await verifySession(), 'ADMIN');

  const sessions = await fetchSessions(dateFrom, dateTo);

  // Group by route
  const groups = new Map<number, {
    crm_route_id: number; route_name: string; time_chisinau: string;
    sessions: SessionRow[];
  }>();
  for (const s of sessions) {
    if (!groups.has(s.crm_route_id)) {
      groups.set(s.crm_route_id, {
        crm_route_id: s.crm_route_id, route_name: s.route_name, time_chisinau: s.time_chisinau,
        sessions: [],
      });
    }
    groups.get(s.crm_route_id)!.sessions.push(s);
  }

  const rows: Omit<RouteScorecardRow, 'quadrant'>[] = [];
  for (const g of groups.values()) {
    const totalRev = g.sessions.reduce((a, s) => a + s.total_lei, 0);
    const totalUnique = g.sessions.reduce((a, s) => a + (s.unique_passengers || 0), 0);
    const totalPaxKm = g.sessions.reduce((a, s) => a + (s.passenger_km || 0), 0);
    const withLoad = g.sessions.filter(s => s.load_factor_pct !== null);
    const avgLoad = withLoad.length > 0
      ? withLoad.reduce((a, s) => a + (s.load_factor_pct as number), 0) / withLoad.length
      : null;
    const withRpk = g.sessions.filter(s => s.revenue_per_km !== null);
    const avgRpk = withRpk.length > 0
      ? withRpk.reduce((a, s) => a + (s.revenue_per_km as number), 0) / withRpk.length
      : null;

    rows.push({
      crm_route_id: g.crm_route_id,
      route_name: g.route_name,
      time_chisinau: g.time_chisinau,
      total_revenue: Math.round(totalRev),
      avg_load_factor_pct: avgLoad !== null ? Math.round(avgLoad * 10) / 10 : null,
      total_unique_passengers: totalUnique,
      total_passenger_km: Math.round(totalPaxKm),
      sessions_count: g.sessions.length,
      avg_revenue_per_km: avgRpk !== null ? Math.round(avgRpk * 100) / 100 : null,
      route_length_km: g.sessions[0]?.route_length_km ?? null,
    });
  }

  // Median revenue for quadrant classification
  const sortedByRev = [...rows].map(r => r.total_revenue).sort((a, b) => a - b);
  const medianRev = sortedByRev.length > 0
    ? sortedByRev[Math.floor(sortedByRev.length / 2)]
    : 0;

  const result: RouteScorecardRow[] = rows.map(r => ({
    ...r,
    quadrant: classifyQuadrant(r.total_revenue, r.avg_load_factor_pct, medianRev),
  }));

  result.sort((a, b) => b.total_revenue - a.total_revenue);
  return result;
}

export async function getDriverScorecard(dateFrom: string, dateTo: string): Promise<DriverScorecardRow[]> {
  requireRole(await verifySession(), 'ADMIN');

  const [sessions, baselines] = await Promise.all([fetchSessions(dateFrom, dateTo), fetchBaselines()]);

  // Group by driver
  const groups = new Map<string, {
    driver_id: string; driver_name: string;
    sessions: SessionRow[];
    baselineContributions: { actual: number; baseline: number; sample_count: number }[];
  }>();

  for (const s of sessions) {
    if (!s.driver_id) continue;
    if (!groups.has(s.driver_id)) {
      groups.set(s.driver_id, {
        driver_id: s.driver_id, driver_name: s.driver_name || '?',
        sessions: [], baselineContributions: [],
      });
    }
    const g = groups.get(s.driver_id)!;
    g.sessions.push(s);
    const bl = findBaseline(baselines, s.crm_route_id, s.season, s.dow, s.rain_heavy);
    if (bl && bl.avg_passengers > 0 && bl.sample_count > 0) {
      g.baselineContributions.push({
        actual: s.total_passengers,
        baseline: bl.avg_passengers,
        sample_count: bl.sample_count,
      });
    }
  }

  const result: DriverScorecardRow[] = [];
  for (const g of groups.values()) {
    const n = g.sessions.length;
    if (n < 5) continue; // statistical reliability threshold

    const totalRev = g.sessions.reduce((a, s) => a + s.total_lei, 0);
    const totalUnique = g.sessions.reduce((a, s) => a + (s.unique_passengers || 0), 0);
    const totalKm = g.sessions.reduce((a, s) => a + (s.route_length_km || 0), 0);

    const withRpk = g.sessions.filter(s => s.revenue_per_km !== null);
    const avgRpk = withRpk.length > 0
      ? withRpk.reduce((a, s) => a + (s.revenue_per_km as number), 0) / withRpk.length
      : null;

    // sample_count-weighted % vs baseline
    let pctVsNorm: number | null = null;
    let sampleSum = 0;
    if (g.baselineContributions.length > 0) {
      let weightedActual = 0;
      let weightedBaseline = 0;
      for (const c of g.baselineContributions) {
        weightedActual += c.actual * c.sample_count;
        weightedBaseline += c.baseline * c.sample_count;
        sampleSum += c.sample_count;
      }
      if (weightedBaseline > 0) {
        pctVsNorm = Math.round((weightedActual / weightedBaseline) * 100 - 100);
      }
    }

    result.push({
      driver_id: g.driver_id,
      driver_name: g.driver_name,
      sessions_count: n,
      total_km_driven: Math.round(totalKm),
      total_revenue: Math.round(totalRev),
      total_unique_passengers: totalUnique,
      avg_revenue_per_km: avgRpk !== null ? Math.round(avgRpk * 100) / 100 : null,
      pct_vs_route_norm: pctVsNorm,
      sample_count: sampleSum,
    });
  }

  result.sort((a, b) => {
    if (a.pct_vs_route_norm === null && b.pct_vs_route_norm === null) return 0;
    if (a.pct_vs_route_norm === null) return 1;
    if (b.pct_vs_route_norm === null) return -1;
    return b.pct_vs_route_norm - a.pct_vs_route_norm;
  });

  return result;
}

export async function getDemandSupplyGap(days: number = 30): Promise<DemandSupplyRow[]> {
  requireRole(await verifySession(), 'ADMIN');

  const sb = getSupabase();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  // Fetch search data
  const PAGE = 1000;
  const searches: { to_locality: string; from_locality: string }[] = [];
  let offset = 0;
  while (true) {
    const { data } = await sb
      .from('search_log')
      .select('from_locality, to_locality')
      .gte('created_at', sinceStr + 'T00:00:00')
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    searches.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // Fetch call clicks
  const calls: { to_locality: string; from_locality: string }[] = [];
  offset = 0;
  while (true) {
    const { data } = await sb
      .from('call_clicks')
      .select('from_locality, to_locality')
      .gte('created_at', sinceStr + 'T00:00:00')
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    calls.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // Fetch routes for mapping
  const { data: routes } = await sb
    .from('crm_routes')
    .select('id, dest_to_ro')
    .eq('active', true);

  // Fetch session averages per route
  const sessions = await fetchSessions(sinceStr, new Date().toISOString().slice(0, 10));

  // Build route name lookup (normalized)
  const routeNameMap = new Map<string, { id: number; name: string }>();
  for (const r of (routes || [])) {
    routeNameMap.set(normalize(r.dest_to_ro), { id: r.id, name: r.dest_to_ro });
  }

  // Count searches and calls by route destination
  const searchCounts = new Map<string, number>();
  const callCounts = new Map<string, number>();

  for (const s of searches) {
    const key = normalize(s.to_locality);
    searchCounts.set(key, (searchCounts.get(key) || 0) + 1);
  }
  for (const c of calls) {
    const key = normalize(c.to_locality);
    callCounts.set(key, (callCounts.get(key) || 0) + 1);
  }

  // Session averages per route
  const routeSessionAvg = new Map<number, { avgPax: number; count: number }>();
  const routeGroups = new Map<number, number[]>();
  for (const s of sessions) {
    if (!routeGroups.has(s.crm_route_id)) routeGroups.set(s.crm_route_id, []);
    routeGroups.get(s.crm_route_id)!.push(s.total_passengers);
  }
  for (const [routeId, paxArr] of routeGroups) {
    routeSessionAvg.set(routeId, {
      avgPax: paxArr.reduce((a, b) => a + b, 0) / paxArr.length,
      count: paxArr.length,
    });
  }

  // Match
  const result: DemandSupplyRow[] = [];
  const matched = new Set<string>();

  for (const [normName, routeInfo] of routeNameMap) {
    const sc = searchCounts.get(normName) || 0;
    const cc = callCounts.get(normName) || 0;
    if (sc === 0 && cc === 0) continue;
    matched.add(normName);

    const sa = routeSessionAvg.get(routeInfo.id);
    const avgPax = sa ? Math.round(sa.avgPax * 10) / 10 : null;
    const convRate = sc > 0 ? Math.round((cc / sc) * 100) : 0;
    const dailySearches = sc / days;
    const gapScore = avgPax && avgPax > 0 ? Math.round((dailySearches / avgPax) * 100) / 100 : null;

    result.push({
      route: routeInfo.name,
      search_count: sc,
      call_count: cc,
      avg_actual_passengers: avgPax,
      conversion_rate: convRate,
      gap_score: gapScore,
      sessions_count: sa?.count || 0,
    });
  }

  // Add unmatched search terms with high volume
  for (const [normName, count] of searchCounts) {
    if (matched.has(normName) || count < 5) continue;
    const cc = callCounts.get(normName) || 0;
    result.push({
      route: normName,
      search_count: count,
      call_count: cc,
      avg_actual_passengers: null,
      conversion_rate: count > 0 ? Math.round((cc / count) * 100) : 0,
      gap_score: null,
      sessions_count: 0,
    });
  }

  result.sort((a, b) => b.search_count - a.search_count);
  return result;
}

export async function getRevenueOverview(dateFrom: string, dateTo: string): Promise<RevenueOverview> {
  requireRole(await verifySession(), 'ADMIN');

  const sessions = await fetchSessions(dateFrom, dateTo);

  if (sessions.length === 0) {
    return { total_revenue: 0, total_sessions: 0, avg_revenue_per_session: 0, best_route: null, worst_route: null };
  }

  const totalRevenue = sessions.reduce((s, r) => s + r.total_lei, 0);
  const avgRevenue = Math.round(totalRevenue / sessions.length);

  // Per route
  const routeRevenue = new Map<string, { name: string; revenue: number }>();
  for (const s of sessions) {
    const existing = routeRevenue.get(String(s.crm_route_id));
    if (existing) existing.revenue += s.total_lei;
    else routeRevenue.set(String(s.crm_route_id), { name: s.route_name, revenue: s.total_lei });
  }
  const routeArr = Array.from(routeRevenue.values()).sort((a, b) => b.revenue - a.revenue);

  return {
    total_revenue: Math.round(totalRevenue),
    total_sessions: sessions.length,
    avg_revenue_per_session: avgRevenue,
    best_route: routeArr[0] ? { name: routeArr[0].name, revenue: Math.round(routeArr[0].revenue) } : null,
    worst_route: routeArr.length > 1 ? { name: routeArr[routeArr.length - 1].name, revenue: Math.round(routeArr[routeArr.length - 1].revenue) } : null,
  };
}
