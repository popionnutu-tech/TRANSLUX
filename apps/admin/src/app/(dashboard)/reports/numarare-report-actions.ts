'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

export interface NumarareDailyRow {
  crm_route_id: number;
  dest_to_ro: string;
  time_nord: string;
  passengers: number | null;
}

export interface NumarareWeeklyRow {
  crm_route_id: number;
  dest_to_ro: string;
  time_nord: string;
  dayOfWeek: number; // ISO: 1=Mon, 7=Sun
  avgPassengers: number;
}

function parseTimeNord(t: string): number {
  const m = t?.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 9999;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export async function getNumarareDaily(date: string): Promise<NumarareDailyRow[]> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');

  const sb = getSupabase();

  // 1. All active interurban routes
  const { data: routes } = await sb
    .from('crm_routes')
    .select('id, dest_to_ro, time_nord')
    .eq('active', true)
    .eq('route_type', 'interurban');

  if (!routes || routes.length === 0) return [];

  // 2. Completed sessions for this date
  const { data: sessions } = await sb
    .from('counting_sessions')
    .select('id, crm_route_id')
    .eq('assignment_date', date)
    .eq('status', 'completed');

  const sessionMap = new Map<number, string>();
  for (const s of (sessions || []) as any[]) {
    sessionMap.set(s.crm_route_id, s.id);
  }

  // 3. Get retur stop_order=1 entries for those sessions
  const sessionIds = Array.from(sessionMap.values());
  let entryMap = new Map<string, number>();

  if (sessionIds.length > 0) {
    const { data: entries } = await sb
      .from('counting_entries')
      .select('session_id, total_passengers')
      .in('session_id', sessionIds)
      .eq('direction', 'retur')
      .eq('stop_order', 1);

    for (const e of (entries || []) as any[]) {
      entryMap.set(e.session_id, e.total_passengers ?? 0);
    }
  }

  // 4. Build result — all routes, passengers or null
  const result: NumarareDailyRow[] = (routes as any[]).map((r) => {
    const sessionId = sessionMap.get(r.id);
    const passengers = sessionId ? (entryMap.get(sessionId) ?? null) : null;
    return {
      crm_route_id: r.id,
      dest_to_ro: r.dest_to_ro,
      time_nord: r.time_nord,
      passengers,
    };
  });

  result.sort((a, b) => parseTimeNord(a.time_nord) - parseTimeNord(b.time_nord));
  return result;
}

export async function getNumarareWeekly(
  dateFrom: string,
  dateTo: string,
): Promise<NumarareWeeklyRow[]> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');

  const sb = getSupabase();

  // 1. All active interurban routes
  const { data: routes } = await sb
    .from('crm_routes')
    .select('id, dest_to_ro, time_nord')
    .eq('active', true)
    .eq('route_type', 'interurban');

  if (!routes || routes.length === 0) return [];

  // 2. Completed sessions in date range
  const { data: sessions } = await sb
    .from('counting_sessions')
    .select('id, crm_route_id, assignment_date')
    .gte('assignment_date', dateFrom)
    .lte('assignment_date', dateTo)
    .eq('status', 'completed');

  if (!sessions || sessions.length === 0) return [];

  const sessionIds = (sessions as any[]).map((s) => s.id);

  // 3. Get retur stop_order=1 entries
  const { data: entries } = await sb
    .from('counting_entries')
    .select('session_id, total_passengers')
    .in('session_id', sessionIds)
    .eq('direction', 'retur')
    .eq('stop_order', 1);

  const entryBySession = new Map<string, number>();
  for (const e of (entries || []) as any[]) {
    entryBySession.set(e.session_id, e.total_passengers ?? 0);
  }

  // 4. Build session → (route_id, dayOfWeek, passengers)
  const routeMap = new Map<number, any>();
  for (const r of routes as any[]) routeMap.set(r.id, r);

  // Aggregate: key = "routeId|dayOfWeek" → { sum, count }
  const agg = new Map<string, { sum: number; count: number }>();

  for (const s of sessions as any[]) {
    const passengers = entryBySession.get(s.id);
    if (passengers == null) continue;
    if (!routeMap.has(s.crm_route_id)) continue;

    const dt = new Date(s.assignment_date + 'T12:00:00');
    const jsDay = dt.getDay();
    const isoDay = jsDay === 0 ? 7 : jsDay; // 1=Mon, 7=Sun

    const key = `${s.crm_route_id}|${isoDay}`;
    const existing = agg.get(key);
    if (existing) {
      existing.sum += passengers;
      existing.count += 1;
    } else {
      agg.set(key, { sum: passengers, count: 1 });
    }
  }

  // 5. Build result
  const result: NumarareWeeklyRow[] = [];
  for (const [key, { sum, count }] of agg) {
    const [routeIdStr, dayStr] = key.split('|');
    const routeId = parseInt(routeIdStr, 10);
    const route = routeMap.get(routeId);
    if (!route) continue;
    result.push({
      crm_route_id: routeId,
      dest_to_ro: route.dest_to_ro,
      time_nord: route.time_nord,
      dayOfWeek: parseInt(dayStr, 10),
      avgPassengers: Math.round((sum / count) * 10) / 10,
    });
  }

  result.sort((a, b) => {
    const ta = parseTimeNord(a.time_nord);
    const tb = parseTimeNord(b.time_nord);
    if (ta !== tb) return ta - tb;
    return a.dayOfWeek - b.dayOfWeek;
  });

  return result;
}
