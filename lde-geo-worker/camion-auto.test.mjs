// Teste pentru stările automate ale camioanelor (node --test lde-geo-worker/camion-auto.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actualizeazaStationarea, deciziaCamion, alerteCamion, punctulUndeSta, minuteLaPunct,
  descarcaAici, incarcaAici, PRAG_MIN, PLECAT_KM, PLECAT_MIN, LOC_DESCARCARE_NECUNOSCUT,
} from './camion-auto.mjs';

const T0 = Date.parse('2026-09-05T16:50:00Z');
const min = (n) => new Date(T0 + n * 60e3).toISOString();

// Puncte reale (migr. 335).
const BERDICHEV = { id: 'p-berd', name: 'Bază Berdichev', lat: 49.8851, lon: 28.5439, radius_m: 800, kind: 'incarcare_biodiesel' };
const NORD = { id: 'p-nord', name: 'Vamă/terminal nord Berdichev', lat: 50.61, lon: 27.59, radius_m: 1500, kind: 'tranzit_acte' };
const BRICENI = { id: 'p-bri', name: 'Bază Briceni', lat: 48.3535, lon: 27.1013, radius_m: 800, kind: 'baza' };
const RUSE = { id: 'p-ruse', name: 'Ruse', lat: 43.8564, lon: 25.9707, radius_m: 2000, kind: 'descarcare_biodiesel' };
const PETROMIDIA = { id: 'p-petro', name: 'Petromidia', lat: 44.3357, lon: 28.6394, radius_m: 1200, kind: 'incarcare_diesel' };
const UNGHENI = { id: 'p-ung', name: 'TLX Ungheni', lat: 47.21896, lon: 27.80257, radius_m: 300, kind: 'descarcare_diesel' };
const ZEL = { id: 'p-zel', name: 'ZEL Ungheni', lat: 47.2229, lon: 27.8018, radius_m: 300, kind: 'tranzit_acte' };
const PUNCTE = [BERDICHEV, NORD, BRICENI, RUSE, PETROMIDIA, UNGHENI, ZEL];
const dupaId = new Map(PUNCTE.map((p) => [p.id, p]));

const la = (p, at, speed = 0) => ({ lat: p.lat + 0.0003, lon: p.lon, speed, at });
const CISTERNA = { id: 'v1', plate: 'MOW214', fleetType: 'cisterna', driverId: 'd1' };

/** Camion care stă la `punct` de `minute`, cu poziție proaspătă. */
function stand(punct, minute, acumMs = T0 + minute * 60e3) {
  const pozitie = la(punct, new Date(acumMs - 60e3).toISOString());
  const stationare = { point_id: punct.id, since: min(0), last_seen_at: new Date(acumMs - 60e3).toISOString(), prev_point_id: null, prev_since: null, prev_until: null };
  return { stationare, punct, pozitie, acumMs };
}

test('descarcaAici / incarcaAici: marfa se potrivește cu tipul punctului (D4)', () => {
  assert.equal(descarcaAici('diesel', 'descarcare_diesel'), true);
  assert.equal(descarcaAici('diesel', 'baza'), true);
  assert.equal(descarcaAici('biodiesel', 'baza'), false);           // MOW214 la Briceni = tranzit
  assert.equal(descarcaAici('biodiesel', 'descarcare_biodiesel'), true);
  assert.equal(descarcaAici('biodiesel', 'descarcare_diesel'), false); // ZEL lângă TLX Ungheni nu-l descarcă
  assert.equal(incarcaAici(null, 'incarcare_biodiesel'), true);
  assert.equal(incarcaAici('diesel', 'incarcare_biodiesel'), false);
  assert.equal(incarcaAici('diesel', 'tranzit_acte'), false);
});

test('punctulUndeSta: cel mai apropiat punct cu tip, în rază; fără tip nu contează', () => {
  assert.equal(punctulUndeSta(la(BERDICHEV, min(0)), PUNCTE)?.id, 'p-berd');
  assert.equal(punctulUndeSta({ lat: 45.9, lon: 28.4 }, PUNCTE), null);
  assert.equal(punctulUndeSta(la(BERDICHEV, min(0)), [{ ...BERDICHEV, kind: null }]), null);
});

