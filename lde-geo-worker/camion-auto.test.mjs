// Teste pentru stările automate ale camioanelor (node --test lde-geo-worker/camion-auto.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actualizeazaStationarea, deciziaCamion, alerteCamion, punctulUndeSta, minuteLaPunct,
  descarcaAici, incarcaAici, PRAG_MIN, PLECAT_KM, PLECAT_MIN, LOC_DESCARCARE_NECUNOSCUT,
  cursaExpirata, cisterneDinOpriri, recupereazaDinIstoric,
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

test('spre descărcare + diesel: Briceni cere 120 min (și e bază → plin, nu la descărcare), stația TLX 15 min; ZEL Ungheni nu descarcă nimic', () => {
  const cursa = { id: 'c1', status: 'spre_descarcare', cargo: 'diesel', load_point_id: 'p-petro', unload_point_id: null, load_planned_at: min(0), status_changed_at: min(200) };
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...stand(BRICENI, 100) }).schimba, null);
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...stand(BRICENI, 125) }).schimba?.patch.status, 'asteapta_descarcare');
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

test('alerte: la descărcare peste 24 h fără bon; GPS mut peste 12 h cu marfa în camion; cheia e stabilă', () => {
  const acumMs = T0;
  const ungheniMd = { ...UNGHENI, country: 'Moldova' };
  const cursa = { id: 'c1', status: 'la_descarcare', cargo: 'diesel', status_changed_at: new Date(acumMs - 25 * 3600e3).toISOString(), unloadPoint: ungheniMd };
  const a = alerteCamion({ camion: CISTERNA, cursa, stationare: null, punct: ungheniMd, pozitie: la(UNGHENI, new Date(acumMs - 60e3).toISOString()), acumMs });
  assert.equal(a.length, 1); assert.equal(a[0].fel, 'descarcare_fara_bon'); assert.equal(a[0].cheie, 'descarcare_fara_bon|c1');
  // 7 h nu mai sunt o alertă din 21.09: automatul închide singur cursa, iar bonul
  // de recepție se scrie uneori a doua zi (văzut: descărcare 04.09, bon pe 08.09).
  const recenta = { ...cursa, status_changed_at: new Date(acumMs - 7 * 3600e3).toISOString() };
  assert.equal(alerteCamion({ camion: CISTERNA, cursa: recenta, stationare: null, punct: ungheniMd, pozitie: null, acumMs }).length, 0);
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

// ── 10.09, seara: ANT344 la Bacioi, RWN169 în România ──
const BACIOI = { id: 'p-bacioi', name: 'Bază Chișinău — stație Bacioi', lat: 46.941, lon: 28.8669, radius_m: 500, kind: 'baza' };
const CONSTANTA = { id: 'p-const', name: 'Port Constanța', lat: 44.1312, lon: 28.6163, radius_m: 1500, kind: 'incarcare_diesel' };

test('ANT344: planificată, stă la BAZĂ (nu la încărcare), dar istoricul îl arată 10 h la Constanța → la încărcare (nu «nimic»)', () => {
  const { stationare, punct, pozitie, acumMs } = stand(BACIOI, 20);
  const cursa = { id: 't-ant', status: 'planificata', cargo: 'diesel', load_point_id: CONSTANTA.id, unload_point_id: BACIOI.id,
    load_planned_at: min(-7 * 1440), status_changed_at: null, loadPoint: CONSTANTA, unloadPoint: BACIOI };
  const opriri = [{ lat: 44.1314, lon: 28.6194, dwell_min: 604, arrival_at: min(-7 * 1440 + 320), departure_at: min(-7 * 1440 + 924) }];
  const d = deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: null, stationare, punct, pozitie, puncteDupaId: new Map([[BACIOI.id, BACIOI], [CONSTANTA.id, CONSTANTA]]), opriri, acumMs });
  assert.equal(d.schimba?.patch.status, 'la_incarcare');
  assert.equal(d.schimba?.patch.status_changed_at, min(-7 * 1440 + 924));
  // Stă la punctul de încărcare sub prag: tot nimic — istoricul nu adaugă nimic cât e încă acolo.
  const s2 = stand(CONSTANTA, 10);
  const d2 = deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: null, ...s2, puncteDupaId: dupaId, opriri, acumMs: s2.acumMs });
  assert.equal(d2.schimba, null);
});

