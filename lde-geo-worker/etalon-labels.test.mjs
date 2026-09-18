// Teste pentru etichetare + segmentare (node --test lde-geo-worker/etalon-labels.test.mjs).
// Fiecare test e un caz real, măsurat pe date, nu unul inventat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDay, hav } from './km-core.mjs';
import { buildPlacesIndex } from './places-index.mjs';
import {
  secvente, sateDeservite, treceriPorti, invataGranite, imperecheazaTreceri,
  stareApropiere, starePlecare, kmInterval, segmenteZi,
} from './etalon-labels.mjs';

const T0 = Date.UTC(2026, 8, 16, 0, 0, 0) - 3 * 3600000;   // 00:00 ora Chișinăului (UTC+3 vara)
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

test('granița se învață în fereastra ei; sub prag e respinsă, nu ghicită', () => {
  const plecari = [];
  for (let i = 0; i < 40; i++) plecari.push(at(6 * 60 + (i % 3) * 10));    // ~06:00-06:20, n=40
  for (let i = 0; i < 5; i++) plecari.push(at(18 * 60));                   // altă oră, n=5
  const g = invataGranite(plecari, 6 * 60);
  assert.ok(Math.abs(g.minuteZi - 370) <= 20, `graniță pe la 06:10, a ieșit ${g.minuteZi}`);
  assert.equal(g.n, 40, 'plecările din altă parte a zilei nu intră în fereastră');
  assert.equal(invataGranite(plecari, 18 * 60).motiv, 'sub prag');
});

test('uzina mare nu mai iese „bimodală" doar fiindcă are trafic toată ziua', () => {
  // Draxelmaier: 39 de mașini ating poarta la toate orele, deci binurile nu se despart
  // nicăieri. Varianta veche grupa ziua întreagă și respingea TOT ca program_schimbat.
  const plecari = [];
  for (let h = 5; h < 24; h++) for (let i = 0; i < 6; i++) plecari.push(at(h * 60 + i * 9));
  for (let i = 0; i < 30; i++) plecari.push(at(7 * 60 + 10));   // vârful real al graniței
  const g = invataGranite(plecari, 7 * 60);
  assert.equal(g.motiv, null, 'traficul de peste zi nu e o mutare de program');
  assert.ok(Math.abs(g.minuteZi - 430) <= 25, `graniță pe la 07:10, a ieșit ${g.minuteZi}`);
});

test('uzina care și-a mutat programul: graniță respinsă cu „program_schimbat"', () => {
  const plecari = [];
  for (let i = 0; i < 25; i++) plecari.push(at(6 * 60));        // vechiul program 06:00
  for (let i = 0; i < 25; i++) plecari.push(at(6 * 60 + 90));   // noul, 3 binuri mai încolo
  const g = invataGranite(plecari, 6 * 60 + 45, { fereastraMin: 120 });
  assert.equal(g.motiv, 'program_schimbat', 'nu se mediază între cele două vârfuri');
  assert.equal(g.minuteZi, null);
});

const trecere = (h, m = 0, durata = 30) => ({ tIn: at(h * 60 + m), tOut: at(h * 60 + m + durata) });

test('plin/gol pe ceas: aceeași geometrie, verdicte diferite (cazul 041BRAU)', () => {
  // Draxelmaier: schimbul 1 începe 07:00, se termină 15:30
  const granite = [
    { minuteZi: 7 * 60, tip: 'inceput', shift_number: 1 },
    { minuteZi: 15 * 60 + 30, tip: 'sfarsit', shift_number: 1 },
  ];
  // atinge poarta la 06:20 (aduce schimbul) și la 15:10-15:40 (vine să-l ia)
  const p = imperecheazaTreceri([trecere(6, 20), trecere(15, 10)], granite, [1]);
  assert.equal(p[0].livrare?.shift_number, 1);
  assert.equal(p[1].ridicare?.shift_number, 1);
  assert.equal(stareApropiere(p[0]).stare, 'plin', 'dimineața a adus oamenii');
  assert.equal(starePlecare(p[0]).stare, 'gol', 'și pleacă goală de la poartă');
  assert.equal(stareApropiere(p[1]).stare, 'gol', 'după-amiază vine goală după ei');
  assert.equal(starePlecare(p[1]).stare, 'plin', 'și pleacă cu ei acasă');
});

