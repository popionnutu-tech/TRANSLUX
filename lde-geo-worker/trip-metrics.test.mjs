// Teste pentru metricile unei curse (node --test lde-geo-worker/trip-metrics.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectArrival, inRaza, stopsOver, tripKm, tripMetrics } from './trip-metrics.mjs';

const T0 = Math.floor(new Date('2026-09-01T06:00:00Z').getTime() / 1000);
const pt = (sec, lat, lon, speed = 60) => ({ t: T0 + sec, lat, lon, speed });

const CHISINAU = { lat: 47.0105, lon: 28.8638 };
const BALTI = { lat: 47.7615, lon: 27.9291 };

test('inRaza: 500 m înseamnă 500 m, nu 5 km', () => {
  assert.equal(inRaza({ lat: 47.0105, lon: 28.8638 }, CHISINAU, 500), true);
  // ~0.01° latitudine ≈ 1.1 km — în afara razei de 500 m
  assert.equal(inRaza({ lat: 47.0205, lon: 28.8638 }, CHISINAU, 500), false);
});

test('detectArrival întoarce PRIMA intrare în rază, nu ultima', () => {
  const points = [
    pt(0, 47.2, 28.5),          // pe drum
    pt(600, 47.0106, 28.8639),  // sosire
    pt(1200, 47.2, 28.5),       // a ieșit
    pt(1800, 47.0107, 28.8637), // s-a întors
  ];
  assert.equal(detectArrival(points, CHISINAU, 500), T0 + 600);
});

test('detectArrival: fără punct sau fără coordonate → null (nu explodează)', () => {
  const points = [pt(0, 47.0105, 28.8638)];
  assert.equal(detectArrival(points, null, 500), null);
  assert.equal(detectArrival(points, { lat: null, lon: null }, 500), null);
});

test('stopsOver: oprirea în punctul de încărcare NU e abatere', () => {
  const points = [];
  // 40 de minute pe loc, exact la Chișinău (punct de încărcare)
  for (let i = 0; i <= 40; i++) points.push(pt(i * 60, CHISINAU.lat, CHISINAU.lon, 0));
  points.push(pt(45 * 60, 47.2, 28.5, 70));
  assert.deepEqual(stopsOver(points, 30, [CHISINAU], 500), []);
});

test('stopsOver: oprirea lungă în câmp e raportată', () => {
  const points = [];
  for (let i = 0; i <= 40; i++) points.push(pt(i * 60, 47.4, 28.2, 0));
  points.push(pt(45 * 60, 47.5, 28.3, 70));
  const opriri = stopsOver(points, 30, [CHISINAU], 500);
  assert.equal(opriri.length, 1);
  assert.ok(opriri[0].minutes >= 30, `minute: ${opriri[0].minutes}`);
});

test('stopsOver: oprirea de 20 de minute nu depășește pragul', () => {
  const points = [];
  for (let i = 0; i <= 20; i++) points.push(pt(i * 60, 47.4, 28.2, 0));
  points.push(pt(25 * 60, 47.5, 28.3, 70));
  assert.deepEqual(stopsOver(points, 30, [], 500), []);
});

test('tripKm: Chișinău → Bălți în pași curați dă ordinul de mărime corect', () => {
  const points = [];
  const pasi = 40;
  for (let i = 0; i <= pasi; i++) {
    const k = i / pasi;
    points.push(pt(i * 300, CHISINAU.lat + (BALTI.lat - CHISINAU.lat) * k, CHISINAU.lon + (BALTI.lon - CHISINAU.lon) * k, 70));
  }
  const km = tripKm(points);
  assert.ok(km > 100 && km < 130, `km=${km}`);
});

test('tripKm: mai puțin de două puncte → 0, nu NaN', () => {
  assert.equal(tripKm([]), 0);
  assert.equal(tripKm([pt(0, 47, 28)]), 0);
});

test('tripMetrics: întârzierea se numără față de plan, în minute', () => {
  const points = [
    pt(0, CHISINAU.lat, CHISINAU.lon, 0),        // la încărcare, 06:00
    pt(3600, 47.4, 28.4, 70),
    pt(7200, BALTI.lat, BALTI.lon, 0),           // la descărcare, 08:00
  ];
  const m = tripMetrics({
    points,
    loadPoint: CHISINAU,
    unloadPoint: BALTI,
    razaM: 500,
    kmIdeal: 135,
    plannedLoad: '2026-09-01T05:30:00Z',   // planificat cu 30 min mai devreme
    plannedUnload: '2026-09-01T09:00:00Z', // planificat cu o oră mai târziu
  });
  assert.equal(m.load_delay_min, 30);
  assert.equal(m.unload_delay_min, -60);
  assert.equal(m.km_ideal, 135);
  assert.equal(typeof m.km_deviation, 'number');
});

test('tripMetrics: fără furnizor de rutare, km_ideal și abaterea rămân null', () => {
  const points = [pt(0, CHISINAU.lat, CHISINAU.lon, 0), pt(3600, BALTI.lat, BALTI.lon, 0)];
  const m = tripMetrics({
    points, loadPoint: CHISINAU, unloadPoint: BALTI, razaM: 500,
    kmIdeal: null, plannedLoad: '2026-09-01T06:00:00Z', plannedUnload: '2026-09-01T08:00:00Z',
  });
  assert.equal(m.km_ideal, null);
  assert.equal(m.km_deviation, null, 'nu inventăm abaterea față de un traseu necunoscut');
});

test('tripMetrics: descărcarea se caută DUPĂ încărcare, nu înainte', () => {
  // camionul trece pe lângă punctul de descărcare în drum spre încărcare
  const points = [
    pt(0, BALTI.lat, BALTI.lon, 0),          // trecere pe la Bălți, ÎNAINTE de încărcare
    pt(1800, 47.4, 28.4, 70),
    pt(3600, CHISINAU.lat, CHISINAU.lon, 0), // încărcare
    pt(5400, 47.4, 28.4, 70),
    pt(7200, BALTI.lat, BALTI.lon, 0),       // descărcare adevărată
  ];
  const m = tripMetrics({
    points, loadPoint: CHISINAU, unloadPoint: BALTI, razaM: 500,
    plannedLoad: '2026-09-01T07:00:00Z', plannedUnload: '2026-09-01T08:00:00Z',
  });
  assert.equal(m.load_actual_at, new Date((T0 + 3600) * 1000).toISOString());
  assert.equal(m.unload_actual_at, new Date((T0 + 7200) * 1000).toISOString());
});
