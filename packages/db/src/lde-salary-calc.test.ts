// Teste pentru motorul de salarii UZINE (categoriile 1-5)
import { describe, it, expect } from 'vitest';
import { calcSalary, type SalaryCalcInput, type DailyKmInput } from './lde-salary-calc.js';

function day(date: string, km: number, weekend = false): DailyKmInput {
  return { work_date: date, vehicle_id: 'v1', route_id: 'r1', shift_number: 1, km_total: km, is_weekend: weekend };
}

function baseInput(partial: Partial<SalaryCalcInput>): SalaryCalcInput {
  return {
    driver_id: 'd1',
    uzina_id: 'DRAXELMAIER_BALTI',
    salary_category: 1,
    period_month: '2026-06-01',
    daily_km: [],
    extra_orders: [],
    school_period: null,
    pererashod_alerts_lei: 0,
    damages_lei: 0,
    spalare_lei: 0,
    fix_amount_override_lei: null,
    ...partial,
  };
}

describe('Categoria 1 (DAF)', () => {
  it('sub 6000 km → doar 8500 lei', () => {
    const r = calcSalary(baseInput({ salary_category: 1, daily_km: [day('2026-06-01', 200), day('2026-06-02', 200)] }));
    expect(r.base_lei).toBe(8500);
    expect(r.km_surcharge_lei).toBe(0);
    expect(r.total_gross_lei).toBe(8500);
  });

  it('peste 6000 km → 8500 + (km-6000)×1.5', () => {
    // 8000 km total → surcharge = 2000 × 1.5 = 3000 → 11500
    const days = Array.from({ length: 40 }, (_, i) => day(`2026-06-${String(i + 1).padStart(2, '0')}`, 200));
    const r = calcSalary(baseInput({ salary_category: 1, daily_km: days }));
    expect(r.km_total).toBe(8000);
    expect(r.km_surcharge_lei).toBe(3000);
    expect(r.total_gross_lei).toBe(11500);
  });

  it('reține перерасход din net', () => {
    const r = calcSalary(baseInput({ salary_category: 1, daily_km: [day('2026-06-01', 100)], pererashod_alerts_lei: 500 }));
    expect(r.total_gross_lei).toBe(8500);
    expect(r.deduction_pererashod_lei).toBe(500);
    expect(r.total_net_lei).toBe(8000);
  });
});

describe('Categoria 2 (Microbuze)', () => {
  it('400 lei × zile lucrate sub 7000 km', () => {
    const days = Array.from({ length: 22 }, (_, i) => day(`2026-06-${String(i + 1).padStart(2, '0')}`, 100));
    const r = calcSalary(baseInput({ salary_category: 2, daily_km: days }));
    expect(r.base_lei).toBe(22 * 400); // 8800
    expect(r.km_surcharge_lei).toBe(0);
    expect(r.total_gross_lei).toBe(8800);
  });

  it('weekend lucrat = tarif normal 400 (confirmat Ion 24.06, fără ×2)', () => {
    // 3 zile lucrate (2 normale + 1 weekend) × 400 = 1200, fără spor de weekend
    const r = calcSalary(baseInput({
      salary_category: 2,
      daily_km: [day('2026-06-01', 100), day('2026-06-02', 100), day('2026-06-06', 100, true)],
    }));
    expect(r.base_lei).toBe(1200);      // toate 3 zilele × 400
    expect(r.weekend_double_lei).toBe(0); // fără spor de weekend
    expect(r.total_gross_lei).toBe(1200);
  });

  it('peste 7000 km → +1.2 lei/km', () => {
    // 8000 km, 20 zile normale → base 8000 + surcharge (1000×1.2=1200) = 9200
    const days = Array.from({ length: 20 }, (_, i) => day(`2026-06-${String(i + 1).padStart(2, '0')}`, 400));
    const r = calcSalary(baseInput({ salary_category: 2, daily_km: days }));
    expect(r.km_total).toBe(8000);
    expect(r.base_lei).toBe(8000);
    expect(r.km_surcharge_lei).toBe(1200);
    expect(r.total_gross_lei).toBe(9200);
  });
});

describe('Categoria 3 (SEBN/LEAR fix)', () => {
  it('fix default 8500, fără km surcharge', () => {
    const days = Array.from({ length: 40 }, (_, i) => day(`2026-06-${String(i + 1).padStart(2, '0')}`, 300));
    const r = calcSalary(baseInput({ salary_category: 3, daily_km: days }));
    expect(r.base_lei).toBe(8500);
    expect(r.km_surcharge_lei).toBe(0);
    expect(r.weekend_double_lei).toBe(0);
    expect(r.total_gross_lei).toBe(8500);
  });

  it('override fix la 8000', () => {
    const r = calcSalary(baseInput({ salary_category: 3, fix_amount_override_lei: 8000, daily_km: [day('2026-06-01', 100)] }));
    expect(r.base_lei).toBe(8000);
  });
});

