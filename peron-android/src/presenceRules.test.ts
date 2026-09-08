import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUEUE_MAX_LENGTH, nextAction, planFromDay, planFromStorage, pruneQueue, shouldTrack } from './presenceRules.ts';
import type { PresencePing } from './types';

const window = { from: '06:25', to: '23:30' };

test('shouldTrack: în fereastră inclusiv la capete, în afara ei nu', () => {
  assert.equal(shouldTrack('06:25', window), true);
  assert.equal(shouldTrack('12:00', window), true);
  assert.equal(shouldTrack('23:30', window), true);
  assert.equal(shouldTrack('06:24', window), false);
  assert.equal(shouldTrack('23:31', window), false);
  assert.equal(shouldTrack('00:10', window), false);
});

test('shouldTrack: fără fereastră sau cu fereastră stricată → fals', () => {
  assert.equal(shouldTrack('12:00', null), false);
  assert.equal(shouldTrack('12:00', undefined), false);
  assert.equal(shouldTrack('12:00', { from: '6:25', to: '23:30' }), false);
  assert.equal(shouldTrack('noon', window), false);
});

test('planFromDay: ia data, fereastra, stația și punctul din /day', () => {
  const plan = planFromDay({ date: '2026-09-08', presenceWindow: window, station: { lat: 47.02, lon: 28.83, radiusM: 150 }, point: 'CHISINAU' });
  assert.deepEqual(plan, { date: '2026-09-08', window, station: { lat: 47.02, lon: 28.83, radiusM: 150 }, point: 'CHISINAU' });
  assert.equal(planFromDay({ date: '2026-09-08', presenceWindow: null, station: { lat: 0, lon: 0, radiusM: 1 }, point: 'BALTI' }).window, null);
});

test('planFromStorage: planul de azi trece, cel de ieri nu', () => {
  const raw = { date: '2026-09-08', window, station: { lat: 47.02, lon: 28.83, radiusM: 150 }, point: 'BALTI' };
  assert.deepEqual(planFromStorage(raw, '2026-09-08'), raw);
  assert.equal(planFromStorage(raw, '2026-09-09'), null);
});

test('planFromStorage: zi fără curse (fereastră null) e un plan valid; plan vechi fără point → point null', () => {
  assert.deepEqual(planFromStorage({ date: '2026-09-08', window: null, station: null }, '2026-09-08'), {
    date: '2026-09-08',
    window: null,
    station: null,
    point: null,
  });
});

test('planFromStorage: gunoi → null', () => {
  assert.equal(planFromStorage(null, '2026-09-08'), null);
  assert.equal(planFromStorage('x', '2026-09-08'), null);
  assert.equal(planFromStorage({ date: '2026-09-08', window: { from: 'a', to: 'b' }, station: null }, '2026-09-08'), null);
  assert.equal(planFromStorage({ date: '2026-09-08', window, station: { lat: '47' } }, '2026-09-08'), null);
});

test('nextAction: în fereastră pornește doar dacă nu e pornit și avem permisiunea', () => {
  assert.equal(nextAction({ inWindow: true, tracking: false, permitted: true }), 'start');
  assert.equal(nextAction({ inWindow: true, tracking: true, permitted: true }), 'keep');
  assert.equal(nextAction({ inWindow: true, tracking: false, permitted: false }), 'keep');
  assert.equal(nextAction({ inWindow: true, tracking: true, permitted: false }), 'keep');
});

test('nextAction: în afara ferestrei oprește doar dacă e pornit', () => {
  assert.equal(nextAction({ inWindow: false, tracking: true, permitted: true }), 'stop');
  assert.equal(nextAction({ inWindow: false, tracking: true, permitted: false }), 'stop');
  assert.equal(nextAction({ inWindow: false, tracking: false, permitted: true }), 'keep');
});

test('pruneQueue: aruncă ce e mai vechi de o zi și ce nu se parsează, taie la cele mai noi 1500', () => {
  const now = new Date('2026-09-08T12:00:00Z');
  const ping = (at: string): PresencePing => ({ at, lat: 47, lon: 28, accuracyM: 10 });
  const kept = pruneQueue([ping('2026-09-07T11:59:00Z'), ping('2026-09-07T12:01:00Z'), ping('bad'), ping('2026-09-08T11:58:00Z')], now);
  assert.deepEqual(
    kept.map((p) => p.at),
    ['2026-09-07T12:01:00Z', '2026-09-08T11:58:00Z'],
  );
  const many = Array.from({ length: QUEUE_MAX_LENGTH + 5 }, (_, i) => ping(new Date(now.getTime() - (QUEUE_MAX_LENGTH + 5 - i) * 1000).toISOString()));
  const cut = pruneQueue(many, now);
  assert.equal(cut.length, QUEUE_MAX_LENGTH);
  assert.equal(cut[cut.length - 1]?.at, many[many.length - 1]?.at);
});