test('la bază cisterna e PLINĂ până apare bonul TLX: spre descărcare + 15 min la Bacioi (punctul cursei) → plin, așteaptă descărcarea; nu «la descărcare»', () => {
  const { stationare, punct, pozitie, acumMs } = stand(BACIOI, 16);
  const cursa = { id: 't-ant', status: 'spre_descarcare', cargo: 'diesel', load_point_id: CONSTANTA.id, unload_point_id: BACIOI.id,
    load_planned_at: min(-7 * 1440), status_changed_at: min(-60), loadPoint: CONSTANTA, unloadPoint: BACIOI };
  const d = deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: null, stationare, punct, pozitie, puncteDupaId: dupaId, acumMs });
  assert.equal(d.schimba?.patch.status, 'asteapta_descarcare');
  assert.match(d.motiv, /fără bon TLX/);
  // Deja plin: nimic de schimbat, oricât ar sta.
  const d2 = deciziaCamion({ camion: CISTERNA, cursa: { ...cursa, status: 'asteapta_descarcare' }, ultimaCursa: null, ...stand(BACIOI, 3000), puncteDupaId: dupaId });
  assert.equal(d2.schimba, null);
  // Briceni fără punct explicit pe cursă: tot bază, tot plin, dar abia după 120 min.
  const laBriceni = { ...cursa, unload_point_id: null, unloadPoint: null };
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa: laBriceni, ultimaCursa: null, ...stand(BRICENI, 60), puncteDupaId: dupaId }).schimba, null);
  const d3 = deciziaCamion({ camion: CISTERNA, cursa: laBriceni, ultimaCursa: null, ...stand(BRICENI, 130), puncteDupaId: dupaId });
  assert.equal(d3.schimba?.patch.status, 'asteapta_descarcare');
  assert.equal(d3.schimba?.patch.unload_point_id, BRICENI.id);
  // Stația TLX rămâne «la descărcare».
  const d4 = deciziaCamion({ camion: CISTERNA, cursa: laBriceni, ultimaCursa: null, ...stand(UNGHENI, 16), puncteDupaId: dupaId });
  assert.equal(d4.schimba?.patch.status, 'la_descarcare');
});

// ── Închiderea fără dispecer (Ion, 21.09) ────────────────────────────────────
// Cifrele din testele de mai jos sunt urma GPS reală din lde_gps_stops, 16–20.09.

/** Camionul e la `km` nord de `punct`, plecat de acolo de `deMinute`. */
function plecatDe(punct, km, deMinute, acumMs) {
  const at = new Date(acumMs - 60e3).toISOString();
  return {
    punct: null,
    pozitie: { lat: punct.lat + km / 111, lon: punct.lon, speed: 70, at },
    stationare: { point_id: null, since: null, last_seen_at: null, prev_point_id: punct.id, prev_since: null, prev_until: new Date(acumMs - deMinute * 60e3).toISOString() },
    acumMs,
  };
}

test('la descărcare + a plecat de la punctul de descărcare → încheiată, cu ora plecării', () => {
  const acumMs = T0 + 10 * 3600e3;
  const cursa = { id: 'c1', status: 'la_descarcare', cargo: 'biodiesel', load_point_id: 'p-berd', unload_point_id: 'p-ruse', load_planned_at: min(-4000), status_changed_at: min(-300), unloadPoint: RUSE, notes: 'ждет разгрузку' };
  // Încă în rază: nimic (nu se închide cursa cât camionul stă la descărcare).
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...stand(RUSE, 600) }).schimba, null);
  // La 30 km, dar plecat de doar 40 min: încă nu.
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...plecatDe(RUSE, 30, 40, acumMs) }).schimba, null);
  // La 30 km, plecat de 90 min: cursa s-a terminat la ora plecării, nu acum.
  const p = plecatDe(RUSE, 30, 90, acumMs);
  const d = deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...p });
  assert.equal(d.schimba?.patch.status, 'incheiata');
  assert.equal(d.schimba?.patch.status_source, 'gps');
  assert.equal(d.schimba?.patch.status_changed_at, p.stationare.prev_until);
  assert.match(d.schimba?.patch.notes, /^ждет разгрузку\n/);      // ce scria dispecerul rămâne
  assert.match(d.schimba?.patch.notes, /fără bon TLX/);
  assert.equal(d.creeaza, null);
});

