'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import type { PointEnum, DirectionEnum, ReportStatus } from '@translux/db';

function formatDriverName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const familyName = parts[0];
  const initials = parts.slice(1).map((p) => p.charAt(0).toUpperCase() + '.').join('');
  return `${familyName} ${initials}`;
}

export interface ReportRow {
  id: string;
  report_date: string;
  point: PointEnum;
  status: ReportStatus;
  passengers_count: number | null;
  exterior_ok: boolean | null;
  uniform_ok: boolean | null;
  auto_curat: boolean | null;
  reclama_ok: boolean | null;
  reclama_deadline: string | null;
  created_at: string;
  cancelled_at: string | null;
  route_name: string;
  departure_time: string;
  direction: DirectionEnum;
  driver_name: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  plate_number: string | null;
  photos_count: number;
}

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  routeId?: string;
  direction?: DirectionEnum | '';
  point?: PointEnum | '';
  driverId?: string;
  status?: ReportStatus | '';
  page?: number;
}

export interface ReportsResult {
  reports: ReportRow[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 50;

export async function getReports(filters: ReportFilters): Promise<ReportsResult> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const page = filters.page || 0;
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = getSupabase()
    .from('reports')
    .select(
      `
      id,
      report_date,
      point,
      status,
      passengers_count,
      exterior_ok,
      uniform_ok,
      auto_curat,
      reclama_ok,
      reclama_deadline,
      created_at,
      cancelled_at,
      driver_id,
      vehicle_id,
      trips!inner(departure_time, direction, routes!inner(name)),
      drivers(full_name),
      vehicles(plate_number),
      report_photos(id)
    `,
      { count: 'exact' }
    )
    .order('report_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  // Apply filters
  if (filters.dateFrom) {
    query = query.gte('report_date', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('report_date', filters.dateTo);
  }
  if (filters.point) {
    query = query.eq('point', filters.point);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.driverId) {
    query = query.eq('driver_id', filters.driverId);
  }
  if (filters.direction) {
    query = query.eq('trips.direction', filters.direction);
  }
  if (filters.routeId) {
    query = query.eq('trips.route_id', filters.routeId);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('Reports query error:', error);
    return { reports: [], total: 0, page, pageSize: PAGE_SIZE };
  }

  const reports: ReportRow[] = (data || []).map((r: any) => ({
    id: r.id,
    report_date: r.report_date,
    point: r.point,
    status: (r.status === 'OK' && r.passengers_count === -1) ? 'FULL' : r.status,
    passengers_count: r.passengers_count === -1 ? null : r.passengers_count,
    exterior_ok: r.exterior_ok,
    uniform_ok: r.uniform_ok,
    auto_curat: r.auto_curat,
    reclama_ok: r.reclama_ok,
    reclama_deadline: r.reclama_deadline,
    created_at: r.created_at,
    cancelled_at: r.cancelled_at,
    route_name: r.trips?.routes?.name || '—',
    departure_time: r.trips?.departure_time || '—',
    direction: r.trips?.direction,
    driver_name: r.drivers?.full_name ? formatDriverName(r.drivers.full_name) : null,
    driver_id: r.driver_id,
    vehicle_id: r.vehicle_id || null,
    plate_number: r.vehicles?.plate_number || null,
    photos_count: r.report_photos?.length || 0,
  }));

  return { reports, total: count || 0, page, pageSize: PAGE_SIZE };
}

// Summary data for passengers mode
export interface PassengersSummary {
  totalPassengers: number;
  totalTrips: number;
  avgPerTrip: number;
  byPoint: Record<string, number>;
}

export async function getPassengersSummary(filters: ReportFilters): Promise<PassengersSummary> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  let query = getSupabase()
    .from('reports')
    .select('point, passengers_count, trips!inner(direction, route_id)')
    .eq('status', 'OK')
    .is('cancelled_at', null);

  if (filters.dateFrom) query = query.gte('report_date', filters.dateFrom);
  if (filters.dateTo) query = query.lte('report_date', filters.dateTo);
  if (filters.point) query = query.eq('point', filters.point);
  if (filters.driverId) query = query.eq('driver_id', filters.driverId);
  if (filters.direction) query = query.eq('trips.direction', filters.direction);
  if (filters.routeId) query = query.eq('trips.route_id', filters.routeId);

  const { data } = await query;
  const rows = data || [];

  let totalPassengers = 0;
  const byPoint: Record<string, number> = { CHISINAU: 0, BALTI: 0 };

  for (const r of rows as any[]) {
    const count = r.passengers_count || 0;
    totalPassengers += count;
    byPoint[r.point] = (byPoint[r.point] || 0) + count;
  }

  return {
    totalPassengers,
    totalTrips: rows.length,
    avgPerTrip: rows.length > 0 ? Math.round(totalPassengers / rows.length * 10) / 10 : 0,
    byPoint,
  };
}

// Summary for compliance mode
export interface ComplianceSummary {
  totalOk: number;
  aspectOkCount: number;
  uniformOkCount: number;
  autoCuratOkCount: number;
  reclamaOkCount: number;
  aspectPct: number;
  uniformPct: number;
  autoCuratPct: number;
  reclamaPct: number;
  violations: Array<{
    driver_name: string;
    report_date: string;
    exterior_ok: boolean | null;
    uniform_ok: boolean | null;
    auto_curat: boolean | null;
    reclama_ok: boolean | null;
    reclama_deadline: string | null;
  }>;
}

export async function getComplianceSummary(filters: ReportFilters): Promise<ComplianceSummary> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  let query = getSupabase()
    .from('reports')
    .select('exterior_ok, uniform_ok, auto_curat, reclama_ok, reclama_deadline, report_date, driver_id, drivers(full_name), trips!inner(direction, route_id)')
    .eq('status', 'OK')
    .is('cancelled_at', null);

  if (filters.dateFrom) query = query.gte('report_date', filters.dateFrom);
  if (filters.dateTo) query = query.lte('report_date', filters.dateTo);
  if (filters.point) query = query.eq('point', filters.point);
  if (filters.driverId) query = query.eq('driver_id', filters.driverId);
  if (filters.direction) query = query.eq('trips.direction', filters.direction);
  if (filters.routeId) query = query.eq('trips.route_id', filters.routeId);

  const { data } = await query;
  const rows = (data || []) as any[];

  const totalOk = rows.length;
  let aspectOkCount = 0;
  let uniformOkCount = 0;
  let autoCuratOkCount = 0;
  let reclamaOkCount = 0;
  const violations: ComplianceSummary['violations'] = [];

  for (const r of rows) {
    if (r.exterior_ok) aspectOkCount++;
    if (r.uniform_ok) uniformOkCount++;
    if (r.auto_curat !== false) autoCuratOkCount++;
    if (r.reclama_ok !== false) reclamaOkCount++;
    if (!r.exterior_ok || !r.uniform_ok || r.auto_curat === false || r.reclama_ok === false) {
      violations.push({
        driver_name: r.drivers?.full_name ? formatDriverName(r.drivers.full_name) : '—',
        report_date: r.report_date,
        exterior_ok: r.exterior_ok,
        uniform_ok: r.uniform_ok,
        auto_curat: r.auto_curat,
        reclama_ok: r.reclama_ok,
        reclama_deadline: r.reclama_deadline,
      });
    }
  }

  return {
    totalOk,
    aspectOkCount,
    uniformOkCount,
    autoCuratOkCount,
    reclamaOkCount,
    aspectPct: totalOk > 0 ? Math.round((aspectOkCount / totalOk) * 100) : 0,
    uniformPct: totalOk > 0 ? Math.round((uniformOkCount / totalOk) * 100) : 0,
    autoCuratPct: totalOk > 0 ? Math.round((autoCuratOkCount / totalOk) * 100) : 0,
    reclamaPct: totalOk > 0 ? Math.round((reclamaOkCount / totalOk) * 100) : 0,
    violations,
  };
}

// CSV export
export async function exportReportsCSV(filters: ReportFilters): Promise<string> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  // Fetch all reports for these filters (no pagination)
  let query = getSupabase()
    .from('reports')
    .select(
      `
      id, report_date, point, status, passengers_count,
      exterior_ok, uniform_ok, auto_curat, reclama_ok, reclama_deadline,
      created_at, cancelled_at, driver_id, vehicle_id,
      trips!inner(departure_time, direction, routes!inner(name)),
      drivers(full_name),
      vehicles(plate_number)
    `
    )
    .order('report_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.dateFrom) query = query.gte('report_date', filters.dateFrom);
  if (filters.dateTo) query = query.lte('report_date', filters.dateTo);
  if (filters.point) query = query.eq('point', filters.point);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.driverId) query = query.eq('driver_id', filters.driverId);
  if (filters.direction) query = query.eq('trips.direction', filters.direction);
  if (filters.routeId) query = query.eq('trips.route_id', filters.routeId);