test('staționarea: intrare, stat, ieșire — ieșirea se ține minte în prev_*', () => {
  let s = null;
  ({ stationare: s } = actualizeazaStationarea(s, BERDICHEV, la(BERDICHEV, min(0)), T0 + 60e3));
  assert.equal(s.point_id, 'p-berd'); assert.equal(s.since, min(0));
  ({ stationare: s } = actualizeazaStationarea(s, BERDICHEV, la(BERDICHEV, min(130)), T0 + 131 * 60e3));
  assert.equal(minuteLaPunct(s), 130);
  ({ stationare: s } = actualizeazaStationarea(s, null, { lat: 49.95, lon: 28.6, speed: 60, at: min(150) }, T0 + 151 * 60e3));
  assert.equal(s.point_id, null);
  assert.equal(s.prev_point_id, 'p-berd'); assert.equal(s.prev_until, min(130));
  assert.equal(minuteLaPunct(s), 0);
});

test('staționarea: poziție veche nu atinge nimic', () => {
  const s0 = { point_id: 'p-berd', since: min(0), last_seen_at: min(10), prev_point_id: null, prev_since: null, prev_until: null };
  const r = actualizeazaStationarea(s0, null, la(BERDICHEV, min(0)), T0 + 3 * 3600e3);
  assert.equal(r.schimbata, false); assert.deepEqual(r.stationare, s0);
});

test('D1: fără cursă, 120 min la Berdichev → cursă nouă biodiesel, la încărcare', () => {
  const d = deciziaCamion({ camion: CISTERNA, cursa: null, ultimaCursa: null, puncteDupaId: dupaId, ...stand(BERDICHEV, 121) });
  assert.ok(d.creeaza);
  assert.equal(d.creeaza.cargo, 'biodiesel');
  assert.equal(d.creeaza.status, 'la_incarcare');
  assert.equal(d.creeaza.load_point_id, 'p-berd');
  assert.equal(d.creeaza.load_planned_at, min(0));
  assert.equal(d.creeaza.unload_point_id, null);
  assert.equal(d.creeaza.unload_place, LOC_DESCARCARE_NECUNOSCUT);
  assert.equal(d.creeaza.created_by, 'auto:gps');
  assert.equal(d.creeaza.driver_id, 'd1');
  assert.ok(Date.parse(d.creeaza.unload_planned_at) > Date.parse(d.creeaza.load_planned_at));
});

test('D1: sub prag, sau la vamă/tranzit, sau zernovoz → nimic', () => {
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa: null, ultimaCursa: null, puncteDupaId: dupaId, ...stand(BERDICHEV, 119) }).creeaza, null);
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa: null, ultimaCursa: null, puncteDupaId: dupaId, ...stand(NORD, 400) }).creeaza, null);
  assert.equal(deciziaCamion({ camion: { ...CISTERNA, fleetType: 'zernovoz' }, cursa: null, ultimaCursa: null, puncteDupaId: dupaId, ...stand(BERDICHEV, 400) }).creeaza, null);
  assert.equal(deciziaCamion({ camion: { ...CISTERNA, fleetType: null }, cursa: null, ultimaCursa: null, puncteDupaId: dupaId, ...stand(BERDICHEV, 400) }).creeaza, null);
});

test('D1: cursa tocmai închisă la același punct, în aceeași staționare, nu se reface', () => {
  const ultima = { load_point_id: 'p-berd', load_planned_at: min(5), status: 'incheiata' };
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa: null, ultimaCursa: ultima, puncteDupaId: dupaId, ...stand(BERDICHEV, 300) }).creeaza, null);
  const veche = { load_point_id: 'p-berd', load_planned_at: '2026-08-20T10:00:00Z', status: 'incheiata' };
  assert.ok(deciziaCamion({ camion: CISTERNA, cursa: null, ultimaCursa: veche, puncteDupaId: dupaId, ...stand(BERDICHEV, 300) }).creeaza);
});