test('la descărcare fără punct de descărcare știut: GPS-ul nu poate închide nimic', () => {
  const acumMs = T0 + 10 * 3600e3;
  const cursa = { id: 'c1', status: 'la_descarcare', cargo: 'biodiesel', load_point_id: 'p-berd', unload_point_id: null, load_planned_at: min(-4000), status_changed_at: min(-300) };
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...plecatDe(RUSE, 300, 600, acumMs) }).schimba, null);
});

test('plin la bază + a plecat: sub fereastra bonului nu se închide, peste ea da (ANT344 la Bacioi)', () => {
  const cursa = { id: 'c1', status: 'asteapta_descarcare', cargo: 'diesel', load_point_id: 'p-petro', unload_point_id: 'p-bri', load_planned_at: min(-4000), status_changed_at: min(0), unloadPoint: BRICENI };
  // A plecat după 3 h: poate fi o mutare prin curte.
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...plecatDe(BRICENI, 40, 90, T0 + 3 * 3600e3) }).schimba, null);
  // A plecat după 9 h, de 90 min: s-a golit.
  const d = deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...plecatDe(BRICENI, 40, 90, T0 + 9 * 3600e3) });
  assert.equal(d.schimba?.patch.status, 'incheiata');
  assert.match(d.schimba?.patch.notes, /plin la «Bază Briceni»|a stat plin/);
  // Tot la bază, oricât ar sta: rămâne plin până pleacă sau până vine bonul.
  assert.equal(deciziaCamion({ camion: CISTERNA, cursa, ultimaCursa: cursa, puncteDupaId: dupaId, ...stand(BRICENI, 3 * 24 * 60) }).schimba, null);
});

test('ANT344: 282 min la Berdichev cu cursa «la descărcare» din altă lună → cursa veche se încheie, se naște una nouă', () => {
  // Urma reală: cursa diesel Constanța → Bacioi, «la descărcare» de pe 16.09;
  // camionul a stat la Berdichev 17.09 16:18–21:00 și încă 8 h peste noapte.
  const cursa = { id: 'c1', status: 'la_descarcare', cargo: 'diesel', load_point_id: 'p-petro', unload_point_id: 'p-bri', load_planned_at: '2026-09-03T04:00:00Z', status_changed_at: '2026-09-16T06:50:00Z', unloadPoint: BRICENI, notes: 'ЖДЕТ РАЗГРУЗКУ' };
  const acumMs = Date.parse('2026-09-17T21:00:00Z');
  const s = {
    point_id: 'p-berd', since: '2026-09-17T16:18:00Z', last_seen_at: '2026-09-17T21:00:00Z',
    prev_point_id: 'p-bri', prev_since: null, prev_until: '2026-09-17T05:20:00Z',
  };
  const d = deciziaCamion({
    camion: CISTERNA, cursa, ultimaCursa: cursa, stationare: s, punct: BERDICHEV,
    pozitie: la(BERDICHEV, new Date(acumMs - 60e3).toISOString()), puncteDupaId: dupaId, acumMs,
  });
  assert.equal(d.schimba?.patch.status, 'incheiata');
  assert.equal(d.schimba?.deLa, 'la_descarcare');
  assert.equal(d.schimba?.patch.status_changed_at, '2026-09-17T16:18:00.000Z');
  assert.match(d.schimba?.patch.notes, /^ЖДЕТ РАЗГРУЗКУ\n/);
  assert.equal(d.creeaza?.cargo, 'biodiesel');
  assert.equal(d.creeaza?.status, 'la_incarcare');
  assert.equal(d.creeaza?.load_point_id, 'p-berd');
  assert.equal(d.creeaza?.load_planned_at, '2026-09-17T16:18:00.000Z');
});

