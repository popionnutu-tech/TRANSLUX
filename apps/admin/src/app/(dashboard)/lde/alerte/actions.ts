'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { chisinauMonthBounds } from '@/lib/chisinau-time';
import {
  buildFuelWindows,
  calcPererashodWindow,
  calcPererashodMonthly,
  isCronicPattern,
  type FuelEvent,
  type DriverKmInWindow,
  type DtLevel,
  type DtMethod,
} from '@translux/db';

// ============================================================================
// LDE — Alerte DT (detectare furt motorină): listare + MOTOR de generare + review.
// Motorul PUR (l/100km, ferestre plin→plin, repartizare pe șofer) trăiește în
// @translux/db (lde-dt-calc). Aici e doar I/O: batch-fetch + persistare idempotentă.
// ============================================================================

// status enum — sincron cu CHECK din migrarea 205 (lde_dt_alerts.status)
export type DtAlertStatus = 'nou' | 'in_analiza' | 'raportat' | 'rezolvat';
// resolution_action enum — sincron cu CHECK din migrarea 205 (lde_dt_alerts.resolution_action)
// (NU confunda cu override_reason din lde_vehicle_norms: 'reparatie_tehnica' etc.)
export type DtResolutionAction =
  | 'mustrare'
  | 'penalizare_lei'
  | 'concediere'
  | 'norma_ajustata'
  | 'fals_pozitiv'
  | 'altul';

export interface DtAlertRow {
  id: string;
  vehicle_id: string;
  vehicle_plate: string;
  alert_date: string;
  method: DtMethod;
  period_from: string;
  period_to: string;
  km_in_period: number;
  litri_alimentati: number;
  litri_norma: number;
  actual_consumption_l_per_100km: number;
  pererashod_l_per_100km: number | null;
  level: DtLevel;
  vehicle_in_repair: boolean;
  has_precise_cutoff: boolean; // false = «formulă uscată» (estimare, §3.4)
  drivers_involved: Array<{ driver_id: string; km: number; proportion: number }>;
  status: DtAlertStatus;
  resolution_action: DtResolutionAction | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface DtAlertFilters {
  level?: DtLevel;
  status?: DtAlertStatus;
  month?: string; // 'YYYY-MM-01' — filtrează după alert_date în luna respectivă
}

// ── Listare alerte cu plăcuța mașinii (embedded select, fără N+1) ──
export async function getDtAlerts(filters?: DtAlertFilters): Promise<DtAlertRow[]> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  let query = sb
    .from('lde_dt_alerts')
    .select(
      `id, vehicle_id, alert_date, method, period_from, period_to,
       km_in_period, litri_alimentati, litri_norma, actual_consumption_l_per_100km,
       pererashod_l_per_100km, level, vehicle_in_repair, has_precise_cutoff, drivers_involved,
       status, resolution_action, resolution_notes,
       resolved_at, created_at,
       vehicles!inner ( plate_number )`,
    )
    .order('alert_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.level) query = query.eq('level', filters.level);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.month) {
    const start = filters.month; // 'YYYY-MM-01'
    const startDate = new Date(start + 'T00:00:00Z');
    const monthEnd = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0));
    query = query.gte('alert_date', start).lte('alert_date', monthEnd.toISOString().slice(0, 10));
  }

  const { data, error } = await query;
  if (error) return [];

  return (data || []).map((r: any) => ({
    id: r.id,
    vehicle_id: r.vehicle_id,
    vehicle_plate: r.vehicles?.plate_number ?? '—',
    alert_date: r.alert_date,
    method: r.method,
    period_from: r.period_from,
    period_to: r.period_to,
    km_in_period: Number(r.km_in_period),
    litri_alimentati: Number(r.litri_alimentati),
    litri_norma: Number(r.litri_norma),
    actual_consumption_l_per_100km: Number(r.actual_consumption_l_per_100km),
    pererashod_l_per_100km: r.pererashod_l_per_100km != null ? Number(r.pererashod_l_per_100km) : null,
    level: r.level,
    vehicle_in_repair: !!r.vehicle_in_repair,
    has_precise_cutoff: r.has_precise_cutoff !== false, // rânduri vechi (NULL) → tratate ca precise
    drivers_involved: Array.isArray(r.drivers_involved) ? r.drivers_involved : [],
    status: r.status,
    resolution_action: r.resolution_action ?? null,
    resolution_notes: r.resolution_notes ?? null,
    resolved_at: r.resolved_at ?? null,
    created_at: r.created_at,
  }));
}

