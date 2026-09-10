import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleaningGateFor, mergeDone, missingZones, nextZone, slotForTime } from './cleaning.ts';
import type { DayResponse } from './types';

type DayLike = Pick<DayResponse, 'point' | 'trips' | 'cleaning' | 'cleaningGateTripTime'>;

function day(over: Partial<DayLike> = {}): DayLike {
  return {
    point: 'CHISINAU',
    trips: [
      { id: 't1', departure_time: '06:55', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'next' },
      { id: 't2', departure_time: '08:00', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'locked' },
      { id: 't3', departure_time: '16:25', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'locked' },
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

test('poarta: DIMINEATA e la prima cursă raportată efectiv — cursele sărite nu contează (scenariul Aurel)', () => {
  const skipped = day({
    trips: [
      { id: 't1', departure_time: '06:55', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'skipped' },
      { id: 't2', departure_time: '07:35', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'skipped' },
      { id: 't3', departure_time: '08:15', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'next' },
      { id: 't4', departure_time: '16:25', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'locked' },
    ],
  });
  assert.deepEqual(cleaningGateFor(skipped, 't3'), { slot: 'DIMINEATA', missing: ['PERON', 'PIETONI', 'VECEU'] });
  // după setul de dimineață poarta dispare
  assert.equal(cleaningGateFor({ ...skipped, cleaning: { DIMINEATA: ['PERON', 'PIETONI', 'VECEU'], ZIUA: [] } }, 't3'), null);
});

test('poarta: după o cursă raportată, cursele obișnuite nu mai cer DIMINEATA', () => {
  const d = day({
    trips: [
      { id: 't1', departure_time: '06:55', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'done' },
      { id: 't2', departure_time: '07:35', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'next' },
      { id: 't3', departure_time: '16:25', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'locked' },
    ],
  });
  assert.equal(cleaningGateFor(d, 't2'), null);
});

test('poarta: 16:25 cere ZIUA, restul curselor nu au poartă', () => {
  const d = day({
    trips: [
      { id: 't1', departure_time: '06:55', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'done' },
      { id: 't2', departure_time: '08:00', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'done' },
      { id: 't3', departure_time: '16:25', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'next' },
      { id: 't4', departure_time: '16:45', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'locked' },
    ],
  });
  assert.deepEqual(cleaningGateFor(d, 't3'), { slot: 'ZIUA', missing: ['PERON', 'PIETONI', 'VECEU'] });
  assert.equal(cleaningGateFor({ ...d, cleaning: { DIMINEATA: [], ZIUA: ['PERON', 'PIETONI', 'VECEU'] } }, 't3'), null);
  assert.equal(cleaningGateFor(d, 't2'), null);
  assert.equal(cleaningGateFor(d, 't4'), null);
  assert.equal(cleaningGateFor({ ...d, cleaningGateTripTime: null }, 't3'), null);
  assert.equal(cleaningGateFor(d, 'lipsă'), null);
});

test('poarta: 16:25 sărită → ZIUA se cere la prima cursă de după ea', () => {
  const trips = (afterGate: 'next' | 'done', last: 'locked' | 'next') => [
    { id: 't1', departure_time: '06:55', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'done' as const },
    { id: 't2', departure_time: '16:25', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: 'skipped' as const },
    { id: 't3', departure_time: '16:45', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: afterGate },
    { id: 't4', departure_time: '17:20', route_name: 'Chișinău – Bălți', crm_route_id: null, passengers: null, state: last },
  ];
  assert.deepEqual(cleaningGateFor(day({ trips: trips('next', 'locked') }), 't3'), { slot: 'ZIUA', missing: ['PERON', 'PIETONI', 'VECEU'] });
  // 16:45 raportată între timp → 17:20 nu mai are poartă
  assert.equal(cleaningGateFor(day({ trips: trips('done', 'next') }), 't4'), null);
  // setul ZIUA complet → nimic
  assert.equal(cleaningGateFor(day({ trips: trips('next', 'locked'), cleaning: { DIMINEATA: [], ZIUA: ['PERON', 'PIETONI', 'VECEU'] } }), 't3'), null);
});

test('poarta: Bălți nu are curățenie', () => {
  assert.equal(cleaningGateFor(day({ point: 'BALTI' }), 't1'), null);
});
