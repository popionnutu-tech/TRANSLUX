// Teste pentru cursele automate ale zernovozurilor (node --test lde-geo-worker/zernovoz-auto.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { deciziaCamion } from './camion-auto.mjs';
import {
  deciziaZernovoz, recupereazaZernovozDinIstoric, zernovozeDinOpriri,
  LA_BAZA_MIN, PRAG_DESCARCARE_CEREALE_MIN,
} from './zernovoz-auto.mjs';

const T0 = Date.parse('2026-09-14T10:00:00Z');
const h = (n) => new Date(T0 + n * 3600e3).toISOString();

// Puncte reale (migr. 335 și 387).
const BRICENI = { id: 'p-bri', name: 'Bază Briceni', lat: 48.3535, lon: 27.1013, radius_m: 800, kind: 'baza' };
const BRAILA = { id: 'p-bra', name: 'Port Brăila — descărcare cereale', lat: 45.289, lon: 27.990, radius_m: 1000, kind: 'descarcare_cereale' };
const ALBITA = { id: 'p-alb', name: 'Vama Albița–Leușeni', lat: 46.786, lon: 28.140, radius_m: 1500, kind: 'vama' };
const CONSTANTA_DIESEL = { id: 'p-cta', name: 'Port Constanța — încărcare diesel', lat: 44.1312, lon: 28.6163, radius_m: 1500, kind: 'incarcare_diesel' };
const PUNCTE = [BRICENI, BRAILA, ALBITA, CONSTANTA_DIESEL];
const dupaId = new Map(PUNCTE.map((p) => [p.id, p]));
const la = (p, at) => ({ lat: p.lat + 0.0003, lon: p.lon, speed: 0, at });
const pe = (lat, lon, at) => ({ lat, lon, speed: 70, at });
const ZERNOVOZ = { id: 'v-kyk', plate: 'KYK692', fleetType: 'zernovoz', driverId: 'd1' };

/** Plecat de la Briceni acum 3 h, e pe drum spre Albița (la ~150 km). */
function peDrum() {
  const acumMs = T0 + 3 * 3600e3;
  return {
    camion: ZERNOVOZ, cursa: null, ultimaCursa: null, punct: null, puncteDupaId: dupaId, acumMs,
    pozitie: pe(47.40, 28.10, new Date(acumMs - 60e3).toISOString()),
    stationare: { point_id: null, since: null, last_seen_at: null, prev_point_id: BRICENI.id, prev_since: h(-40), prev_until: h(0) },
  };
}

test('zernovozul plecat de la bază primește cursa de cereale, cu ora plecării', () => {
  const d = deciziaZernovoz(peDrum());
  assert.ok(d.creeaza);
  assert.equal(d.creeaza.cargo, 'cereale');
  assert.equal(d.creeaza.status, 'spre_descarcare');
  assert.equal(d.creeaza.load_point_id, BRICENI.id);
  assert.equal(d.creeaza.load_planned_at, h(0));
  assert.ok(Date.parse(d.creeaza.unload_planned_at) > Date.parse(d.creeaza.load_planned_at));
});

test('mutarea prin raion (sub 50 km de bază) nu e cursă', () => {
  const x = peDrum();
  x.pozitie = pe(48.36, 26.83, x.pozitie.at);   // Lipcani, ~20 km
  assert.equal(deciziaZernovoz(x).creeaza, null);
});

test('plecarea de acum două săptămâni, ținută minte, nu mai naște cursă', () => {
  const x = peDrum();
  x.stationare = { ...x.stationare, prev_since: h(-400), prev_until: h(-14 * 24) };
  assert.equal(deciziaZernovoz(x).creeaza, null);
});

test('plecarea care a născut deja o cursă nu se reface', () => {
  const x = peDrum();
  x.ultimaCursa = { load_point_id: BRICENI.id, load_planned_at: h(0), status: 'incheiata' };
  assert.equal(deciziaZernovoz(x).creeaza, null);
});

test('cisterna nu e treaba zernovozului, iar zernovozul nu e treaba cisternei', () => {
  const x = peDrum();
  assert.equal(deciziaZernovoz({ ...x, camion: { ...ZERNOVOZ, fleetType: 'cisterna' } }).creeaza, null);
  assert.equal(deciziaCamion(x).creeaza, null);
});