export interface RecomputeResult {
  generated: number;
  skipped_no_type: number;
  by_level: { verde: number; galben: number; rosu: number };
}

// Borna de luni: 'YYYY-MM-01' → [startISO, endISO] (ora Chișinăului, inclusiv toată ultima zi).
function monthBounds(period_month: string): { startDate: string; endDate: string; startISO: string; endISO: string } {
  const start = new Date(period_month + 'T00:00:00Z');
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const { startISO, endISO } = chisinauMonthBounds(period_month);
  return {
    startDate: period_month, // 'YYYY-MM-01'
    endDate: end.toISOString().slice(0, 10),
    startISO,
    endISO,
  };
}

// Sumă km GPS pe un interval de date [fromDate, toDate] inclusiv, dintr-o listă pre-sortată.
function sumGpsKm(gps: Array<{ date: string; km: number }>, fromDate: string, toDate: string): { km: number; hasData: boolean } {
  let km = 0;
  let hasData = false;
  for (const g of gps) {
    if (g.date >= fromDate && g.date <= toDate) {
      km += g.km;
      hasData = true;
    }
  }
  return { km: Math.round(km * 100) / 100, hasData };
}

// Sumă litri numerar (§3.6) într-un interval de timp [fromISO, toISO] inclusiv.
function sumCashLitri(cash: Array<{ at: string; litri: number }>, fromISO: string, toISO: string): number {
  let litri = 0;
  for (const c of cash) {
    if (c.at >= fromISO && c.at <= toISO) litri += c.litri;
  }
  return Math.round(litri * 100) / 100;
}

