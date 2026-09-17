import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDay, hav } from './km-core.mjs';
import { simplifica, dp, PLAFON_PUNCTE } from './geom-simplify.mjs';

const T0 = Date.UTC(2026, 8, 16, 3, 0);
const at = (min) => new Date(T0 + min * 60000);

test('linia dreaptă se reduce la două capete', () => {
  const pts = [];
  for (let i = 0; i < 50; i++) pts.push({ lat: 47 + i * 0.001, lon: 28, t: at(i), sp: 40 });
  assert.deepEqual(dp(pts, 0, 49, 20), [0, 49]);
});

test('geometria se rupe la pauza de semnal — MultiLineString, nu o dreaptă peste gaură', () => {
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push({ lat: 47 + i * 0.002, lon: 28, t: at(i), sp: 40 });
  for (let i = 0; i < 10; i++) pts.push({ lat: 47.3 + i * 0.002, lon: 28, t: at(30 + i), sp: 40 });
  const calc = computeDay(pts, { bridgeKm: (a, b) => ({ km: hav(a, b), src: 'straight_line' }), movingKmh: 5.6 });
  const g = simplifica(pts, calc, 0, pts.length - 1);
  assert.equal(g.type, 'MultiLineString');
  assert.equal(g.coordinates.length, 2, 'două părți, nu una trasă peste gaura de 30 de minute');
});

test('plafonul de puncte se respectă, crescând toleranța', () => {
  const pts = [];
  for (let i = 0; i < 1200; i++) pts.push({ lat: 47 + i * 0.0004 + (i % 2) * 0.0009, lon: 28 + i * 0.0004, t: at(i / 2), sp: 40 });
  const calc = computeDay(pts, { bridgeKm: (a, b) => ({ km: hav(a, b), src: 'straight_line' }), movingKmh: 5.6 });
  const g = simplifica(pts, calc, 0, pts.length - 1);
  for (const linie of g.coordinates) assert.ok(linie.length <= PLAFON_PUNCTE, `${linie.length} puncte, plafon ${PLAFON_PUNCTE}`);
});

test('interval prea scurt → null, nu o geometrie de un punct', () => {
  const pts = [{ lat: 47, lon: 28, t: at(0), sp: 0 }, { lat: 47, lon: 28, t: at(1), sp: 0 }];
  const calc = computeDay(pts, { bridgeKm: (a, b) => ({ km: hav(a, b), src: 'straight_line' }), movingKmh: 5.6 });
  assert.ok(simplifica(pts, calc, 0, 0) === null);
});
