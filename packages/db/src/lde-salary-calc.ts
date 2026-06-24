// ============================================================================
// LDE — Motor de calcul SALARII UZINE (categoriile 1-5)
// Funcții PURE (fără side-effects, fără DB) — testabile.
// Sursă formule: Sinteza-interviuri-autopark.md §2
//
// IMPORTANT — categoriile 6 (suburban) și 7 (interurban) NU sunt aici:
// se calculează în modulul EXISTENT /numarare.
// ============================================================================

import type { LdeSalaryCategory, LdeExtraOrder, LdeSchoolPeriod } from './types.js';

// Praguri și rate din interviu (§2)
const DAF_BASE_LEI = 8500;
const DAF_KM_THRESHOLD = 6000;
const DAF_KM_RATE = 1.5;

const MICROBUZ_DAY_RATE_LEI = 400;
const MICROBUZ_KM_THRESHOLD = 7000;
const MICROBUZ_KM_RATE = 1.2;

const SEBN_LEAR_FIX_DEFAULT_LEI = 8500;   // cat 3: 8000-8500 (admin alege exact)
const ADMIN_BALTI_FIX_DEFAULT_LEI = 8000; // cat 4: 8000 + suplimente
const LEAR_FLORESTI_FIX_DEFAULT_LEI = 7500; // cat 5: 6500-8500 (mediana)

export interface DailyKmInput {
  work_date: string;       // 'YYYY-MM-DD'
  vehicle_id: string;
  route_id: string | null;
  shift_number: 1 | 2 | 3 | null;
  km_total: number;
  is_weekend: boolean;
}

export interface SalaryCalcInput {
  driver_id: string;
  uzina_id: string;
  salary_category: LdeSalaryCategory;
  period_month: string;                  // 'YYYY-MM-01'
  daily_km: DailyKmInput[];              // toate zilele lucrate în lună
  extra_orders: LdeExtraOrder[];         // comenzi suplimentare
  school_period: LdeSchoolPeriod | null; // dacă luna are școlar activ
  pererashod_alerts_lei: number;         // reținări din lde_dt_alerts pentru acest șofer
  damages_lei: number;                   // intro admin
  spalare_lei: number;                   // intro admin (default 0)
  fix_amount_override_lei: number | null; // cat 3/4/5 — admin alege suma exactă
}

export interface SalaryBreakdownDay {
  work_date: string;
  vehicle_id: string;
  route_id: string | null;
  shift_number: 1 | 2 | 3 | null;
  km_total: number;
  is_weekend: boolean;
  day_amount_lei: number;
  school_amount_lei: number;
  extra_order_amount_lei: number;
  notes: string | null;
}

