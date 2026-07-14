'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import {
  calcSalary,
  type SalaryCalcInput,
  type DailyKmInput,
  type LdeSalaryRun,
  type LdeSalaryUzineMonthly,
  type LdeExtraOrder,
  type LdeSchoolPeriod,
  type LdeSalaryCategory,
} from '@translux/db';

// ── Listare runs (ultimele 12 luni) ──
export async function getSalaryRuns(): Promise<LdeSalaryRun[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data } = await getSupabase()
    .from('lde_salary_runs')
    .select('*')
    .order('period_month', { ascending: false })
    .limit(12);
  return (data || []) as LdeSalaryRun[];
}

export interface SalaryMonthlyRow extends LdeSalaryUzineMonthly {
  driver_name: string;
  uzina_name: string;
}

export interface SalaryRunDetail {
  run: LdeSalaryRun;
  rows: SalaryMonthlyRow[];
  totals: { gross: number; net: number; deductions: number; drivers: number };
}

// ── Detaliu run (cu nume șofer + uzină, fără N+1) ──
export async function getSalaryRunDetail(salary_run_id: string): Promise<SalaryRunDetail | null> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  const { data: run } = await sb.from('lde_salary_runs').select('*').eq('id', salary_run_id).single();
  if (!run) return null;

  const { data: rows } = await sb
    .from('lde_salary_uzine_monthly')
    .select('*, drivers(full_name), lde_uzine(display_name)')
    .eq('salary_run_id', salary_run_id);

  const mapped: SalaryMonthlyRow[] = (rows || []).map((r: any) => ({
    ...r,
    driver_name: r.drivers?.full_name ?? '—',
    uzina_name: r.lde_uzine?.display_name ?? r.uzina_id,
  }));

  const totals = mapped.reduce(
    (acc, r) => ({
      gross: acc.gross + Number(r.total_gross_lei),
      net: acc.net + Number(r.total_net_lei),
      deductions:
        acc.deductions +
        Number(r.deduction_pererashod_lei) +
        Number(r.deduction_damages_lei) +
        Number(r.deduction_other_lei),
      drivers: acc.drivers + 1,
    }),
    { gross: 0, net: 0, deductions: 0, drivers: 0 },
  );

  return { run: run as LdeSalaryRun, rows: mapped, totals };
}