test('D1 diesel: 45 min la Petromidia fără cursă → cursă diesel (KWX620)', () => {
  const d = deciziaCamion({ camion: { ...CISTERNA, plate: 'KWX620' }, cursa: null, ultimaCursa: null, puncteDupaId: dupaId, ...stand(PETROMIDIA, 46) });
  assert.equal(d.creeaza?.cargo, 'diesel');
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa: null, ultimaCursa: null, puncteDupaId: dupaId, ...stand(PETROMIDIA, 30) }).creeaza, null);
});

test('planificată + stă la punctul cursei ≥ prag → la încărcare; la alt punct de același fel la fel', () => {
  const cursa = { id: 'c1', status: 'planificata', cargo: 'biodiesel', load_point_id: 'p-berd', unload_point_id: 'p-ruse', load_planned_at: min(-600), status_changed_at: null };
  const d = deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...stand(BERDICHEV, 121) });
  assert.equal(d.schimba?.patch.status, 'la_incarcare');
  assert.equal(d.schimba?.deLa, 'planificata');
  assert.equal(d.schimba?.patch.status_source, 'gps');
  assert.equal(d.creeaza, null);
  // Fără punct de încărcare pe cursă: se ia punctul unde stă și marfa lipsă.
  const faraPunct = { ...cursa, load_point_id: null, cargo: null };
  const d2 = deciziaCamion({ camion: CISTERNA, cursa: faraPunct, ultimaCursa: faraPunct, puncteDupaId: dupaId, ...stand(BERDICHEV, 121) });
  assert.equal(d2.schimba?.patch.load_point_id, 'p-berd');
  assert.equal(d2.schimba?.patch.cargo, 'biodiesel');
  // Diesel pe cursă, stă la Berdichev: nu e încărcarea lui.
  const diesel = { ...cursa, cargo: 'diesel', load_point_id: 'p-petro' };
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa: diesel, ultimaCursa: diesel, puncteDupaId: dupaId, ...stand(BERDICHEV, 300) }).schimba, null);
});

test('planificată + stă la punctul de DESCĂRCARE → nimic (poate fi gol)', () => {
  const cursa = { id: 'c1', status: 'planificata', cargo: 'biodiesel', load_point_id: 'p-berd', unload_point_id: 'p-ruse', load_planned_at: min(-600) };
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...stand(RUSE, 300) }).schimba, null);
});

test('la încărcare → spre descărcare: ≥ 15 km și ≥ 60 min de la ieșirea din rază; manevra de 9,6 km nu e plecare', () => {
  const cursa = { id: 'c1', status: 'la_incarcare', cargo: 'biodiesel', load_point_id: 'p-berd', unload_point_id: null, load_planned_at: min(0), status_changed_at: min(120), loadPoint: BERDICHEV };
  const iesit = { point_id: null, since: null, last_seen_at: null, prev_point_id: 'p-berd', prev_since: min(0), prev_until: min(2000) };
  const acumMs = T0 + 2070 * 60e3;
  // 9,6 km nord — manevră.
  const aproape = { lat: BERDICHEV.lat + 0.086, lon: BERDICHEV.lon, speed: 0, at: min(2069) };
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, stationare: iesit, punct: null, pozitie: aproape, puncteDupaId: dupaId, acumMs }).schimba, null);
  // 30 km, dar doar 50 min de la ieșire.
  const departe = { lat: BERDICHEV.lat + 0.27, lon: BERDICHEV.lon, speed: 70, at: min(2049) };
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, stationare: iesit, punct: null, pozitie: departe, puncteDupaId: dupaId, acumMs: T0 + 2050 * 60e3 }).schimba, null);
  // 30 km și 70 min.
  const d = deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, stationare: iesit, punct: null, pozitie: { ...departe, at: min(2069) }, puncteDupaId: dupaId, acumMs });
  assert.equal(d.schimba?.patch.status, 'spre_descarcare');
  // Fără staționare (worker nou): se numără de la status_changed_at.
  const d2 = deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, stationare: null, punct: null, pozitie: { ...departe, at: min(2069) }, puncteDupaId: dupaId, acumMs });
  assert.equal(d2.schimba?.patch.status, 'spre_descarcare');
  // Stă la vama de la nord (105 km): tot spre descărcare, tranzitul nu blochează.
  const d3 = deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, stationare: { ...iesit, point_id: 'p-nord', since: min(2000), last_seen_at: min(2069) }, punct: NORD, pozitie: la(NORD, min(2069)), puncteDupaId: dupaId, acumMs });
  assert.equal(d3.schimba?.patch.status, 'spre_descarcare');
});

