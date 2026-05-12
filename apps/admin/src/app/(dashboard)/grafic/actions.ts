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
  /**
   * Numar chitanta casa automata (introdus de dispecer).
   * Vizibil pentru ADMIN + DISPATCHER, ascuns pentru GRAFIC.
   * Identifica unic soferul pe ziua respectiva pentru matching cu tomberon.
   */
  cashin_receipt_nr: string | null;
  /** true daca dispecerul a marcat cursa ca neefectuata pe ziua respectiva */
  cancelled: boolean;
}

export interface GraficEdinetRow {
  crm_route_id: number;
  hour_edinet: string;            // "09:25" — departure from Edineț toward Chișinău
  hour_balti: string;             // "10:30" — departure from Bălți toward Chișinău
  time_chisinau_retur: string;    // "15:55" — retur departure from Chișinău
  dest_to: string;
  driver_id: string | null;
  driver_phone: string | null;
  driver_name: string | null;
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
  const session = requireRole(await verifySession(), 'ADMIN', 'DISPATCHER', 'GRAFIC');
  // ADMIN si DISPATCHER vad numarul foii de parcurs. Rolul GRAFIC nu.
  const canSeeReceipt = session.role === 'DISPATCHER' || session.role === 'ADMIN';

  const db = getSupabase();

  const [routesRes, assignmentsRes, driversRes, vehiclesRes, stopsRes, receiptsRes, cancellationsRes] = await Promise.all([
    db.from('crm_routes').select('id, time_nord, time_chisinau, dest_to_ro').eq('active', true).not('time_nord', 'is', null).neq('time_nord', ''),
    db.from('daily_assignments')
      .select('id, crm_route_id, driver_id, vehicle_id, vehicle_id_retur, retur_route_id')
      .eq('assignment_date', date)
      .eq('auto_copied', false),
    db.from('drivers').select('id, full_name, phone').eq('active', true),
    db.from('vehicles').select('id, plate_number').eq('active', true),
    db.from('crm_stop_fares').select('id, crm_route_id, name_ro').eq('is_visible', true).order('id', { ascending: true }),
    canSeeReceipt
      ? db.from('driver_cashin_receipts').select('driver_id, receipt_nr').eq('ziua', date)
      : Promise.resolve({ data: [] as any[] }),
    db.from('route_cancellations').select('crm_route_id').eq('ziua', date),
  ]);

  const routes = (routesRes.data || []) as any[];
  const assignments = (assignmentsRes.data || []) as any[];
  const drivers = (driversRes.data || []) as any[];
  const vehicles = (vehiclesRes.data || []) as any[];
  const stops = (stopsRes.data || []) as any[];
  const receipts = (receiptsRes.data || []) as any[];
  const cancellations = (cancellationsRes.data || []) as any[];

  const assignmentMap = new Map(assignments.map((a: any) => [a.crm_route_id, a]));
  const driverMap = new Map(drivers.map((d: any) => [d.id, d]));
  const vehicleMap = new Map(vehicles.map((v: any) => [v.id, v]));
  const receiptByDriver = new Map<string, string>();
  for (const r of receipts) receiptByDriver.set(r.driver_id, r.receipt_nr);
  const cancelledSet = new Set<number>(cancellations.map((c: any) => c.crm_route_id));

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
      cashin_receipt_nr: a?.driver_id ? (receiptByDriver.get(a.driver_id) || null) : null,
      cancelled: cancelledSet.has(r.id),
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
    cashin_receipt_nr: r.cashin_receipt_nr,
    cancelled: r.cancelled,
  }));

  return {
    page1: numbered.slice(0, 14),
    page2: numbered.slice(14, 28),
  };
}

/* ── Edineț graphic (second image type) ── */

