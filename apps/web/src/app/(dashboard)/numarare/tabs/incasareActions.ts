'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

// ─── Tipuri ───

export type IncasareStatus = 'ok' | 'underpaid' | 'overpaid' | 'no_cashin' | 'no_numarare';
export type AnomalyCategory = 'NO_FOAIE' | 'INVALID_FORMAT';
export type OverrideAction = 'ASSIGN' | 'IGNORE';

export interface IncasareRow {
  driver_id: string | null;
  driver_name: string | null;
  cashin_sofer_id: string | null;
  numarare_lei: number;
  incasare_lei: number;
  incasare_numerar: number;
  incasare_diagrama: number;
  plati: number;
  ligotniki0_suma: number;
  ligotniki_vokzal_suma: number;
  dt_suma: number;
  dop_rashodi: number;
  comment: string | null;
  diff: number;
  status: IncasareStatus;
}

export interface AnomalyBreakdown {
  numerar: number;
  diagrama: number;
  ligotniki0_suma: number;
  ligotniki_vokzal_suma: number;
  dt_suma: number;
  dop_rashodi: number;
  comment: string | null;
  fiscal_nr: string | null;
}

export interface DuplicateCandidate {
  driver_id: string;
  driver_name: string | null;
  ziua: string;
}

export type FoaieHistorySource = 'grafic' | 'override' | 'kiosk';

export interface FoaieHistoryEntry {
  driver_id: string | null;
  driver_name: string | null;
  ziua: string;
  source: FoaieHistorySource;
}

export interface Anomaly {
  receipt_nr: string;
  ziua: string;
  category: AnomalyCategory;
  plati: number;
  incasare_lei: number;
  breakdown: AnomalyBreakdown;
  duplicate_candidates: DuplicateCandidate[] | null;
  foaie_history: FoaieHistoryEntry[];
}

export interface Confirmation {
  confirmed_by_id: string;
  confirmed_by_name: string | null;
  confirmed_at: string;
  note: string | null;
  has_new_payments_after: boolean;
}

export interface IncasareReportResult {
  rows: IncasareRow[];
  anomalies: Anomaly[];
  confirmation: Confirmation | null;
}

// ─── Tipuri pentru raportul orientat pe rută ───

export type RouteStatus =
  | 'ok'
  | 'underpaid'
  | 'overpaid'
  | 'no_data'
  | 'no_numarare'
  | 'no_incasare'
  | 'no_foaie'
  | 'no_driver'
  | 'empty'
  | 'cancelled';

export type OrphanReason = 'no_driver' | 'no_grafic';

export type FoaieSource = 'explicit' | 'implied' | null;

export interface GraficRouteRow {
  assignment_id: string | null;
  row_key: string;
  crm_route_id: number;
  ziua: string;
  route_name: string | null;
  time_nord: string | null;
  time_chisinau: string | null;
  driver_id: string | null;
  driver_name: string | null;
  vehicle_plate: string | null;
  vehicle_plate_retur: string | null;
  foaie_nr: string | null;
  foaie_source: FoaieSource;
  cancelled: boolean;
  counting_session_id: string | null;
  counting_status: string | null;
  tur_total_lei: number | null;
  retur_total_lei: number | null;
  numarare_lei: number;
  incasare_numerar: number;
  incasare_diagrama: number;
  ligotniki0_suma: number;
  ligotniki_vokzal_suma: number;
  dt_suma: number;
  dop_rashodi: number;
  incasare_lei: number;
  plati: number;
  comment: string | null;
  fiscal_nrs: string | null;
  diff: number;
  status: RouteStatus;
}

export interface OrphanNumerar {
  session_id: string;
  crm_route_id: number;
  route_name: string | null;
  time_nord: string | null;
  ziua: string;
  driver_id: string | null;
  driver_name: string | null;
  tur_total_lei: number | null;
  retur_total_lei: number | null;
  total_lei: number;
  counting_status: string | null;
  reason: OrphanReason;
}

export interface GraficReportResult {
  routes: GraficRouteRow[];
  orphan_numerar: OrphanNumerar[];
  orphan_incasare: Anomaly[];
  confirmation: Confirmation | null;
}

const VIEWER_ROLES = ['ADMIN', 'EVALUATOR_INCASARI'] as const;
const EDITOR_ROLES = ['EVALUATOR_INCASARI'] as const;

function isViewer(role: string): boolean {
  return (VIEWER_ROLES as readonly string[]).includes(role);
}

function isEditor(role: string): boolean {
  return (EDITOR_ROLES as readonly string[]).includes(role);
}

// ─── Loader principal ───