test('LJN076: întoarcerea la Berdichev a doua zi, în mijlocul cursei, NU e cursă nouă', () => {
  // Urma reală: a încărcat 16.09 09:04, a plecat, s-a întors 17.09 06:11 pentru 4 h.
  const cursa = { id: 'c1', status: 'la_incarcare', cargo: 'biodiesel', load_point_id: 'p-berd', unload_point_id: null, load_planned_at: '2026-09-16T09:04:00Z', status_changed_at: '2026-09-16T11:00:00Z', loadPoint: BERDICHEV };
  const acumMs = Date.parse('2026-09-17T10:17:00Z');
  const s = { point_id: 'p-berd', since: '2026-09-17T06:11:00Z', last_seen_at: '2026-09-17T10:17:00Z', prev_point_id: null, prev_since: null, prev_until: null };
  const d = deciziaCamion({
    camion: CISTERNA, cursa, ultimaCursa: cursa, stationare: s, punct: BERDICHEV,
    pozitie: la(BERDICHEV, new Date(acumMs - 60e3).toISOString()), puncteDupaId: dupaId, acumMs,
  });
  assert.equal(d.creeaza, null);
  assert.equal(d.schimba, null);
  // Chiar și cu cursa deja «spre descărcare», sub 24 h de la încărcare nu e marfă nouă.
  const plecata = { ...cursa, status: 'spre_descarcare' };
  assert.equal(deciziaCamion({
    camion: CISTERNA, cursa: plecata, ultimaCursa: plecata, stationare: s, punct: BERDICHEV,
    pozitie: la(BERDICHEV, new Date(acumMs - 60e3).toISOString()), puncteDupaId: dupaId, acumMs,
  }).creeaza, null);
});

test('RWN193: «spre încărcare» + 19 h la Berdichev → la încărcare pe cursa lui, nu cursă nouă', () => {
  // Urma reală 18–20.09, camionul pe care automatul nu-l vedea deloc (fără tip).
  const cursa = { id: 'c1', status: 'spre_incarcare', cargo: 'biodiesel', load_point_id: 'p-berd', unload_point_id: null, load_planned_at: '2026-09-05T04:00:00Z', status_changed_at: null, loadPoint: BERDICHEV };
  const acumMs = Date.parse('2026-09-19T17:00:00Z');
  const s = { point_id: 'p-berd', since: '2026-09-18T22:00:00Z', last_seen_at: '2026-09-19T17:00:00Z', prev_point_id: null, prev_since: null, prev_until: null };
  const d = deciziaCamion({
    camion: { ...CISTERNA, plate: 'RWN193' }, cursa, ultimaCursa: cursa, stationare: s, punct: BERDICHEV,
    pozitie: la(BERDICHEV, new Date(acumMs - 60e3).toISOString()), puncteDupaId: dupaId, acumMs,
  });
  assert.equal(d.schimba?.patch.status, 'la_incarcare');
  assert.equal(d.creeaza, null);
});

test('cursaExpirata: cursa nemișcată se stinge după 10 zile; cea proaspătă și cea închisă, nu', () => {
  const acumMs = Date.parse('2026-09-21T12:00:00Z');
  const veche = { id: 'c1', status: 'planificata', unload_planned_at: '2026-09-11T11:00:00Z', status_changed_at: '2026-09-10T07:02:00Z', notes: 'el amu la Romanie' };
  const e = cursaExpirata(veche, acumMs);
  assert.equal(e?.patch.status, 'incheiata');
  assert.equal(e?.patch.updated_by, 'auto:expirat');
  assert.equal(e?.patch.status_changed_at, '2026-09-11T11:00:00.000Z');   // ultima mișcare știută, nu azi
  assert.match(e?.patch.notes, /^el amu la Romanie\n/);
  // Atinsă acum 2 zile: încă în lucru.
  assert.equal(cursaExpirata({ ...veche, status_changed_at: '2026-09-19T08:00:00Z' }, acumMs), null);
  // Descărcarea planificată peste 3 zile.
  assert.equal(cursaExpirata({ ...veche, unload_planned_at: '2026-09-24T11:00:00Z', status_changed_at: null }, acumMs), null);
  // Deja închisă sau anulată: nu se atinge.
  assert.equal(cursaExpirata({ ...veche, status: 'incheiata' }, acumMs), null);
  assert.equal(cursaExpirata({ ...veche, status: 'anulata' }, acumMs), null);
  assert.equal(cursaExpirata({ ...veche, unload_planned_at: null }, acumMs), null);
});