// ── Generare run lunar (batch-fetch, fără N+1) ──
export async function generateSalaryRun(period_month: string): Promise<{ run_id: string; drivers: number; warnings: string[] }> {
  const session = requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  const monthStart = period_month;                                  // 'YYYY-MM-01'
  const startDate = new Date(monthStart + 'T00:00:00Z');
  const monthEnd = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0));
  const monthEndStr = monthEnd.toISOString().slice(0, 10);

  // 1. Toți șoferii UZINE cu categorie 1-5 (single query).
  //    Doar șoferii ACTIVI — plecații păstrează categoria istoric, dar nu mai intră în salarizare.
  const { data: extras } = await sb
    .from('lde_driver_extras')
    .select('driver_id, uzina_id, lde_salary_category, drivers!inner ( active )')
    .gte('lde_salary_category', 1)
    .lte('lde_salary_category', 5)
    .eq('drivers.active', true);
  const drivers = (extras || []).filter((e: any) => e.lde_salary_category != null && e.uzina_id != null);
  if (drivers.length === 0) throw new Error('Niciun șofer UZINĂ cu categorie 1-5 setată.');

  const driverIds = drivers.map((d: any) => d.driver_id);

  // 2. Atribuiri active (driver → vehicle) — pentru a lega GPS-ul
  const { data: assignments } = await sb
    .from('lde_active_assignments')
    .select('driver_id, vehicle_id, route_id, shift_number')
    .is('valid_to', null)
    .in('driver_id', driverIds);
  const driverVehicle = new Map<string, { vehicle_id: string; route_id: string | null; shift_number: 1 | 2 | 3 | null }>();
  for (const a of assignments || []) {
    if (!driverVehicle.has(a.driver_id)) driverVehicle.set(a.driver_id, { vehicle_id: a.vehicle_id, route_id: a.route_id, shift_number: a.shift_number });
  }

  // 3. GPS zilnic pe luna (toate vehiculele atribuite) — single query
  const vehicleIds = [...new Set([...driverVehicle.values()].map((v) => v.vehicle_id))];
  const gpsByVehicle = new Map<string, DailyKmInput[]>();
  if (vehicleIds.length > 0) {
    const { data: gps } = await sb
      .from('lde_vehicle_gps_daily')
      .select('vehicle_id, date, km_total')
      .gte('date', monthStart)
      .lte('date', monthEndStr)
      .in('vehicle_id', vehicleIds);
    for (const g of gps || []) {
      const dow = new Date(g.date + 'T00:00:00Z').getUTCDay();
      const entry: DailyKmInput = {
        work_date: g.date,
        vehicle_id: g.vehicle_id,
        route_id: null,
        shift_number: null,
        km_total: Number(g.km_total),
        is_weekend: dow === 0 || dow === 6,
      };
      const arr = gpsByVehicle.get(g.vehicle_id) || [];
      arr.push(entry);
      gpsByVehicle.set(g.vehicle_id, arr);
    }
  }

  // 4. Comenzi suplimentare pe luna — single query
  const extraByDriver = new Map<string, LdeExtraOrder[]>();
  const { data: orders } = await sb
    .from('lde_extra_orders')
    .select('*')
    .gte('work_date', monthStart)
    .lte('work_date', monthEndStr)
    .in('driver_id', driverIds);
  for (const o of orders || []) {
    const arr = extraByDriver.get(o.driver_id) || [];
    arr.push(o as LdeExtraOrder);
    extraByDriver.set(o.driver_id, arr);
  }

  // 5. Perioadă școlară pentru lună
  const { data: school } = await sb.from('lde_school_periods').select('*').eq('period_month', monthStart).maybeSingle();
  const schoolPeriod = (school || null) as LdeSchoolPeriod | null;

  // 6. Re-rulare idempotentă: șterge orice DRAFT existent pe această lună (CASCADE curăță monthly+breakdown).
  // NU atinge run-urile approved/paid — acelea sunt finalizate.
  await sb.from('lde_salary_runs').delete().eq('period_month', monthStart).eq('status', 'draft');

  // 7. Header run (draft)
  const { data: runRow, error: runErr } = await sb
    .from('lde_salary_runs')
    .insert({ period_month: monthStart, status: 'draft', generated_by_admin_id: session.id })
    .select('id')
    .single();
  if (runErr || !runRow) throw new Error(runErr?.message || 'Eroare la crearea run-ului');
  const runId = runRow.id;

  // 7. Calcul per șofer + insert (în memorie, fără query per șofer)
  const allWarnings: string[] = [];
  const monthlyRows: any[] = [];
  const breakdownRows: { driver_id: string; days: any[] }[] = [];

  for (const d of drivers) {
    const veh = driverVehicle.get(d.driver_id);
    const daily = veh ? gpsByVehicle.get(veh.vehicle_id) || [] : [];
    const input: SalaryCalcInput = {
      driver_id: d.driver_id,
      uzina_id: d.uzina_id,
      salary_category: d.lde_salary_category as LdeSalaryCategory,
      period_month: monthStart,
      daily_km: daily.map((x) => ({ ...x, route_id: veh?.route_id ?? null, shift_number: veh?.shift_number ?? null })),
      extra_orders: extraByDriver.get(d.driver_id) || [],
      school_period: schoolPeriod,
      pererashod_alerts_lei: 0,  // GPS/DT engine nu e încă conectat — admin poate edita draft-ul
      damages_lei: 0,
      spalare_lei: 0,
      fix_amount_override_lei: null,
    };
    const res = calcSalary(input);
    if (res.warnings.length) allWarnings.push(...res.warnings.map((w) => `${d.driver_id}: ${w}`));

    monthlyRows.push({
      salary_run_id: runId,
      driver_id: d.driver_id,
      uzina_id: d.uzina_id,
      salary_category: d.lde_salary_category,
      base_lei: res.base_lei,
      km_surcharge_lei: res.km_surcharge_lei,
      weekend_double_lei: res.weekend_double_lei,
      extra_orders_lei: res.extra_orders_lei,
      school_lei: res.school_lei,
      cash_orders_lei: res.cash_orders_lei,
      spalare_lei: res.spalare_lei,
      total_gross_lei: res.total_gross_lei,
      deduction_pererashod_lei: res.deduction_pererashod_lei,
      deduction_damages_lei: res.deduction_damages_lei,
      deduction_other_lei: res.deduction_other_lei,
      total_net_lei: res.total_net_lei,
      km_total: res.km_total,
      work_days: res.work_days,
      weekend_days: res.weekend_days,
    });
    breakdownRows.push({ driver_id: d.driver_id, days: res.breakdown_per_day });
  }

  // 8. Insert monthly (bulk) + breakdown (bulk, după ce avem id-urile).
  // Inserturile nu sunt atomice (Supabase REST nu are tranzacții multi-statement),
  // deci la eroare facem cleanup manual: ștergem run-ul (CASCADE curăță monthly+breakdown)
  // ca să nu rămână un draft orfan parțial. Re-rularea e oricum idempotentă (pasul 6).
  const { data: insertedMonthly, error: monthlyErr } = await sb
    .from('lde_salary_uzine_monthly')
    .insert(monthlyRows)
    .select('id, driver_id');
  if (monthlyErr || !insertedMonthly) {
    await sb.from('lde_salary_runs').delete().eq('id', runId);
    throw new Error(`Eroare la salvarea salariilor: ${monthlyErr?.message || 'rezultat gol'}`);
  }

  const monthlyIdByDriver = new Map<string, string>();
  for (const m of insertedMonthly) monthlyIdByDriver.set(m.driver_id, m.id);

  const allBreakdown = breakdownRows.flatMap((b) => {
    const monthlyId = monthlyIdByDriver.get(b.driver_id);
    if (!monthlyId) return [];
    return b.days.map((day) => ({
      salary_monthly_id: monthlyId,
      work_date: day.work_date,
      vehicle_id: day.vehicle_id,
      route_id: day.route_id,
      shift_number: day.shift_number,
      km_total: day.km_total,
      is_weekend: day.is_weekend,
      day_amount_lei: day.day_amount_lei,
      school_amount_lei: day.school_amount_lei,
      extra_order_amount_lei: day.extra_order_amount_lei,
    }));
  });
  if (allBreakdown.length > 0) {
    const { error: breakdownErr } = await sb.from('lde_salary_breakdown').insert(allBreakdown);
    if (breakdownErr) {
      await sb.from('lde_salary_runs').delete().eq('id', runId);
      throw new Error(`Eroare la salvarea detaliului pe zile: ${breakdownErr.message}`);
    }
  }

  revalidatePath('/lde/salarii');
  return { run_id: runId, drivers: drivers.length, warnings: [...new Set(allWarnings)] };
}