export async function getGraficEdinetRows(date: string): Promise<GraficEdinetRow[]> {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER', 'GRAFIC');

  const db = getSupabase();

  const [routesRes, stopsRes, assignmentsRes, driversRes] = await Promise.all([
    db.from('crm_routes').select('id, time_chisinau, dest_to_ro').eq('active', true).not('time_chisinau', 'is', null).neq('time_chisinau', ''),
    db.from('crm_stop_fares').select('id, crm_route_id, name_ro, hour_from_nord').eq('is_visible', true).order('id', { ascending: true }),
    db.from('daily_assignments')
      .select('crm_route_id, driver_id, retur_route_id')
      .eq('assignment_date', date)
      .eq('auto_copied', false),
    db.from('drivers').select('id, full_name, phone').eq('active', true),
  ]);

  const routes = (routesRes.data || []) as any[];
  const stops = (stopsRes.data || []) as any[];
  const assignments = (assignmentsRes.data || []) as any[];
  const drivers = (driversRes.data || []) as any[];

  const driverMap = new Map(drivers.map((d: any) => [d.id, d]));
  const assignmentMap = new Map(assignments.map((a: any) => [a.crm_route_id, a]));
  const routeMap = new Map(routes.map((r: any) => [r.id, r]));

  // Normalize Romanian stop name (strip diacritics + lowercase) for exact match
  const normRo = (name: string) =>
    name.trim().toLowerCase()
      .replace(/[șş]/g, 's')
      .replace(/[țţ]/g, 't')
      .replace(/[ăâ]/g, 'a')
      .replace(/î/g, 'i');

  // Reject empty or midnight-zero placeholders ("0:00", "00:00")
  const isValidHour = (t: string | null | undefined): t is string =>
    !!t && !/^\s*0?0:00\s*$/.test(t);

  // Group stops per route: find hour_from_nord for exact "Edineț" and "Bălți" stops only
  const routeStops = new Map<number, { edinet?: string; balti?: string }>();
  for (const s of stops) {
    const n = normRo(s.name_ro || '');
    if (n !== 'edinet' && n !== 'balti') continue;
    if (!isValidHour(s.hour_from_nord)) continue;
    if (!routeStops.has(s.crm_route_id)) routeStops.set(s.crm_route_id, {});
    const rs = routeStops.get(s.crm_route_id)!;
    if (n === 'edinet') rs.edinet = s.hour_from_nord;
    else rs.balti = s.hour_from_nord;
  }

  const rows: (GraficEdinetRow & { _sortKey: number })[] = [];
  for (const r of routes) {
    const rs = routeStops.get(r.id);
    if (!rs?.edinet) continue;

    const a = assignmentMap.get(r.id);
    const driver = a?.driver_id ? driverMap.get(a.driver_id) : null;
    const chisinauTime = resolveReturTime(a, r.time_chisinau || '', routeMap);

    rows.push({
      _sortKey: parseFirstTime(rs.edinet || ''),
      crm_route_id: r.id,
      hour_edinet: parseTimeLabel(rs.edinet || ''),
      hour_balti: rs.balti ? parseTimeLabel(rs.balti) : '',
      time_chisinau_retur: chisinauTime,
      dest_to: r.dest_to_ro || '',
      driver_id: a?.driver_id || null,
      driver_phone: toLocalPhone(driver?.phone || null),
      driver_name: driver?.full_name || null,
    });
  }

  rows.sort((a, b) => a._sortKey - b._sortKey);

  return rows.map(({ _sortKey, ...rest }) => rest);
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
  // Any dispatcher touch promotes the row to manual (clears auto_copied).
  const { error } = await db.from('daily_assignments').upsert(
    {
      crm_route_id: crmRouteId,
      assignment_date: date,
      driver_id: driverId,
      vehicle_id: vehicleId,
      vehicle_id_retur: vehicleIdRetur,
      auto_copied: false,
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

  // A target date that only holds auto_copied rows should count as empty —
  // dispatcher sees no programări in the UI, so blocking here is misleading.
  const { data: existing } = await db
    .from('daily_assignments')
    .select('id')
    .eq('assignment_date', targetDate)
    .eq('auto_copied', false)
    .limit(1);

  if (existing && existing.length > 0) {
    return { error: 'Există deja programări pentru această dată' };
  }

  // Clear any stale auto_copied rows on the target before the real copy
  // (avoids UNIQUE (crm_route_id, assignment_date) conflicts on insert).
  await db
    .from('daily_assignments')
    .delete()
    .eq('assignment_date', targetDate)
    .eq('auto_copied', true);

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
    auto_copied: false,
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
    .eq('auto_copied', false)
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
    .eq('active', true)
    .not('time_chisinau', 'is', null)
    .neq('time_chisinau', '');
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

/* ── Suburban routes grafic ── */

export interface SuburbanGraficRow {
  crm_route_id: number;
  dest_from_ro: string;   // "Beleavinți"
  dest_to_ro: string;     // "Briceni"
  cycles: number;         // cate cicluri/zi (max sequence_no)
  assignment_id: string | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle_id: string | null;
  vehicle_plate: string | null;
  /** Vizibil pentru ADMIN + DISPATCHER. */
  cashin_receipt_nr: string | null;
  /** true daca dispecerul a marcat cursa ca neefectuata pe ziua respectiva */
  cancelled: boolean;
}

export async function getGraficSuburban(date: string): Promise<SuburbanGraficRow[]> {
  const session = requireRole(await verifySession(), 'ADMIN', 'DISPATCHER', 'GRAFIC');
  // Foaia de parcurs e vizibila atat pentru DISPATCHER (editabila) cat si pentru ADMIN (read-only).
  // Pentru rolul GRAFIC ramane ascunsa.
  const canSeeReceipt = session.role === 'DISPATCHER' || session.role === 'ADMIN';

  const db = getSupabase();

  // Rute suburbane = active, fara time_nord (delimitarea standard in baza)
  const { data: routes } = await db
    .from('crm_routes')
    .select('id, dest_from_ro, dest_to_ro')
    .eq('active', true)
    .or('time_nord.is.null,time_nord.eq.')
    .order('dest_from_ro');

  if (!routes || routes.length === 0) return [];

  const routeIds = routes.map((r: any) => r.id);

  const [schedulesRes, assignmentsRes, driversRes, vehiclesRes, receiptsRes, cancellationsRes] = await Promise.all([
    db.from('crm_route_schedules')
      .select('route_id, sequence_no, days_of_week')
      .in('route_id', routeIds)
      .eq('active', true),
    db.from('daily_assignments')
      .select('id, crm_route_id, driver_id, vehicle_id')
      .in('crm_route_id', routeIds)
      .eq('assignment_date', date)
      .eq('auto_copied', false),
    db.from('drivers').select('id, full_name, phone').eq('active', true),
    db.from('vehicles').select('id, plate_number').eq('active', true),
    canSeeReceipt
      ? db.from('driver_cashin_receipts').select('driver_id, receipt_nr').eq('ziua', date)
      : Promise.resolve({ data: [] as any[] }),
    db.from('route_cancellations')
      .select('crm_route_id')
      .in('crm_route_id', routeIds)
      .eq('ziua', date),
  ]);

  const schedules = (schedulesRes.data || []) as any[];
  const assignments = (assignmentsRes.data || []) as any[];
  const drivers = (driversRes.data || []) as any[];
  const vehicles = (vehiclesRes.data || []) as any[];
  const receipts = (receiptsRes.data || []) as any[];
  const cancellations = (cancellationsRes.data || []) as any[];
  const cancelledSet = new Set<number>(cancellations.map((c: any) => c.crm_route_id));

  // Ziua saptamanii ISO (1=Luni ... 7=Duminica)
  const jsDay = new Date(date + 'T12:00:00').getDay(); // 0..6 (0=Sunday)
  const isoDay = ((jsDay + 6) % 7) + 1; // 1..7 (1=Monday, 7=Sunday)

  // Pentru fiecare ruta calculez cate cicluri (schedules) circula in ziua respectiva.
  // Daca 0 — ruta nu apare in unified list (nu circula azi).
  const cyclesToday = new Map<number, number>();
  for (const s of schedules) {
    const days: number[] = Array.isArray(s.days_of_week) ? s.days_of_week : [];
    if (!days.includes(isoDay)) continue;
    cyclesToday.set(s.route_id, (cyclesToday.get(s.route_id) || 0) + 1);
  }

  const assignmentMap = new Map(assignments.map((a: any) => [a.crm_route_id, a]));
  const driverMap = new Map(drivers.map((d: any) => [d.id, d]));
  const vehicleMap = new Map(vehicles.map((v: any) => [v.id, v]));
  const receiptByDriver = new Map<string, string>();
  for (const r of receipts) receiptByDriver.set(r.driver_id, r.receipt_nr);

  return routes
    // Filtru: doar rutele care circula in ziua saptamanii curenta
    .filter((r: any) => (cyclesToday.get(r.id) || 0) > 0)
    .map((r: any) => {
      const a = assignmentMap.get(r.id);
      const driver = a?.driver_id ? driverMap.get(a.driver_id) : null;
      const vehicle = a?.vehicle_id ? vehicleMap.get(a.vehicle_id) : null;

      return {
        crm_route_id: r.id,
        dest_from_ro: r.dest_from_ro || '',
        dest_to_ro: r.dest_to_ro || '',
        cycles: cyclesToday.get(r.id) || 0,
        assignment_id: a?.id || null,
        driver_id: a?.driver_id || null,
        driver_name: driver?.full_name || null,
        driver_phone: toLocalPhone(driver?.phone || null),
        vehicle_id: a?.vehicle_id || null,
        vehicle_plate: vehicle?.plate_number || null,
        cashin_receipt_nr: a?.driver_id ? (receiptByDriver.get(a.driver_id) || null) : null,
        cancelled: cancelledSet.has(r.id),
      };
    });
}

/* ── Chitanta casa automata (rol DISPATCHER only) ── */

export async function setCashinReceipt(
  driverId: string,
  date: string,
  receiptNr: string,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (session.role !== 'DISPATCHER') return { error: 'Doar dispecerul poate introduce chitanta' };
  if (!driverId || !date) return { error: 'Date lipsă' };

  const db = getSupabase();
  const raw = receiptNr.trim();

  // String gol = stergere mapping
  if (raw === '') {
    const { error } = await db.from('driver_cashin_receipts')
      .delete()
      .match({ driver_id: driverId, ziua: date });
    if (error) return { error: error.message };
    return {};
  }

  // Normalizare: pentru numere, eliminam zerourile de la inceput.
  // In baza '0142961' si '00142961' se stocheaza la fel: '142961'.
  const trimmed = /^[0-9]+$/.test(raw) ? String(parseInt(raw, 10)) : raw;

  // Upsert: (driver_id, ziua) e unique, deci conflict pe aceasta pereche
  const { error } = await db.from('driver_cashin_receipts').upsert(
    {
      driver_id: driverId,
      ziua: date,
      receipt_nr: trimmed,
      created_by: session.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'driver_id,ziua' },
  );

  if (error) {
    // 23505 = duplicate. Constraintul unic pe receipt_nr e global (nu doar in zi).
    if (error.code === '23505') {
      const { data: existing } = await db
        .from('driver_cashin_receipts')
        .select('ziua, drivers:driver_id(full_name)')
        .eq('receipt_nr', trimmed)
        .maybeSingle();
      if (existing) {
        const driverName = (existing as any).drivers?.full_name || 'alt șofer';
        const [y, m, d] = String(existing.ziua).split('-');
        const day = `${d}.${m}.${y}`;
        return { error: `Foaia de parcurs #${trimmed} e deja folosită de ${driverName} pe ${day}` };
      }
      return { error: `Foaia de parcurs #${trimmed} e deja folosită` };
    }
    return { error: error.message };
  }
  return {};
}

/* ── Cursa neefectuata (rol DISPATCHER only) ── */

export async function setRouteCancellation(
  crmRouteId: number,
  date: string,
  cancelled: boolean,
  reason?: string,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (session.role !== 'DISPATCHER') return { error: 'Doar dispecerul poate marca cursa' };
  if (!crmRouteId || !date) return { error: 'Date lipsa' };

  const db = getSupabase();

  if (!cancelled) {
    const { error } = await db.from('route_cancellations')
      .delete()
      .match({ crm_route_id: crmRouteId, ziua: date });
    if (error) return { error: error.message };
    return {};
  }

  const { error } = await db.from('route_cancellations').upsert(
    {
      crm_route_id: crmRouteId,
      ziua: date,
      reason: reason || null,
      created_by: session.id,
    },
    { onConflict: 'crm_route_id,ziua' },
  );
  if (error) return { error: error.message };
  return {};
}
