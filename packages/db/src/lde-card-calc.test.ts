// Teste pentru motorul «Completare carduri» — litri + rezervă + cost opțional
import { describe, it, expect } from 'vitest';
import { computeCardTopup } from './lde-card-calc.js';

describe('computeCardTopup', () => {
  it('bază: litri stricti = km × normă / 100', () => {
    // 1000 km × 30 l/100km = 300 L
    const r = computeCardTopup(1000, 30, 0);
    expect(r.liters).toBe(300);
    expect(r.litersWithReserve).toBe(300); // rezervă 0%
    expect(r.lei).toBeNull();              // fără preț
  });

  it('cu rezervă (default 10%)', () => {
    // 300 L × 1.10 = 330 L
    const r = computeCardTopup(1000, 30);
    expect(r.liters).toBe(300);
    expect(r.litersWithReserve).toBe(330);
  });

  it('cu rezervă explicită (25%)', () => {
    // 300 L × 1.25 = 375 L
    const r = computeCardTopup(1000, 30, 25);
    expect(r.litersWithReserve).toBe(375);
  });

  it('cu preț → lei = round2(litersWithReserve × preț)', () => {
    // 330 L × 24.5 lei/L = 8085 lei
    const r = computeCardTopup(1000, 30, 10, 24.5);
    expect(r.litersWithReserve).toBe(330);
    expect(r.lei).toBe(8085);
  });

  it('fără preț → lei = null', () => {
    const r = computeCardTopup(500, 20, 10);
    expect(r.lei).toBeNull();
  });

  it('preț 0 e furnizat (≠ undefined) → lei = 0, nu null', () => {
    const r = computeCardTopup(1000, 30, 10, 0);
    expect(r.lei).toBe(0);
  });

  it('edge: km = 0 → totul 0 (dar lei urmează prezența prețului)', () => {
    const noPrice = computeCardTopup(0, 30, 10);
    expect(noPrice.liters).toBe(0);
    expect(noPrice.litersWithReserve).toBe(0);
    expect(noPrice.lei).toBeNull();

    const withPrice = computeCardTopup(0, 30, 10, 24.5);
    expect(withPrice.liters).toBe(0);
    expect(withPrice.litersWithReserve).toBe(0);
    expect(withPrice.lei).toBe(0);
  });

  it('rotunjește litri și lei la 2 zecimale', () => {
    // 333 km × 12.7 / 100 = 42.291 → 42.29 L
    const r = computeCardTopup(333, 12.7, 0, 23.33);
    expect(r.liters).toBe(42.29);
    // 42.29 × 1.0 = 42.29; × 23.33 = 986.6257 → 986.63
    expect(r.litersWithReserve).toBe(42.29);
    expect(r.lei).toBe(986.63);
  });
});