test('o oprire la poartă poate fi ȘI livrare, ȘI ridicare — cazul spus de Ion', () => {
  // «când ruta nu se repetă în toate schimburile, el la tur aduce o rută, iar în același
  // retur ea altă rută; ruta care a adus-o acum, la retur o ia peste 8 ore».
  // Draxelmaier, 15:30 = sfârșitul schimbului 1 = începutul schimbului 2.
  const granite = [
    { minuteZi: 7 * 60, tip: 'inceput', shift_number: 1 },
    { minuteZi: 15 * 60 + 30, tip: 'sfarsit', shift_number: 1 },
    { minuteZi: 15 * 60 + 30, tip: 'inceput', shift_number: 2 },
    { minuteZi: 0, tip: 'sfarsit', shift_number: 2 },
  ];
  // o singură oprire: sosește 15:05 cu oamenii schimbului 2, pleacă 15:45 cu ai lui 1
  const p = imperecheazaTreceri([trecere(6, 20), trecere(15, 5, 40)], granite, [1, 2]);
  const a = stareApropiere(p[1]), pl = starePlecare(p[1]);
  assert.equal(a.stare, 'plin', 'a venit plină, cu schimbul 2');
  assert.equal(a.shift_number, 2);
  assert.equal(pl.stare, 'plin', 'și pleacă plină, cu schimbul 1');
  assert.equal(pl.shift_number, 1);
});

test('a treia atingere nu e „schimbul 3" — numărătoarea poziției rata tiparul normal', () => {
  // Tiparul măsurat: 3 atingeri la 2 atribuiri. La granița comună de 15:30 sunt două
  // atingeri: prima ADUCE schimbul 2, a doua îl IA pe 1 — ordinea fizică, nu ceasul,
  // fiindcă ceasul le dă aceeași oră.
  const granite = [
    { minuteZi: 7 * 60, tip: 'inceput', shift_number: 1 },
    { minuteZi: 15 * 60 + 30, tip: 'sfarsit', shift_number: 1 },
    { minuteZi: 15 * 60 + 30, tip: 'inceput', shift_number: 2 },
    { minuteZi: 23 * 60, tip: 'sfarsit', shift_number: 2 },
  ];
  const p = imperecheazaTreceri([trecere(6, 20), trecere(14, 20), trecere(15, 20)], granite, [1, 2]);
  assert.equal(p[0].livrare?.shift_number, 1);
  assert.equal(p[1].livrare?.shift_number, 2, 'a doua aduce schimbul 2');
  assert.equal(p[2].ridicare?.shift_number, 1, 'a treia îl ia pe 1, nu e „schimbul 3"');
  assert.equal(stareApropiere(p[1]).stare, 'plin', 'dusul cu schimbul 2 e plin');
  assert.equal(starePlecare(p[2]).stare, 'plin', 'întorsul cu schimbul 1 e plin');
});

test('un schimb pe care mașina NU îl are atribuit nu poate fi ales', () => {
  const granite = [
    { minuteZi: 7 * 60, tip: 'inceput', shift_number: 1 },
    { minuteZi: 6 * 60 + 30, tip: 'inceput', shift_number: 3 },
  ];
  const p = imperecheazaTreceri([trecere(6, 25)], granite, [1]);
  assert.equal(p[0].livrare?.shift_number, 1, 'chiar dacă granița schimbului 3 e mai aproape');
});

test('departe de orice graniță → necunoscut, nu o presupunere', () => {
  const granite = [{ minuteZi: 7 * 60, tip: 'inceput', shift_number: 1 }];
  const p = imperecheazaTreceri([trecere(11, 0)], granite, [1]);
  assert.equal(p[0].livrare, null);
  assert.equal(starePlecare(p[0]).stare, 'necunoscut');
});

test('toleranța e cea măsurată, nu 45 de minute', async () => {
  const { TOLERANTA_SCHIMB_MIN } = await import('./etalon-labels.mjs');
  assert.equal(TOLERANTA_SCHIMB_MIN, 75, 'p75 = 43 min, p90 = 87; la 45 rămâneau 22% necunoscute');
  const granite = [{ minuteZi: 7 * 60, tip: 'inceput', shift_number: 1 }];
  const p = imperecheazaTreceri([trecere(5, 50)], granite, [1]);   // 70 de minute înainte
  assert.equal(p[0].livrare?.shift_number, 1);
});

test('opririle scurte se vad: urcarea din sat tine 40 s, nu 90', async () => {
  const { opririScurte } = await import('./etalon-labels.mjs');
  const pts = [];
  const push = (lat, lon, sec, sp) => pts.push({ lat, lon, t: new Date(Date.UTC(2026, 8, 16, 3, 0, sec)), sp });
  let sec = 0;
  for (let i = 0; i < 5; i++) push(47.0 + i * 0.01, 28.0, sec += 30, 40);   // merge
  for (let i = 0; i < 3; i++) push(47.05, 28.0, sec += 25, 1);              // oprire ~50 s in sat
  for (let i = 0; i < 5; i++) push(47.05 + i * 0.01, 28.0, sec += 30, 40);  // merge mai departe
  assert.equal(opririScurte(pts, 0, pts.length - 1), 1, 'oprirea scurta din sat se numara');
  // aceeasi oprire, dar la poarta: nu se numara, e stationarea uzinei
  assert.equal(opririScurte(pts, 0, pts.length - 1, { exclude: [{ lat: 47.05, lon: 28.0, raza: 1.0 }] }), 0);
});

