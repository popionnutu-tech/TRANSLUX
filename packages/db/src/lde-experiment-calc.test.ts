// Teste pentru motorul «Experimente» (§6) — comparație baseline vs test
import { describe, it, expect } from 'vitest';
import { compareExperiment } from './lde-experiment-calc.js';

describe('compareExperiment', () => {
  it('baseline mai scump ca test → economie', () => {
    // Baseline: 30 zile, 30000 lei → 1000 lei/zi. Test: 30 zile, 24000 lei → 800 lei/zi.
    const r = compareExperiment(
      { litri: 3000, lei: 30000, km: 10000, days: 30 },
      { litri: 2400, lei: 24000, km: 10000, days: 30 },
    );
    expect(r.baseline.lei_per_day).toBe(1000);
    expect(r.test.lei_per_day).toBe(800);
    expect(r.delta_lei_per_day).toBe(-200);
    // economie = +200 lei/zi × 30 = +6000 lei/lună
    expect(r.economie_lei_per_month).toBe(6000);
    expect(r.verdict).toBe('economie');
  });

  it('test mai scump ca baseline → pierdere', () => {
    const r = compareExperiment(
      { litri: 2400, lei: 24000, km: 10000, days: 30 },
      { litri: 3000, lei: 30000, km: 10000, days: 30 },
    );
    expect(r.delta_lei_per_day).toBe(200);
    expect(r.economie_lei_per_month).toBe(-6000); // pierdere
    expect(r.verdict).toBe('pierdere');
  });

  it('cost egal → neutru', () => {
    const r = compareExperiment(
      { litri: 3000, lei: 30000, km: 10000, days: 30 },
      { litri: 3000, lei: 30000, km: 10000, days: 30 },
    );
    expect(r.delta_lei_per_day).toBe(0);
    expect(r.economie_lei_per_month).toBe(0);
    expect(r.verdict).toBe('neutru');
  });

  it('normalizează pe zi când perioadele au lungimi diferite', () => {
    // Baseline: 10 zile, 10000 lei → 1000 lei/zi. Test: 20 zile, 16000 lei → 800 lei/zi.
    const r = compareExperiment(
      { litri: 1000, lei: 10000, km: 4000, days: 10 },
      { litri: 1600, lei: 16000, km: 8000, days: 20 },
    );
    expect(r.baseline.lei_per_day).toBe(1000);
    expect(r.test.lei_per_day).toBe(800);
    expect(r.verdict).toBe('economie');
  });

  it('litri/100km calculat corect + delta', () => {
    // Baseline: 3000 L / 10000 km = 30 l/100km. Test: 2400 L / 10000 km = 24 l/100km.
    const r = compareExperiment(
      { litri: 3000, lei: 30000, km: 10000, days: 30 },
      { litri: 2400, lei: 24000, km: 10000, days: 30 },
    );
    expect(r.baseline.litri_per_100km).toBe(30);
    expect(r.test.litri_per_100km).toBe(24);
    expect(r.delta_litri_per_100km).toBe(-6);
  });

  it('diferență sub pragul de zgomot (≤1 lei/zi) → neutru', () => {
    // Baseline 1000.5 lei/zi vs test 1000 lei/zi → delta -0.5 → neutru.
    const r = compareExperiment(
      { litri: 100, lei: 10005, km: 1000, days: 10 },
      { litri: 100, lei: 10000, km: 1000, days: 10 },
    );
    expect(r.delta_lei_per_day).toBe(-0.5);
    expect(r.verdict).toBe('neutru');
  });

  it('days 0 / km 0 → fără diviziune cu zero', () => {
    const r = compareExperiment(
      { litri: 0, lei: 0, km: 0, days: 0 },
      { litri: 0, lei: 0, km: 0, days: 0 },
    );
    expect(r.baseline.lei_per_day).toBe(0);
    expect(r.baseline.litri_per_100km).toBe(0);
    expect(r.test.lei_per_day).toBe(0);
    expect(r.verdict).toBe('neutru');
  });
});