// ── MOTORUL: recalculează alertele DT pentru o lună (batch-fetch, fără N+1) ──
export async function recomputeDtAlerts(period_month: string): Promise<RecomputeResult> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const { startDate, endDate, startISO, endISO } = monthBounds(period_month);
  const alertDate = startDate; // alertele lunii sunt ancorate la prima zi a lunii (idempotent pe re-rulare)

  // a) Norma efectivă per vehicul = COALESCE(loaded, measured, type.loaded, type.norm).
  //    Camioane: pragul = consumul încărcat (max interval) — sub el nu e pererashod.
  //    DOAR vehiculele cu rând în lde_vehicle_norms.
  const [{ data: norms }, { data: types }] = await Promise.all([
    sb.from('lde_vehicle_norms').select('vehicle_id, vehicle_type_id, measured_consumption_l_per_100km, measured_consumption_l_per_100km_loaded, in_repair'),
    sb.from('lde_vehicle_types').select('id, norm_l_per_100km, norm_l_per_100km_loaded'),
  ]);
  const typeNorm = new Map<string, number>();
  for (const t of types || []) {
    typeNorm.set(t.id, Number(t.norm_l_per_100km_loaded ?? t.norm_l_per_100km));
  }

  const effectiveNorm = new Map<string, number>(); // vehicle_id → l/100km efectiv
  const inRepairSet = new Set<string>();            // vehicule marcate «în reparație» (soft-tag pe alerte)
  let skipped_no_type = 0;
  for (const n of norms || []) {
    if (n.in_repair) inRepairSet.add(n.vehicle_id);
    const measured = n.measured_consumption_l_per_100km_loaded ?? n.measured_consumption_l_per_100km;
    if (measured != null) {
      effectiveNorm.set(n.vehicle_id, Number(measured)); // override măsurat
    } else {
      const tn = typeNorm.get(n.vehicle_type_id);
      if (tn == null) {
        // rând fără tip valid (tip lipsă/șters) → nu putem calcula norma
        skipped_no_type++;
        continue;
      }
      effectiveNorm.set(n.vehicle_id, tn);
    }
  }

  const vehicleIds = [...effectiveNorm.keys()];
  if (vehicleIds.length === 0) {
    // niciun vehicul cu normă efectivă → nimic de calculat (normal până la atribuirea tipurilor)
    await deleteNewAlertsForDate(sb, alertDate);
    return { generated: 0, skipped_no_type, by_level: { verde: 0, galben: 0, rosu: 0 } };
  }

  // b) Alimentări Benzol pe lună (toate vehiculele cu normă), grupate pe vehicle_id, ordonate cronologic.
  const fuelByVehicle = new Map<string, FuelEvent[]>();
  {
    const { data: fuel } = await sb
      .from('lde_fuel_alimentari')
      .select('vehicle_id, driver_id, alimentat_at, litri, is_full')
      .gte('alimentat_at', startISO)
      .lte('alimentat_at', endISO)
      .in('vehicle_id', vehicleIds)
      .order('alimentat_at', { ascending: true });
    for (const f of fuel || []) {
      const ev: FuelEvent = {
        alimentat_at: f.alimentat_at,
        litri: Number(f.litri),
        is_full: !!f.is_full,
        km_at_event: null, // lde_fuel_alimentari nu are odometru → km vine din GPS (vezi mai jos)
        driver_id: f.driver_id ?? null,
      };
      const arr = fuelByVehicle.get(f.vehicle_id) || [];
      arr.push(ev);
      fuelByVehicle.set(f.vehicle_id, arr);
    }
  }

  // b2) Alimentări NUMERAR pe lună (§3.6: litrii numerar intră OBLIGATORIU în calculul total).
  // Nu fac parte din ferestrele plin→plin (n-au is_full), dar litrii lor se adaugă la totalul consumat.
  const cashByVehicle = new Map<string, Array<{ at: string; litri: number }>>();
  {
    const { data: cash } = await sb
      .from('lde_fuel_alimentari_cash')
      .select('vehicle_id, alimentat_at, litri')
      .gte('alimentat_at', startISO)
      .lte('alimentat_at', endISO)
      .in('vehicle_id', vehicleIds);
    for (const c of cash || []) {
      const arr = cashByVehicle.get(c.vehicle_id) || [];
      arr.push({ at: c.alimentat_at, litri: Number(c.litri) });
      cashByVehicle.set(c.vehicle_id, arr);
    }
  }

  // c) GPS zilnic pe lună (km), grupat pe vehicle_id, ordonat pe dată.
  const gpsByVehicle = new Map<string, Array<{ date: string; km: number }>>();
  {
    const { data: gps } = await sb
      .from('lde_vehicle_gps_daily')
      .select('vehicle_id, date, km_total')
      .gte('date', startDate)
      .lte('date', endDate)
      .in('vehicle_id', vehicleIds)
      .order('date', { ascending: true });
    for (const g of gps || []) {
      const arr = gpsByVehicle.get(g.vehicle_id) || [];
      arr.push({ date: g.date, km: Number(g.km_total) });
      gpsByVehicle.set(g.vehicle_id, arr);
    }
  }

  // d) Per vehicul: ferestre plin→plin (metoda A) + cumul lunar (metoda B).
  type PendingAlert = {
    alert: Record<string, unknown>;
    drivers: Array<{ driver_id: string; km_in_window: number; proportion: number }>;
  };
  const pending: PendingAlert[] = [];
  const by_level = { verde: 0, galben: 0, rosu: 0 };

  for (const vehicleId of vehicleIds) {
    const norm = effectiveNorm.get(vehicleId)!;
    const inRepair = inRepairSet.has(vehicleId);
    const events = fuelByVehicle.get(vehicleId) || [];
    const gps = gpsByVehicle.get(vehicleId) || [];
    const cashEvents = cashByVehicle.get(vehicleId) || [];

    // ── Metoda A: ferestre plin→plin ──
    const windows = buildFuelWindows(events);
    for (const win of windows) {
      // km din GPS pe spanul ferestrei (lde_fuel_alimentari nu are odometru).
      const fromDate = win.from_at.slice(0, 10);
      const toDate = win.to_at.slice(0, 10);
      const { km, hasData } = sumGpsKm(gps, fromDate, toDate);
      // Fără date GPS pe interval → date insuficiente, NU generăm alert verde fals.
      if (!hasData || km <= 0) continue;

      // §3.6: adaugă litrii numerar din fereastra de timp la totalul consumat (altfel перерасход fals).
      const cashLitri = sumCashLitri(cashEvents, win.from_at, win.to_at);
      const driversKm = distributeKm(win.driver_ids, km);
      // §3.4: km vine din GPS (lde_fuel_alimentari n-are odometru) → fereastra NU are
      // cutoff precis decât dacă motorul l-a marcat așa (win.has_precise_cutoff).
      const res = calcPererashodWindow(norm, km, win.litri + cashLitri, driversKm, win.has_precise_cutoff);
      if (res.level === 'verde') continue; // doar abaterile (galben/roșu) devin alerte

      by_level[res.level]++;
      pending.push(buildPending(vehicleId, 'between_alimentari_A', win.from_at, win.to_at, alertDate, res, inRepair));
    }

    // ── Metoda B: cumul lunar (benzol + numerar, §3.6) ──
    const litriMonth = events.reduce((acc, e) => acc + e.litri, 0) + cashEvents.reduce((acc, e) => acc + e.litri, 0);
    const { km: kmMonth, hasData: hasMonthGps } = sumGpsKm(gps, startDate, endDate);
    if (hasMonthGps && kmMonth > 0 && litriMonth > 0) {
      const monthDrivers = [...new Set(events.map((e) => e.driver_id).filter((d): d is string => !!d))];
      const driversKm = distributeKm(monthDrivers, kmMonth);
      // §3.4: fără niciun «plin» (отсечкă) în lună → estimare «formula uscată» (km×normă din GPS,
      // litri cumulați), NU măsurare precisă plin→plin. Marcăm alerta corespunzător.
      const hasFullInMonth = events.some((e) => e.is_full);
      const resB = calcPererashodMonthly(norm, kmMonth, litriMonth, driversKm, hasFullInMonth);
      if (resB.level !== 'verde') {
        by_level[resB.level]++;
        pending.push(buildPending(vehicleId, 'monthly_B', startISO, endISO, alertDate, resB, inRepair));
      }
    }
  }

  // e) Re-rulare idempotentă: șterge alertele NOI ale lunii (status='nou'); păstrează in_analiza/raportat/rezolvat.
  await deleteNewAlertsForDate(sb, alertDate);

  // INSERT bulk alerte + drivers_window bulk (ne-atomic în REST: cleanup nu e necesar — re-rularea e idempotentă).
  // id generat client-side (crypto.randomUUID) → linkăm window-rows direct, fără să depindem
  // de ordinea sau de formatarea timestamp-urilor returnate de PostgREST.
  let generated = 0;
  if (pending.length > 0) {
    const alertRows = pending.map((p) => ({ id: crypto.randomUUID(), ...p.alert }));
    const windowRows = pending.flatMap((p, i) =>
      p.drivers.map((d) => ({
        dt_alert_id: alertRows[i].id,
        driver_id: d.driver_id,
        km_in_window: d.km_in_window,
        proportion: d.proportion,
      })),
    );

    const { error: insErr } = await sb.from('lde_dt_alerts').insert(alertRows);
    if (insErr) throw new Error(`Eroare la salvarea alertelor: ${insErr.message}`);
    generated = alertRows.length;

    if (windowRows.length > 0) {
      const { error: winErr } = await sb.from('lde_dt_drivers_window').insert(windowRows);
      if (winErr) throw new Error(`Eroare la salvarea șoferilor implicați: ${winErr.message}`);
    }
  }

  revalidatePath('/lde/alerte');
  return { generated, skipped_no_type, by_level };
}