test('cisterneDinOpriri: două opriri lungi la un punct de încărcare fac o cisternă (RWN193)', () => {
  const PUNCTE_INC = [BERDICHEV, PETROMIDIA];
  const v = { id: 'v-rwn', plate_number: 'RWN193' };
  const laBerdichev = (dwell) => ({ vehicle_id: 'v-rwn', lat: BERDICHEV.lat + 0.0004, lon: BERDICHEV.lon, dwell_min: dwell });
  // 189 și 312 min, ca în urma reală din 19–20.09.
  const r = cisterneDinOpriri([laBerdichev(189), laBerdichev(312)], PUNCTE_INC, [v], []);
  assert.deepEqual(r.cisterneNoi.map((c) => c.plate), ['RWN193']);
  assert.equal(r.cisterneNoi[0].opriri, 2);
  // O singură oprire lungă: poate fi o parcare lângă bază.
  assert.equal(cisterneDinOpriri([laBerdichev(312)], PUNCTE_INC, [v], []).cisterneNoi.length, 0);
  // Opriri scurte: trecere, nu încărcare.
  assert.equal(cisterneDinOpriri([laBerdichev(30), laBerdichev(40)], PUNCTE_INC, [v], []).cisterneNoi.length, 0);
  // Tipul pus de om nu se răstoarnă — iese conflict.
  const cuTip = cisterneDinOpriri([laBerdichev(189), laBerdichev(312)], PUNCTE_INC, [v], [{ vehicle_id: 'v-rwn', fleet_type: 'zernovoz' }]);
  assert.equal(cuTip.cisterneNoi.length, 0);
  assert.equal(cuTip.conflicte[0].fleetType, 'zernovoz');
  // Deja cisternă: nici conflict, nici scriere.
  const dejaCisterna = cisterneDinOpriri([laBerdichev(189), laBerdichev(312)], PUNCTE_INC, [v], [{ vehicle_id: 'v-rwn', fleet_type: 'cisterna' }]);
  assert.deepEqual([dejaCisterna.cisterneNoi.length, dejaCisterna.conflicte.length], [0, 0]);
  // Opriri departe de orice punct de încărcare.
  const laBriceni = { vehicle_id: 'v-rwn', lat: BRICENI.lat, lon: BRICENI.lon, dwell_min: 900 };
  assert.equal(cisterneDinOpriri([laBriceni, laBriceni], PUNCTE_INC, [v], []).cisterneNoi.length, 0);
});

test('alerta «fără bon TLX»: doar pentru carburant descărcat în Moldova, și abia după 24 h', () => {
  const acumMs = T0 + 30 * 3600e3;
  const md = { ...UNGHENI, country: 'Moldova' };
  const diesel = { id: 'c1', status: 'la_descarcare', cargo: 'diesel', status_changed_at: min(0), unloadPoint: md };
  const feluri = (cursa, la = acumMs) => alerteCamion({ camion: CISTERNA, cursa, stationare: null, punct: null, pozitie: null, acumMs: la }).map((a) => a.fel);
  assert.deepEqual(feluri(diesel), ['descarcare_fara_bon']);
  // La 6 h nu mai e alertă: descărcarea la bază ține ore, iar bonul se scrie și a doua zi.
  assert.deepEqual(feluri(diesel, T0 + 6 * 3600e3), []);
  // Biodiesel la Ruse: bon TLX nu există și n-a existat niciodată.
  assert.deepEqual(feluri({ ...diesel, cargo: 'biodiesel', unloadPoint: { ...RUSE, country: 'Bulgaria' } }), []);
  // Diesel, dar descărcat în afara Moldovei.
  assert.deepEqual(feluri({ ...diesel, unloadPoint: { ...md, country: 'România' } }), []);
});

// ── Recuperarea cursei nevăzute din urma GPS (Ion, 21.09) ────────────────────

