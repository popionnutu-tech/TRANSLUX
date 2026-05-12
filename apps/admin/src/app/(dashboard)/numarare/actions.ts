'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { resolveReturTime } from '@/lib/assignments';

// ─── Типы ───

export interface RouteForCounting {
  crm_route_id: number;
  dest_to_ro: string;
  time_chisinau: string;
  time_nord: string;
  driver_id: string | null;
  driver_name: string | null;
  vehicle_id: string | null;
  vehicle_plate: string | null;
  session_id: string | null;
  session_status: string | null;
  locked_by_email: string | null;
  locked_by_id: string | null;
  operator_id: string | null;
  operator_email: string | null;
  double_tariff: boolean;
  tur_total_lei: number | null;
  retur_total_lei: number | null;
  tur_single_lei: number | null;
  retur_single_lei: number | null;
  // Audit fields
  audit_status: string | null;
  audit_tur_total_lei: number | null;
  audit_retur_total_lei: number | null;
  audit_tur_single_lei: number | null;
  audit_retur_single_lei: number | null;
  audit_locked_by_email: string | null;
  audit_locked_by_id: string | null;
  route_type: 'interurban' | 'suburban';
  dest_from_ro: string;
}

export interface DriverOption { id: string; full_name: string; }
export interface VehicleOption { id: string; plate_number: string; }

export interface RouteStop {
  stopOrder: number;
  nameRo: string;
  kmFromStart: number;
}

export interface SavedEntry {
  id: string;
  stopOrder: number;
  stopNameRo: string;
  kmFromStart: number;
  totalPassengers: number;
  alighted: number;
  shortPassengers: {
    id: string;
    boardedStopOrder: number;
    boardedStopNameRo: string;
    kmDistance: number;
    passengerCount: number;
    amountLei: number | null;
  }[];
}

export interface TariffConfig {
  ratePerKmLong: number;
  ratePerKmShort: number;
  ratePerKmSuburban: number;
  doubleTariffEnabled: boolean;
  shortDistanceKm: number;
}

export interface SuburbanScheduleStop {
  stopId: number;
  stopOrder: number;
  nameRo: string;
  stopTime: string; // "HH:MM"
  kmFromStart: number;
}

export interface SuburbanSchedule {
  scheduleId: number;
  direction: 'tur' | 'retur';
  sequenceNo: number;
  daysOfWeek: number[];
  stops: SuburbanScheduleStop[];
}

export interface RouteForPeriod {
  crm_route_id: number;
  dest_to_ro: string;
  dest_from_ro: string;
  route_type: 'interurban' | 'suburban';
  time_chisinau: string;
  time_nord: string;
  sessions_count: number;
  tur_total_lei: number | null;
  retur_total_lei: number | null;
  tur_single_lei: number | null;
  retur_single_lei: number | null;
  audit_tur_total_lei: number | null;
  audit_retur_total_lei: number | null;
  audit_sessions_count: number;
}

// ─── Текущий пользователь ───

const NUMARARE_ROLES = ['ADMIN', 'ADMIN_CAMERE', 'OPERATOR_CAMERE'] as const;

export async function getCurrentUserId(): Promise<string | null> {
  const session = await verifySession();
  return session?.id || null;
}

// ─── Загрузка данных ───

export async function getActiveDrivers(): Promise<DriverOption[]> {
  try { requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return []; }
  const { data } = await getSupabase()
    .from('drivers')
    .select('id, full_name')
    .eq('active', true)
    .order('full_name');
  return (data || []) as DriverOption[];
}

export async function getActiveVehicles(): Promise<VehicleOption[]> {
  try { requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return []; }
  const { data } = await getSupabase()
    .from('vehicles')
    .select('id, plate_number')
    .eq('active', true)
    .order('plate_number');
  return (data || []) as VehicleOption[];
}

