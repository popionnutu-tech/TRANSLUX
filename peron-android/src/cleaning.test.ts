import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleaningGateFor, mergeDone, missingZones, nextZone, slotForTime } from './cleaning.ts';
import type { DayResponse } from './types';

type DayLike = Pick<DayResponse, 'point' | 'trips' | 'cleaning' | 'cleaningGateTripTime'>;

function day(over: Partial<DayLike> = {}): DayLike {
  return {
    point: 'CHISINAU',
    trips: [
      { id: 't1', departure_time: '06:55', route_name: 'Chișinău – Bălți', crm_route_id: null, state: 'next' },
      { id: 't2', departure_time: '08:00', route_name: 'Chișinău – Bălți', crm_route_id: null, state: 'locked' },
      { id: 't3', departure_time: '16:25', route_name: 'Chișinău – Bălți', crm_route_id: null, state: 'locked' },
    ],
    cleaning: { DIMINEATA: [], ZIUA: [] },
    cleaningGateTripTime: '16:25',
    ...over,
  };
}

test('slotForTime: până la 12:00 DIMINEATA, apoi ZIUA', () => {
  assert.equal(slotForTime(new Date(2026, 8, 8, 6, 40)), 'DIMINEATA');
  assert.equal(slotForTime(new Date(2026, 8, 8, 11, 59)), 'DIMINEATA');
  assert.equal(slotForTime(new Date(2026, 8, 8, 12, 0)), 'ZIUA');
  assert.equal(slotForTime(new Date(2026, 8, 8, 15, 5)), 'ZIUA');
});

test('missingZones / nextZone în ordinea canonică', () => {
  assert.deepEqual(missingZones([]), ['PERON', 'PIETONI', 'VECEU']);
  assert.deepEqual(missingZones(['VECEU', 'PERON']), ['PIETONI']);
  assert.equal(nextZone(['PERON']), 'PIETONI');
  assert.equal(nextZone(['PERON', 'PIETONI', 'VECEU']), null);
});

test('mergeDone: reuniune fără duplicate, ordonată', () => {
  assert.deepEqual(mergeDone(['VECEU'], ['PERON', 'VECEU']), ['PERON', 'VECEU']);
  assert.deepEqual(mergeDone([], []), []);
});

test('poarta: prima cursă a zilei cere DIMINEATA', () => {
  assert.deepEqual(cleaningGateFor(day(), 't1'), { slot: 'DIMINEATA', missing: ['PERON', 'PIETONI', 'VECEU'] });
  assert.deepEqual(cleaningGateFor(day({ cleaning: { DIMINEATA: ['PERON', 'VECEU'], ZIUA: [] } }), 't1'), { slot: 'DIMINEATA', missing: ['PIETONI'] });
  assert.equal(cleaningGateFor(day({ cleaning: { DIMINEATA: ['PERON', 'PIETONI', 'VECEU'], ZIUA: [] } }), 't1'), null);
});

test('poarta: 16:25 cere ZIUA, restul curselor nu au poartă', () => {
  assert.deepEqual(cleaningGateFor(day(), 't3'), { slot: 'ZIUA', missing: ['PERON', 'PIETONI', 'VECEU'] });
  assert.equal(cleaningGateFor(day({ cleaning: { DIMINEATA: [], ZIUA: ['PERON', 'PIETONI', 'VECEU'] } }), 't3'), null);
  assert.equal(cleaningGateFor(day(), 't2'), null);
  assert.equal(cleaningGateFor(day({ cleaningGateTripTime: null }), 't3'), null);
  assert.equal(cleaningGateFor(day(), 'lipsă'), null);
});

test('poarta: Bălți nu are curățenie', () => {
  assert.equal(cleaningGateFor(day({ point: 'BALTI' }), 't1'), null);
});
