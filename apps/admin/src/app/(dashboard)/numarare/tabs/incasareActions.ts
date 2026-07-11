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
  tur_single_lei: number | null;
  retur_single_lei: number | null;
  numarare_lei: number;
  numarare_single_lei: number | null;
  extra_2tarife_lei: number | null;
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

// ─── Nomenclatoare pentru picker-ele din Document casier ───

export interface VehicleOption {
  id: string;
  plate_number: string;
}

export interface RouteOption {
  id: number;
  display_name: string;
  time_nord: string | null;
  route_type: string | null;
}

export async function getActiveVehiclesForPicker(): Promise<VehicleOption[]> {
  const session = await verifySession();
  if (!session) return [];
  const sb = getSupabase();
  const { data } = await sb
    .from('vehicles')
    .select('id, plate_number')
    .eq('active', true)
    .eq('is_lde', false)
    .order('plate_number');
  return (data || []) as VehicleOption[];
}

function parseFirstTimeForSort(s: string | null): number {
  if (!s) return 9999;
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 9999;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export async function getActiveRoutesForPicker(): Promise<RouteOption[]> {
  const session = await verifySession();
  if (!session) return [];
  const sb = getSupabase();
  const { data } = await sb
    .from('crm_routes')
    .select('id, dest_to_ro, dest_from_ro, route_type, time_nord')
    .eq('active', true);
  type Row = { id: number; dest_to_ro: string; dest_from_ro: string | null; route_type: string | null; time_nord: string | null };
  const rows = (data || []) as Row[];
  return rows
    .map((r) => ({
      id: r.id,
      display_name: r.route_type === 'suburban'
        ? `${r.dest_to_ro} - ${r.dest_from_ro || ''}`
        : r.dest_to_ro,
      time_nord: r.time_nord,
      route_type: r.route_type,
    }))
    // Sortează după nume; în interiorul numelui după ora primei plecări
    .sort((a, b) => {
      const cmp = a.display_name.localeCompare(b.display_name);
      if (cmp !== 0) return cmp;
      return parseFirstTimeForSort(a.time_nord) - parseFirstTimeForSort(b.time_nord);
    });
}

// ─── Document casier — date strict din tomberon, lookup /grafic per foaie ───

export interface CasierRow {
  row_key: string;
  norm_nr: string | null;      // norm_foaie(sofer_id) — cheia corecției; null la rândurile manuale
  is_manual: boolean;          // true = rând adăugat manual (foaie fizică fără tomberon)
  manual_id: string | null;    // id-ul din casier_manual_rows (doar la rândurile manuale)
  corrected_fields: string[];  // câmpurile de sumă/comentariu corectate (pentru colorare per-celulă)
  foaie_nr: string;
  ziua: string;            // ziua plății la casă (kiosk)
  data_foaie: string | null; // ziua /grafic pentru această foaie (poate fi alta sau null)
  pus_la: string | null;     // timestamptz: când s-a introdus foaia (adesea în ajunul lui data_foaie)
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

// ─── Corecții sume + rânduri manuale în Document casier ───

/** Corecția pentru o foaie tomberon existentă. null pe un câmp = nicio corecție (păstrează brutul). */
export interface CasierCorrectionInput {
  norm_nr: string;
  diagrama: number | null;
  ligotniki0_suma: number | null;
  ligotniki_vokzal_suma: number | null;
  dt_suma: number | null;
  dop_rashodi: number | null;
  comment: string | null;
}

/** Rând manual (foaie fizică fără tomberon). id null = insert nou; uuid = update. Fără cash. */
export interface CasierManualInput {
  id: string | null;
  foaie_nr: string | null;
  data_foaie: string | null;
  driver_id: string | null;
  driver_name: string | null;
  crm_route_id: number | null;
  route_name: string | null;
  vehicle_plate: string | null;
  diagrama: number;
  ligotniki0_suma: number;
  ligotniki_vokzal_suma: number;
  dt_suma: number;
  dop_rashodi: number;
  comment: string | null;
}

export interface CasierSavePayload {
  corrections: CasierCorrectionInput[];
  manualUpserts: CasierManualInput[];
  manualDeletes: string[];   // uuid-uri de șters
}

const CORR_SUM_KEYS = [
  'diagrama', 'ligotniki0_suma', 'ligotniki_vokzal_suma', 'dt_suma', 'dop_rashodi',
] as const;

/**
 * Salvează corecțiile de sume și rândurile manuale pentru o zi.
 * Corecție cu toate câmpurile null = ștergere (revocare completă).
 * Întoarce documentul reîncărcat, ca UI-ul să primească manual_id/corrected_fields reale.
 */
export async function saveCasierCorrections(
  ziua: string,
  payload: CasierSavePayload,
): Promise<{ error?: string; data?: CasierRow[] }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!isEditor(session.role)) return { error: 'Doar evaluatorul poate corecta' };
  if (!ziua) return { error: 'Zi lipsă' };

  const sb = getSupabase();
  const now = new Date().toISOString();

  // Scrierile nu sunt într-o singură tranzacție (supabase-js). Ca să nu se dubleze rândurile
  // manuale la o reîncercare după eșec parțial, întoarcem MEREU documentul reîncărcat (și pe
  // eroare) — clientul își re-sincronizează id-urile reale înainte de un eventual retry.
  let opError: string | undefined;
  try {
    // 1. Corecții: împarte în cele de șters (toate null) și cele de upsert.
    const toDelete: string[] = [];
    const toUpsert: Record<string, unknown>[] = [];
    for (const c of payload.corrections) {
      if (!c.norm_nr) continue;
      const hasAny =
        CORR_SUM_KEYS.some(k => c[k] !== null && c[k] !== undefined) ||
        (c.comment !== null && c.comment !== undefined);
      if (!hasAny) {
        toDelete.push(c.norm_nr);
      } else {
        toUpsert.push({
          ziua,
          norm_nr: c.norm_nr,
          diagrama: c.diagrama,
          ligotniki0_suma: c.ligotniki0_suma,
          ligotniki_vokzal_suma: c.ligotniki_vokzal_suma,
          dt_suma: c.dt_suma,
          dop_rashodi: c.dop_rashodi,
          comment: c.comment,
          created_by: session.id,
          updated_by: session.id,
          updated_at: now,
        });
      }
    }

    if (toDelete.length) {
      const { error } = await sb
        .from('casier_amount_corrections')
        .delete()
        .eq('ziua', ziua)
        .in('norm_nr', toDelete);
      if (error) throw new Error(error.message);
    }
    if (toUpsert.length) {
      const { error } = await sb
        .from('casier_amount_corrections')
        .upsert(toUpsert, { onConflict: 'ziua,norm_nr' });
      if (error) throw new Error(error.message);
    }

    // 2. Rânduri manuale: ștergeri (doar în ziua curentă, ca gardă), apoi upsert-uri.
    if (payload.manualDeletes.length) {
      const { error } = await sb
        .from('casier_manual_rows')
        .delete()
        .eq('ziua', ziua)
        .in('id', payload.manualDeletes);
      if (error) throw new Error(error.message);
    }
    for (const m of payload.manualUpserts) {
      const base = {
        ziua,
        foaie_nr: m.foaie_nr,
        data_foaie: m.data_foaie,
        driver_id: m.driver_id,
        driver_name: m.driver_name,
        crm_route_id: m.crm_route_id,
        route_name: m.route_name,
        vehicle_plate: m.vehicle_plate,
        diagrama: m.diagrama,
        ligotniki0_suma: m.ligotniki0_suma,
        ligotniki_vokzal_suma: m.ligotniki_vokzal_suma,
        dt_suma: m.dt_suma,
        dop_rashodi: m.dop_rashodi,
        comment: m.comment,
        updated_by: session.id,
        updated_at: now,
      };
      if (m.id) {
        // Update — nu atinge created_by/created_at; gardă pe ziua curentă.
        const { error } = await sb
          .from('casier_manual_rows')
          .update(base)
          .eq('id', m.id)
          .eq('ziua', ziua);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await sb
          .from('casier_manual_rows')
          .insert({ ...base, created_by: session.id });
        if (error) throw new Error(error.message);
      }
    }
  } catch (e) {
    opError = e instanceof Error ? e.message : 'Eroare la salvare';
  }

  // 3. Reîncarcă documentul, cu id-urile/câmpurile reale (și pe eroare, pentru re-sincronizare).
  const { data, error } = await sb.rpc('get_casier_document', { p_date: ziua });
  if (error) {
    // Reîncărcarea a eșuat: NU întoarcem `data` (nici []). Clientul păstrează atunci editările
    // locale în loc să golească tabelul. (Scrierile s-ar putea să fi reușit deja; clientul cere
    // reîncărcarea paginii ca să reconcilieze sigur — evită dublarea rândurilor manuale.)
    return { error: opError || error.message };
  }
  return { error: opError, data: (data as CasierRow[]) || [] };
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
    .eq('is_lde', false)
    .order('full_name');
  return (data || []) as DriverOption[];
}