test('stă în portul de cereale peste prag → la descărcare, cu punctul completat', () => {
  const acumMs = T0 + 20 * 3600e3;
  const cursa = { id: 't1', status: 'spre_descarcare', cargo: 'cereale', load_point_id: BRICENI.id, unload_point_id: null, load_planned_at: h(0), status_changed_at: h(0) };
  const stationare = { point_id: BRAILA.id, since: h(18), last_seen_at: new Date(acumMs - 60e3).toISOString() };
  const d = deciziaZernovoz({ camion: ZERNOVOZ, cursa, stationare, punct: BRAILA, pozitie: la(BRAILA, new Date(acumMs - 60e3).toISOString()), puncteDupaId: dupaId, acumMs });
  assert.equal(d.schimba.patch.status, 'la_descarcare');
  assert.equal(d.schimba.patch.unload_point_id, BRAILA.id);
  assert.ok(PRAG_DESCARCARE_CEREALE_MIN <= 120);
});

test('vama nu e descărcare, oricât ar sta', () => {
  const acumMs = T0 + 30 * 3600e3;
  const cursa = { id: 't1', status: 'spre_descarcare', cargo: 'cereale', load_point_id: BRICENI.id, unload_point_id: null, load_planned_at: h(0), status_changed_at: h(0) };
  const stationare = { point_id: ALBITA.id, since: h(5), last_seen_at: new Date(acumMs - 60e3).toISOString() };
  const d = deciziaZernovoz({ camion: ZERNOVOZ, cursa, stationare, punct: ALBITA, pozitie: la(ALBITA, new Date(acumMs - 60e3).toISOString()), puncteDupaId: dupaId, acumMs });
  assert.equal(d.schimba, null);
});

test('a plecat din port → încheiată, cu ora plecării', () => {
  const acumMs = T0 + 60 * 3600e3;
  const cursa = { id: 't1', status: 'la_descarcare', cargo: 'cereale', load_point_id: BRICENI.id, unload_point_id: BRAILA.id, unloadPoint: BRAILA, load_planned_at: h(0), status_changed_at: h(20) };
  const stationare = { point_id: null, since: null, last_seen_at: null, prev_point_id: BRAILA.id, prev_since: h(18), prev_until: h(50) };
  const d = deciziaZernovoz({ camion: ZERNOVOZ, cursa, stationare, punct: null, pozitie: pe(44.52, 25.96, new Date(acumMs - 60e3).toISOString()), puncteDupaId: dupaId, acumMs });
  assert.equal(d.schimba.patch.status, 'incheiata');
  assert.equal(d.schimba.patch.status_changed_at, h(50));
  assert.match(d.schimba.patch.notes, /a plecat de la «Port Brăila/);
});

test('întors la bază fără descărcare văzută → încheiată la ora întoarcerii', () => {
  const acumMs = T0 + 100 * 3600e3;
  const cursa = { id: 't1', status: 'spre_descarcare', cargo: 'cereale', load_point_id: BRICENI.id, unload_point_id: null, load_planned_at: h(0), status_changed_at: h(0) };
  const since = new Date(acumMs - (LA_BAZA_MIN + 10) * 60e3).toISOString();
  const stationare = { point_id: BRICENI.id, since, last_seen_at: new Date(acumMs - 60e3).toISOString() };
  const d = deciziaZernovoz({ camion: ZERNOVOZ, cursa, stationare, punct: BRICENI, pozitie: la(BRICENI, new Date(acumMs - 60e3).toISOString()), puncteDupaId: dupaId, acumMs });
  assert.equal(d.schimba.patch.status, 'incheiata');
  assert.equal(d.schimba.patch.status_changed_at, since);
});

test('cursa planificată de om nu se închide cât camionul încă stă la bază', () => {
  const acumMs = T0 + 10 * 3600e3;
  const cursa = { id: 't1', status: 'planificata', cargo: 'cereale', load_point_id: null, unload_point_id: null, load_planned_at: h(-5), status_changed_at: h(-30) };
  const stationare = { point_id: BRICENI.id, since: h(-20), last_seen_at: new Date(acumMs - 60e3).toISOString() };
  const d = deciziaZernovoz({ camion: ZERNOVOZ, cursa, stationare, punct: BRICENI, pozitie: la(BRICENI, new Date(acumMs - 60e3).toISOString()), puncteDupaId: dupaId, acumMs });
  assert.equal(d.schimba, null);
});

test('cursa planificată de om trece «spre descărcare» când camionul pleacă', () => {
  const x = peDrum();
  x.cursa = { id: 't1', status: 'planificata', cargo: 'cereale', load_point_id: null, unload_point_id: null, load_planned_at: h(0), status_changed_at: h(-30) };
  const d = deciziaZernovoz(x);
  assert.equal(d.schimba.patch.status, 'spre_descarcare');
  assert.equal(d.schimba.patch.status_changed_at, h(0));
});