/** Oprire în urma GPS, la un punct, cu durata în minute. */
const oprire = (p, arrival, dwell) => ({
  lat: p.lat + 0.0004, lon: p.lon, dwell_min: dwell,
  arrival_at: arrival, departure_at: new Date(Date.parse(arrival) + dwell * 60e3).toISOString(),
});
const AZI = Date.parse('2026-09-21T11:00:00Z');

test('ANT344: a încărcat bio la Berdichev pe 17–18.09 și nimeni n-a văzut → cursa se recuperează', () => {
  // Urma reală: 282 min + 489 min la Berdichev, apoi drumul spre casă.
  const opriri = [
    oprire(BERDICHEV, '2026-09-17T16:18:00Z', 282),
    oprire(BERDICHEV, '2026-09-17T21:03:00Z', 489),
    oprire(NORD, '2026-09-18T12:00:00Z', 229),
  ];
  const r = recupereazaDinIstoric({ camion: { ...CISTERNA, plate: 'ANT344' }, opriri, puncte: PUNCTE, ultimaCursa: null, acumMs: AZI });
  assert.equal(r.creeaza.cargo, 'biodiesel');
  assert.equal(r.creeaza.load_point_id, 'p-berd');
  // Ședințele lipite la același punct sunt o singură încărcare: ora e a primei.
  assert.equal(r.creeaza.load_planned_at, '2026-09-17T16:18:00.000Z');
  assert.equal(r.creeaza.status, 'spre_descarcare');     // s-a oprit la vamă după încărcare
  assert.equal(r.creeaza.created_by, 'auto:istoric');
  assert.equal(r.creeaza.unload_point_id, null);
  assert.equal(r.creeaza.unload_place, LOC_DESCARCARE_NECUNOSCUT);
  assert.match(r.creeaza.notes, /recuperată din urma GPS/);
});

test('drumul dus până la capăt nu se recuperează: e istorie, nu cursă', () => {
  const opriri = [
    oprire(BERDICHEV, '2026-09-12T08:00:00Z', 300),
    oprire(RUSE, '2026-09-14T09:00:00Z', 120),          // a descărcat
    oprire(BRICENI, '2026-09-16T09:00:00Z', 600),       // s-a oprit în altă parte după
  ];
  assert.equal(recupereazaDinIstoric({ camion: CISTERNA, opriri, puncte: PUNCTE, ultimaCursa: null, acumMs: AZI }), null);
});

test('oprit chiar la descărcare la capătul urmei → cursă recuperată «la descărcare», cu punctul pus', () => {
  const opriri = [
    oprire(BERDICHEV, '2026-09-18T08:00:00Z', 300),
    oprire(RUSE, '2026-09-20T09:00:00Z', 120),
  ];
  const r = recupereazaDinIstoric({ camion: CISTERNA, opriri, puncte: PUNCTE, ultimaCursa: null, acumMs: AZI });
  assert.equal(r.creeaza.status, 'la_descarcare');
  assert.equal(r.creeaza.unload_point_id, 'p-ruse');
  assert.equal(r.creeaza.unload_place, null);
});

test('diesel oprit la bază → «plin, așteaptă descărcarea», că bonul TLX n-a venit (D4)', () => {
  const opriri = [
    oprire(PETROMIDIA, '2026-09-18T08:00:00Z', 200),
    oprire(BRICENI, '2026-09-19T20:00:00Z', 900),
  ];
  const r = recupereazaDinIstoric({ camion: CISTERNA, opriri, puncte: PUNCTE, ultimaCursa: null, acumMs: AZI });
  assert.equal(r.creeaza.cargo, 'diesel');
  assert.equal(r.creeaza.status, 'asteapta_descarcare');
  assert.equal(r.creeaza.unload_point_id, 'p-bri');
  // Biodieselul la aceeași bază e doar tranzit — rămâne spre descărcare.
  const bio = [oprire(BERDICHEV, '2026-09-18T08:00:00Z', 300), oprire(BRICENI, '2026-09-19T20:00:00Z', 900)];
  assert.equal(recupereazaDinIstoric({ camion: CISTERNA, opriri: bio, puncte: PUNCTE, ultimaCursa: null, acumMs: AZI }).creeaza.status, 'spre_descarcare');
});

