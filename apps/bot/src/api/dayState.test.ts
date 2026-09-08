import { describe, expect, it } from 'vitest';
import { nextTripId, tripStates } from './dayState.js';

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
