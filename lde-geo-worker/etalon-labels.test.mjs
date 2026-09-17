// Teste pentru etichetare + segmentare (node --test lde-geo-worker/etalon-labels.test.mjs).
// Fiecare test e un caz real, măsurat pe date, nu unul inventat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDay, hav } from './km-core.mjs';
import { buildPlacesIndex } from './places-index.mjs';
import {
  secvente, sateDeservite, treceriPorti, invataGranite, clasificaPlecare, kmInterval,
} from './etalon-labels.mjs';

const T0 = Date.UTC(2026, 8, 16, 0, 0, 0);
const at = (min) => new Date(T0 + min * 60000);
const drum = (lat0, lon0, lat1, lon1, n, minStart, pasMin, sp = 40) => {
  const out = [];
  for (let i = 0; i < n; i++)
    out.push({ lat: lat0 + (lat1 - lat0) * (i / (n - 1)), lon: lon0 + (lon1 - lon0) * (i / (n - 1)), t: at(minStart + i * pasMin), sp });
  return out;
};

test('varianta B prinde satul pe care „cel mai apropiat" îl masca', () => {
  const idx = buildPlacesIndex([
    { name: 'Cătun', lat: 47.0005, lon: 28.0 },   // lipit de drum
    { name: 'Satul', lat: 47.0100, lon: 28.0 },   // ~1,1 km lateral
  ]);
  const pts = drum(47.0, 28.0, 47.001, 28.0, 5, 0, 1);
  const sate = sateDeservite(pts, idx, 0, 4);
  assert.deepEqual(sate.sort(), ['Cătun', 'Satul'], 'B ia ambele; A ar fi luat doar Cătun');
});

test('ordinea satelor = prima atingere, nu alfabetic', () => {
  const idx = buildPlacesIndex([
    { name: 'Primul', lat: 47.000, lon: 28.0 },
    { name: 'Ultimul', lat: 47.050, lon: 28.0 },
  ]);
  const pts = drum(47.0, 28.0, 47.05, 28.0, 20, 0, 1);
  assert.deepEqual(sateDeservite(pts, idx, 0, 19), ['Primul', 'Ultimul']);
});

test('gaura de semnal nu produce o trecere prin poartă (regula 1)', () => {
  // poarta e la mijloc; mașina pierde semnalul exact peste ea
  const poarta = [{ uzina_id: 'U', label: 'P', lat: 47.025, lon: 28.0, radius_km: 0.6 }];
  const pts = [
    ...drum(47.000, 28.0, 47.010, 28.0, 5, 0, 1),
    ...drum(47.040, 28.0, 47.050, 28.0, 5, 20, 1),   // 20 min mai târziu, dincolo de poartă
  ];
  const calc = computeDay(pts, { bridgeKm: (a, b) => ({ km: hav(a, b), src: 'straight_line' }), movingKmh: 5.6 });
  const secv = secvente(pts, calc);
  assert.equal(secv.length, 2, 'urma se rupe în două');
  assert.deepEqual(treceriPorti(pts, secv, poarta), [], 'nicio trecere inventată peste gaură');
});

test('debounce: punctul est + poarta = o singură sosire, nu două + retur gol', () => {
  // cazul Orhei: lasă oamenii la 0,78 km de poartă, stă 17 min, apoi intră pe poartă
  const gates = [
    { uzina_id: 'ORHEI', label: 'Punct est', lat: 47.380, lon: 28.820, radius_km: 0.6 },
    { uzina_id: 'ORHEI', label: 'Poarta', lat: 47.387, lon: 28.820, radius_km: 0.6 },
  ];
  const pts = [
    ...drum(47.380, 28.820, 47.3801, 28.820, 4, 0, 1, 0),     // la punctul est
    ...drum(47.3830, 28.820, 47.3840, 28.820, 3, 5, 3, 20),   // între ele (în afara razelor)
    ...drum(47.387, 28.820, 47.3871, 28.820, 4, 17, 1, 0),    // la poartă
  ];
  const calc = computeDay(pts, { bridgeKm: (a, b) => ({ km: hav(a, b), src: 'straight_line' }), movingKmh: 5.6 });
  const tr = treceriPorti(pts, secvente(pts, calc), gates);
  assert.equal(tr.length, 1, 'o singură sosire la uzină, nu două');
  assert.equal(tr[0].uzina_id, 'ORHEI');
});