export async function getIncasareReport(
  fromDate: string,
  toDate: string,
): Promise<{ data?: IncasareReportResult; error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!isViewer(session.role)) return { error: 'Acces interzis' };

  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_incasare_report', {
    p_from: fromDate,
    p_to: toDate || fromDate,
  });

  if (error) return { error: error.message };

  const payload = data as IncasareReportResult | null;
  return {
    data: {
      rows: payload?.rows || [],
      anomalies: payload?.anomalies || [],
      confirmation: payload?.confirmation || null,
    },
  };
}

// ─── Loader raport orientat pe rută ───

export async function getGraficReport(
  fromDate: string,
  toDate: string,
): Promise<{ data?: GraficReportResult; error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!isViewer(session.role)) return { error: 'Acces interzis' };

  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_grafic_report', {
    p_from: fromDate,
    p_to: toDate || fromDate,
  });

  if (error) return { error: error.message };

  const payload = data as GraficReportResult | null;
  return {
    data: {
      routes: payload?.routes || [],
      orphan_numerar: payload?.orphan_numerar || [],
      orphan_incasare: payload?.orphan_incasare || [],
      confirmation: payload?.confirmation || null,
    },
  };
}

// ─── Document casier — date strict din tomberon, lookup /grafic per foaie ───

export interface CasierRow {
  row_key: string;
  foaie_nr: string;
  ziua: string;
  plati: number;
  driver_id: string | null;
  driver_name: string | null;
  assignment_id: string | null;
  crm_route_id: number | null;
  route_name: string | null;
  time_nord: string | null;
  vehicle_plate: string | null;
  incasare_numerar: number;
  diagrama: number;
  ligotniki0_suma: number;
  ligotniki_vokzal_suma: number;
  dt_suma: number;
  dop_rashodi: number;
  comment: string | null;
  fiscal_nrs: string | null;
  has_grafic_match: boolean;
}

export async function getCasierDocument(date: string): Promise<CasierRow[]> {
  const session = await verifySession();
  if (!session) return [];
  if (!isViewer(session.role)) return [];

  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_casier_document', { p_date: date });
  if (error) return [];
  return (data as CasierRow[]) || [];
}

// ─── Numele operatorului curent (pentru antet Document casier) ───

export async function getCurrentOperatorName(): Promise<string> {
  const session = await verifySession();
  if (!session) return '—';
  const sb = getSupabase();
  const { data } = await sb
    .from('admin_accounts')
    .select('name, email')
    .eq('id', session.id)
    .maybeSingle();
  return data?.name || data?.email || session.email || 'operator';
}

// ─── Atribuire pe rută (înlocuiește AssignDriverModal) ───

export interface RouteForAssign {
  assignment_id: string | null;  // null dacă nu există daily_assignment
  crm_route_id: number;
  route_name: string;
  time_nord: string | null;
  driver_id: string | null;
  driver_name: string | null;
  vehicle_plate: string | null;
}

/** Returnează toate rutele active pentru o zi cu șofer/auto din /grafic. */
export async function getRoutesForAssign(date: string): Promise<RouteForAssign[]> {
  const session = await verifySession();
  if (!session) return [];
  if (!isViewer(session.role)) return [];

  const sb = getSupabase();
  // active routes + daily_assignments LEFT JOIN
  const { data, error } = await sb
    .from('crm_routes')
    .select(`
      id, dest_to_ro, dest_from_ro, route_type, time_nord, active,
      daily_assignments!inner(id, assignment_date, driver_id, vehicle_id, drivers:driver_id(full_name), vehicles:vehicle_id(plate_number))
    `)
    .eq('active', true)
    .eq('daily_assignments.assignment_date', date);

  if (error) return [];

  type Row = {
    id: number;
    dest_to_ro: string;
    dest_from_ro: string | null;
    route_type: string;
    time_nord: string | null;
    daily_assignments: Array<{
      id: string;
      driver_id: string | null;
      drivers: { full_name?: string } | null;
      vehicles: { plate_number?: string } | null;
    }>;
  };

  const rows = (data || []) as unknown as Row[];
  return rows.map((r) => {
    const da = r.daily_assignments[0];
    const routeName = r.route_type === 'suburban'
      ? `${r.dest_to_ro} - ${r.dest_from_ro || ''}`
      : r.dest_to_ro;
    return {
      assignment_id: da?.id || null,
      crm_route_id: r.id,
      route_name: routeName,
      time_nord: r.time_nord,
      driver_id: da?.driver_id || null,
      driver_name: da?.drivers?.full_name || null,
      vehicle_plate: da?.vehicles?.plate_number || null,
    };
  }).sort((a, b) => (a.time_nord || 'zz').localeCompare(b.time_nord || 'zz'));
}

