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
  doubleTariffEnabled: boolean;
  shortDistanceKm: number;
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
    .select('id, dest_to_ro, time_chisinau, time_nord')
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
      double_tariff, tur_total_lei, retur_total_lei,
      driver_id, vehicle_id,
      session_driver:drivers!counting_sessions_driver_id_fkey(id, full_name),
      session_vehicle:vehicles!counting_sessions_vehicle_id_fkey(id, plate_number),
      locker:admin_accounts!counting_sessions_locked_by_fkey(email),
      operator:admin_accounts!counting_sessions_operator_id_fkey(email)
    `)
    .eq('assignment_date', date);

  const sessionMap = new Map<number, any>();
  for (const s of sessions || []) sessionMap.set(s.crm_route_id, s);

  // Build route map for retur_route_id resolution
  const routeLookup = new Map<number, any>();
  for (const r of allRoutes) routeLookup.set(r.id, r);

  // 4. Construim lista — TOATE rutele active
  const routes: RouteForCounting[] = allRoutes.map((r: any) => {
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
    }
  }

  return { data: routes };
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

export async function getTariffConfig(): Promise<TariffConfig> {
  const sb = getSupabase();
  const { data } = await sb
    .from('app_config')
    .select('key, value')
    .in('key', ['rate_per_km_long', 'rate_per_km_interurban_short', 'dual_interurban_tariff', 'short_distance_threshold_km']);

  const config: Record<string, string> = {};
  for (const row of data || []) {
    config[row.key] = row.value;
  }

  return {
    ratePerKmLong: parseFloat(config['rate_per_km_long'] || '0.94'),
    ratePerKmShort: parseFloat(config['rate_per_km_interurban_short'] || '0.94'),
    doubleTariffEnabled: config['dual_interurban_tariff'] === 'true',
    shortDistanceKm: parseInt(config['short_distance_threshold_km'] || '65'),
  };
}

// ─── Locking ───

export async function lockRoute(
  crmRouteId: number,
  date: string,
  driverId?: string | null,
  vehicleId?: string | null,
): Promise<{ sessionId?: string; error?: string }> {
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
    // Dacă sesiunea a fost creată de alt operator — acces interzis (permanent)
    if (existing.operator_id !== session.id) {
      return { error: 'Cursă atribuită altui operator' };
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
    updateFields.status = 'tur_done';
  } else {
    updateFields.retur_total_lei = totalLei;
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

// ─── Admin camere: toggle tarif dublu ───

export async function toggleDoubleTariff(
  sessionId: string,
  enabled: boolean,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session || (session.role !== 'ADMIN' && session.role !== 'ADMIN_CAMERE')) {
    return { error: 'Acces interzis' };
  }

  const sb = getSupabase();
  await sb.from('counting_sessions').update({ double_tariff: enabled }).eq('id', sessionId);
  revalidatePath('/numarare');
  return {};
}

// ─── Admin camere: deblocare forțată ───

export async function forceUnlock(sessionId: string): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session || (session.role !== 'ADMIN' && session.role !== 'ADMIN_CAMERE')) {
    return { error: 'Acces interzis' };
  }

  return unlockRoute(sessionId);
}
