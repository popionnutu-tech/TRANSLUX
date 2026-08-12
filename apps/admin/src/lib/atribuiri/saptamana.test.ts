import { describe, it, expect } from 'vitest';
import { weekDates } from './saptamana';

describe('weekDates', () => {
  it('miercuri → săptămâna L 10.08 – D 16.08', () => {
    expect(weekDates('2026-08-12')).toEqual([
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13',
      '2026-08-14', '2026-08-15', '2026-08-16',
    ]);
  });
  it('luni → începe cu ea însăși', () => {
    expect(weekDates('2026-08-10')[0]).toBe('2026-08-10');
  });
  it('duminică → începe cu lunea din urmă', () => {
    expect(weekDates('2026-08-16')).toEqual(weekDates('2026-08-10'));
  });
  it('trecere de an', () => {
    expect(weekDates('2026-01-01')).toEqual([
      '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01',
      '2026-01-02', '2026-01-03', '2026-01-04',
    ]);
  });
});