export async function getRoutesForDate(date: string): Promise<{ data?: RouteForCounting[]; error?: string }> {
  let session;
  try { session = requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();

  // 1. Toate rutele active
  const { data: allRoutes, error: rErr } = await sb
    .from('crm_routes')
    .select('id, dest_to_ro, dest_from_ro, time_chisinau, time_nord, route_type')
    .eq('active', true);

  if (rErr) return { error: rErr.message };
  if (!allRoutes || allRoutes.length === 0) return { data: [] };

  // 2. Assignments pe dată (cu join pe drivers, vehicles)
  const { data: assignments } = await sb
    .from('daily_assignments')
    .select(`
      crm_route_id,
      retur_route_id,
      driver_id,
      vehicle_id,
      drivers(id, full_name),
      vehicles!daily_assignments_vehicle_id_fkey(id, plate_number)
    `)
    .eq('assignment_date', date);

  const assignMap = new Map<number, any>();
  for (const a of assignments || []) assignMap.set(a.crm_route_id, a);

  // 3. Sesiuni de numărare pe dată (cu driver/vehicle din sesiune)
  const { data: sessions } = await sb
    .from('counting_sessions')
    .select(`
      crm_route_id, id, status, operator_id, locked_by, locked_at,
      double_tariff, tur_total_lei, retur_total_lei, tur_single_lei, retur_single_lei,
      audit_status, audit_tur_total_lei, audit_retur_total_lei, audit_tur_single_lei, audit_retur_single_lei,
      audit_locked_by,
      driver_id, vehicle_id,
      session_driver:drivers!counting_sessions_driver_id_fkey(id, full_name),
      session_vehicle:vehicles!counting_sessions_vehicle_id_fkey(id, plate_number),
      locker:admin_accounts!counting_sessions_locked_by_fkey(email),
      operator:admin_accounts!counting_sessions_operator_id_fkey(email),
      audit_locker:admin_accounts!counting_sessions_audit_locked_by_fkey(email)
    `)
    .eq('assignment_date', date);

  const sessionMap = new Map<number, any>();
  for (const s of sessions || []) sessionMap.set(s.crm_route_id, s);

  // Build route map for retur_route_id resolution
  const routeLookup = new Map<number, any>();
  for (const r of allRoutes) routeLookup.set(r.id, r);

  // 3b. Pentru suburban: identificăm rutele care au cel puțin un schedule pentru ziua curentă
  const jsDay = new Date(date).getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;
  const { data: schedulesToday } = await sb
    .from('crm_route_schedules')
    .select('route_id')
    .eq('active', true)
    .contains('days_of_week', [isoDay]);
  const suburbanActiveRouteIds = new Set((schedulesToday || []).map((s: any) => s.route_id));

  // 4. Construim lista — TOATE rutele active (suburbanele filtrate pe zi)
  const routes: RouteForCounting[] = allRoutes
    .filter((r: any) => r.route_type !== 'suburban' || suburbanActiveRouteIds.has(r.id))
    .map((r: any) => {
    const a = assignMap.get(r.id);
    const s = sessionMap.get(r.id);

    // Retur time: din retur_route_id dacă e setat, altfel din ruta proprie
    const returTime = resolveReturTime(a, r.time_chisinau, routeLookup);

    // Driver/vehicle: sesiune > assignment > null
    const driverId = s?.session_driver?.id || a?.drivers?.id || null;
    const driverName = s?.session_driver?.full_name || a?.drivers?.full_name || null;
    const vehicleId = s?.session_vehicle?.id || a?.vehicles?.id || null;
    const vehiclePlate = s?.session_vehicle?.plate_number || a?.vehicles?.plate_number || null;

    return {
      crm_route_id: r.id,
      dest_to_ro: r.dest_to_ro,
      time_chisinau: returTime,
      time_nord: r.time_nord,
      driver_id: driverId,
      driver_name: driverName,
      vehicle_id: vehicleId,
      vehicle_plate: vehiclePlate,
      session_id: s?.id || null,
      session_status: s?.status || null,
      locked_by_email: s?.locker?.email || null,
      locked_by_id: s?.locked_by || null,
      operator_id: s?.operator_id || null,
      operator_email: s?.operator?.email || null,
      double_tariff: s?.double_tariff || false,
      tur_total_lei: s?.tur_total_lei || null,
      retur_total_lei: s?.retur_total_lei || null,
      tur_single_lei: s?.tur_single_lei ?? null,
      retur_single_lei: s?.retur_single_lei ?? null,
      audit_status: s?.audit_status ?? null,
      audit_tur_total_lei: s?.audit_tur_total_lei ?? null,
      audit_retur_total_lei: s?.audit_retur_total_lei ?? null,
      audit_tur_single_lei: s?.audit_tur_single_lei ?? null,
      audit_retur_single_lei: s?.audit_retur_single_lei ?? null,
      audit_locked_by_email: s?.audit_locker?.email ?? null,
      audit_locked_by_id: s?.audit_locked_by ?? null,
      route_type: (r.route_type || 'interurban') as 'interurban' | 'suburban',
      dest_from_ro: r.dest_from_ro || '',
    };
  });

  // Сортируем по времени отправления (time_nord)
  const parseTur = (t: string) => {
    const [h, m] = (t?.split(' - ')[0] || '0:0').split(':').map(Number);
    return h * 60 + m;
  };
  routes.sort((a, b) => parseTur(a.time_nord) - parseTur(b.time_nord));

  // Strip financial data for non-admin roles (server-side enforcement)
  if (session.role !== 'ADMIN' && session.role !== 'ADMIN_CAMERE') {
    for (const r of routes) {
      r.tur_total_lei = null;
      r.retur_total_lei = null;
      r.tur_single_lei = null;
      r.retur_single_lei = null;
      r.audit_tur_total_lei = null;
      r.audit_retur_total_lei = null;
      r.audit_tur_single_lei = null;
      r.audit_retur_single_lei = null;
      r.audit_status = null;
    }
  }

  return { data: routes };
}

export async function getRoutesForPeriod(
  fromDate: string,
  toDate: string,
): Promise<{ data?: RouteForPeriod[]; error?: string }> {
  let session;
  try { session = requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();

  // 1. Toate rutele active (pentru time_nord + dest_to_ro)
  const { data: allRoutes, error: rErr } = await sb
    .from('crm_routes')
    .select('id, dest_to_ro, dest_from_ro, time_chisinau, time_nord, route_type')
    .eq('active', true);

  if (rErr) return { error: rErr.message };
  if (!allRoutes || allRoutes.length === 0) return { data: [] };

  // 2. Toate sesiunile din perioadă
  const { data: sessions, error: sErr } = await sb
    .from('counting_sessions')
    .select('crm_route_id, tur_total_lei, retur_total_lei, tur_single_lei, retur_single_lei, audit_tur_total_lei, audit_retur_total_lei, audit_status')
    .gte('assignment_date', fromDate)
    .lte('assignment_date', toDate);

  if (sErr) return { error: sErr.message };

  // 3. Agregare pe crm_route_id
  const routeLookup = new Map<number, any>();
  for (const r of allRoutes) routeLookup.set(r.id, r);

  const agg = new Map<number, RouteForPeriod>();
  for (const s of sessions || []) {
    const r = routeLookup.get(s.crm_route_id);
    if (!r) continue;
    const existing = agg.get(s.crm_route_id);
    const tur = Number(s.tur_total_lei) || 0;
    const retur = Number(s.retur_total_lei) || 0;
    const turSingle = Number(s.tur_single_lei) || 0;
    const returSingle = Number(s.retur_single_lei) || 0;
    const auditTur = Number(s.audit_tur_total_lei) || 0;
    const auditRetur = Number(s.audit_retur_total_lei) || 0;
    const hasAudit = s.audit_status === 'completed';
    if (existing) {
      existing.sessions_count += 1;
      existing.tur_total_lei = (existing.tur_total_lei ?? 0) + tur;
      existing.retur_total_lei = (existing.retur_total_lei ?? 0) + retur;
      existing.tur_single_lei = (existing.tur_single_lei ?? 0) + turSingle;
      existing.retur_single_lei = (existing.retur_single_lei ?? 0) + returSingle;
      existing.audit_tur_total_lei = (existing.audit_tur_total_lei ?? 0) + auditTur;
      existing.audit_retur_total_lei = (existing.audit_retur_total_lei ?? 0) + auditRetur;
      existing.audit_sessions_count += hasAudit ? 1 : 0;
    } else {
      agg.set(s.crm_route_id, {
        crm_route_id: s.crm_route_id,
        dest_to_ro: r.dest_to_ro,
        dest_from_ro: r.dest_from_ro || '',
        route_type: (r.route_type || 'interurban') as 'interurban' | 'suburban',
        time_chisinau: r.time_chisinau,
        time_nord: r.time_nord,
        sessions_count: 1,
        tur_total_lei: tur,
        retur_total_lei: retur,
        tur_single_lei: turSingle,
        retur_single_lei: returSingle,
        audit_tur_total_lei: auditTur,
        audit_retur_total_lei: auditRetur,
        audit_sessions_count: hasAudit ? 1 : 0,
      });
    }
  }

  const result = Array.from(agg.values());

  // Sort by time_nord
  const parseTur = (t: string) => {
    const [h, m] = (t?.split(' - ')[0] || '0:0').split(':').map(Number);
    return h * 60 + m;
  };
  result.sort((a, b) => parseTur(a.time_nord) - parseTur(b.time_nord));

  // Strip financial data for non-admin roles
  if (session.role !== 'ADMIN' && session.role !== 'ADMIN_CAMERE') {
    for (const r of result) {
      r.tur_total_lei = null;
      r.retur_total_lei = null;
      r.tur_single_lei = null;
      r.retur_single_lei = null;
      r.audit_tur_total_lei = null;
      r.audit_retur_total_lei = null;
    }
  }

  return { data: result };
}

// Ruta 8:00 (id=13) folosește itinerariul rutei 10:40 (id=16) la numărare
const COUNTING_ROUTE_MAP: Record<number, number> = { 13: 16 };

export async function getRouteStops(crmRouteId: number, direction: 'tur' | 'retur'): Promise<RouteStop[]> {
  try { requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return []; }

  const stopsRouteId = COUNTING_ROUTE_MAP[crmRouteId] ?? crmRouteId;
  const sb = getSupabase();
  // Opririle sunt stocate în ordinea rutei (de la Nord → Chișinău) după id.
  // km_from_nord / km_from_chisinau = distanța segmentului (inter-opriri), nu cumulativă.
  const { data } = await sb
    .from('crm_stop_prices')
    .select('id, name_ro, km_from_chisinau, km_from_nord')
    .eq('crm_route_id', stopsRouteId)
    .order('id', { ascending: true });

  if (!data || data.length === 0) return [];

  // Tur = de la Nord → Chișinău (ordinea naturală din DB)
  // Retur = de la Chișinău → Nord (ordine inversată)
  const ordered = direction === 'tur' ? data : [...data].reverse();

  // Cumulăm distanțele segmentelor
  const segmentKey = direction === 'tur' ? 'km_from_nord' : 'km_from_chisinau';
  let cumKm = 0;
  return ordered.map((row: any, idx: number) => {
    if (idx > 0) {
      cumKm += Number(row[segmentKey] || 0);
    }
    return {
      stopOrder: idx + 1,
      nameRo: row.name_ro,
      kmFromStart: Math.round(cumKm * 10) / 10,
    };
  });
}

export async function getTariffConfig(date?: string): Promise<TariffConfig> {
  const sb = getSupabase();

  // Load settings that don't change per period
  const { data: settingsRows } = await sb
    .from('app_config')
    .select('key, value')
    .in('key', ['dual_interurban_tariff', 'short_distance_threshold_km']);
  const settings: Record<string, string> = {};
  for (const row of settingsRows || []) settings[row.key] = row.value;

  const doubleTariffEnabled = settings['dual_interurban_tariff'] === 'true';
  const shortDistanceKm = parseInt(settings['short_distance_threshold_km'] || '65');

  // Try historical tariff for the given date
  if (date) {
    const { data: period } = await sb
      .from('tariff_periods')
      .select('rate_interurban_long, rate_interurban_short, rate_suburban')
      .lte('period_start', date)
      .gte('period_end', date)
      .order('period_start', { ascending: false })
      .limit(1)
      .single();

    if (period) {
      return {
        ratePerKmLong: Number(period.rate_interurban_long),
        ratePerKmShort: Number(period.rate_interurban_short),
        ratePerKmSuburban: Number((period as any).rate_suburban ?? 0),
        doubleTariffEnabled,
        shortDistanceKm,
      };
    }
  }

  // Fallback: current rates from app_config
  const { data: rateRows } = await sb
    .from('app_config')
    .select('key, value')
    .in('key', ['rate_per_km_long', 'rate_per_km_interurban_short', 'rate_per_km_suburban']);
  for (const row of rateRows || []) settings[row.key] = row.value;

  return {
    ratePerKmLong: parseFloat(settings['rate_per_km_long'] || '0.94'),
    ratePerKmShort: parseFloat(settings['rate_per_km_interurban_short'] || '0.94'),
    ratePerKmSuburban: parseFloat(settings['rate_per_km_suburban'] || '1.20'),
    doubleTariffEnabled,
    shortDistanceKm,
  };
}

/**
 * Returnează orarul suburban pentru o rută într-o zi specifică.
 * Filtrează schedule-urile după days_of_week (ISO zi: 1=luni…7=duminică).
 * Returnează listele tur și retur sortate după sequence_no.
 */
export async function getSuburbanSchedule(
  crmRouteId: number,
  date: string,
): Promise<{ tur: SuburbanSchedule[]; retur: SuburbanSchedule[] }> {
  try { requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return { tur: [], retur: [] }; }

  const sb = getSupabase();
  // JS: getDay() returns 0=Sunday. Convert to ISO 1=Mon..7=Sun.
  const jsDay = new Date(date).getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;

  const { data: schedules } = await sb
    .from('crm_route_schedules')
    .select('id, direction, sequence_no, days_of_week')
    .eq('route_id', crmRouteId)
    .eq('active', true)
    .contains('days_of_week', [isoDay])
    .order('sequence_no', { ascending: true });

  if (!schedules || schedules.length === 0) return { tur: [], retur: [] };

  const scheduleIds = schedules.map((s: any) => s.id);
  const { data: stopsRows } = await sb
    .from('crm_route_schedule_stops')
    .select('schedule_id, stop_id, stop_time, stop_order')
    .in('schedule_id', scheduleIds)
    .order('stop_order', { ascending: true });

  // Load stop names + km
  const stopIds = Array.from(new Set((stopsRows || []).map((r: any) => r.stop_id)));
  const { data: stopDetails } = await sb
    .from('crm_stop_prices')
    .select('id, name_ro, km_from_nord, km_from_chisinau')
    .in('id', stopIds);

  const stopById: Record<number, { name: string; kmSegment: number }> = {};
  for (const s of (stopDetails || []) as any[]) {
    stopById[s.id] = { name: s.name_ro, kmSegment: Number(s.km_from_nord || 0) };
  }

  const byScheduleId: Record<number, SuburbanScheduleStop[]> = {};
  for (const row of (stopsRows || []) as any[]) {
    if (!byScheduleId[row.schedule_id]) byScheduleId[row.schedule_id] = [];
    const meta = stopById[row.stop_id] || { name: '', kmSegment: 0 };
    byScheduleId[row.schedule_id].push({
      stopId: row.stop_id,
      stopOrder: row.stop_order,
      nameRo: meta.name,
      stopTime: (row.stop_time as string)?.slice(0, 5) || '',
      kmFromStart: 0, // temp, will compute below
    });
  }

  // Compute kmFromStart per schedule (cumulative segment sum)
  for (const schedId of Object.keys(byScheduleId)) {
    const stops = byScheduleId[Number(schedId)];
    stops.sort((a, b) => a.stopOrder - b.stopOrder);
    let cum = 0;
    for (let i = 0; i < stops.length; i++) {
      if (i > 0) {
        const seg = stopById[stops[i].stopId]?.kmSegment ?? 0;
        cum += seg;
      }
      stops[i].kmFromStart = Math.round(cum * 10) / 10;
    }
  }

  const tur: SuburbanSchedule[] = [];
  const retur: SuburbanSchedule[] = [];

  for (const s of schedules as any[]) {
    const item: SuburbanSchedule = {
      scheduleId: s.id,
      direction: s.direction,
      sequenceNo: s.sequence_no,
      daysOfWeek: s.days_of_week,
      stops: byScheduleId[s.id] || [],
    };
    if (s.direction === 'tur') tur.push(item);
    else retur.push(item);
  }

  return { tur, retur };
}

// ─── Locking ───

export async function lockRoute(
  crmRouteId: number,
  date: string,
  driverId?: string | null,
  vehicleId?: string | null,
): Promise<{ sessionId?: string; readOnly?: boolean; error?: string }> {
  let session;
  try { session = requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();

  // Verificăm dacă există deja o sesiune
  const { data: existing } = await sb
    .from('counting_sessions')
    .select('id, operator_id, locked_by, locked_at, status')
    .eq('crm_route_id', crmRouteId)
    .eq('assignment_date', date)
    .single();

  if (existing) {
    // Sesiune a altui operator — deschidem în mod doar-citire, fără să atingem lock-ul.
    if (existing.operator_id !== session.id) {
      return { sessionId: existing.id, readOnly: true };
    }
    // Blocăm pentru operatorul care a creat sesiunea + actualizăm driver/vehicle dacă sunt noi
    const updateFields: any = { locked_by: session.id, locked_at: new Date().toISOString() };
    if (driverId !== undefined) updateFields.driver_id = driverId || null;
    if (vehicleId !== undefined) updateFields.vehicle_id = vehicleId || null;
    await sb
      .from('counting_sessions')
      .update(updateFields)
      .eq('id', existing.id);
    return { sessionId: existing.id };
  }

  // Creăm sesiune nouă
  const { data, error } = await sb
    .from('counting_sessions')
    .insert({
      crm_route_id: crmRouteId,
      assignment_date: date,
      operator_id: session.id,
      locked_by: session.id,
      locked_at: new Date().toISOString(),
      status: 'new',
      driver_id: driverId || null,
      vehicle_id: vehicleId || null,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { sessionId: data.id };
}

export async function updateSessionDriverVehicle(
  sessionId: string,
  driverId: string | null,
  vehicleId: string | null,
): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();
  const { error } = await sb
    .from('counting_sessions')
    .update({ driver_id: driverId, vehicle_id: vehicleId })
    .eq('id', sessionId);

  if (error) return { error: error.message };
  revalidatePath('/numarare');
  return {};
}

export async function unlockRoute(sessionId: string): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();
  await sb
    .from('counting_sessions')
    .update({ locked_by: null, locked_at: null })
    .eq('id', sessionId);

  revalidatePath('/numarare');
  return {};
}

// ─── Сохранение данных ───

export async function saveDirection(
  sessionId: string,
  direction: 'tur' | 'retur',
  entries: {
    stopOrder: number;
    stopNameRo: string;
    kmFromStart: number;
    totalPassengers: number;
    alighted: number;
    shortPassengers: {
      boardedStopOrder: number;
      boardedStopNameRo: string;
      kmDistance: number;
      passengerCount: number;
      amountLei: number;
    }[];
  }[],
  totalLei: number,
  totalLeiSingle: number,
): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();

  // Удаляем старые entries для этого direction
  const { data: oldEntries } = await sb
    .from('counting_entries')
    .select('id')
    .eq('session_id', sessionId)
    .eq('direction', direction);

  if (oldEntries && oldEntries.length > 0) {
    const oldIds = oldEntries.map((e: any) => e.id);
    await sb.from('counting_short_passengers').delete().in('entry_id', oldIds);
    await sb.from('counting_entries').delete().eq('session_id', sessionId).eq('direction', direction);
  }

  // Вставляем новые entries
  for (const entry of entries) {
    const { data: inserted, error: eErr } = await sb
      .from('counting_entries')
      .insert({
        session_id: sessionId,
        direction,
        stop_order: entry.stopOrder,
        stop_name_ro: entry.stopNameRo,
        km_from_start: entry.kmFromStart,
        total_passengers: entry.totalPassengers,
        alighted: entry.alighted,
      })
      .select('id')
      .single();

    if (eErr) return { error: eErr.message };

    // Вставляем short passengers
    if (entry.shortPassengers.length > 0) {
      const shorts = entry.shortPassengers.map(sp => ({
        entry_id: inserted!.id,
        boarded_stop_order: sp.boardedStopOrder,
        boarded_stop_name_ro: sp.boardedStopNameRo,
        km_distance: sp.kmDistance,
        passenger_count: sp.passengerCount,
        amount_lei: sp.amountLei,
      }));
      const { error: spErr } = await sb
        .from('counting_short_passengers')
        .insert(shorts);
      if (spErr) return { error: spErr.message };
    }
  }

  // Обновляем статус и сумму
  const updateFields: any = {};
  if (direction === 'tur') {
    updateFields.tur_total_lei = totalLei;
    updateFields.tur_single_lei = totalLeiSingle;
    updateFields.status = 'tur_done';
  } else {
    updateFields.retur_total_lei = totalLei;
    updateFields.retur_single_lei = totalLeiSingle;
    updateFields.status = 'completed';
  }
  updateFields.locked_by = null;
  updateFields.locked_at = null;

  await sb.from('counting_sessions').update(updateFields).eq('id', sessionId);

  revalidatePath('/numarare');
  return {};
}

export async function loadSavedEntries(
  sessionId: string,
  direction: 'tur' | 'retur',
): Promise<SavedEntry[]> {
  try { requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return []; }

  const sb = getSupabase();
  const { data: entries } = await sb
    .from('counting_entries')
    .select(`
      id, stop_order, stop_name_ro, km_from_start, total_passengers, alighted,
      counting_short_passengers(id, boarded_stop_order, boarded_stop_name_ro, km_distance, passenger_count, amount_lei)
    `)
    .eq('session_id', sessionId)
    .eq('direction', direction)
    .order('stop_order');

  return (entries || []).map((e: any) => ({
    id: e.id,
    stopOrder: e.stop_order,
    stopNameRo: e.stop_name_ro,
    kmFromStart: Number(e.km_from_start),
    totalPassengers: e.total_passengers,
    alighted: e.alighted ?? 0,
    shortPassengers: (e.counting_short_passengers || []).map((sp: any) => ({
      id: sp.id,
      boardedStopOrder: sp.boarded_stop_order,
      boardedStopNameRo: sp.boarded_stop_name_ro,
      kmDistance: Number(sp.km_distance),
      passengerCount: sp.passenger_count,
      amountLei: sp.amount_lei ? Number(sp.amount_lei) : null,
    })),
  }));
}

// ─── Admin camere: deblocare forțată ───

export async function forceUnlock(sessionId: string): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session || (session.role !== 'ADMIN' && session.role !== 'ADMIN_CAMERE')) {
    return { error: 'Acces interzis' };
  }

  return unlockRoute(sessionId);
}