  const { data } = await query;
  const rows = (data || []) as any[];

  const header = 'Data,Punct,Ruta,Ora,Directia,Sofer,Auto,Status,Pasageri,Aspect OK,Uniforma OK,Auto Curat,Reclama OK,Reclama Deadline,Anulat';
  const lines = rows.map((r: any) => {
    const cols = [
      r.report_date,
      r.point,
      `"${r.trips?.routes?.name || ''}"`,
      (r.trips?.departure_time || '').slice(0, 5),
      r.trips?.direction || '',
      `"${r.drivers?.full_name ? formatDriverName(r.drivers.full_name) : ''}"`,
      r.vehicles?.plate_number || '',
      r.status,
      r.passengers_count ?? '',
      r.exterior_ok != null ? (r.exterior_ok ? 'DA' : 'NU') : '',
      r.uniform_ok != null ? (r.uniform_ok ? 'DA' : 'NU') : '',
      r.auto_curat != null ? (r.auto_curat ? 'DA' : 'NU') : '',
      r.reclama_ok != null ? (r.reclama_ok ? 'DA' : 'NU') : '',
      r.reclama_deadline || '',
      r.cancelled_at ? 'DA' : 'NU',
    ];
    return cols.join(',');
  });

  return [header, ...lines].join('\n');
}

