// Teste pentru detecția navetei făcute cu altă mașină (node --test).
// Cazurile sunt cele din date, nu inventate: ziua reală a lui 073BRAO (18.09.2026) și
// curtea comună de la Fălești, care NU trebuie să iasă navetă.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detecteazaNaveta, MIN_ZILE_NAVETA } from './naveta-sofer.mjs';

const VATICI = { lat: 47.33857, lon: 28.60832 };      // unde doarme autobuzul rutei 25
const ACASA = { lat: 47.47555, lon: 28.72375 };       // Ocnița-Răzeși, 17 km în linie dreaptă
const PELIVAN = { lat: 47.40093, lon: 28.77136 };
const LUCASEUCA = { lat: 47.34310, lon: 28.76787 };
const POARTA = { lat: 47.3864, lon: 28.8014 };        // SEBN Orhei
const AUTOBUZ = 'v-820GXP', NAVETA = 'v-073BRAO', RUTA = 'r-25';

const op = (vehicle_id, date, seq, loc, dwell, km, locality = null) =>
  ({ vehicle_id, date, seq, lat: loc.lat, lon: loc.lon, dwell_min: dwell, km_from_prev: km, locality });

/** Ziua reală a perechii 820GXP / 073BRAO, așa cum stă în lde_gps_stops. */
function ziua(date) {
  return {
    autobuz: [
      op(AUTOBUZ, date, 1, VATICI, 122, null, 'Vatici'),
      op(AUTOBUZ, date, 2, POARTA, 37, 18.8, 'Bucuria'),
      op(AUTOBUZ, date, 3, VATICI, 427, 20.2, 'Vatici'),
      op(AUTOBUZ, date, 4, POARTA, 36, 19.7, 'Bucuria'),
      op(AUTOBUZ, date, 5, VATICI, 412, 19.7, 'Vatici'),
      op(AUTOBUZ, date, 6, POARTA, 33, 19.6, 'Bucuria'),
      op(AUTOBUZ, date, 7, VATICI, 207, 20.3, 'Vatici'),
    ],
    naveta: [
      op(NAVETA, date, 1, ACASA, 36, null, 'Ocnița-Răzeși'),
      op(NAVETA, date, 2, VATICI, 107, 32.5, 'Vatici'),
      op(NAVETA, date, 3, ACASA, 310, 33.4, 'Ocnița-Răzeși'),
      op(NAVETA, date, 4, VATICI, 131, 33.5, 'Vatici'),
      op(NAVETA, date, 5, PELIVAN, 4, 22.6, 'Pelivan'),
      op(NAVETA, date, 6, ACASA, 305, 10.2, 'Ocnița-Răzeși'),
      op(NAVETA, date, 7, LUCASEUCA, 4, 20.3, 'Lucășeuca'),
      op(NAVETA, date, 8, VATICI, 112, 11.6, 'Vatici'),
      op(NAVETA, date, 9, ACASA, 132, 32.7, 'Ocnița-Răzeși'),
    ],
    curse: [1, 2, 3].map((shift_number) => ({ vehicle_id: AUTOBUZ, run_date: date, factory_route_id: RUTA, km_real: 19.5, shift_number })),
  };
}

const ZILE = ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];
function intrare(zile = ZILE) {
  const opriri = [], curse = [];
  for (const d of zile) { const z = ziua(d); opriri.push(...z.autobuz, ...z.naveta); curse.push(...z.curse); }
  return { opriri, curse, porti: [POARTA] };
}

test('naveta cu altă mașină: ziua lui 073BRAO iese cu km-ii drumurilor casă ↔ Vatici', () => {
  const out = detecteazaNaveta(intrare());
  assert.equal(out.length, ZILE.length, 'o linie pe zi');
  const r = out[0];
  assert.equal(r.vehicle_id, NAVETA);
  assert.equal(r.autobuz_id, AUTOBUZ, 'autobuzul lângă care a așteptat');
  assert.equal(r.factory_route_id, RUTA);
  assert.equal(r.locul, 'Vatici');
  assert.equal(r.drumuri, 6, 'trei dus-întors');
  assert.ok(Math.abs(r.km - 196.8) < 0.05, `km ${r.km} ≈ 196,8`);
});

