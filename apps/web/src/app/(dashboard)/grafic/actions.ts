'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { parseFirstTime, parseTimeLabel, resolveReturTime } from '@/lib/assignments';

/* ── Types ── */

export interface DriverOption {
  id: string;
  full_name: string;
  phone: string | null;
}

export interface VehicleOption {
  id: string;
  plate_number: string;
}

export interface GraficRow {
  crm_route_id: number;
  seq: number;                    // 1-based position in sorted list
  time_nord: string;              // "02:35" (departure from nord)
  time_chisinau: string;          // "10:40" (departure from Chișinău)
  dest_to: string;                // "Lipcani"
  assignment_id: string | null;
  driver_id: string | null;
  driver_phone: string | null;    // local format "069..."
  driver_name: string | null;     // first name only
  vehicle_id: string | null;
  vehicle_plate: string | null;
  vehicle_id_retur: string | null;
  vehicle_plate_retur: string | null;
  stops: string;                  // "Briceni/Edineț/Bălți"
  retur_route_id: number | null;
}

/* ── Helpers ── */

function toLocalPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('373') && digits.length >= 11) {
    return '0' + digits.slice(3);
  }
  return digits.startsWith('0') ? digits : '0' + digits;
}

function extractFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

/* ── Data loading ── */

export async function getGraficData(date: string): Promise<{
  page1: GraficRow[];
  page2: GraficRow[];
}> {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER', 'GRAFIC');

  const db = getSupabase();

  const [routesRes, assignmentsRes, driversRes, vehiclesRes, stopsRes] = await Promise.all([
    db.from('crm_routes').select('id, time_nord, time_chisinau, dest_to_ro').eq('active', true),
    db.from('daily_assignments')
      .select('id, crm_route_id, driver_id, vehicle_id, vehicle_id_retur, retur_route_id')
      .eq('assignment_date', date),
    db.from('drivers').select('id, full_name, phone').eq('active', true),
    db.from('vehicles').select('id, plate_number').eq('active', true),
    db.from('crm_stop_fares').select('crm_route_id, name_ro').eq('is_visible', true),
  ]);

  const routes = (routesRes.data || []) as any[];
  const assignments = (assignmentsRes.data || []) as any[];
  const drivers = (driversRes.data || []) as any[];
  const vehicles = (vehiclesRes.data || []) as any[];
  const stops = (stopsRes.data || []) as any[];

  const assignmentMap = new Map(assignments.map((a: any) => [a.crm_route_id, a]));
  const driverMap = new Map(drivers.map((d: any) => [d.id, d]));
  const vehicleMap = new Map(vehicles.map((v: any) => [v.id, v]));

  // Group stops by route: crm_route_id -> "Stop1/Stop2/Stop3"
  // Only include stops from Nord down to Bălți (truncate after Bălți)
  const stopsGrouped = new Map<number, string[]>();
  for (const s of stops) {
    if (!stopsGrouped.has(s.crm_route_id)) stopsGrouped.set(s.crm_route_id, []);
    stopsGrouped.get(s.crm_route_id)!.push(s.name_ro);
  }
  const stopsMap = new Map<number, string>();
  for (const [routeId, names] of stopsGrouped) {
    const baltiIdx = names.findIndex(n => /b[aă]l[tț]i/i.test(n));
    const truncated = baltiIdx >= 0 ? names.slice(0, baltiIdx + 1) : names;
    stopsMap.set(routeId, truncated.join('/'));
  }

  // Build route lookup for retur time resolution
  const routeMap = new Map(routes.map((r: any) => [r.id, r]));

  const rows = routes.map((r: any) => {
    const a = assignmentMap.get(r.id);
    const driver = a?.driver_id ? driverMap.get(a.driver_id) : null;
    const vTur = a?.vehicle_id ? vehicleMap.get(a.vehicle_id) : null;
    const vRet = a?.vehicle_id_retur ? vehicleMap.get(a.vehicle_id_retur) : null;

    const chisinauTime = resolveReturTime(a, r.time_chisinau || '', routeMap);

    return {
      _sortKey: parseFirstTime(r.time_nord || ''),
      crm_route_id: r.id,
      time_nord: parseTimeLabel(r.time_nord || ''),
      time_chisinau: chisinauTime,
      dest_to: r.dest_to_ro || '',
      assignment_id: a?.id || null,
      driver_id: a?.driver_id || null,
      driver_phone: toLocalPhone(driver?.phone || null),
      driver_name: driver?.full_name || null,
      vehicle_id: a?.vehicle_id || null,
      vehicle_plate: vTur?.plate_number || null,
      vehicle_id_retur: a?.vehicle_id_retur || null,
      vehicle_plate_retur: vRet?.plate_number || null,
      stops: stopsMap.get(r.id) || '',
      retur_route_id: a?.retur_route_id || null,
    };
  });

  rows.sort((a, b) => a._sortKey - b._sortKey);

  const numbered: GraficRow[] = rows.slice(0, 28).map((r, i) => ({
    seq: i + 1,
    crm_route_id: r.crm_route_id,
    time_nord: r.time_nord,
    time_chisinau: r.time_chisinau,
    dest_to: r.dest_to,
    assignment_id: r.assignment_id,
    driver_id: r.driver_id,
    driver_phone: r.driver_phone,
    driver_name: r.driver_name,
    vehicle_id: r.vehicle_id,
    vehicle_plate: r.vehicle_plate,
    vehicle_id_retur: r.vehicle_id_retur,
    vehicle_plate_retur: r.vehicle_plate_retur,
    stops: r.stops,
    retur_route_id: r.retur_route_id,
  }));

  return {
    page1: numbered.slice(0, 14),
    page2: numbered.slice(14, 28),
  };
}