test('doua rute in acelasi schimb: amandoua primesc rol, nu doar prima', () => {
  const granite = [
    { minuteZi: 6 * 60, tip: 'inceput', shift_number: 1 },
    { minuteZi: 14 * 60 + 30, tip: 'sfarsit', shift_number: 1 },
  ];
  const treceri = [trecere(5, 20), trecere(6, 10), trecere(14, 0), trecere(14, 50)];
  const fara = imperecheazaTreceri(treceri, granite, [1]);
  assert.equal(fara.filter((p) => p.livrare || p.ridicare).length, 2, 'cu o singura capacitate, doua atingeri raman fara rol');
  const cu = imperecheazaTreceri(treceri, granite, [1], undefined, new Map([['1', 2]]));
  assert.equal(cu.filter((p) => p.livrare || p.ridicare).length, 4, 'cu doua curse in schimb, toate patru primesc rol');
  assert.equal(cu.filter((p) => p.livrare).length, 2);
  assert.equal(cu.filter((p) => p.ridicare).length, 2);
});

test('km-ii unui interval sunt suma pașilor măsurați', () => {
  const stepKm = [0, 1.5, 2.5, 3.0];
  assert.equal(kmInterval(stepKm, 0, 3), 7);
  assert.equal(kmInterval(stepKm, 1, 2), 2.5, 'pasul de intrare nu se numără de două ori');
});

test('ora se citește în fusul Chișinăului, nu UTC (bugul prins la proba 2)', async () => {
  const { minuteZiLocal } = await import('./etalon-labels.mjs');
  // 06:00 ora Chișinăului vara = 03:00 UTC
  assert.equal(minuteZiLocal(new Date(Date.UTC(2026, 8, 16, 3, 0))), 6 * 60);
  // iarna e UTC+2: 06:00 local = 04:00 UTC
  assert.equal(minuteZiLocal(new Date(Date.UTC(2026, 11, 16, 4, 0))), 6 * 60);
});

test('granițele învățate cad pe orarul declarat, nu cu 3 ore mai devreme', () => {
  // plecări la 06:05 ora Chișinăului, vara (= 03:05 UTC)
  const plecari = [];
  for (let i = 0; i < 30; i++) plecari.push(new Date(Date.UTC(2026, 8, 14 + (i % 5), 3, 5)));
  const g = invataGranite(plecari, 6 * 60);
  assert.ok(Math.abs(g.minuteZi - 6 * 60) <= 20, `graniță pe la 06:00, a ieșit ${g.minuteZi}`);
});

test('segmentele ACOPERĂ ziua o singură dată — suma lor închide pe km-ii zilei', () => {
  // ziua clasică: acasă → poartă → înapoi spre sate → poartă → acasă
  const gates = [{ uzina_id: 'U', label: 'P', lat: 47.200, lon: 28.0, radius_km: 0.6 }];
  const pts = [
    ...drum(47.000, 28.0, 47.200, 28.0, 30, 5 * 60, 2),        // dus spre poartă
    ...drum(47.2001, 28.0, 47.2002, 28.0, 3, 6 * 60 + 5, 2, 0),// la poartă
    ...drum(47.200, 28.0, 47.050, 28.0, 25, 6 * 60 + 15, 2),   // iese spre sate
    ...drum(47.050, 28.0, 47.200, 28.0, 25, 7 * 60 + 10, 2),   // se întoarce
    ...drum(47.2001, 28.0, 47.2002, 28.0, 3, 8 * 60, 2, 0),    // iar la poartă
    ...drum(47.200, 28.0, 47.000, 28.0, 30, 8 * 60 + 10, 2),   // acasă
  ];
  const calc = computeDay(pts, { bridgeKm: (a, b) => ({ km: hav(a, b), src: 'straight_line' }), movingKmh: 5.6 });
  const tr = treceriPorti(pts, secvente(pts, calc), gates);
  assert.ok(tr.length >= 1, 'cel puțin o trecere');
  const perechi = imperecheazaTreceri(tr, [{ minuteZi: 7 * 60, tip: 'inceput', shift_number: 1 }], [1]);
  const segs = segmenteZi(pts, calc, tr, perechi);
  const suma = segs.reduce((s, x) => s + x.km, 0);
  assert.ok(Math.abs(suma - calc.km) <= 0.5,
    `suma segmentelor (${suma.toFixed(1)}) trebuie să închidă pe km-ii zilei (${calc.km}) — nu de două ori`);
  // niciun interval nu se suprapune cu următorul
  for (let i = 1; i < segs.length; i++)
    assert.ok(segs[i].from >= segs[i - 1].to, `segmentul ${i} începe înainte să se termine ${i - 1}`);
});