test('spre descărcare + biodiesel la Briceni 31 h → NIMIC (D4); la Ruse 15 min → la descărcare, cu punctul completat', () => {
  const cursa = { id: 'c1', status: 'spre_descarcare', cargo: 'biodiesel', load_point_id: 'p-berd', unload_point_id: null, load_planned_at: min(0), status_changed_at: min(200) };
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...stand(BRICENI, 31 * 60) }).schimba, null);
  const d = deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...stand(RUSE, 16) });
  assert.equal(d.schimba?.patch.status, 'la_descarcare');
  assert.equal(d.schimba?.patch.unload_point_id, 'p-ruse');
  assert.equal(d.schimba?.patch.unload_seen_at, null);
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...stand(RUSE, 10) }).schimba, null);
});

test('spre descărcare + diesel: Briceni cere 120 min, stația TLX 15 min; ZEL Ungheni nu descarcă nimic', () => {
  const cursa = { id: 'c1', status: 'spre_descarcare', cargo: 'diesel', load_point_id: 'p-petro', unload_point_id: null, load_planned_at: min(0), status_changed_at: min(200) };
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...stand(BRICENI, 100) }).schimba, null);
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...stand(BRICENI, 125) }).schimba?.patch.status, 'la_descarcare');
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...stand(UNGHENI, 16) }).schimba?.patch.status, 'la_descarcare');
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...stand(ZEL, 300) }).schimba, null);
});

test('punctul explicit al cursei bate potrivirea mărfii: biodiesel cu descărcarea pusă la Briceni → la descărcare în 15 min', () => {
  const cursa = { id: 'c1', status: 'spre_descarcare', cargo: 'biodiesel', load_point_id: 'p-berd', unload_point_id: 'p-bri', load_planned_at: min(0), status_changed_at: min(200) };
  const d = deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...stand(BRICENI, 16) });
  assert.equal(d.schimba?.patch.status, 'la_descarcare');
  assert.equal(d.schimba?.patch.unload_point_id, undefined);
});

test('plin, așteaptă descărcarea: GPS-ul îl duce la descărcare; la descărcare / încheiată: GPS-ul nu face nimic', () => {
  const plin = { id: 'c1', status: 'asteapta_descarcare', cargo: 'diesel', load_point_id: 'p-petro', unload_point_id: 'p-ung', load_planned_at: min(0), status_changed_at: min(200) };
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa: plin, ultimaCursa: plin, puncteDupaId: dupaId, ...stand(UNGHENI, 16) }).schimba?.patch.status, 'la_descarcare');
  const laDesc = { ...plin, status: 'la_descarcare' };
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa: laDesc, ultimaCursa: laDesc, puncteDupaId: dupaId, ...stand(UNGHENI, 600) }).schimba, null);
});

test('poziție veche: nicio decizie, nici creare', () => {
  const s = stand(BERDICHEV, 300);
  s.pozitie = la(BERDICHEV, min(0));
  assert.deepEqual(deciziaCamion({ camion: CISTERNA, cursa: null, ultimaCursa: null, puncteDupaId: dupaId, ...s }), { creeaza: null, schimba: null, motiv: null });
});

