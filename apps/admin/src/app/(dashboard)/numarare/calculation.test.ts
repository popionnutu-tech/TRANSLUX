import { describe, it, expect } from 'vitest';
import { isWithinGrace, GRACE_MINUTES, suburbanFareRound } from './calculation';

describe('suburbanFareRound — regula 0.20 (≤0.20 în jos, >0.20 în sus)', () => {
  it('7.02 → 7 (6 km × 1.17)', () => {
    expect(suburbanFareRound(6, 1.17)).toBe(7);
  });

  it('9.36 → 10 (8 km × 1.17)', () => {
    expect(suburbanFareRound(8, 1.17)).toBe(10);
  });

  it('14.04 → 14 (12 km × 1.17)', () => {
    expect(suburbanFareRound(12, 1.17)).toBe(14);
  });

  it('7.20 → 7 (limita exactă merge în jos)', () => {
    expect(suburbanFareRound(7.2, 1)).toBe(7);
  });

  it('7.21 → 8 (imediat peste limită merge în sus)', () => {
    expect(suburbanFareRound(7.21, 1)).toBe(8);
  });

  it('7.25 → 8', () => {
    expect(suburbanFareRound(7.25, 1)).toBe(8);
  });

  it('tarif exact întreg rămâne neschimbat (10 km × 1.00 = 10)', () => {
    expect(suburbanFareRound(10, 1)).toBe(10);
  });

  it('zgomot de virgulă mobilă: 6 km × 1.2 = 7.2 → 7 (nu 8)', () => {
    expect(suburbanFareRound(6, 1.2)).toBe(7);
  });

  it('0 km → 0 lei', () => {
    expect(suburbanFareRound(0, 1.17)).toBe(0);
  });
});

describe('isWithinGrace', () => {
  const now = new Date('2026-06-10T10:00:00.000Z');

  it('NULL completed_at => expirat (sesiuni vechi)', () => {
    expect(isWithinGrace(null, now)).toBe(false);
  });

  it('în fereastră la 9 min 59 s după finalizare', () => {
    expect(isWithinGrace('2026-06-10T09:50:01.000Z', now)).toBe(true);
  });

  it('expirat la exact 10:00 după finalizare (limită strictă)', () => {
    expect(isWithinGrace('2026-06-10T09:50:00.000Z', now)).toBe(false);
  });

  it('expirat la 10 min 1 s după finalizare', () => {
    expect(isWithinGrace('2026-06-10T09:49:59.000Z', now)).toBe(false);
  });

  it('imediat după finalizare => în fereastră', () => {
    expect(isWithinGrace(now.toISOString(), now)).toBe(true);
  });

  it('timestamp invalid => expirat', () => {
    expect(isWithinGrace('not-a-date', now)).toBe(false);
  });

  it('GRACE_MINUTES este 10', () => {
    expect(GRACE_MINUTES).toBe(10);
  });
});