test('trecerea prin dreptul porții fără oprire nu e atingere (Popescu, 552BRAO/16.09)', () => {
  const gates = [{ uzina_id: 'U', label: 'P', lat: 47.200, lon: 28.0, radius_km: 0.5 }];
  // trece prin rază la ~40 km/h: puncte la 30 s, ~330 m între ele
  const trecere = drum(47.190, 28.0, 47.210, 28.0, 8, 6 * 60, 0.5);
  // se oprește la poartă: cinci puncte la 30 s în același loc
  const oprire = [...drum(47.190, 28.0, 47.200, 28.0, 4, 7 * 60, 0.5), ...drum(47.2000, 28.0, 47.2001, 28.0, 5, 7 * 60 + 2, 0.5, 0),
    ...drum(47.200, 28.0, 47.210, 28.0, 4, 7 * 60 + 5, 0.5)];
  const pts = [...drum(47.100, 28.0, 47.190, 28.0, 10, 5 * 60, 2), ...trecere,
    ...drum(47.210, 28.0, 47.190, 28.0, 10, 6 * 60 + 10, 2), ...oprire];
  const calc = computeDay(pts, { bridgeKm: (a, b) => ({ km: hav(a, b), src: 'straight_line' }), movingKmh: 5.6 });
  const tr = treceriPorti(pts, secvente(pts, calc), gates);
  assert.equal(tr.length, 2, 'două atingeri brute');
  assert.equal(tr[0].oprit, false, 'prima e trecere: n-a oprit în rază');
  assert.equal(tr[1].oprit, true, 'a doua e atingere: a stat la poartă');
});

test('întoarcerea e la sfârșitul pauzei, nu în punctul cel mai depărtat (Covalschi, 503BRAR/16.09)', () => {
  // poartă → acasă (pauză 40 min) → drumul turului trece printr-un punct MAI DEPĂRTAT de
  // poartă decât casa → poartă. Cu tăietura pe depărtare, începutul turului cădea pe retur.
  const gates = [{ uzina_id: 'U', label: 'P', lat: 47.200, lon: 28.0, radius_km: 0.6 }];
  const pts = [
    ...drum(47.2001, 28.0, 47.2002, 28.0, 3, 6 * 60, 2, 0),      // la poartă
    ...drum(47.200, 28.0, 47.050, 28.0, 25, 6 * 60 + 10, 2),     // retur, până acasă
    ...drum(47.0500, 28.0, 47.0501, 28.0, 20, 7 * 60, 2, 0),     // pauză acasă, 40 min
    ...drum(47.050, 28.0, 47.020, 28.0, 10, 7 * 60 + 45, 2),     // turul iese mai departe de poartă
    ...drum(47.020, 28.0, 47.200, 28.0, 30, 8 * 60 + 10, 2),     // și vine la poartă
    ...drum(47.2001, 28.0, 47.2002, 28.0, 3, 9 * 60 + 15, 2, 0),
  ];
  const calc = computeDay(pts, { bridgeKm: (a, b) => ({ km: hav(a, b), src: 'straight_line' }), movingKmh: 5.6 });
  const tr = treceriPorti(pts, secvente(pts, calc), gates);
  assert.equal(tr.length, 2);
  const perechi = tr.map(() => ({ livrare: null, ridicare: null }));
  const segs = segmenteZi(pts, calc, tr, perechi);
  const apropiere = segs.find((s, i) => i > 0 && s.tip === 'apropiere');
  const start = pts[apropiere.from];
  assert.ok(hav(start, { lat: 47.050, lon: 28.0 }) < 0.3,
    `turul începe de acasă (47.050), nu din punctul depărtat: a început la ${start.lat.toFixed(3)}`);
  const plecare = segs.find((s) => s.tip === 'plecare');
  assert.ok(plecare.to === apropiere.from, 'tăietura e una singură');
  const suma = segs.reduce((s, x) => s + x.km, 0);
  assert.ok(Math.abs(suma - calc.km) <= 0.5, 'suma segmentelor închide pe km-ii zilei');
});
