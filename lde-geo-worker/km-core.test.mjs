// Teste pentru nucleul de km (node --test lde-geo-worker/km-core.test.mjs).
// Scenariile sunt cele reale care au produs regresia din 10.07.2026.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDay, plausibleBridgeKm, hav } from './km-core.mjs';

const T0 = new Date('2026-07-28T00:00:00Z').getTime();
const at = (sec) => new Date(T0 + sec * 1000);
const MOVING = 5.6;

// cârpire „naivă" ca înainte de fix: tronsonul-buclă de 180 km lipit pe orice gaură
const bridgeBuclă = () => ({ km: 180, src: 'leg_coord' });
const bridgeDreaptă = (a, b) => ({ km: hav(a, b), src: 'straight_line' });

test('tremurat GPS în parcare: nu se cârpește nimic (regresia 603BRAS)', () => {
  // mașina stă în Florești; coordonatele sar ±1.5 km la fiecare 10 s, viteza 0
  const pts = [];
  for (let i = 0; i < 300; i++) {
    const jitter = i % 2 === 0 ? 0 : 0.015;   // ~1.6 km
    pts.push({ lat: 47.894 + jitter, lon: 28.311, t: at(i * 10), sp: 0 });
  }
  const r = computeDay(pts, { bridgeKm: bridgeBuclă, movingKmh: MOVING });
  assert.equal(r.km, 0, 'o mașină parcată nu poate acumula km');
  assert.equal(r.patched, 0);
});

test('gaură reală de semnal: tronsonul plauzibil se ia întreg, linia dreaptă se plafonează', () => {
  // 30 min fără semnal între două puncte la ~39 km distanță
  const pts = [
    { lat: 47.900, lon: 28.300, t: at(0), sp: 0 },
    { lat: 48.250, lon: 28.300, t: at(1800), sp: 0 },
  ];
  const tronson = computeDay(pts, { bridgeKm: () => ({ km: 48, src: 'leg_coord' }), movingKmh: MOVING });
  assert.equal(tronson.km, 48, 'tronsonul învățat a trecut testul de plauzibilitate → km real de drum');

  // linia dreaptă nu știe traseul: rămâne plafonată fizic (aici gaura e de 700 s)
  const scurt = computeDay(
    [{ lat: 47.9, lon: 28.3, t: at(0), sp: 0 }, { lat: 47.91, lon: 28.3, t: at(700), sp: 0 }],
    { bridgeKm: () => ({ km: 180, src: 'straight_line' }), movingKmh: MOVING },
  );
  assert.equal(scurt.km, 17.5, 'gaură de 700 s → cel mult 17.5 km, nu 180');
});

test('pașii care înghit puncte aruncate sunt marcați (nu se învață ca etalon)', () => {
  const pts = [];
  for (let i = 0; i < 6; i++) pts.push({ lat: 47.0 + i * 0.005, lon: 28.0, t: at(i * 30), sp: 60 });
  pts.splice(3, 0, { lat: 48.5, lon: 29.5, t: at(2 * 30 + 15), sp: 60 });   // vârf
  const r = computeDay(pts, { bridgeKm: bridgeDreaptă, movingKmh: MOVING });
  assert.equal(r.dropped, 1, 'un punct aruncat');
  assert.ok(r.stepDropped.some(Boolean), 'pasul de după vârf e marcat');
});

test('rulaj curat: km = suma pașilor măsurați', () => {
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push({ lat: 47.0 + i * 0.005, lon: 28.0, t: at(i * 30), sp: 60 });
  const r = computeDay(pts, { bridgeKm: bridgeDreaptă, movingKmh: MOVING });
  const așteptat = 9 * hav({ lat: 47.0, lon: 28.0 }, { lat: 47.005, lon: 28.0 });
  assert.ok(Math.abs(r.km - așteptat) < 0.2, `${r.km} ≈ ${așteptat.toFixed(1)}`);
  assert.equal(r.patched, 0);
});

test('un singur punct-vârf în mijlocul rulajului nu adaugă km', () => {
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push({ lat: 47.0 + i * 0.005, lon: 28.0, t: at(i * 30), sp: 60 });
  const curat = computeDay(pts, { bridgeKm: bridgeDreaptă, movingKmh: MOVING }).km;
  pts.splice(5, 0, { lat: 48.5, lon: 29.5, t: at(4 * 30 + 15), sp: 60 });   // vârf: ~200 km într-o clipă
  const cuVârf = computeDay(pts, { bridgeKm: bridgeDreaptă, movingKmh: MOVING }).km;
  assert.ok(Math.abs(cuVârf - curat) < 1, `vârful a adăugat ${(cuVârf - curat).toFixed(1)} km`);
});

test('ancoră mincinoasă: după 3 puncte aruncate se reancorează pe traseul real', () => {
  // primul punct e el însuși glitch; restul sunt un rulaj curat
  const pts = [{ lat: 45.5, lon: 26.5, t: at(0), sp: 0 }];
  for (let i = 0; i < 10; i++) pts.push({ lat: 47.0 + i * 0.005, lon: 28.0, t: at(60 + i * 30), sp: 60 });
  const r = computeDay(pts, { bridgeKm: bridgeDreaptă, movingKmh: MOVING });
  assert.ok(r.km < 10, `km rezonabili după reancorare, nu ${r.km}`);
  assert.ok(r.km > 2, 'traseul real de după ancoră se numără');
});

test('plausibleBridgeKm taie buclele, păstrează ocolurile normale', () => {
  assert.equal(plausibleBridgeKm(180, 0.1), false, 'buclă: capete suprapuse, 180 km');
  assert.equal(plausibleBridgeKm(48, 39), true, 'ocol normal de drum');
  assert.equal(plausibleBridgeKm(3, 1), true, 'tronson scurt în localitate');
});