/** Atribuie o foaie unui șofer pe o zi (insert în /grafic = driver_cashin_receipts). */
export async function assignFoaieToDriver(
  receiptNr: string,
  ziua: string,
  driverId: string,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!isEditor(session.role)) return { error: 'Doar evaluatorul poate atribui foaie' };
  if (!receiptNr || !ziua || !driverId) return { error: 'Date lipsă' };

  // Normalizăm zerourile de la început (ca la dispatcher)
  const normalized = /^[0-9]+$/.test(receiptNr) ? String(parseInt(receiptNr, 10)) : receiptNr;

  const sb = getSupabase();

  // Upsert: dacă (driver_id, ziua) există deja, suprascriem foaie.
  // Dacă receipt_nr e deja folosit altundeva, ridica 23505 → mesaj clar.
  const { error } = await sb.from('driver_cashin_receipts').upsert(
    {
      driver_id: driverId,
      ziua,
      receipt_nr: normalized,
      created_by: session.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'driver_id,ziua' },
  );

  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await sb
        .from('driver_cashin_receipts')
        .select('ziua, drivers:driver_id(full_name)')
        .eq('receipt_nr', normalized)
        .maybeSingle();
      if (existing) {
        const otherName = (existing as unknown as { drivers?: { full_name?: string } }).drivers?.full_name || 'alt șofer';
        return { error: `Foaia #${normalized} e deja folosită de ${otherName} pe ${existing.ziua}` };
      }
      return { error: `Foaia #${normalized} e deja folosită altundeva` };
    }
    return { error: error.message };
  }
  return {};
}

// ─── Acțiuni evaluator ───

export async function assignOverride(
  receiptNr: string,
  ziua: string,
  driverId: string,
  note: string | null,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!isEditor(session.role)) return { error: 'Doar evaluatorul poate face corecturi' };
  if (!receiptNr || !ziua || !driverId) return { error: 'Date lipsă' };

  const sb = getSupabase();
  const { error } = await sb.from('tomberon_payment_overrides').upsert(
    {
      receipt_nr: receiptNr,
      ziua,
      action: 'ASSIGN',
      driver_id: driverId,
      note: note?.trim() || null,
      created_by: session.id,
      updated_by: session.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'receipt_nr,ziua' },
  );
  if (error) return { error: error.message };
  return {};
}

export async function deleteOverride(
  receiptNr: string,
  ziua: string,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!isEditor(session.role)) return { error: 'Doar evaluatorul poate șterge corecturi' };

  const sb = getSupabase();
  const { error } = await sb
    .from('tomberon_payment_overrides')
    .delete()
    .match({ receipt_nr: receiptNr, ziua });
  if (error) return { error: error.message };
  return {};
}

export async function confirmDay(
  ziua: string,
  note: string | null,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!isEditor(session.role)) return { error: 'Doar evaluatorul poate confirma ziua' };
  if (!ziua) return { error: 'Data lipsă' };

  // Verifică că nu mai sunt anomalii
  const sb = getSupabase();
  const { data, error: rpcErr } = await sb.rpc('get_incasare_report', {
    p_from: ziua,
    p_to: ziua,
  });
  if (rpcErr) return { error: rpcErr.message };
  const anomalies = (data as IncasareReportResult)?.anomalies || [];
  if (anomalies.length > 0) {
    return { error: `Mai sunt ${anomalies.length} alerte nerezolvate. Rezolvă-le toate înainte de confirmare.` };
  }

  const { error } = await sb.from('incasare_day_confirmations').upsert(
    {
      ziua,
      confirmed_by: session.id,
      confirmed_at: new Date().toISOString(),
      note: note?.trim() || null,
    },
    { onConflict: 'ziua' },
  );
  if (error) return { error: error.message };
  return {};
}

export async function unconfirmDay(ziua: string): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!isEditor(session.role)) return { error: 'Doar evaluatorul poate anula confirmarea' };

  const sb = getSupabase();
  const { error } = await sb
    .from('incasare_day_confirmations')
    .delete()
    .eq('ziua', ziua);
  if (error) return { error: error.message };
  return {};
}

// ─── Loader pentru lista de șoferi (pentru picker) ───

export interface DriverOption {
  id: string;
  full_name: string;
}

export async function getActiveDriversForPicker(): Promise<DriverOption[]> {
  const session = await verifySession();
  if (!session || !isEditor(session.role)) return [];

  const sb = getSupabase();
  const { data } = await sb
    .from('drivers')
    .select('id, full_name')
    .eq('active', true)
    .order('full_name');
  return (data || []) as DriverOption[];
}
