import { describe, expect, it } from 'vitest';
import { assertNotDayOff, dayOffText, isDayOff, isoWeekday, nextTripId, tripStates, weekdayName } from './dayState.js';

const trips = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const states = (reported: string[]) => tripStates(trips, new Set(reported)).map((t) => t.state);

describe('tripStates', () => {
  it('nimic raportat → prima e next, restul locked', () => {
    expect(states([])).toEqual(['next', 'locked', 'locked', 'locked']);
  });

  it('toate raportate → toate done, fără next', () => {
    expect(states(['a', 'b', 'c', 'd'])).toEqual(['done', 'done', 'done', 'done']);
    expect(nextTripId(trips, new Set(['a', 'b', 'c', 'd']))).toBeNull();
  });

  it('la mijloc → exact una next, cele de după locked', () => {
    expect(states(['a', 'b'])).toEqual(['done', 'done', 'next', 'locked']);
    expect(nextTripId(trips, new Set(['a', 'b']))).toBe('c');
  });

  it('o cursă sărită (raport anulat) redevine next, chiar dacă cele de după sunt done', () => {
    expect(states(['a', 'c'])).toEqual(['done', 'next', 'done', 'locked']);
  });

  it('păstrează ordinea și id-urile', () => {
    expect(tripStates(trips, new Set(['a'])).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(tripStates([], new Set())).toEqual([]);
  });
});

describe('tripStates cu curse sărite («N-am fost la cursă»)', () => {
  const withSkips = (reported: string[], skipped: string[]) => tripStates(trips, new Set(reported), new Set(skipped)).map((t) => t.state);

  it('cursa sărită e `skipped`, nu `done`, și nu blochează: următoarea devine next', () => {
    expect(withSkips([], ['a'])).toEqual(['skipped', 'next', 'locked', 'locked']);
    expect(nextTripId(trips, new Set(), new Set(['a']))).toBe('b');
  });

  it('Aurel: 06:55 și 07:35 sărite → a treia e next; după raportul ei, a patra', () => {
    expect(withSkips([], ['a', 'b'])).toEqual(['skipped', 'skipped', 'next', 'locked']);
    expect(withSkips(['c'], ['a', 'b'])).toEqual(['skipped', 'skipped', 'done', 'next']);
    expect(nextTripId(trips, new Set(['c']), new Set(['a', 'b']))).toBe('d');
  });

  it('toate închise (raportate sau sărite) → fără next', () => {
    expect(withSkips(['a', 'c'], ['b', 'd'])).toEqual(['done', 'skipped', 'done', 'skipped']);
    expect(nextTripId(trips, new Set(['a', 'c']), new Set(['b', 'd']))).toBeNull();
  });

  it('raportată ȘI sărită (de la 10.09 sărirea scrie și cifra în reports) → câștigă `skipped`', () => {
    expect(withSkips(['a'], ['a'])).toEqual(['skipped', 'next', 'locked', 'locked']);
  });
});

describe('zi fără operator (config.noOperatorWeekdays: vineri la Chișinău)', () => {
  it('isoWeekday: luni = 1 … duminică = 7', () => {
    expect(isoWeekday('2026-06-08')).toBe(1); // luni
    expect(isoWeekday('2026-06-12')).toBe(5); // vineri
    expect(isoWeekday('2026-06-14')).toBe(7); // duminică
    expect(weekdayName('2026-06-12')).toBe('vineri');
  });

  it('vineri: Chișinău liber cu textul ecranului; Bălți lucrează; joi nimeni nu e liber', () => {
    expect(isDayOff('CHISINAU', '2026-06-12')).toBe(true);
    expect(dayOffText('CHISINAU', '2026-06-12')).toBe('Vineri: zi fără operator la Chișinău');
    expect(isDayOff('BALTI', '2026-06-12')).toBe(false);
    expect(dayOffText('BALTI', '2026-06-12')).toBeNull();
    expect(isDayOff('CHISINAU', '2026-06-11')).toBe(false);
    expect(dayOffText('CHISINAU', '2026-06-11')).toBeNull();
  });

  it('assertNotDayOff: 409 DAY_OFF vineri la Chișinău, tace în rest', () => {
    expect(() => assertNotDayOff('CHISINAU', '2026-06-11')).not.toThrow();
    expect(() => assertNotDayOff('BALTI', '2026-06-12')).not.toThrow();
    try {
      assertNotDayOff('CHISINAU', '2026-06-12');
      throw new Error('trebuia să arunce');
    } catch (e: any) {
      expect(e.status).toBe(409);
      expect(e.code).toBe('DAY_OFF');
      expect(e.message).toContain('Vineri: zi fără operator la Chișinău');
    }
  });
});