test('ce sistemul știe deja nu se reface', () => {
  const opriri = [oprire(BERDICHEV, '2026-09-17T16:18:00Z', 282)];
  // Cursa închisă DUPĂ plecarea de la încărcare: drumul e deja scris.
  assert.equal(recupereazaDinIstoric({ camion: CISTERNA, opriri, puncte: PUNCTE, acumMs: AZI,
    ultimaCursa: { load_planned_at: '2026-09-17T16:00:00Z', status_changed_at: '2026-09-19T10:00:00Z', status: 'incheiata' } }), null);
  // Cursa veche, terminată înainte de încărcarea asta: recuperarea merge.
  assert.ok(recupereazaDinIstoric({ camion: CISTERNA, opriri, puncte: PUNCTE, acumMs: AZI,
    ultimaCursa: { load_planned_at: '2026-09-05T04:00:00Z', status_changed_at: '2026-09-10T11:34:00Z', status: 'incheiata' } }));
});

test('recuperarea nu atinge ce nu e cisternă, opririle scurte sau urma veche', () => {
  const opriri = [oprire(BERDICHEV, '2026-09-17T16:18:00Z', 282)];
  assert.equal(recupereazaDinIstoric({ camion: { ...CISTERNA, fleetType: 'zernovoz' }, opriri, puncte: PUNCTE, ultimaCursa: null, acumMs: AZI }), null);
  // 60 min la Berdichev: sub pragul de 120, nu e încărcare.
  assert.equal(recupereazaDinIstoric({ camion: CISTERNA, opriri: [oprire(BERDICHEV, '2026-09-17T16:18:00Z', 60)], puncte: PUNCTE, ultimaCursa: null, acumMs: AZI }), null);
  // Încărcare de acum o lună: în afara ferestrei de recuperare.
  assert.equal(recupereazaDinIstoric({ camion: CISTERNA, opriri: [oprire(BERDICHEV, '2026-08-17T16:18:00Z', 282)], puncte: PUNCTE, ultimaCursa: null, acumMs: AZI }), null);
  assert.equal(recupereazaDinIstoric({ camion: CISTERNA, opriri: [], puncte: PUNCTE, ultimaCursa: null, acumMs: AZI }), null);
});

test('încărcarea nouă șterge drumul neterminat dinainte: camionul nu încarcă peste marfă', () => {
  const opriri = [
    oprire(PETROMIDIA, '2026-09-13T08:00:00Z', 200),     // diesel, drum neterminat
    oprire(BERDICHEV, '2026-09-18T08:00:00Z', 300),      // a încărcat bio: drumul vechi s-a terminat cândva
    oprire(NORD, '2026-09-19T08:00:00Z', 200),
  ];
  const r = recupereazaDinIstoric({ camion: CISTERNA, opriri, puncte: PUNCTE, ultimaCursa: null, acumMs: AZI });
  assert.equal(r.creeaza.cargo, 'biodiesel');
  assert.equal(r.creeaza.load_planned_at, '2026-09-18T08:00:00.000Z');
});

test('ANT344: bucata scurtă la același punct nu e plecare și nu rescrie ora încărcării', () => {
  // Urma reală, așa cum o taie detectorul de opriri: 282, 489, 89 (sub pragul de
  // 120), 130 — toate la Berdichev, o singură încărcare.
  const opriri = [
    oprire(BERDICHEV, '2026-09-17T16:18:00Z', 282),
    oprire(BERDICHEV, '2026-09-17T21:03:00Z', 489),
    oprire(BERDICHEV, '2026-09-18T05:50:00Z', 89),
    oprire(BERDICHEV, '2026-09-18T07:54:00Z', 130),
    oprire(UNGHENI, '2026-09-19T06:52:00Z', 848),      // biodiesel la o stație de diesel: nu descarcă (D4)
  ];
  const r = recupereazaDinIstoric({ camion: { ...CISTERNA, plate: 'ANT344' }, opriri, puncte: PUNCTE, ultimaCursa: null, acumMs: AZI });
  assert.equal(r.creeaza.load_planned_at, '2026-09-17T16:18:00.000Z');
  assert.equal(r.creeaza.cargo, 'biodiesel');
  assert.equal(r.creeaza.status, 'spre_descarcare');
  assert.equal(r.creeaza.unload_point_id, null);
});