/* ── Assignment CRUD ── */

export async function upsertAssignment(
  crmRouteId: number,
  date: string,
  driverId: string,
  vehicleId: string | null,
  vehicleIdRetur: string | null
): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), 'ADMIN', 'DISPATCHER'); } catch { return { error: 'Acces interzis' }; }

  const db = getSupabase();
  const { error } = await db.from('daily_assignments').upsert(
    {
      crm_route_id: crmRouteId,
      assignment_date: date,
      driver_id: driverId,
      vehicle_id: vehicleId,
      vehicle_id_retur: vehicleIdRetur,
    },
    { onConflict: 'crm_route_id,assignment_date' }
  );

  if (error) return { error: error.message };
  return {};
}

export async function deleteAssignment(assignmentId: string): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), 'ADMIN', 'DISPATCHER'); } catch { return { error: 'Acces interzis' }; }

  const db = getSupabase();
  const { error } = await db.from('daily_assignments').delete().eq('id', assignmentId);
  if (error) return { error: error.message };
  return {};
}

export async function copyAssignments(
  sourceDate: string,
  targetDate: string
): Promise<{ error?: string; count?: number }> {
  try { requireRole(await verifySession(), 'ADMIN', 'DISPATCHER'); } catch { return { error: 'Acces interzis' }; }

  const db = getSupabase();

  const { data: existing } = await db
    .from('daily_assignments')
    .select('id')
    .eq('assignment_date', targetDate)
    .limit(1);

  if (existing && existing.length > 0) {
    return { error: 'Există deja programări pentru această dată' };
  }

  const { data: source, error: fetchErr } = await db
    .from('daily_assignments')
    .select('crm_route_id, driver_id, vehicle_id, vehicle_id_retur, retur_route_id')
    .eq('assignment_date', sourceDate);

  if (fetchErr) return { error: fetchErr.message };
  if (!source || source.length === 0) return { error: 'Nu există programări de copiat' };

  const rows = source.map((s: any) => ({
    crm_route_id: s.crm_route_id,
    assignment_date: targetDate,
    driver_id: s.driver_id,
    vehicle_id: s.vehicle_id,
    vehicle_id_retur: s.vehicle_id_retur,
    retur_route_id: s.retur_route_id,
  }));

  const { error: insertErr } = await db.from('daily_assignments').insert(rows);
  if (insertErr) return { error: insertErr.message };
  return { count: rows.length };
}