test('autobuzul rutei nu se numără pe sine: are curse, deci km-ii lui sunt deja în livrare', () => {
  const out = detecteazaNaveta(intrare());
  assert.equal(out.filter((r) => r.vehicle_id === AUTOBUZ).length, 0);
});

test('ziua în care mașina navetei a avut cursă proprie nu intră', () => {
  const inp = intrare();
  inp.curse.push({ vehicle_id: NAVETA, run_date: '2026-09-17', factory_route_id: 'r-12', km_real: 66.2 });
  const out = detecteazaNaveta(inp);
  assert.deepEqual(out.map((r) => r.run_date), ['2026-09-15', '2026-09-16', '2026-09-18']);
});

test('curtea comună (Fălești) NU e navetă: mașina doarme chiar lângă autobuz', () => {
  const CURTE = { lat: 47.45000, lon: 27.71000 };
  const A = 'v-827MUM', B = 'v-807MUM';
  const opriri = [], curse = [];
  for (const d of ZILE) {
    // A face rută și stă în curte între ture; B stă în aceeași curte toată ziua, fără curse
    opriri.push(op(A, d, 1, CURTE, 400, null, 'Fălești'), op(A, d, 2, POARTA, 35, 40, 'Bucuria'), op(A, d, 3, CURTE, 300, 40, 'Fălești'));
    opriri.push(op(B, d, 1, CURTE, 600, null, 'Fălești'), op(B, d, 2, CURTE, 300, 0.2, 'Fălești'), op(B, d, 3, CURTE, 200, 0.1, 'Fălești'));
    curse.push({ vehicle_id: A, run_date: d, factory_route_id: 'r-9', km_real: 40 });
  }
  assert.deepEqual(detecteazaNaveta({ opriri, curse, porti: [POARTA] }), []);
});

test('o singură zi de potrivire e coincidență, nu tipar', () => {
  const out = detecteazaNaveta(intrare(['2026-09-18']));
  assert.deepEqual(out, []);
  assert.equal(MIN_ZILE_NAVETA, 3);
});

test('ocolul care nu se termină la punctul rutei nu se pune pe rută', () => {
  const BALTI = { lat: 47.76983, lon: 27.92334 };
  const inp = intrare();
  // în ziua de 17 mașina mai face, între două pauze acasă, un drum la Bălți și înapoi
  const ziua17 = inp.opriri.filter((s) => s.vehicle_id === NAVETA && s.date === '2026-09-17');
  const dupa = ziua17[2];                                   // pauza lungă de acasă de dimineață
  dupa.dwell_min = 120;
  inp.opriri.push(op(NAVETA, '2026-09-17', 3.5, BALTI, 250, 82, 'Bălți'));
  inp.opriri.push(op(NAVETA, '2026-09-17', 3.6, ACASA, 60, 93, 'Ocnița-Răzeși'));
  const out = detecteazaNaveta(inp);
  const z17 = out.find((r) => r.run_date === '2026-09-17');
  assert.ok(z17, 'ziua rămâne navetă');
  assert.ok(Math.abs(z17.km - 196.8) < 0.05, `drumul la Bălți nu intră în livrare: km ${z17.km}`);
});

test('așteptarea la poarta uzinei nu e punct de rută', () => {
  const inp = intrare();
  // autobuzul stă lung la poartă; dacă poarta ar conta ca punct, orice mașină care trece
  // pe acolo ar deveni «navetă»
  for (const s of inp.opriri) if (s.vehicle_id === AUTOBUZ && s.lat === POARTA.lat) s.dwell_min = 300;
  const out = detecteazaNaveta(inp);
  assert.equal(out.length, ZILE.length, 'rezultatul nu se schimbă');
  assert.ok(out.every((r) => r.locul === 'Vatici'));
});