// ─── Suburban: save/load per ciclu ───

export async function saveSuburbanCycle(
  sessionId: string,
  scheduleId: number,
  direction: 'tur' | 'retur',
  cycleNumber: number,
  entries: {
    stopOrder: number;
    stopNameRo: string;
    kmFromStart: number;
    totalPassengers: number;
    alighted: number;
  }[],
  totalLei: number,
  altDriverId?: string | null,
  altVehicleId?: string | null,
): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return { error: 'Acces interzis' }; }
  const sb = getSupabase();

  // Șterge entries anterioare pentru acest (session, schedule, cycle)
  await sb
    .from('counting_entries')
    .delete()
    .eq('session_id', sessionId)
    .eq('schedule_id', scheduleId)
    .eq('cycle_number', cycleNumber);

  // Inserează noile entries
  for (const entry of entries) {
    const { error } = await sb.from('counting_entries').insert({
      session_id: sessionId,
      direction,
      schedule_id: scheduleId,
      cycle_number: cycleNumber,
      stop_order: entry.stopOrder,
      stop_name_ro: entry.stopNameRo,
      km_from_start: entry.kmFromStart,
      total_passengers: entry.totalPassengers,
      alighted: entry.alighted,
      alt_driver_id: altDriverId || null,
      alt_vehicle_id: altVehicleId || null,
    });
    if (error) return { error: error.message };
  }

  // Auto-detect finalize: dacă toate schedule-urile planificate pentru ziua
  // sesiunii au cel puțin o linie salvată, status devine 'completed'.
  // Altfel rămâne 'tur_done' (interfața arată „Tur gata" și permite continuarea).
  const { data: sessionRow } = await sb
    .from('counting_sessions')
    .select('assignment_date, crm_route_id')
    .eq('id', sessionId)
    .single();

  let newStatus: 'tur_done' | 'completed' = 'tur_done';
  if (sessionRow) {
    const jsDay = new Date(sessionRow.assignment_date as string).getDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;

    const { data: expectedRows } = await sb
      .from('crm_route_schedules')
      .select('id')
      .eq('route_id', sessionRow.crm_route_id)
      .eq('active', true)
      .contains('days_of_week', [isoDay]);
    const expected = new Set<number>((expectedRows || []).map((r: any) => r.id));

    const { data: savedRows } = await sb
      .from('counting_entries')
      .select('schedule_id')
      .eq('session_id', sessionId)
      .not('schedule_id', 'is', null);
    const saved = new Set<number>((savedRows || []).map((r: any) => r.schedule_id));

    if (expected.size > 0) {
      let allCovered = true;
      for (const id of expected) if (!saved.has(id)) { allCovered = false; break; }
      if (allCovered) newStatus = 'completed';
    }
  }

  // Recompute total revenue for the session from all saved entries + tariff.
  // For suburban sessions we store the grand total in tur_total_lei (single bucket
  // because a cursa can have passengers in both directions simultaneously).
  const sessionTotal = sessionRow
    ? await computeSuburbanSessionTotal(sessionId, sessionRow.assignment_date as string)
    : 0;

  await sb.from('counting_sessions').update({
    status: newStatus,
    tur_total_lei: sessionTotal,
    retur_total_lei: 0,
    locked_by: null,
    locked_at: null,
  }).eq('id', sessionId);

  revalidatePath('/numarare');
  return {};
}

