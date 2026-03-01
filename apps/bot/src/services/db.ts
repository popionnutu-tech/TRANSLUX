import { getSupabase } from '../supabase.js';
import type {
  User,
  InviteToken,
  Route,
  Driver,
  Trip,
  Report,
  PointEnum,
  DirectionEnum,
} from '@translux/db';
import { POINT_DIRECTION_MAP } from '@translux/db';

const db = () => getSupabase();

// ── Users ──────────────────────────────────────────────

export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  const { data } = await db()
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('active', true)
    .single();
  return data;
}

export async function createOrUpdateUser(
  telegramId: number,
  username: string | undefined,
  point: PointEnum
): Promise<User> {
  // Try to find existing user by telegram_id
  const existing = await getUserByTelegramId(telegramId);
  if (existing) {
    const { data } = await db()
      .from('users')
      .update({ point, active: true, username: username || null })
      .eq('id', existing.id)
      .select()
      .single();
    return data as User;
  }

  const { data } = await db()
    .from('users')
    .insert({
      telegram_id: telegramId,
      username: username || null,
      role: 'CONTROLLER' as const,
      point,
      active: true,
    })
    .select()
    .single();
  return data as User;
}

// ── Invite Tokens ──────────────────────────────────────

export async function validateInviteToken(token: string): Promise<InviteToken | null> {
  const { data } = await db()
    .from('invite_tokens')
    .select('*')
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();
  return data;
}

export async function markInviteUsed(token: string, userId: string): Promise<void> {
  await db()
    .from('invite_tokens')
    .update({ used_at: new Date().toISOString(), used_by_user: userId })
    .eq('token', token);
}

// ── Routes ─────────────────────────────────────────────

export async function getActiveRoutes(): Promise<Route[]> {
  const { data } = await db()
    .from('routes')
    .select('*')
    .eq('active', true)
    .order('name');
  return data || [];
}

// ── Drivers ────────────────────────────────────────────

export async function getActiveDrivers(): Promise<Driver[]> {
  const { data } = await db()
    .from('drivers')
    .select('*')
    .eq('active', true)
    .order('full_name');
  return data || [];
}

export async function createDriver(fullName: string): Promise<Driver> {
  const { data, error } = await db()
    .from('drivers')
    .insert({ full_name: fullName })
    .select()
    .single();
  if (error) throw error;
  return data as Driver;
}

export async function searchDrivers(query: string): Promise<Driver[]> {
  const { data } = await db()
    .from('drivers')
    .select('*')
    .eq('active', true)
    .ilike('full_name', `%${query}%`)
    .order('full_name')
    .limit(10);
  return data || [];
}

// ── Trips ──────────────────────────────────────────────

export async function getTripsForRoute(
  routeId: string,
  direction: DirectionEnum
): Promise<Trip[]> {
  const { data } = await db()
    .from('trips')
    .select('*')
    .eq('route_id', routeId)
    .eq('direction', direction)
    .eq('active', true)
    .order('departure_time', { ascending: true });
  return data || [];
}

/** Load all active trips for a direction, with route name */
export async function getAllTripsForDirection(
  direction: DirectionEnum
): Promise<Array<Trip & { route_name: string }>> {
  const { data } = await db()
    .from('trips')
    .select('*, routes!inner(name)')
    .eq('direction', direction)
    .eq('active', true)
    .order('departure_time', { ascending: true });
  return (data || []).map((t: any) => ({
    ...t,
    route_name: t.routes.name,
    routes: undefined,
  }));
}

/** Get IDs of trips that already have active reports for a given date+point */
export async function getReportedTripIds(
  reportDate: string,
  point: PointEnum
): Promise<Set<string>> {
  const { data } = await db()
    .from('reports')
    .select('trip_id')
    .eq('report_date', reportDate)
    .eq('point', point)
    .is('cancelled_at', null);
  return new Set((data || []).map((r: any) => r.trip_id));
}

/** Get driver IDs already assigned to reports for a given date+point */
export async function getUsedDriverIds(
  reportDate: string,
  point: PointEnum
): Promise<Set<string>> {
  const { data } = await db()
    .from('reports')
    .select('driver_id')
    .eq('report_date', reportDate)
    .eq('point', point)
    .eq('status', 'OK')
    .is('cancelled_at', null)
    .not('driver_id', 'is', null);
  return new Set((data || []).map((r: any) => r.driver_id));
}

// ── Reports ────────────────────────────────────────────

export async function checkReportExists(
  reportDate: string,
  point: PointEnum,
  tripId: string
): Promise<boolean> {
  const { data } = await db()
    .from('reports')
    .select('id')
    .eq('report_date', reportDate)
    .eq('point', point)
    .eq('trip_id', tripId)
    .is('cancelled_at', null)
    .single();
  return !!data;
}

export async function createReport(report: {
  report_date: string;
  point: PointEnum;
  trip_id: string;
  driver_id: string | null;
  status: 'OK' | 'ABSENT' | 'FULL';
  passengers_count: number | null;
  exterior_ok: boolean | null;
  uniform_ok: boolean | null;
  created_by_user: string;
}): Promise<Report> {
  // DB enum only has OK/ABSENT — store FULL as OK with passengers_count=-1
  const dbRecord = report.status === 'FULL'
    ? { ...report, status: 'OK' as const, passengers_count: -1 }
    : report;

  const { data, error } = await db()
    .from('reports')
    .insert(dbRecord)
    .select()
    .single();

  if (error) throw error;
  return data as Report;
}

