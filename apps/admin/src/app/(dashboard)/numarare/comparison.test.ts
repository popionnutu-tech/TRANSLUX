import { describe, it, expect } from 'vitest';
import { buildComparisonRows, type ComparisonRow } from './comparison';

describe('buildComparisonRows', () => {
  it('returns rows for each stop present in operator or audit', () => {
    const operator = [
      { stopOrder: 1, stopNameRo: 'A', totalPassengers: 10, alighted: 0, shortSum: 0 },
      { stopOrder: 2, stopNameRo: 'B', totalPassengers: 15, alighted: 2, shortSum: 1 },
    ];
    const audit = [
      { stopOrder: 1, stopNameRo: 'A', totalPassengers: 10, alighted: 0, shortSum: 0 },
      { stopOrder: 2, stopNameRo: 'B', totalPassengers: 14, alighted: 2, shortSum: 1 },
    ];

    const rows = buildComparisonRows(operator, audit);

    expect(rows).toHaveLength(2);
    expect(rows[0].hasDiff).toBe(false);
    expect(rows[1].hasDiff).toBe(true);
    expect(rows[1].deltaTotal).toBe(-1);
  });

  it('handles missing entries in audit', () => {
    const operator = [
      { stopOrder: 1, stopNameRo: 'A', totalPassengers: 10, alighted: 0, shortSum: 0 },
    ];
    const audit: typeof operator = [];
    const rows = buildComparisonRows(operator, audit);
    expect(rows).toHaveLength(1);
    expect(rows[0].auditTotal).toBeNull();
    expect(rows[0].hasDiff).toBe(true);
  });

  it('handles missing entries in operator', () => {
    const operator: any[] = [];
    const audit = [
      { stopOrder: 1, stopNameRo: 'A', totalPassengers: 10, alighted: 0, shortSum: 0 },
    ];
    const rows = buildComparisonRows(operator, audit);
    expect(rows).toHaveLength(1);
    expect(rows[0].operatorTotal).toBeNull();
    expect(rows[0].hasDiff).toBe(true);
  });

  it('sorts by stopOrder', () => {
    const operator = [
      { stopOrder: 3, stopNameRo: 'C', totalPassengers: 5, alighted: 0, shortSum: 0 },
      { stopOrder: 1, stopNameRo: 'A', totalPassengers: 10, alighted: 0, shortSum: 0 },
    ];
    const audit = [
      { stopOrder: 2, stopNameRo: 'B', totalPassengers: 7, alighted: 0, shortSum: 0 },
    ];
    const rows = buildComparisonRows(operator, audit);
    expect(rows.map(r => r.stopOrder)).toEqual([1, 2, 3]);
  });
});