/**
 * Recompută totalul suburban dintr-o sesiune pornind de la counting_entries
 * și tariful valabil la data sesiunii. Aplică aceeași formulă ca UI-ul
 * (pasageri × km tronson × rată), sumată pe TUR (spre Briceni) și RETUR
 * (dinspre Briceni) pentru fiecare cursă.
 */
async function computeSuburbanSessionTotal(sessionId: string, assignmentDate: string): Promise<number> {
  const sb = getSupabase();
  const tariff = await getTariffConfig(assignmentDate);
  const rate = tariff.ratePerKmSuburban;
  if (!rate) return 0;

  const { data: entries } = await sb
    .from('counting_entries')
    .select('schedule_id, cycle_number, stop_order, km_from_start, total_passengers, alighted')
    .eq('session_id', sessionId);
  if (!entries || entries.length === 0) return 0;

  const cycles = new Map<string, { stopOrder: number; km: number; total: number; alighted: number }[]>();
  for (const e of entries as any[]) {
    const key = `${e.schedule_id}::${e.cycle_number}`;
    if (!cycles.has(key)) cycles.set(key, []);
    cycles.get(key)!.push({
      stopOrder: e.stop_order,
      km: Number(e.km_from_start || 0),
      total: e.total_passengers || 0,
      alighted: e.alighted || 0,
    });
  }

  let grandTotal = 0;
  for (const stops of cycles.values()) {
    stops.sort((a, b) => a.stopOrder - b.stopOrder);
    for (let i = 0; i < stops.length - 1; i++) {
      const tronsonKm = Math.abs(stops[i + 1].km - stops[i].km);
      grandTotal += stops[i].total * tronsonKm * rate;
    }
    for (let i = stops.length - 1; i > 0; i--) {
      const tronsonKm = Math.abs(stops[i].km - stops[i - 1].km);
      grandTotal += stops[i].alighted * tronsonKm * rate;
    }
  }
  return Math.round(grandTotal);
}