// ── Override manual pe un rând (cat 3/5 fix, corecturi) cu audit ──
export async function updateSalaryMonthly(
  id: string,
  patch: Partial<Pick<LdeSalaryUzineMonthly, 'base_lei' | 'spalare_lei' | 'deduction_damages_lei' | 'deduction_pererashod_lei' | 'notes'>>,
  reason?: string,
): Promise<void> {
  const session = requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  const { data: before } = await sb.from('lde_salary_uzine_monthly').select('*').eq('id', id).single();
  if (!before) throw new Error('Rândul nu există');

  // Recalcul total cu noile valori
  const next = { ...before, ...patch };
  const gross =
    Number(next.base_lei) + Number(next.km_surcharge_lei) + Number(next.weekend_double_lei) +
    Number(next.extra_orders_lei) + Number(next.school_lei) + Number(next.cash_orders_lei) + Number(next.spalare_lei);
  const net = gross - Number(next.deduction_pererashod_lei) - Number(next.deduction_damages_lei) - Number(next.deduction_other_lei);

  const { error } = await sb
    .from('lde_salary_uzine_monthly')
    .update({ ...patch, total_gross_lei: gross, total_net_lei: net })
    .eq('id', id);
  if (error) throw new Error(error.message);

  // Audit pe fiecare câmp numeric schimbat
  const auditRows = (Object.keys(patch) as (keyof typeof patch)[])
    .filter((k) => k !== 'notes' && Number((before as any)[k]) !== Number((patch as any)[k]))
    .map((k) => ({
      salary_monthly_id: id,
      field_changed: String(k),
      value_before: Number((before as any)[k]),
      value_after: Number((patch as any)[k]),
      reason: reason || null,
      changed_by_admin_id: session.id,
    }));
  if (auditRows.length > 0) await sb.from('lde_salary_audit').insert(auditRows);

  revalidatePath('/lde/salarii');
}

export async function approveSalaryRun(salary_run_id: string): Promise<void> {
  const session = requireRole(await verifySession(), 'ADMIN');
  const { error } = await getSupabase()
    .from('lde_salary_runs')
    .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by_admin_id: session.id })
    .eq('id', salary_run_id)
    .eq('status', 'draft');
  if (error) throw new Error(error.message);
  revalidatePath('/lde/salarii');
}

export async function markSalaryRunPaid(salary_run_id: string): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  const { error } = await getSupabase()
    .from('lde_salary_runs')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', salary_run_id)
    .eq('status', 'approved');
  if (error) throw new Error(error.message);
  revalidatePath('/lde/salarii');
}

export async function deleteSalaryRun(salary_run_id: string): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  // Doar draft-urile pot fi șterse
  const { error } = await getSupabase()
    .from('lde_salary_runs')
    .delete()
    .eq('id', salary_run_id)
    .eq('status', 'draft');
  if (error) throw new Error(error.message);
  revalidatePath('/lde/salarii');
}
