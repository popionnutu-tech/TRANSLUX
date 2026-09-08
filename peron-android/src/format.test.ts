import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDateRo, formatDayRo, localDate } from './format.ts';

test('formatDayRo: data din mockup, din string YYYY-MM-DD', () => {
  assert.equal(formatDayRo('2026-09-07'), 'Luni, 7 septembrie');
  assert.equal(formatDayRo('2026-09-08'), 'Marți, 8 septembrie');
});

test('formatDayRo: din Date, fără zero în față la zi', () => {
  assert.equal(formatDayRo(new Date(2026, 0, 4)), 'Duminică, 4 ianuarie');
  assert.equal(formatDayRo(new Date(2026, 11, 31)), 'Joi, 31 decembrie');
  assert.equal(formatDayRo(new Date(2026, 2, 7)), 'Sâmbătă, 7 martie');
});

test('formatDayRo: toate zilele săptămânii în română', () => {
  const seen = [0, 1, 2, 3, 4, 5, 6].map((i) => formatDayRo(new Date(2026, 8, 6 + i)).split(',')[0]);
  assert.deepEqual(seen, ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă']);
});

test('formatDayRo: un string care nu e dată se întoarce neschimbat', () => {
  assert.equal(formatDayRo('azi'), 'azi');
});

test('formatDateRo și localDate rămân ca înainte', () => {
  assert.equal(formatDateRo('2026-09-08'), '08.09.2026');
  assert.equal(localDate(new Date(2026, 8, 8, 23, 59)), '2026-09-08');
});
