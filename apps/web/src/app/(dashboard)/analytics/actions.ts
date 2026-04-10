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

export async function getPageViewsPerDay(days: number = 30): Promise<DailyCount[]> {
  requireRole(await verifySession(), 'ADMIN');
  const since = daysAgoDate(days);

  const { data } = await getSupabase().rpc('analytics_page_views_per_day', { since_date: since });
  if (data) return data as DailyCount[];

  // Fallback: raw query via select
  const { data: raw } = await getSupabase()
    .from('page_views')
    .select('created_at')
    .gte('created_at', since + 'T00:00:00')
    .order('created_at');

  if (!raw) return [];

  const map = new Map<string, number>();
  for (const r of raw as any[]) {
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

  const { data: raw } = await getSupabase()
    .from('search_log')
    .select('created_at')
    .gte('created_at', since + 'T00:00:00')
    .order('created_at');

  if (!raw) return [];

  const map = new Map<string, number>();
  for (const r of raw as any[]) {
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

  const { data: raw } = await getSupabase()
    .from('search_log')
    .select('from_locality, to_locality')
    .gte('created_at', since + 'T00:00:00');

  if (!raw) return [];

  const map = new Map<string, { from: string; to: string; count: number }>();
  for (const r of raw as any[]) {
    const key = `${r.from_locality}→${r.to_locality}`;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
    } else {
      map.set(key, { from: r.from_locality, to: r.to_locality, count: 1 });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map(r => ({ from_locality: r.from, to_locality: r.to, count: r.count }));
}

export async function getDeviceBreakdown(days: number = 30): Promise<DeviceCount[]> {
  requireRole(await verifySession(), 'ADMIN');
  const since = daysAgoDate(days);

  const { data: raw } = await getSupabase()
    .from('page_views')
    .select('device')
    .gte('created_at', since + 'T00:00:00');

  if (!raw) return [];

  const map = new Map<string, number>();
  for (const r of raw as any[]) {
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

  const { data: raw } = await getSupabase()
    .from('page_views')
    .select('country')
    .gte('created_at', since + 'T00:00:00');

  if (!raw) return [];

  const map = new Map<string, number>();
  for (const r of raw as any[]) {
    const c = r.country || '??';
    map.set(c, (map.get(c) || 0) + 1);
  }

  return Array.from(map.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export async function getTotalStats(days: number = 30) {
  requireRole(await verifySession(), 'ADMIN');
  const since = daysAgoDate(days);

  const [{ count: viewsCount }, { count: searchCount }] = await Promise.all([
    getSupabase()
      .from('page_views')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since + 'T00:00:00'),
    getSupabase()
      .from('search_log')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since + 'T00:00:00'),
  ]);

  return {
    totalViews: viewsCount || 0,
    totalSearches: searchCount || 0,
  };
}
