import { describe, it, expect } from 'vitest';
import {
  addDays, daysInclusive, previousPeriod, sameRangeLastYear, shiftYear, clampToData,
  unreliableOverlap, isUnreliableMonth, pctChange, anomalousDays, median, retentionIndex,
  retentionLabel, presetRange, shiftMonth,
} from './periods';

describe('perioade', () => {
  it('zile și perioada anterioară', () => {
    expect(daysInclusive({ from: '2026-09-01', to: '2026-09-30' })).toBe(30);
    expect(previousPeriod({ from: '2026-09-01', to: '2026-09-30' })).toEqual({ from: '2026-08-02', to: '2026-08-31' });
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('anul trecut, inclusiv 29 februarie', () => {
    expect(sameRangeLastYear({ from: '2026-06-01', to: '2026-09-30' })).toEqual({ from: '2025-06-01', to: '2025-09-30' });
    expect(shiftYear('2024-02-29', 1)).toBe('2025-02-28');
    expect(shiftYear('2025-02-28', -1)).toBe('2024-02-28');
  });
  it('luna parțială se compară pe aceleași zile', () => {
    expect(clampToData({ from: '2026-09-01', to: '2026-09-30' }, '2026-09-18')).toEqual({ from: '2026-09-01', to: '2026-09-18' });
    expect(clampToData({ from: '2026-08-01', to: '2026-08-31' }, '2026-09-18')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });
  it('shiftMonth peste an', () => {
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
    expect(shiftMonth('2025-12-01', 2)).toBe('2026-02-01');
  });
});

describe('perioada nesigură (sincronizare în bloc)', () => {
  it('decembrie 2025 și ianuarie 2026 sunt nesigure, februarie nu', () => {
    expect(isUnreliableMonth('2025-12')).toBe(true);
    expect(isUnreliableMonth('2026-01')).toBe(true);
    expect(isUnreliableMonth('2026-02')).toBe(false);
    expect(isUnreliableMonth('2025-11')).toBe(false);
  });
  it('intervalul care atinge perioada', () => {
    expect(unreliableOverlap({ from: '2026-01-10', to: '2026-02-10' })).not.toBeNull();
    expect(unreliableOverlap({ from: '2026-01-18', to: '2026-02-28' })).toBeNull();
  });
});

describe('zile anormale', () => {
  it('prinde ziua sincronizării în bloc', () => {
    const daily = Array.from({ length: 30 }, (_, i) => ({ d: addDays('2026-01-01', i), tickets: 700 + (i % 5) * 10 }));
    daily[15] = { d: daily[15].d, tickets: 17924 };
    const a = anomalousDays(daily);
    expect(a.map(x => x.d)).toEqual([daily[15].d]);
  });
  it('mediana', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('indicatori', () => {
  it('variația procentuală', () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(5, 0)).toBeNull();
  });
  it('indicele ține clienții', () => {
    expect(retentionIndex(120, 100)).toBeCloseTo(1.2);
    expect(retentionLabel(1.2).tone).toBe('good');
    expect(retentionLabel(1).tone).toBe('ok');
    expect(retentionLabel(0.8).tone).toBe('bad');
    expect(retentionLabel(null).tone).toBe('na');
  });
  it('presetări raportate la ultima zi cu date', () => {
    expect(presetRange('luna_curenta', '2026-09-30')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('luna_trecuta', '2026-09-30')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(presetRange('ultimele_30', '2026-09-30')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });
});
