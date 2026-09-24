import { test } from 'node:test';
import assert from 'node:assert/strict';
import { local, ziLucru, offsetLocal } from './ora-locala.mjs';

const hhmm = t => local(t).toISOString().slice(11, 16);

test('vara: UTC+3', () => { assert.equal(hhmm('2026-07-15T10:00:00Z'), '13:00'); });
test('iarna: UTC+2', () => { assert.equal(hhmm('2026-11-15T10:00:00Z'), '12:00'); });
test('miezul nopții iese 00, nu 24', () => { assert.equal(hhmm('2026-07-14T21:30:00Z'), '00:30'); });
test('25.10.2026, ora repetată: 03:30 de două ori, aceeași zi de lucru', () => {
  assert.equal(hhmm('2026-10-25T00:30:00Z'), '03:30');   // încă UTC+3
  assert.equal(hhmm('2026-10-25T01:30:00Z'), '03:30');   // deja UTC+2
  assert.equal(ziLucru('2026-10-25T00:30:00Z'), '2026-10-25');
  assert.equal(ziLucru('2026-10-25T01:30:00Z'), '2026-10-25');
  assert.equal(offsetLocal('2026-10-25T00:59:00Z'), 3 * 3600000);
  assert.equal(offsetLocal('2026-10-25T01:00:00Z'), 2 * 3600000);
});
test('ziua de lucru începe la 03:00 locale', () => {
  assert.equal(ziLucru('2026-09-14T23:30:00Z'), '2026-09-14');   // 02:30 local luni 15 → încă 14
  assert.equal(ziLucru('2026-09-15T00:30:00Z'), '2026-09-15');   // 03:30 local → 15
});
test('acceptă Date, număr și șir', () => {
  const d = new Date('2026-09-15T05:00:00Z');
  assert.equal(hhmm(d), hhmm(+d)); assert.equal(hhmm(d), '08:00');
});
