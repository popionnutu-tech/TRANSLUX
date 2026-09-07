import { getSupabase } from '@/lib/supabase';
import { parseFirstTime, parseTimeLabel, resolveReturTime } from '@/lib/assignments';

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
  /** Numele complet, așa cum e în nomenclator — pentru imaginea din grupa Mejgorod. */
  driver_full_name: string | null;
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

/* ── Helpers ── */

export function toLocalPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('373') && digits.length >= 11) {
    return '0' + digits.slice(3);
  }
  return digits.startsWith('0') ? digits : '0' + digits;
}

export function extractFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

/* ── Data loading ── */

/**
 * Graficul interurban al zilei, fără verificare de sesiune — apelantul răspunde
 * de autorizare. Există separat de server action ca să poată fi chemat și din
 * căile care NU au sesiune de dispecer (mini-app atribuiri, /assignments), la
 * trimiterea automată a schimbărilor în grupa Mejgorod.
 */
export async function loadGraficPages(date: string, canSeeReceipt: boolean): Promise<{
  pages: GraficRow[][];
}> {
  const db = getSupabase();

  const [routesRes, assignmentsRes, driversRes, vehiclesRes, stopsRes, receiptsRes, cancellationsRes] = await Promise.all([
    db.from('crm_routes').select('id, time_nord, time_chisinau, dest_to_ro').eq('active', true).not('time_nord', 'is', null).neq('time_nord', ''),
    db.from('daily_assignments')
      .select('id, crm_route_id, driver_id, vehicle_id, vehicle_id_retur, driver_id_retur, retur_route_id')
      .eq('assignment_date', date)
      .eq('auto_copied', false),
    db.from('drivers').select('id, full_name, phone').eq('active', true).eq('is_lde', false),
    db.from('vehicles').select('id, plate_number').eq('active', true).eq('is_lde', false),
    db.from('crm_stop_fares').select('id, crm_route_id, name_ro').eq('is_visible', true).order('stop_order', { ascending: true }),
    canSeeReceipt
      ? db.from('driver_cashin_receipts').select('driver_id, receipt_nr, crm_route_id').eq('ziua', date)
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
  // Foaia legată de rută are prioritate; cea fără rută (crm_route_id NULL,
  // «pe toată ziua» — istoric) se arată pe toate rândurile șoferului.
  const receiptByRoute = new Map<string, string>();
  const receiptByDriver = new Map<string, string>();
  for (const r of receipts) {
    if (r.crm_route_id != null) receiptByRoute.set(`${r.driver_id}|${r.crm_route_id}`, r.receipt_nr);
    else receiptByDriver.set(r.driver_id, r.receipt_nr);
  }
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
      driver_name: driver ? extractFirstName(driver.full_name) : null,
      driver_full_name: driver?.full_name || null,
      vehicle_id: a?.vehicle_id || null,
      vehicle_plate: vTur?.plate_number || null,
      vehicle_id_retur: a?.vehicle_id_retur || null,
      vehicle_plate_retur: vRet?.plate_number || null,
      stops: stopsMap.get(r.id) || '',
      retur_route_id: a?.retur_route_id || null,
      cashin_receipt_nr: a?.driver_id
        ? (receiptByRoute.get(`${a.driver_id}|${r.id}`) || receiptByDriver.get(a.driver_id) || null)
        : null,
      cancelled: cancelledSet.has(r.id),
    };
  });

  rows.sort((a, b) => a._sortKey - b._sortKey);

  // Number ALL active routes (no cap). The dispatcher list (UnifiedGraficList)
  // flattens these, so every active route is visible/assignable.
  const numbered: GraficRow[] = rows.map((r, i) => ({
    seq: i + 1,
    crm_route_id: r.crm_route_id,
    time_nord: r.time_nord,
    time_chisinau: r.time_chisinau,
    dest_to: r.dest_to,
    assignment_id: r.assignment_id,
    driver_id: r.driver_id,
    driver_phone: r.driver_phone,
    driver_name: r.driver_name,
    driver_full_name: r.driver_full_name,
    vehicle_id: r.vehicle_id,
    vehicle_plate: r.vehicle_plate,
    vehicle_id_retur: r.vehicle_id_retur,
    vehicle_plate_retur: r.vehicle_plate_retur,
    stops: r.stops,
    retur_route_id: r.retur_route_id,
    cashin_receipt_nr: r.cashin_receipt_nr,
    cancelled: r.cancelled,
  }));

  // Printable form = exactly 2 pages (dispatcher prints 2 sheets). Split evenly,
  // so e.g. 30 routes → 15 + 15 instead of 14 + 14 + 2. The PNG canvas height is
  // dynamic, so larger pages render fine.
  const half = Math.ceil(numbered.length / 2);
  const pages: GraficRow[][] = [
    numbered.slice(0, half),
    numbered.slice(half),
  ];

  return { pages };
}