/**
 * Finalizare manuală a unei sesiuni suburbane.
 * Utilă când operatorul nu va completa toate cursele planificate (autobuz defect,
 * rută anulată etc.) și vrea să închidă sesiunea cu datele existente.
 */
export async function finalizeSuburbanSession(
  sessionId: string,
): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return { error: 'Acces interzis' }; }
  const sb = getSupabase();

  const { data: sessionRow } = await sb
    .from('counting_sessions')
    .select('assignment_date')
    .eq('id', sessionId)
    .single();

  const sessionTotal = sessionRow
    ? await computeSuburbanSessionTotal(sessionId, sessionRow.assignment_date as string)
    : 0;

  const { error } = await sb
    .from('counting_sessions')
    .update({
      status: 'completed',
      tur_total_lei: sessionTotal,
      retur_total_lei: 0,
      locked_by: null,
      locked_at: null,
    })
    .eq('id', sessionId);
  if (error) return { error: error.message };

  revalidatePath('/numarare');
  return {};
}

export async function loadSuburbanEntries(
  sessionId: string,
): Promise<{ scheduleId: number | null; cycleNumber: number; direction: 'tur' | 'retur'; stopOrder: number; stopNameRo: string; kmFromStart: number; totalPassengers: number; alighted: number; altDriverId: string | null; altVehicleId: string | null }[]> {
  try { requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return []; }
  const sb = getSupabase();
  const { data } = await sb
    .from('counting_entries')
    .select('schedule_id, cycle_number, direction, stop_order, stop_name_ro, km_from_start, total_passengers, alighted, alt_driver_id, alt_vehicle_id')
    .eq('session_id', sessionId)
    .order('cycle_number')
    .order('stop_order');
  return (data || []).map((e: any) => ({
    scheduleId: e.schedule_id,
    cycleNumber: e.cycle_number,
    direction: e.direction,
    stopOrder: e.stop_order,
    stopNameRo: e.stop_name_ro,
    kmFromStart: Number(e.km_from_start),
    totalPassengers: e.total_passengers,
    alighted: e.alighted ?? 0,
    altDriverId: e.alt_driver_id || null,
    altVehicleId: e.alt_vehicle_id || null,
  }));
}