// Urma reală a lui KYK692, 12–15.09 (lde_gps_stops, ≥ 45 min).
const URMA_KYK692 = [
  { lat: 48.353, lon: 27.101, dwell_min: 1028, arrival_at: '2026-09-11T21:03:00Z', departure_at: '2026-09-12T14:11:00Z' },
  { lat: 47.403, lon: 28.765, dwell_min: 50, arrival_at: '2026-09-12T17:31:00Z', departure_at: '2026-09-12T18:21:00Z' },
  { lat: 46.786, lon: 28.139, dwell_min: 1406, arrival_at: '2026-09-12T21:31:00Z', departure_at: '2026-09-13T20:57:00Z' },
  { lat: 45.289, lon: 27.990, dwell_min: 298, arrival_at: '2026-09-14T15:59:00Z', departure_at: '2026-09-14T20:57:00Z' },
  { lat: 45.289, lon: 27.990, dwell_min: 686, arrival_at: '2026-09-14T21:02:00Z', departure_at: '2026-09-15T08:28:00Z' },
];

test('recuperare: KYK692 a plecat de la Briceni și stă în portul Brăila', () => {
  const acumMs = Date.parse('2026-09-15T09:00:00Z');
  const r = recupereazaZernovozDinIstoric({ camion: ZERNOVOZ, opriri: URMA_KYK692, puncte: PUNCTE, ultimaCursa: null, acumMs });
  assert.equal(r.creeaza.status, 'la_descarcare');
  assert.equal(r.creeaza.load_point_id, BRICENI.id);
  assert.equal(r.creeaza.load_planned_at, '2026-09-12T14:11:00.000Z');
  assert.equal(r.creeaza.unload_point_id, BRAILA.id);
  assert.equal(r.creeaza.created_by, 'auto:istoric');
});

test('recuperare: drumul terminat (plecat din port, oprit departe) nu se reface', () => {
  const acumMs = Date.parse('2026-09-16T20:00:00Z');
  const urma = [...URMA_KYK692, { lat: 44.520, lon: 25.961, dwell_min: 274, arrival_at: '2026-09-15T16:24:00Z', departure_at: '2026-09-15T20:58:00Z' }];
  assert.equal(recupereazaZernovozDinIstoric({ camion: ZERNOVOZ, opriri: urma, puncte: PUNCTE, ultimaCursa: null, acumMs }), null);
});

test('recuperare: ce sistemul știe deja nu se reface', () => {
  const acumMs = Date.parse('2026-09-15T09:00:00Z');
  const ultimaCursa = { load_planned_at: '2026-09-12T14:11:00Z', status_changed_at: '2026-09-14T16:00:00Z' };
  assert.equal(recupereazaZernovozDinIstoric({ camion: ZERNOVOZ, opriri: URMA_KYK692, puncte: PUNCTE, ultimaCursa, acumMs }), null);
});

test('recuperare: camionul întors și stând la bază n-are cursă', () => {
  const acumMs = Date.parse('2026-09-19T09:00:00Z');
  const urma = [...URMA_KYK692, { lat: 48.353, lon: 27.101, dwell_min: 781, arrival_at: '2026-09-17T15:07:00Z', departure_at: '2026-09-18T04:08:00Z' }];
  assert.equal(recupereazaZernovozDinIstoric({ camion: ZERNOVOZ, opriri: urma, puncte: PUNCTE, ultimaCursa: null, acumMs }), null);
});

test('tipul din GPS: două opriri lungi în portul de cereale fac un zernovoz; cisterna rămâne cisternă', () => {
  const vehicule = [{ id: 'q357', plate_number: 'QDQ357' }, { id: 'rwn', plate_number: 'RWN169' }, { id: 'kyk', plate_number: 'KYK692' }, { id: 'one', plate_number: 'YJX724' }];
  const port = { lat: 45.2893, lon: 27.9903, dwell_min: 300 };
  const opriri = [
    { vehicle_id: 'q357', ...port }, { vehicle_id: 'q357', ...port },
    { vehicle_id: 'rwn', ...port }, { vehicle_id: 'rwn', ...port },
    { vehicle_id: 'rwn', lat: 44.1315, lon: 28.6165, dwell_min: 200 },       // a stat și la încărcarea de diesel
    { vehicle_id: 'kyk', ...port }, { vehicle_id: 'kyk', ...port },
    { vehicle_id: 'one', ...port },                                          // o singură oprire nu e rutină
  ];
  const profiluri = [{ vehicle_id: 'kyk', fleet_type: 'zernovoz' }];
  const { zernovozeNoi } = zernovozeDinOpriri(opriri, PUNCTE, vehicule, profiluri);
  assert.deepEqual(zernovozeNoi.map((z) => z.plate), ['QDQ357']);
});