describe('Categoria 5 (LEAR Florești)', () => {
  it('fix default 7500, fără km', () => {
    const r = calcSalary(baseInput({ salary_category: 5, daily_km: [day('2026-06-01', 500)] }));
    expect(r.base_lei).toBe(7500);
    expect(r.km_surcharge_lei).toBe(0);
  });
});

describe('Suplimente comune', () => {
  it('școlar 100 lei/zi când e activ', () => {
    const r = calcSalary(baseInput({
      salary_category: 3,
      daily_km: [day('2026-06-01', 100), day('2026-06-02', 100)],
      school_period: { period_month: '2026-06-01', is_active: true, rate_per_day_lei: 100, set_by_admin_id: null, set_at: '', notes: null },
    }));
    expect(r.school_lei).toBe(200); // 2 zile × 100
    expect(r.total_gross_lei).toBe(8700); // 8500 + 200
  });

  it('comenzi persoane fizice → cash_orders; Chișinău admin → extra_orders', () => {
    const r = calcSalary(baseInput({
      salary_category: 3,
      daily_km: [day('2026-06-01', 100)],
      extra_orders: [
        { id: 'e1', driver_id: 'd1', work_date: '2026-06-01', order_type: 'persoana_fizica', amount_lei: 350, entered_by_admin_id: null, notes: null, created_at: '' },
        { id: 'e2', driver_id: 'd1', work_date: '2026-06-01', order_type: 'chisinau_admin', amount_lei: 200, entered_by_admin_id: null, notes: null, created_at: '' },
      ],
    }));
    expect(r.cash_orders_lei).toBe(350);
    expect(r.extra_orders_lei).toBe(200);
    expect(r.total_gross_lei).toBe(8500 + 350 + 200);
    // persoana_fizica + chisinau_admin sunt definite → fără warning de tip neconfirmat
    expect(r.warnings.some((w) => w.includes('transport_extra/altul'))).toBe(false);
  });

  it('transport_extra/altul → adăugate la extra (confirmat Ion: plătite după categoria direcției, FĂRĂ warning)', () => {
    const r = calcSalary(baseInput({
      salary_category: 3,
      daily_km: [day('2026-06-01', 100)],
      extra_orders: [
        { id: 'e1', driver_id: 'd1', work_date: '2026-06-01', order_type: 'transport_extra', amount_lei: 120, entered_by_admin_id: null, notes: null, created_at: '' },
        { id: 'e2', driver_id: 'd1', work_date: '2026-06-01', order_type: 'altul', amount_lei: 80, entered_by_admin_id: null, notes: null, created_at: '' },
      ],
    }));
    expect(r.extra_orders_lei).toBe(200);
    expect(r.warnings.some((w) => w.includes('transport_extra/altul'))).toBe(false);
  });
});

describe('Decizii confirmate Ion 24.06 (comportament, fără warning)', () => {
  it('weekend pe fix lunar (cat 3/4/5) NU adaugă nimic, fără warning', () => {
    const r = calcSalary(baseInput({
      salary_category: 4,
      daily_km: [day('2026-06-01', 100), day('2026-06-06', 100, true)],
    }));
    expect(r.weekend_double_lei).toBe(0); // oklad doar pe zile lucrate; weekendul nu adaugă
    expect(r.warnings.some((w) => w.includes('weekend'))).toBe(false);
  });

  it('școlar calculat pe zilele cu GPS (= zile lucrate), fără warning', () => {
    const r = calcSalary(baseInput({
      salary_category: 3,
      daily_km: [day('2026-06-01', 100), day('2026-06-02', 100), day('2026-06-06', 100, true)],
      school_period: { period_month: '2026-06-01', is_active: true, rate_per_day_lei: 100, set_by_admin_id: null, set_at: '', notes: null },
    }));
    expect(r.school_lei).toBe(300); // 3 zile cu GPS × 100
    expect(r.warnings.length).toBe(0);
  });
});

describe('Categoria invalidă', () => {
  it('aruncă eroare pentru cat 6 (suburban — în numarare)', () => {
    expect(() => calcSalary(baseInput({ salary_category: 6 as never }))).toThrow();
  });
});