test('alerte: la descărcare peste 6 h fără bon; GPS mut peste 12 h cu marfa în camion; cheia e stabilă', () => {
  const acumMs = T0;
  const cursa = { id: 'c1', status: 'la_descarcare', cargo: 'diesel', status_changed_at: new Date(acumMs - 7 * 3600e3).toISOString(), unloadPoint: UNGHENI };
  const a = alerteCamion({ camion: CISTERNA, cursa, stationare: null, punct: UNGHENI, pozitie: la(UNGHENI, new Date(acumMs - 60e3).toISOString()), acumMs });
  assert.equal(a.length, 1); assert.equal(a[0].fel, 'descarcare_fara_bon'); assert.equal(a[0].cheie, 'descarcare_fara_bon|c1');
  const recenta = { ...cursa, status_changed_at: new Date(acumMs - 2 * 3600e3).toISOString() };
  assert.equal(alerteCamion({ camion: CISTERNA, cursa: recenta, stationare: null, punct: UNGHENI, pozitie: null, acumMs }).length, 0);
  const plin = { id: 'c2', status: 'spre_descarcare', cargo: 'biodiesel', status_changed_at: min(0) };
  const mut = alerteCamion({ camion: CISTERNA, cursa: plin, stationare: null, punct: null, pozitie: { lat: 47, lon: 28, speed: 0, at: new Date(acumMs - 13 * 3600e3).toISOString() }, acumMs });
  assert.equal(mut.length, 1); assert.equal(mut[0].fel, 'gps_mut');
  assert.equal(alerteCamion({ camion: { ...CISTERNA, fleetType: 'zernovoz' }, cursa, stationare: null, punct: null, pozitie: null, acumMs }).length, 0);
});

test('pragurile din spec', () => {
  assert.equal(PRAG_MIN.incarcare_biodiesel, 120);
  assert.equal(PRAG_MIN.incarcare_diesel, 45);
  assert.equal(PRAG_MIN.baza, 120);
  assert.equal(PLECAT_KM, 15);
  assert.equal(PLECAT_MIN, 60);
});

test('pornire la rece: cursă planificată, camionul nu e la punct, dar istoricul îl arată ≥60 min la încărcare → la încărcare, cu ora plecării', () => {
  const cursa = { id: 'c1', status: 'planificata', cargo: 'biodiesel', load_point_id: 'p-berd', unload_point_id: 'p-ruse', load_planned_at: '2026-09-05T04:00:00Z', status_changed_at: null, loadPoint: BERDICHEV };
  const opriri = [
    { lat: 49.8852, lon: 28.5433, dwell_min: 13, arrival_at: '2026-09-05T15:51:12Z', departure_at: '2026-09-05T16:03:12Z' },   // trecere scurtă
    { lat: 49.8852, lon: 28.5433, dwell_min: 1347, arrival_at: '2026-09-05T21:48:45Z', departure_at: '2026-09-06T20:15:50Z' },
    { lat: 49.8852, lon: 28.5433, dwell_min: 298, arrival_at: '2026-09-06T21:15:50Z', departure_at: '2026-09-07T02:13:32Z' },
  ];
  const acumMs = Date.parse('2026-09-10T14:00:00Z');
  const peDrum = { lat: 47.0, lon: 27.6, speed: 60, at: new Date(acumMs - 60e3).toISOString() };
  const d = deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, stationare: null, punct: null, pozitie: peDrum, puncteDupaId: dupaId, opriri, acumMs });
  assert.equal(d.schimba?.patch.status, 'la_incarcare');
  assert.equal(d.schimba?.patch.status_changed_at, '2026-09-06T20:15:50.000Z');
  assert.match(d.motiv, /istoric/);
  // Fără istoric potrivit (doar trecerea scurtă, sau oprire dinaintea cursei): nimic.
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, stationare: null, punct: null, pozitie: peDrum, puncteDupaId: dupaId, opriri: [opriri[0]], acumMs }).schimba, null);
  const veche = [{ ...opriri[1], arrival_at: '2026-08-30T21:48:45Z', departure_at: '2026-08-31T20:15:50Z' }];
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, stationare: null, punct: null, pozitie: peDrum, puncteDupaId: dupaId, opriri: veche, acumMs }).schimba, null);
  // Ticul următor, deja «la încărcare» cu plecarea pe 06.09: e la 300 km → spre descărcare.
  const dupa = { ...cursa, status: 'la_incarcare', status_changed_at: '2026-09-06T20:15:50.000Z' };
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa: dupa, ultimaCursa: dupa, stationare: null, punct: null, pozitie: peDrum, puncteDupaId: dupaId, opriri, acumMs }).schimba?.patch.status, 'spre_descarcare');
});