// Pivot report for weekly/daily passenger view
export interface PivotRawRow {
  point: PointEnum;
  departure_time: string;
  report_date: string;
  passengers_count: number | null;
  status: ReportStatus;
}

export async function getPivotReport(dateFrom: string, dateTo: string, point?: PointEnum): Promise<PivotRawRow[]> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  let query = getSupabase()
    .from('reports')
    .select('point, report_date, passengers_count, status, trips!inner(departure_time)')
    .is('cancelled_at', null)
    .order('report_date', { ascending: true })
    .limit(5000);

  if (dateFrom) query = query.gte('report_date', dateFrom);
  if (dateTo) query = query.lte('report_date', dateTo);
  if (point) query = query.eq('point', point);

  const { data, error } = await query;
  if (error) {
    console.error('Pivot report error:', error);
    return [];
  }

  return ((data || []) as any[]).map((r: any) => ({
    point: r.point,
    departure_time: (r.trips?.departure_time || '').slice(0, 5),
    report_date: r.report_date,
    passengers_count: r.passengers_count === -1 ? null : r.passengers_count,
    status: (r.status === 'OK' && r.passengers_count === -1) ? 'FULL' : r.status,
  }));
}

// Nomenclator data for filters
export async function getFilterOptions() {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const [routesRes, driversRes] = await Promise.all([
    getSupabase().from('routes').select('id, name').eq('active', true).order('name'),
    getSupabase().from('drivers').select('id, full_name').eq('active', true).order('full_name'),
  ]);
  return {
    routes: (routesRes.data || []) as Array<{ id: string; name: string }>,
    drivers: ((driversRes.data || []) as Array<{ id: string; full_name: string }>).map((d) => ({
      ...d,
      full_name: formatDriverName(d.full_name),
    })),
  };
}
