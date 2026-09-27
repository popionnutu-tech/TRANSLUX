'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';

export interface DailyCount {
  date: string;
  count: number;
}

type Week = [number, number, number, number, number, number, number];

export interface DetailedRouteCount {
  from_locality: string;
  to_locality: string;
  count: number;
  calls: number;
  day_counts: Week;
  day_calls: Week;
}

export interface DetailedRoutesResult {
  routes: DetailedRouteCount[];
  dayTotals: Week;
  total: number;
}

export interface DeviceCount {
  device: string;
  count: number;
}

export interface CountryCount {
  country: string;
  count: number;
}

// Căutările pe zi, separat «Acum» / «Mai târziu» (ION-102). mod NULL = rânduri de dinainte
// de 27.09.2026, pe fluxul de azi al lui «Mai târziu». Ambele serii au aceleași zile, în aceeași
// ordine — graficul pune punctele după index.
export interface SearchesByMod {
  acum: DailyCount[];
  maiTarziu: DailyCount[];
}

export interface TotalStats {
  totalViews: number;
  totalSearches: number;
  totalCalls: number;
  searchesAcum: number;
  searchesMaiTarziu: number;
  callsAcum: number;
  callsMaiTarziu: number;
}

export interface SiteAnalytics {
  pageViews: DailyCount[];
  searches: SearchesByMod;
  detailedRoutes: DetailedRoutesResult;
  devices: DeviceCount[];
  countries: CountryCount[];
  totals: TotalStats;
}

function daysAgoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const EMPTY_WEEK: Week = [0, 0, 0, 0, 0, 0, 0];

// Toată fila Site dintr-un singur apel (ION-104): numărătoarea o face analytics_site (migr. 410)
// în bază. Înainte, rândurile brute veneau câte 1000 în JS — 5–10 s la fiecare schimbare de perioadă.
// Zilele și ziua săptămânii (0 = luni) sunt pe UTC, ca înainte.
export async function getSiteAnalytics(days: number = 30): Promise<SiteAnalytics> {
  requireRole(await verifySession(), 'ADMIN');
  const since = daysAgoDate(days);

  const { data, error } = await getSupabase().rpc('analytics_site', { since_ts: since + 'T00:00:00Z' });
  if (error || !data) throw new Error('analytics_site: ' + (error?.message ?? 'fără date'));

  const d = data as {
    views_per_day: DailyCount[];
    searches_per_day: { date: string; acum: number; mai_tarziu: number }[];
    totals: { views: number; searches: number; searches_acum: number; calls: number; calls_acum: number };
    devices: DeviceCount[];
    countries: CountryCount[];
    routes: DetailedRouteCount[];
    day_totals: Week | null;
  };

  const t = d.totals;
  return {
    pageViews: d.views_per_day,
    searches: {
      acum: d.searches_per_day.map(r => ({ date: r.date, count: r.acum })),
      maiTarziu: d.searches_per_day.map(r => ({ date: r.date, count: r.mai_tarziu })),
    },
    detailedRoutes: {
      routes: d.routes,
      dayTotals: d.day_totals ?? EMPTY_WEEK,
      total: t.searches,
    },
    devices: d.devices,
    countries: d.countries,
    // «Mai târziu» = restul (mod 'mai_tarziu' sau NULL de dinainte de ION-102).
    totals: {
      totalViews: t.views,
      totalSearches: t.searches,
      totalCalls: t.calls,
      searchesAcum: t.searches_acum,
      searchesMaiTarziu: t.searches - t.searches_acum,
      callsAcum: t.calls_acum,
      callsMaiTarziu: t.calls - t.calls_acum,
    },
  };
}