test('pornire la rece merge și cu GPS-ul vechi (camion parcat, tracker adormit): istoricul ajunge', () => {
  const cursa = { id: 'c1', status: 'planificata', cargo: 'diesel', load_point_id: 'p-petro', unload_point_id: null, load_planned_at: '2026-09-04T04:00:00Z', status_changed_at: null, loadPoint: PETROMIDIA };
  const opriri = [{ lat: PETROMIDIA.lat, lon: PETROMIDIA.lon, dwell_min: 90, arrival_at: '2026-09-05T08:00:00Z', departure_at: '2026-09-05T09:30:00Z' }];
  const acumMs = Date.parse('2026-09-10T14:00:00Z');
  const veche = { lat: 46.94, lon: 28.86, speed: 0, at: '2026-09-10T02:00:00Z' };
  const d = deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, stationare: null, punct: null, pozitie: veche, puncteDupaId: dupaId, opriri, acumMs });
  assert.equal(d.schimba?.patch.status, 'la_incarcare');
  // Dar «la încărcare → spre descărcare» cere poziție proaspătă: cu GPS vechi nu se mișcă.
  const dupa = { ...cursa, status: 'la_incarcare', status_changed_at: '2026-09-05T09:30:00.000Z' };
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa: dupa, ultimaCursa: dupa, stationare: null, punct: null, pozitie: veche, puncteDupaId: dupaId, opriri, acumMs }).schimba, null);
});

test('ANT344: planificată, stă la Bacioi (descărcare) de zile, dar istoricul îl arată la Constanța → la încărcare, nu «liber»', () => {
  const CONSTANTA = { id: 'p-const', name: 'Port Constanța', lat: 44.1312, lon: 28.6163, radius_m: 1500, kind: 'incarcare_diesel' };
  const BACIOI = { id: 'p-bac', name: 'Bacioi', lat: 46.941, lon: 28.8669, radius_m: 500, kind: 'descarcare_diesel' };
  const cursa = { id: 'c1', status: 'planificata', cargo: 'diesel', load_point_id: 'p-const', unload_point_id: 'p-bac', load_planned_at: '2026-09-03T04:00:00Z', status_changed_at: null, loadPoint: CONSTANTA };
  const opriri = [{ lat: 44.1312, lon: 28.6163, dwell_min: 604, arrival_at: '2026-09-03T09:22:00Z', departure_at: '2026-09-03T19:26:00Z' }];
  const acumMs = Date.parse('2026-09-10T15:00:00Z');
  const s = { point_id: 'p-bac', since: '2026-09-10T11:45:00Z', last_seen_at: '2026-09-10T14:59:00Z', prev_point_id: null, prev_since: null, prev_until: null };
  const d = deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, stationare: s, punct: BACIOI, pozitie: la(BACIOI, '2026-09-10T14:59:00Z'), puncteDupaId: new Map([[CONSTANTA.id, CONSTANTA], [BACIOI.id, BACIOI]]), opriri, acumMs });
  assert.equal(d.schimba?.patch.status, 'la_incarcare');
  // Fără istoric: stă la descărcare cu cursa planificată = poate fi gol → nimic.
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, stationare: s, punct: BACIOI, pozitie: la(BACIOI, '2026-09-10T14:59:00Z'), puncteDupaId: dupaId, opriri: [], acumMs }).schimba, null);
});