export async function updateReturRoute(
  assignmentId: string,
  returRouteId: number | null,
  date: string
): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), 'ADMIN', 'DISPATCHER'); } catch { return { error: 'Acces interzis' }; }

  const db = getSupabase();

  // Get crm_route_id for propagation
  const { data: current } = await db
    .from('daily_assignments')
    .select('crm_route_id')
    .eq('id', assignmentId)
    .single();

  if (!current) return { error: 'Programarea nu a fost găsită' };

  // Clear this retur from any other assignment on the same date
  if (returRouteId) {
    await db
      .from('daily_assignments')
      .update({ retur_route_id: null })
      .eq('assignment_date', date)
      .eq('retur_route_id', returRouteId)
      .neq('id', assignmentId);
  }

  const { error } = await db
    .from('daily_assignments')
    .update({ retur_route_id: returRouteId })
    .eq('id', assignmentId);
  if (error) return { error: error.message };

  // Propagate as standard to all future dates
  const { data: futureRows } = await db
    .from('daily_assignments')
    .select('id, assignment_date')
    .eq('crm_route_id', current.crm_route_id)
    .gt('assignment_date', date);

  if (futureRows && futureRows.length > 0) {
    for (const fa of futureRows) {
      if (returRouteId) {
        await db
          .from('daily_assignments')
          .update({ retur_route_id: null })
          .eq('assignment_date', fa.assignment_date)
          .eq('retur_route_id', returRouteId)
          .neq('id', fa.id);
      }
      await db
        .from('daily_assignments')
        .update({ retur_route_id: returRouteId })
        .eq('id', fa.id);
    }
  }

  return {};
}

/* ── Dates overview (small orientation table) ── */

export interface DateEntry {
  date: string;       // "2026-04-05"
  count: number;      // number of assignments
}

export async function getAssignmentDates(): Promise<DateEntry[]> {
  try { requireRole(await verifySession(), 'ADMIN', 'DISPATCHER', 'GRAFIC'); } catch { return []; }
  const db = getSupabase();

  // Show 7 days: yesterday + today + 5 days ahead
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' }));
  const start = new Date(today);
  start.setDate(start.getDate() - 1);
  const end = new Date(today);
  end.setDate(end.getDate() + 5);

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const { data } = await db
    .from('daily_assignments')
    .select('assignment_date')
    .gte('assignment_date', startStr)
    .lte('assignment_date', endStr);

  // Count per date
  const counts = new Map<string, number>();
  for (const row of data || []) {
    const d = row.assignment_date;
    counts.set(d, (counts.get(d) || 0) + 1);
  }

  // Build all 7 days
  const result: DateEntry[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    result.push({ date: iso, count: counts.get(iso) || 0 });
    cur.setDate(cur.getDate() + 1);
  }

  return result;
}

/* ── Static data loaders (called from page.tsx) ── */

export async function getActiveDrivers(): Promise<DriverOption[]> {
  try { requireRole(await verifySession(), 'ADMIN', 'DISPATCHER', 'GRAFIC'); } catch { return []; }
  const db = getSupabase();
  const { data } = await db
    .from('drivers')
    .select('id, full_name, phone')
    .eq('active', true)
    .order('full_name');
  return (data || []) as DriverOption[];
}

export interface ReturRouteOption {
  id: number;
  label: string; // "10:40 Lipcani"
}

export async function getReturRouteOptions(): Promise<ReturRouteOption[]> {
  try { requireRole(await verifySession(), 'ADMIN', 'DISPATCHER', 'GRAFIC'); } catch { return []; }
  const db = getSupabase();
  const { data } = await db
    .from('crm_routes')
    .select('id, time_chisinau, dest_to_ro')
    .eq('active', true);
  if (!data) return [];
  return data.map((r: any) => ({
    id: r.id,
    label: `${parseTimeLabel(r.time_chisinau || '')} ${r.dest_to_ro || ''}`,
  })).sort((a: ReturRouteOption, b: ReturRouteOption) => a.label.localeCompare(b.label));
}

export async function getActiveVehicles(): Promise<VehicleOption[]> {
  try { requireRole(await verifySession(), 'ADMIN', 'DISPATCHER', 'GRAFIC'); } catch { return []; }
  const db = getSupabase();
  const { data } = await db
    .from('vehicles')
    .select('id, plate_number')
    .eq('active', true)
    .order('plate_number');
  return (data || []) as VehicleOption[];
}