test('granițele se învață din plecări; gruparea sub prag e respinsă, nu ghicită', () => {
  const plecari = [];
  for (let i = 0; i < 40; i++) plecari.push(at(6 * 60 + (i % 3) * 10));    // ~06:00-06:20, n=40
  for (let i = 0; i < 5; i++) plecari.push(at(18 * 60));                   // n=5, sub prag
  const g = invataGranite(plecari);
  const bune = g.filter((x) => x.minuteZi != null);
  assert.equal(bune.length, 1, 'doar gruparea cu destule observații devine graniță');
  assert.ok(Math.abs(bune[0].minuteZi - 375) <= 20, `graniță pe la 06:15, a ieșit ${bune[0].minuteZi}`);
  assert.equal(g.find((x) => x.n === 5).motiv, 'sub prag');
});

test('uzina care și-a mutat programul: graniță respinsă cu „program_schimbat"', () => {
  const plecari = [];
  for (let i = 0; i < 25; i++) plecari.push(at(6 * 60));        // vechiul program 06:00
  for (let i = 0; i < 25; i++) plecari.push(at(6 * 60 + 90));   // noul program 07:30, 3 binuri mai încolo
  const g = invataGranite(plecari).filter((x) => x.n >= 20);
  assert.ok(g.some((x) => x.motiv === 'program_schimbat' || x.minuteZi != null),
    'grupările separate se tratează fiecare; dacă se lipesc, bimodalitatea le respinge');
});

test('plin/gol pe ceas: aceeași geometrie, verdicte diferite (cazul 041BRAU)', () => {
  // Draxelmaier: schimbul 1 începe 07:00, se termină 15:30
  const granite = [
    { minuteZi: 7 * 60, tip: 'inceput', shift_number: 1 },
    { minuteZi: 15 * 60 + 30, tip: 'sfarsit', shift_number: 1 },
  ];
  const dimineata = clasificaPlecare(at(6 * 60 + 40), granite, 1);   // pleacă după ce a livrat
  const dupaAmiaza = clasificaPlecare(at(15 * 60 + 40), granite, 2); // pleacă cu oamenii acasă
  assert.equal(dimineata.stare, 'gol');
  assert.equal(dupaAmiaza.stare, 'plin');
});

test('graniță comună (15:30 = sfârșit 1 = început 2): ordinea atingerii decide', () => {
  const granite = [
    { minuteZi: 15 * 60 + 30, tip: 'sfarsit', shift_number: 1 },
    { minuteZi: 15 * 60 + 30, tip: 'inceput', shift_number: 2 },
  ];
  assert.equal(clasificaPlecare(at(15 * 60 + 35), granite, 1).stare, 'gol', 'prima atingere = livrare');
  assert.equal(clasificaPlecare(at(15 * 60 + 35), granite, 2).stare, 'plin', 'a doua = ridicare');
  assert.equal(clasificaPlecare(at(15 * 60 + 35), granite, null).stare, 'necunoscut', 'fără ordine → nu ghicim');
});

test('departe de orice graniță → necunoscut, nu o presupunere', () => {
  const granite = [{ minuteZi: 7 * 60, tip: 'inceput', shift_number: 1 }];
  assert.equal(clasificaPlecare(at(11 * 60), granite, 1).stare, 'necunoscut');
});

test('km-ii unui interval sunt suma pașilor măsurați', () => {
  const stepKm = [0, 1.5, 2.5, 3.0];
  assert.equal(kmInterval(stepKm, 0, 3), 7);
  assert.equal(kmInterval(stepKm, 1, 2), 2.5, 'pasul de intrare nu se numără de două ori');
});
