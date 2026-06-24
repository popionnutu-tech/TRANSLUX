// Teste pentru motorul «Acte de recepție» — valoare per model de facturare
import { describe, it, expect } from 'vitest';
import { computeReceptieValue } from './lde-receptie-calc.js';

const AGG = { km: 1234.5, curse: 40, passengers: 850 };

describe('computeReceptieValue', () => {
  it('per_cursa → rate × curse', () => {
    expect(computeReceptieValue({ billing_model: 'per_cursa', rate_lei: 500 }, AGG)).toBe(20000);
  });

  it('per_pasager → rate × passengers', () => {
    expect(computeReceptieValue({ billing_model: 'per_pasager', rate_lei: 25 }, AGG)).toBe(21250);
  });

  it('per_km → round2(rate × km)', () => {
    // 12.5 × 1234.5 = 15431.25
    expect(computeReceptieValue({ billing_model: 'per_km', rate_lei: 12.5 }, AGG)).toBe(15431.25);
  });

  it('fix_saptamanal → rate (ignoră agregatele)', () => {
    expect(computeReceptieValue({ billing_model: 'fix_saptamanal', rate_lei: 18000 }, AGG)).toBe(18000);
  });

  it('per_km rotunjește corect zecimalele', () => {
    // 1.333 × 100 = 133.3 → 133.3
    expect(
      computeReceptieValue({ billing_model: 'per_km', rate_lei: 1.333 }, { km: 100, curse: 0, passengers: 0 }),
    ).toBe(133.3);
    // 0.005 × 3 = 0.015 → round2 → 0.02 (jumătate în sus)
    expect(
      computeReceptieValue({ billing_model: 'per_km', rate_lei: 0.005 }, { km: 3, curse: 0, passengers: 0 }),
    ).toBe(0.02);
  });

  it('edge: rate 0 → 0 (orice model)', () => {
    expect(computeReceptieValue({ billing_model: 'per_cursa', rate_lei: 0 }, AGG)).toBe(0);
    expect(computeReceptieValue({ billing_model: 'per_km', rate_lei: 0 }, AGG)).toBe(0);
    expect(computeReceptieValue({ billing_model: 'fix_saptamanal', rate_lei: 0 }, AGG)).toBe(0);
  });

  it('edge: agregate 0 → 0 (per_cursa/per_pasager/per_km); fix rămâne rate', () => {
    const zero = { km: 0, curse: 0, passengers: 0 };
    expect(computeReceptieValue({ billing_model: 'per_cursa', rate_lei: 500 }, zero)).toBe(0);
    expect(computeReceptieValue({ billing_model: 'per_pasager', rate_lei: 25 }, zero)).toBe(0);
    expect(computeReceptieValue({ billing_model: 'per_km', rate_lei: 12.5 }, zero)).toBe(0);
    // fix_saptamanal nu depinde de agregate
    expect(computeReceptieValue({ billing_model: 'fix_saptamanal', rate_lei: 18000 }, zero)).toBe(18000);
  });
});