export interface SalaryCalcResult {
  base_lei: number;
  km_surcharge_lei: number;
  weekend_double_lei: number;
  extra_orders_lei: number;
  school_lei: number;
  cash_orders_lei: number;
  spalare_lei: number;
  total_gross_lei: number;
  deduction_pererashod_lei: number;
  deduction_damages_lei: number;
  deduction_other_lei: number;
  total_net_lei: number;
  km_total: number;
  work_days: number;
  weekend_days: number;
  breakdown_per_day: SalaryBreakdownDay[];
  /** Avertismente pentru admin (ex: interpretare weekend la DAF de confirmat) */
  warnings: string[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Suma km pe toate zilele (inclusiv aducerea — toți km de la GPS, per §2 DAF). */
function sumKm(daily: DailyKmInput[]): number {
  return daily.reduce((acc, d) => acc + d.km_total, 0);
}

/** Comenzi grupate: chisinau_admin+transport_extra → extra_orders; persoana_fizica → cash_orders. */
function splitExtraOrders(orders: LdeExtraOrder[]): { extra: number; cash: number; perDay: Map<string, number> } {
  let extra = 0;
  let cash = 0;
  const perDay = new Map<string, number>();
  for (const o of orders) {
    if (o.order_type === 'persoana_fizica') {
      cash += o.amount_lei;
    } else {
      extra += o.amount_lei;
    }
    perDay.set(o.work_date, (perDay.get(o.work_date) ?? 0) + o.amount_lei);
  }
  return { extra, cash, perDay };
}

/** Suplimentele comune tuturor categoriilor (școlar + comenzi + spălare). */
function commonSupplements(input: SalaryCalcInput): {
  extra_orders_lei: number;
  cash_orders_lei: number;
  school_lei: number;
  school_per_day: number;
  spalare_lei: number;
  extra_per_day: Map<string, number>;
  warnings: string[];
} {
  const { extra, cash, perDay } = splitExtraOrders(input.extra_orders);
  const workDays = input.daily_km.length;
  const schoolActive = input.school_period?.is_active ?? false;
  const schoolRate = input.school_period?.rate_per_day_lei ?? 0;
  // Confirmat Ion 24.06.2026: școlarul se calculează pe zilele cu GPS = zilele lucrate.
  // În zilele nelucrătoare (uzina sau mașina nu lucrează) pur și simplu nu există GPS → nu se numără.
  const school_lei = schoolActive ? round2(schoolRate * workDays) : 0;

  // Confirmat Ion 24.06.2026: comenzile extra sunt rare; când apar, se plătesc după categoria
  // direcției în care lucrează omul (admin introduce suma în amount_lei). Fără warning.
  const warnings: string[] = [];

  return {
    extra_orders_lei: round2(extra),
    cash_orders_lei: round2(cash),
    school_lei,
    school_per_day: schoolActive ? schoolRate : 0,
    spalare_lei: round2(input.spalare_lei ?? 0),
    extra_per_day: perDay,
    warnings,
  };
}

/** Aplică reținările (перерасход + daune). Lipsă casa NU se aplică în LDE (doar suburban/interurban). */
function applyDeductions(input: SalaryCalcInput, gross: number): {
  net: number;
  deduction_pererashod: number;
  deduction_damages: number;
  deduction_other: number;
} {
  const dp = round2(input.pererashod_alerts_lei ?? 0);
  const dd = round2(input.damages_lei ?? 0);
  return {
    net: round2(gross - dp - dd),
    deduction_pererashod: dp,
    deduction_damages: dd,
    deduction_other: 0,
  };
}

function buildBreakdown(
  input: SalaryCalcInput,
  dayAmountFn: (d: DailyKmInput) => number,
  school_per_day: number,
  extra_per_day: Map<string, number>,
): SalaryBreakdownDay[] {
  return input.daily_km.map((d) => ({
    work_date: d.work_date,
    vehicle_id: d.vehicle_id,
    route_id: d.route_id,
    shift_number: d.shift_number,
    km_total: d.km_total,
    is_weekend: d.is_weekend,
    day_amount_lei: round2(dayAmountFn(d)),
    school_amount_lei: school_per_day,
    extra_order_amount_lei: round2(extra_per_day.get(d.work_date) ?? 0),
    notes: null,
  }));
}

// ── Categoria 1 — DAF uzine ──
// 8500 lei până la 6000 km/lună + 1.5 lei/km peste 6000 (pe TOȚI km de la GPS, inclusiv aducerea)
function calcCategorie1_DAF(input: SalaryCalcInput): SalaryCalcResult {
  const km = sumKm(input.daily_km);
  const workDays = input.daily_km.length;
  const weekendDays = input.daily_km.filter((d) => d.is_weekend).length;
  const base = DAF_BASE_LEI;
  const km_surcharge = km > DAF_KM_THRESHOLD ? round2((km - DAF_KM_THRESHOLD) * DAF_KM_RATE) : 0;
  const sup = commonSupplements(input);

  // Confirmat Ion 24.06.2026: oklad-ul (baza lunară) e doar pentru zilele lucrate;
  // weekendul NU adaugă nimic în plus. weekend_double = 0.
  const weekend_double = 0;
  const warnings = [...sup.warnings];

  const gross = round2(base + km_surcharge + weekend_double + sup.extra_orders_lei + sup.school_lei + sup.cash_orders_lei + sup.spalare_lei);
  const ded = applyDeductions(input, gross);

  return {
    base_lei: base, km_surcharge_lei: km_surcharge, weekend_double_lei: weekend_double,
    extra_orders_lei: sup.extra_orders_lei, school_lei: sup.school_lei, cash_orders_lei: sup.cash_orders_lei, spalare_lei: sup.spalare_lei,
    total_gross_lei: gross,
    deduction_pererashod_lei: ded.deduction_pererashod, deduction_damages_lei: ded.deduction_damages, deduction_other_lei: ded.deduction_other,
    total_net_lei: ded.net,
    km_total: km, work_days: workDays, weekend_days: weekendDays,
    breakdown_per_day: buildBreakdown(input, () => 0, sup.school_per_day, sup.extra_per_day),
    warnings,
  };
}

// ── Categoria 2 — Microbuze uzine ──
// 400 lei/zi de lucru reală până la 7000 km/lună + 1.2 lei/km peste 7000
// Weekend ×2: zilele de WE = 800 lei (400 × 2)
function calcCategorie2_Microbuze(input: SalaryCalcInput): SalaryCalcResult {
  const km = sumKm(input.daily_km);
  const workDays = input.daily_km.length;
  const weekendDays = input.daily_km.filter((d) => d.is_weekend).length;
  const normalDays = workDays - weekendDays;
  const base = round2(normalDays * MICROBUZ_DAY_RATE_LEI);              // zile normale × 400
  const km_surcharge = km > MICROBUZ_KM_THRESHOLD ? round2((km - MICROBUZ_KM_THRESHOLD) * MICROBUZ_KM_RATE) : 0;
  const sup = commonSupplements(input);

  // base = zile normale × 400; weekend_pay = zile WE × 800 (tarif dublu, §2)
  const weekend_pay = round2(weekendDays * MICROBUZ_DAY_RATE_LEI * 2);
  const gross = round2(base + weekend_pay + km_surcharge + sup.extra_orders_lei + sup.school_lei + sup.cash_orders_lei + sup.spalare_lei);
  const ded = applyDeductions(input, gross);

  return {
    base_lei: base, km_surcharge_lei: km_surcharge, weekend_double_lei: weekend_pay,
    extra_orders_lei: sup.extra_orders_lei, school_lei: sup.school_lei, cash_orders_lei: sup.cash_orders_lei, spalare_lei: sup.spalare_lei,
    total_gross_lei: gross,
    deduction_pererashod_lei: ded.deduction_pererashod, deduction_damages_lei: ded.deduction_damages, deduction_other_lei: ded.deduction_other,
    total_net_lei: ded.net,
    km_total: km, work_days: workDays, weekend_days: weekendDays,
    breakdown_per_day: buildBreakdown(input, (d) => d.is_weekend ? MICROBUZ_DAY_RATE_LEI * 2 : MICROBUZ_DAY_RATE_LEI, sup.school_per_day, sup.extra_per_day),
    warnings: sup.warnings,
  };
}

// ── Categorii 3/4/5 — fix lunar (fără formulă pe km, fără weekend ×2) ──
function calcCategorieFix(input: SalaryCalcInput, defaultFix: number): SalaryCalcResult {
  const km = sumKm(input.daily_km);
  const workDays = input.daily_km.length;
  const weekendDays = input.daily_km.filter((d) => d.is_weekend).length;
  const base = input.fix_amount_override_lei ?? defaultFix;
  const sup = commonSupplements(input);

  // Confirmat Ion 24.06.2026: oklad lunar doar pentru zilele lucrate; weekendul nu adaugă nimic.
  const weekend_double = 0;
  const warnings = [...sup.warnings];

  const gross = round2(base + sup.extra_orders_lei + sup.school_lei + sup.cash_orders_lei + sup.spalare_lei);
  const ded = applyDeductions(input, gross);

  return {
    base_lei: base, km_surcharge_lei: 0, weekend_double_lei: weekend_double,
    extra_orders_lei: sup.extra_orders_lei, school_lei: sup.school_lei, cash_orders_lei: sup.cash_orders_lei, spalare_lei: sup.spalare_lei,
    total_gross_lei: gross,
    deduction_pererashod_lei: ded.deduction_pererashod, deduction_damages_lei: ded.deduction_damages, deduction_other_lei: ded.deduction_other,
    total_net_lei: ded.net,
    km_total: km, work_days: workDays, weekend_days: weekendDays,
    breakdown_per_day: buildBreakdown(input, () => 0, sup.school_per_day, sup.extra_per_day),
    warnings,
  };
}

/** Punct de intrare — alege formula după categoria de salariu (1-5). */
export function calcSalary(input: SalaryCalcInput): SalaryCalcResult {
  switch (input.salary_category) {
    case 1: return calcCategorie1_DAF(input);
    case 2: return calcCategorie2_Microbuze(input);
    case 3: return calcCategorieFix(input, SEBN_LEAR_FIX_DEFAULT_LEI);
    case 4: return calcCategorieFix(input, ADMIN_BALTI_FIX_DEFAULT_LEI);
    case 5: return calcCategorieFix(input, LEAR_FLORESTI_FIX_DEFAULT_LEI);
    default:
      throw new Error(`Categoria de salariu ${input.salary_category} nu e suportată în LDE (doar 1-5; cat 6-7 în modulul numarare).`);
  }
}