export interface RecomputeCronicResult {
  cronic_generated: number;
}

// Borna lunii precedente: 'YYYY-MM-01' → 'YYYY-MM-01' al lunii anterioare (UTC).
function prevMonthStart(period_month: string): string {
  const start = new Date(period_month + 'T00:00:00Z');
  const prev = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  return prev.toISOString().slice(0, 10);
}

// ── PATTERN CRONIC (§3.2): același перерасход ±0.3 l/100km 2 luni la rând → «trimite la măsurare faptică». ──
// Separat de recomputeDtAlerts: rulează DUPĂ ce există istoricul de alerte lunare (monthly_B) pe ambele luni.
export async function recomputeCronicAlerts(period_month: string): Promise<RecomputeCronicResult> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  const currAlertDate = monthBounds(period_month).startDate; // 'YYYY-MM-01' luna curentă
  const prevAlertDate = prevMonthStart(period_month);        // 'YYYY-MM-01' luna precedentă
  // Borna cronicului = ancorată tot la prima zi a lunii curente (idempotent pe re-rulare).
  const cronicAlertDate = currAlertDate;

  // a) Ia alertele monthly_B pe cele 2 luni (per vehicul, max 1/lună prin metoda B).
  //    Folosim pererashod_l_per_100km stocat + restul coloanelor pentru a popula rândul cronic.
  const { data: monthlyAlerts } = await sb
    .from('lde_dt_alerts')
    .select(
      `vehicle_id, alert_date, level, km_in_period, litri_alimentati, litri_norma,
       actual_consumption_l_per_100km, pererashod_l_per_100km, vehicle_in_repair,
       has_precise_cutoff, drivers_involved`,
    )
    .eq('method', 'monthly_B')
    .in('alert_date', [prevAlertDate, currAlertDate]);

  // b) Grupare per vehicul: { prev, curr } cu перерасход și metadate.
  type MB = {
    pererashod: number | null;
    level: DtLevel;
    km_in_period: number;
    litri_alimentati: number;
    litri_norma: number;
    actual: number;
    in_repair: boolean;
    has_precise_cutoff: boolean;
    drivers: Array<{ driver_id: string; km: number; proportion: number }>;
  };
  const byVehicle = new Map<string, { prev?: MB; curr?: MB }>();
  for (const a of monthlyAlerts || []) {
    const slot = byVehicle.get(a.vehicle_id) || {};
    const mb: MB = {
      pererashod: a.pererashod_l_per_100km != null ? Number(a.pererashod_l_per_100km) : null,
      level: a.level,
      km_in_period: Number(a.km_in_period),
      litri_alimentati: Number(a.litri_alimentati),
      litri_norma: Number(a.litri_norma),
      actual: Number(a.actual_consumption_l_per_100km),
      in_repair: !!a.vehicle_in_repair,
      has_precise_cutoff: a.has_precise_cutoff !== false,
      drivers: Array.isArray(a.drivers_involved) ? a.drivers_involved : [],
    };
    if (a.alert_date === prevAlertDate) slot.prev = mb;
    else if (a.alert_date === currAlertDate) slot.curr = mb;
    byVehicle.set(a.vehicle_id, slot);
  }

  // c) Pentru fiecare vehicul cu ambele luni → isCronicPattern([prev, curr]).
  const cronicRows: Array<Record<string, unknown>> = [];
  for (const [vehicleId, { prev, curr }] of byVehicle) {
    if (!prev || !curr || prev.pererashod == null || curr.pererashod == null) continue;
    if (!isCronicPattern([prev.pererashod, curr.pererashod])) continue;

    // Nivelul = al lunii curente (cel mai recent). Perioada = prima zi lună prec. → ultima zi lună curentă.
    const period_to = monthBounds(period_month).endDate;
    cronicRows.push({
      id: crypto.randomUUID(),
      vehicle_id: vehicleId,
      alert_date: cronicAlertDate,
      method: 'cronic_pattern' as DtMethod,
      period_from: prevAlertDate,
      period_to,
      km_in_period: curr.km_in_period,
      litri_alimentati: curr.litri_alimentati,
      litri_norma: curr.litri_norma,
      actual_consumption_l_per_100km: curr.actual,
      pererashod_l_per_100km: curr.pererashod,
      level: curr.level,
      vehicle_in_repair: curr.in_repair,
      // cronicul e precis doar dacă AMBELE luni-sursă au avut cutoff precis (§3.4)
      has_precise_cutoff: prev.has_precise_cutoff && curr.has_precise_cutoff,
      // drivers_involved rămâne ARRAY peste tot (jsonb DEFAULT '[]'); toți cititorii fac
      // Array.isArray(...) ? ... : [], deci un obiect ar fi tăcut transformat în []. Punem
      // doar șoferii lunii curente; justificarea/recomandarea cronică merge în resolution_notes
      // (câmp pe care UI îl poate randa).
      drivers_involved: curr.drivers,
      resolution_notes:
        `Перерасход cronic: ${prev.pererashod} l/100km (luna prec.) → ${curr.pererashod} l/100km (luna curentă), ` +
        'stabil ±0.3 două luni la rând. Recomandare: trimite mașina la măsurare faptică a consumului.',
      status: 'nou' as DtAlertStatus,
    });
  }

  // d) Idempotent: șterge cronic_pattern status='nou' pe alert_date-ul lunii înainte de re-inserare.
  await sb
    .from('lde_dt_alerts')
    .delete()
    .eq('alert_date', cronicAlertDate)
    .eq('method', 'cronic_pattern')
    .eq('status', 'nou');

  let cronic_generated = 0;
  if (cronicRows.length > 0) {
    const { error: insErr } = await sb.from('lde_dt_alerts').insert(cronicRows);
    if (insErr) throw new Error(`Eroare la salvarea alertelor cronice: ${insErr.message}`);
    cronic_generated = cronicRows.length;
  }

  revalidatePath('/lde/alerte');
  return { cronic_generated };
}