export async function addReportPhoto(photo: {
  report_id: string;
  storage_key: string;
  telegram_file_id: string;
  file_unique_id: string | null;
}): Promise<void> {
  await db().from('report_photos').insert(photo);
}

export async function getLastReportByUser(userId: string): Promise<Report | null> {
  const { data } = await db()
    .from('reports')
    .select('*')
    .eq('created_by_user', userId)
    .is('cancelled_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

export async function cancelReport(reportId: string, cancelledBy: string): Promise<void> {
  await db()
    .from('reports')
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: cancelledBy })
    .eq('id', reportId);
}

export function getDirectionForPoint(point: PointEnum): DirectionEnum {
  return POINT_DIRECTION_MAP[point];
}

// ── Weekly report data ────────────────────────────────

/** Drivers with uniform or aspect violations in the period */
export async function getDriverViolations(
  dateFrom: string,
  dateTo: string
): Promise<Array<{ driver_name: string; uniform_count: number; aspect_count: number }>> {
  const { data } = await db()
    .from('reports')
    .select('driver_id, exterior_ok, uniform_ok, drivers(full_name)')
    .eq('status', 'OK')
    .is('cancelled_at', null)
    .gte('report_date', dateFrom)
    .lte('report_date', dateTo)
    .or('exterior_ok.eq.false,uniform_ok.eq.false');

  if (!data || data.length === 0) return [];

  const map = new Map<string, { name: string; uniform: number; aspect: number }>();
  for (const r of data as any[]) {
    const id = r.driver_id || 'unknown';
    const rawName = r.drivers?.full_name || '—';
    const np = rawName.split(' ');
    const name = np.length > 1 ? `${np[0]} ${np.slice(1).map((p: string) => p[0] + '.').join('')}` : rawName;
    if (!map.has(id)) map.set(id, { name, uniform: 0, aspect: 0 });
    const entry = map.get(id)!;
    if (r.uniform_ok === false) entry.uniform++;
    if (r.exterior_ok === false) entry.aspect++;
  }

  return Array.from(map.values()).map((v) => ({
    driver_name: v.name,
    uniform_count: v.uniform,
    aspect_count: v.aspect,
  }));
}

/** Operators absent from work: controllers who didn't submit reports on workdays */
export async function getOperatorAbsences(
  dateFrom: string,
  dateTo: string
): Promise<Array<{ username: string; point: string; absence_count: number }>> {
  const { data: users } = await db()
    .from('users')
    .select('id, username, telegram_id, point')
    .eq('role', 'CONTROLLER')
    .eq('active', true);

  if (!users || users.length === 0) return [];

  const { data: reports } = await db()
    .from('reports')
    .select('created_by_user, report_date')
    .is('cancelled_at', null)
    .gte('report_date', dateFrom)
    .lte('report_date', dateTo);

  const userDates = new Map<string, Set<string>>();
  for (const r of (reports || []) as any[]) {
    if (!userDates.has(r.created_by_user)) userDates.set(r.created_by_user, new Set());
    userDates.get(r.created_by_user)!.add(r.report_date);
  }

  // Workdays in period (Mon-Fri)
  const workdays: string[] = [];
  const start = new Date(dateFrom + 'T12:00:00');
  const end = new Date(dateTo + 'T12:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) {
      workdays.push(d.toISOString().slice(0, 10));
    }
  }

  const result: Array<{ username: string; point: string; absence_count: number }> = [];
  for (const u of users as any[]) {
    const reported = userDates.get(u.id) || new Set();
    const absent = workdays.filter((wd) => !reported.has(wd)).length;
    if (absent > 0) {
      result.push({
        username: u.username || `User #${u.telegram_id}`,
        point: u.point || '—',
        absence_count: absent,
      });
    }
  }

  return result.sort((a, b) => b.absence_count - a.absence_count);
}

// ── Day Validations ───────────────────────────────────

/** Check if a day is validated by a user */
export async function isDayValidated(userId: string, date: string): Promise<boolean> {
  const { data, error } = await db()
    .from('day_validations')
    .select('id')
    .eq('user_id', userId)
    .eq('validation_date', date)
    .single();
  if (error) return true; // If table doesn't exist, treat as validated
  return !!data;
}

/** Validate a day for a user */
export async function validateDay(userId: string, date: string): Promise<void> {
  const { error } = await db()
    .from('day_validations')
    .upsert({ user_id: userId, validation_date: date });
  if (error) console.warn('validateDay failed (table may not exist):', error.message);
}

/** Get yesterday's date (or last workday) that needs validation */
export async function getUnvalidatedDay(
  userId: string,
  today: string
): Promise<string | null> {
  // Only check yesterday (the previous calendar day)
  const yesterday = new Date(today + 'T12:00:00');
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // Check if user has reports for yesterday
  const { data: reports } = await db()
    .from('reports')
    .select('id')
    .eq('created_by_user', userId)
    .eq('report_date', yesterdayStr)
    .is('cancelled_at', null)
    .limit(1);

  if (!reports || reports.length === 0) return null;

  // Check if yesterday is already validated
  const { data: validation, error } = await db()
    .from('day_validations')
    .select('id')
    .eq('user_id', userId)
    .eq('validation_date', yesterdayStr)
    .single();

  // If day_validations table doesn't exist yet (migration 003 not applied), skip validation
  if (error && (error.code === 'PGRST205' || error.message?.includes('day_validations'))) {
    return null;
  }

  return validation ? null : yesterdayStr;
}
