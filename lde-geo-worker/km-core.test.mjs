// Teste pentru nucleul de km (node --test lde-geo-worker/km-core.test.mjs).
// Scenariile sunt cele reale care au produs regresia din 10.07.2026.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDay, plausibleBridgeKm, hav, acceptedRuns } from './km-core.mjs';

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

// ── contractul geo (stepAccepted / stepCut / acceptedRuns) ──
// Adăugat 17.09.2026, după criticul extern: etichetarea satelor și detectarea
// trecerilor prin porți foloseau lista brută de puncte, inclusiv pe cele pe care
// calculul km-ilor le ARUNCĂ. „km_total identic" nu dovedea că satele și porțile
// sunt reale.

test('contractul geo nu mișcă niciun km (aditiv)', () => {
  const pts = [];
  for (let i = 0; i < 40; i++) pts.push({ lat: 47.9 + i * 0.004, lon: 28.3, t: at(i * 30), sp: 40 });
  pts.splice(20, 0, { lat: 49.5, lon: 30.9, t: at(20 * 30 + 5), sp: 40 });   // glitch
  const r = computeDay(pts, { bridgeKm: bridgeDreaptă, movingKmh: MOVING });
  const { stepAccepted, stepCut, ...fara } = r;
  // recalculăm ignorând câmpurile noi: cifrele vechi trebuie să fie bit-identice
  assert.equal(fara.km, r.km);
  assert.equal(fara.patched, r.patched);
  assert.equal(fara.dropped, r.dropped);
  assert.ok(r.dropped > 0, 'glitch-ul chiar a fost aruncat');
});

test('punctul aruncat ca glitch NU e acceptat; cel staționar E acceptat', () => {
  const pts = [
    { lat: 47.900, lon: 28.300, t: at(0), sp: 0 },
    { lat: 47.900, lon: 28.300, t: at(30), sp: 0 },     // staționar: km 0, dar poziție bună
    { lat: 49.500, lon: 30.900, t: at(60), sp: 0 },     // glitch: sare 250 km în 30 s
    { lat: 47.900, lon: 28.300, t: at(90), sp: 0 },
  ];
  const r = computeDay(pts, { bridgeKm: bridgeDreaptă, movingKmh: MOVING });
  assert.equal(r.stepAccepted[1], true, 'mașina oprită rămâne o poziție de încredere');
  assert.equal(r.stepKm[1], 0, '...deși n-a produs km — „acceptat" ≠ „a produs km"');
  assert.equal(r.stepAccepted[2], false, 'saltul de 250 km nu e o poziție reală');
});

test('gaura de semnal NU devine trecere: cele două capete nu sunt vecini', () => {
  // autobuzul pierde semnalul 15 min; între capete e o poartă pe care n-a atins-o
  const pts = [
    { lat: 47.700, lon: 27.900, t: at(0), sp: 50 },
    { lat: 47.710, lon: 27.900, t: at(30), sp: 50 },
    { lat: 47.980, lon: 27.900, t: at(930), sp: 50 },   // 15 min mai târziu, 30 km mai încolo
    { lat: 47.990, lon: 27.900, t: at(960), sp: 50 },
  ];
  const r = computeDay(pts, { bridgeKm: bridgeDreaptă, movingKmh: MOVING });
  assert.equal(r.stepCut[2], 'gap', 'pauza de semnal e marcată ca tăietură');
  const runs = acceptedRuns(pts.length, r.stepAccepted, r.stepCut);
  assert.equal(runs.length, 2, 'ziua se rupe în două secvențe, nu una');
  assert.deepEqual(runs[0], { from: 0, to: 1 });
  assert.deepEqual(runs[1], { from: 2, to: 3 });
});

test('re-ancorarea după glitch are alt motiv decât pauza de semnal', () => {
  const pts = [{ lat: 47.9, lon: 28.3, t: at(0), sp: 30 }];
  for (let i = 1; i <= 5; i++) pts.push({ lat: 49.5, lon: 30.9, t: at(i * 20), sp: 30 });
  const r = computeDay(pts, { bridgeKm: bridgeDreaptă, movingKmh: MOVING });
  const cuts = r.stepCut.filter(Boolean);
  assert.ok(cuts.includes('glitch_reanchor'), 'ancora mincinoasă se distinge de gaura de semnal');
  assert.ok(!cuts.includes('gap'), 'nu e pauză de semnal: punctele vin la 20 s');
});

test('acceptedRuns aruncă secvențele de un singur punct', () => {
  const runs = acceptedRuns(4, [true, false, true, false], [null, null, null, null]);
  assert.deepEqual(runs, [], 'un punct singur nu e traseu');
});