// Distribuie km egal pe șoferii cunoscuți în fereastră (per-driver km nu e în schemă;
// repartizarea proporțională din motor se face pe acest km egal-distribuit).
function distributeKm(driverIds: string[], totalKm: number): DriverKmInWindow[] {
  if (driverIds.length === 0) return [];
  const per = Math.round((totalKm / driverIds.length) * 100) / 100;
  return driverIds.map((driver_id) => ({ driver_id, km: per }));
}

// Construiește rândul de alert + rândurile drivers_window dintr-un rezultat al motorului.
function buildPending(
  vehicleId: string,
  method: DtMethod,
  period_from: string,
  period_to: string,
  alertDate: string,
  res: ReturnType<typeof calcPererashodWindow>,
  inRepair: boolean,
) {
  const drivers = res.drivers_responsibility.map((d) => ({
    driver_id: d.driver_id,
    km_in_window: d.km,
    proportion: d.proportion,
  }));
  return {
    alert: {
      vehicle_id: vehicleId,
      alert_date: alertDate,
      method,
      period_from,
      period_to,
      km_in_period: res.km_in_period,
      litri_alimentati: res.litri_consumati,
      litri_norma: res.litri_norma,
      actual_consumption_l_per_100km: res.actual_l_per_100km,
      pererashod_l_per_100km: res.pererashod_l_per_100km,
      level: res.level,
      vehicle_in_repair: inRepair,
      has_precise_cutoff: res.has_precise_cutoff,
      drivers_involved: drivers,
      status: 'nou' as DtAlertStatus,
    },
    drivers,
  };
}

