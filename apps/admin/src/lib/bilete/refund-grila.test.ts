import { describe, expect, it } from 'vitest';
import { noimiRestituire, sumaRestituire } from './refund-reguli';

// Plecarea de la oprirea pasagerului: 14.10.2026, 06:30 Chișinău.
const plecare = '2026-10-14T06:30:00+03:00';
const cu = (ore: number) => Date.parse(plecare) - ore * 3_600_000;

describe('noimiRestituire (grila lui Ion, 05.10)', () => {
  it('pragurile 24 / 12 / 6 / 4 ore', () => {
    expect(noimiRestituire(plecare, cu(30))).toBe(9);
    expect(noimiRestituire(plecare, cu(24))).toBe(9);
    expect(noimiRestituire(plecare, cu(23.9))).toBe(8);
    expect(noimiRestituire(plecare, cu(12))).toBe(8);
    expect(noimiRestituire(plecare, cu(11))).toBe(7);
    expect(noimiRestituire(plecare, cu(6))).toBe(7);
    expect(noimiRestituire(plecare, cu(5))).toBe(6);
    expect(noimiRestituire(plecare, cu(4))).toBe(6);
    expect(noimiRestituire(plecare, cu(3.99))).toBe(0);
    expect(noimiRestituire(plecare, cu(-1))).toBe(0);
  });
  it('vina noastră → mereu tot; dată greșită → 0', () => {
    expect(noimiRestituire(plecare, cu(-2), true)).toBe(9);
    expect(noimiRestituire('nu e dată', cu(30))).toBe(0);
  });
});

describe('sumaRestituire', () => {
  it('biletul de 135 lei dă exact 135 / 120 / 105 / 90 / 0', () => {
    expect([9, 8, 7, 6, 0].map((n) => sumaRestituire(135, n))).toEqual([135, 120, 105, 90, 0]);
  });
  it('alte prețuri: rotunjit la bani în jos, niciodată peste plată', () => {
    expect(sumaRestituire(100, 8)).toBe(88.88);
    expect(sumaRestituire(283, 6)).toBe(188.66);
    expect(sumaRestituire(135, 12)).toBe(135);
  });
});
