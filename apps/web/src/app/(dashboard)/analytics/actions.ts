'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';

export interface DailyCount {
  date: string;
  count: number;
}

export interface RouteCount {
  from_locality: string;
  to_locality: string;
  count: number;
  calls: number;
}

export interface DetailedRouteCount {
  from_locality: string;
  to_locality: string;
  count: number;
  calls: number;
  day_counts: [number, number, number, number, number, number, number];
  day_calls: [number, number, number, number, number, number, number];
}

export interface DetailedRoutesResult {
  routes: DetailedRouteCount[];
  dayTotals: [number, number, number, number, number, number, number];
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

function daysAgoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function fetchAllSince(table: string, columns: string, since: string): Promise<any[]> {
  const PAGE = 1000;
  const rows: any[] = [];
  let offset = 0;
  while (true) {
    const { data } = await getSupabase()
      .from(table)
      .select(columns)
      .gte('created_at', since + 'T00:00:00')
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

export async function getPageViewsPerDay(days: number = 30): Promise<DailyCount[]> {
  requireRole(await verifySession(), 'ADMIN');
  const since = daysAgoDate(days);

  const { data } = await getSupabase().rpc('analytics_page_views_per_day', { since_date: since });
  if (data) return data as DailyCount[];

  const raw = await fetchAllSince('page_views', 'created_at', since);

  const map = new Map<string, number>();
  for (const r of raw) {
    const day = (r.created_at as string).slice(0, 10);
    map.set(day, (map.get(day) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getSearchesPerDay(days: number = 30): Promise<DailyCount[]> {
  requireRole(await verifySession(), 'ADMIN');
  const since = daysAgoDate(days);

  const raw = await fetchAllSince('search_log', 'created_at', since);

  const map = new Map<string, number>();
  for (const r of raw) {
    const day = (r.created_at as string).slice(0, 10);
    map.set(day, (map.get(day) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getTopSearchedRoutes(days: number = 30): Promise<RouteCount[]> {
  requireRole(await verifySession(), 'ADMIN');
  const since = daysAgoDate(days);

  const [searchRaw, callRaw] = await Promise.all([
    fetchAllSince('search_log', 'from_locality, to_locality, created_at', since),
    fetchAllSince('call_clicks', 'from_locality, to_locality, created_at', since),
  ]);

  const map = new Map<string, { from: string; to: string; count: number; calls: number }>();

  for (const r of searchRaw) {
    const key = `${r.from_locality}→${r.to_locality}`;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
    } else {
      map.set(key, { from: r.from_locality, to: r.to_locality, count: 1, calls: 0 });
    }
  }

  for (const r of callRaw) {
    const key = `${r.from_locality}→${r.to_locality}`;
    const existing = map.get(key);
    if (existing) {
      existing.calls++;
    } else {
      map.set(key, { from: r.from_locality, to: r.to_locality, count: 0, calls: 1 });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map(r => ({ from_locality: r.from, to_locality: r.to, count: r.count, calls: r.calls }));
}

export async function getDeviceBreakdown(days: number = 30): Promise<DeviceCount[]> {
  requireRole(await verifySession(), 'ADMIN');
  const since = daysAgoDate(days);

  const raw = await fetchAllSince('page_views', 'device, created_at', since);

  const map = new Map<string, number>();
  for (const r of raw) {
    const d = r.device || 'unknown';
    map.set(d, (map.get(d) || 0) + 1);
  }

  return Array.from(map.entries())
    .map(([device, count]) => ({ device, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getCountryBreakdown(days: number = 30): Promise<CountryCount[]> {
  requireRole(await verifySession(), 'ADMIN');
  const since = daysAgoDate(days);

  const raw = await fetchAllSince('page_views', 'country, created_at', since);

  const map = new Map<string, number>();
  for (const r of raw) {
    const c = r.country || '??';
    map.set(c, (map.get(c) || 0) + 1);
  }

  return Array.from(map.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function getDayOfWeek(isoString: string): number {
  const jsDay = new Date(isoString).getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

export async function getTopSearchedRoutesDetailed(days: number = 30): Promise<DetailedRoutesResult> {
  requireRole(await verifySession(), 'ADMIN');
  const since = daysAgoDate(days);

  const [searchRaw, callRaw] = await Promise.all([
    fetchAllSince('search_log', 'from_locality, to_locality, created_at', since),
    fetchAllSince('call_clicks', 'from_locality, to_locality, created_at', since),
  ]);

  type Entry = {
    from: string; to: string; count: number; calls: number;
    day_counts: number[]; day_calls: number[];
    search_dates: Set<string>[]; call_dates: Set<string>[];
  };
  const makeEntry = (from: string, to: string): Entry => ({
    from, to, count: 0, calls: 0,
    day_counts: [0, 0, 0, 0, 0, 0, 0], day_calls: [0, 0, 0, 0, 0, 0, 0],
    search_dates: [new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set()],
    call_dates: [new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set()],
  });

  const map = new Map<string, Entry>();

  // Global active-day tracking per weekday (across all routes) for dayTotals row
  const globalSearchDates: Set<string>[] = [new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set()];

  for (const r of (searchRaw || []) as any[]) {
    const key = `${r.from_locality}→${r.to_locality}`;
    const dow = getDayOfWeek(r.created_at);
    const dateStr = (r.created_at as string).slice(0, 10);
    let entry = map.get(key);
    if (!entry) {
      entry = makeEntry(r.from_locality, r.to_locality);
      map.set(key, entry);
    }
    entry.count++;
    entry.day_counts[dow]++;
    entry.search_dates[dow].add(dateStr);
    globalSearchDates[dow].add(dateStr);
  }

  for (const r of (callRaw || []) as any[]) {
    const key = `${r.from_locality}→${r.to_locality}`;
    const dow = getDayOfWeek(r.created_at);
    const dateStr = (r.created_at as string).slice(0, 10);
    let entry = map.get(key);
    if (!entry) {
      entry = makeEntry(r.from_locality, r.to_locality);
      map.set(key, entry);
    }
    entry.calls++;
    entry.day_calls[dow]++;
    entry.call_dates[dow].add(dateStr);
  }

  const all = Array.from(map.values());
  const dayTotals: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  for (const entry of all) {
    total += entry.count;
    for (let i = 0; i < 7; i++) dayTotals[i] += entry.day_counts[i];
  }

  // Average using only days that actually had data for that weekday
  const avgDayTotals = dayTotals.map((v, i) => {
    const activeDays = globalSearchDates[i].size;
    return activeDays > 0 ? Math.round(v / activeDays) : 0;
  }) as [number, number, number, number, number, number, number];

  const routes = all
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map(r => ({
      from_locality: r.from,
      to_locality: r.to,
      count: r.count,
      calls: r.calls,
      day_counts: r.day_counts.map((v, i) => {
        const activeDays = r.search_dates[i].size;
        return activeDays > 0 ? Math.round(v / activeDays) : 0;
      }) as [number, number, number, number, number, number, number],
      day_calls: r.day_calls.map((v, i) => {
        const activeDays = r.call_dates[i].size;
        return activeDays > 0 ? Math.round(v / activeDays) : 0;
      }) as [number, number, number, number, number, number, number],
    }));

  return { routes, dayTotals: avgDayTotals, total };
}

export async function getTotalStats(days: number = 30) {
  requireRole(await verifySession(), 'ADMIN');
  const since = daysAgoDate(days);

  const [{ count: viewsCount }, { count: searchCount }, { count: callsCount }] = await Promise.all([
    getSupabase()
      .from('page_views')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since + 'T00:00:00'),
    getSupabase()
      .from('search_log')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since + 'T00:00:00'),
    getSupabase()
      .from('call_clicks')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since + 'T00:00:00'),
  ]);

  return {
    totalViews: viewsCount || 0,
    totalSearches: searchCount || 0,
    totalCalls: callsCount || 0,
  };
}