async function deleteNewAlertsForDate(sb: ReturnType<typeof getSupabase>, alertDate: string): Promise<void> {
  // ON DELETE CASCADE pe lde_dt_drivers_window curăță automat rândurile window.
  // .neq('method','cronic_pattern'): recomputeDtAlerts curăță DOAR alertele necronice
  // (between_alimentari_A + monthly_B). Cronicele se ancorează pe ACEEAȘI alert_date
  // (prima zi a lunii curente) și sunt exclusiv în grija lui recomputeCronicAlerts
  // (care le curăță separat). Fără acest filtru, o re-rulare lunară ar înghiți tăcut
  // cronicele cu status='nou'.
  await sb
    .from('lde_dt_alerts')
    .delete()
    .eq('alert_date', alertDate)
    .eq('status', 'nou')
    .neq('method', 'cronic_pattern');
}

// ── Tranziție status: nou → in_analiza → raportat → rezolvat ──
export async function updateAlertStatus(
  id: string,
  status: DtAlertStatus,
  resolution_action?: DtResolutionAction,
  resolution_notes?: string,
): Promise<void> {
  const session = requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  const patch: Record<string, unknown> = { status };
  if (status === 'rezolvat') {
    patch.resolution_action = resolution_action ?? null;
    patch.resolution_notes = resolution_notes ?? null;
    patch.resolved_at = new Date().toISOString();
    patch.resolved_by_admin_id = session.id;
  } else if (resolution_notes !== undefined) {
    patch.resolution_notes = resolution_notes;
  }

  const { error } = await sb.from('lde_dt_alerts').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/alerte');
}
