// Teste pentru stările automate (node --test lde-geo-worker/trip-auto.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { deciziaGps, deciziaTlx, statiaPunctului, razaEfectiva, normPlaca, inMoldova } from './trip-auto.mjs';

const ACUM = Date.parse('2026-09-08T12:00:00Z');
const iso = (min) => new Date(ACUM + min * 60e3).toISOString();

// TLX Bălți, punct cu raza 300 m; poziții: în rază / la 2 km
const BALTI = { lat: 47.75288, lon: 27.87852, radius_m: 300, country: 'Moldova' };
const IN_RAZA = { lat: 47.7530, lon: 27.8786 };
const DEPARTE = { lat: 47.7699, lon: 27.9236 };

const cursa = (extra = {}) => ({
  id: 'c1', status: 'spre_descarcare', plate: 'KWX620', cargo: 'diesel', unload_seen_at: null, unloadPoint: BALTI,
  load_planned_at: '2026-09-07T06:00:00Z', unload_planned_at: '2026-09-08T10:00:00Z', ...extra,
});

test('razaEfectiva: plafon 200..2000 m, 500 implicit', () => {
  assert.equal(razaEfectiva(50), 200);
  assert.equal(razaEfectiva(20000), 2000);
  assert.equal(razaEfectiva(null), 500);
});

test('GPS: prima observare în rază doar notează unload_seen_at, nu mută starea', () => {
  const d = deciziaGps(cursa(), { ...IN_RAZA, speed: 0, at: iso(-2) }, ACUM);
  assert.deepEqual(d, { unload_seen_at: iso(-2) });
});

test('GPS: sub 15 minute de la prima observare — nimic', () => {
  const d = deciziaGps(cursa({ unload_seen_at: iso(-10) }), { ...IN_RAZA, speed: 1, at: iso(-1) }, ACUM);
  assert.equal(d, null);
});

test('GPS: după 15 minute în rază, stând, cursa trece «la descărcare» cu sursa gps', () => {
  const d = deciziaGps(cursa({ unload_seen_at: iso(-20) }), { ...IN_RAZA, speed: 0, at: iso(-1) }, ACUM);
  assert.equal(d.status, 'la_descarcare');
  assert.equal(d.status_source, 'gps');
  assert.equal(d.updated_by, 'auto:gps');
});

test('GPS: dacă se mișcă sau iese din rază, prima observare se șterge', () => {
  assert.deepEqual(deciziaGps(cursa({ unload_seen_at: iso(-20) }), { ...IN_RAZA, speed: 40, at: iso(-1) }, ACUM), { unload_seen_at: null });
  assert.deepEqual(deciziaGps(cursa({ unload_seen_at: iso(-20) }), { ...DEPARTE, speed: 0, at: iso(-1) }, ACUM), { unload_seen_at: null });
  // fără observare anterioară, plecarea nu scrie nimic
  assert.equal(deciziaGps(cursa(), { ...DEPARTE, speed: 0, at: iso(-1) }, ACUM), null);
});

test('GPS: poziția veche (peste 30 min) sau din viitor nu decide nimic — nici nu șterge', () => {
  assert.equal(deciziaGps(cursa({ unload_seen_at: iso(-20) }), { ...DEPARTE, speed: 0, at: iso(-45) }, ACUM), null);
  assert.equal(deciziaGps(cursa({ unload_seen_at: iso(-20) }), { ...IN_RAZA, speed: 0, at: iso(+5) }, ACUM), null);
});

test('GPS: doar un camion deja plin poate trece «la descărcare»', () => {
  for (const status of ['planificata', 'spre_incarcare', 'la_descarcare', 'incheiata', 'anulata']) {
    assert.equal(deciziaGps(cursa({ status, unload_seen_at: iso(-20) }), { ...IN_RAZA, speed: 0, at: iso(-1) }, ACUM), null, status);
  }
  for (const status of ['la_incarcare', 'asteapta_descarcare', 'spre_descarcare']) {
    assert.equal(deciziaGps(cursa({ status, unload_seen_at: iso(-20) }), { ...IN_RAZA, speed: 0, at: iso(-1) }, ACUM)?.status, 'la_descarcare', status);
  }
});

test('GPS: punct fără coordonate sau fără poziție — nimic', () => {
  assert.equal(deciziaGps(cursa({ unloadPoint: { lat: null, lon: null, radius_m: 300 } }), { ...IN_RAZA, speed: 0, at: iso(-1) }, ACUM), null);
  assert.equal(deciziaGps(cursa(), null, ACUM), null);
});

const STATII = [
  { id: 'st-balti', lat: 47.7528819, lon: 27.8785248 },
  { id: 'st-singerei', lat: 47.6244675, lon: 28.1784889 },
];

test('statiaPunctului: stația de pe punct; baza Briceni n-are stație', () => {
  assert.equal(statiaPunctului(BALTI, STATII)?.id, 'st-balti');
  assert.equal(statiaPunctului({ lat: 48.3535, lon: 27.1013, radius_m: 800 }, STATII), null);
});

const rec = (extra = {}) => ({
  id: 'r1', station_id: 'st-balti', nr_auto: 'KWX 620', volume: 23995,
  unloaded_at: '2026-09-08T09:30:00Z', created_at: '2026-09-08T11:00:00Z', is_deleted: false, ...extra,
});

test('TLX: recepția cu numărul camionului la stația punctului închide cursa', () => {
  const d = deciziaTlx(cursa(), [rec()], STATII, new Set(), ACUM);
  assert.equal(d.status, 'incheiata');
  assert.equal(d.status_source, 'tlx');
  assert.equal(d.tlx_receipt_id, 'r1');
  assert.equal(d.tlx_receipt_at, '2026-09-08T09:30:00.000Z');
  assert.equal(d.tlx_receipt_liters, 23995);
});

test('TLX: numărul se potrivește indiferent de spații/minuscule', () => {
  assert.equal(normPlaca('kwx 620'), 'KWX620');
  assert.ok(deciziaTlx(cursa({ plate: 'KWX 620' }), [rec({ nr_auto: 'kwx620' })], STATII));
});

test('TLX: altă stație, alt camion, recepție ștearsă sau deja folosită — nimic', () => {
  assert.equal(deciziaTlx(cursa(), [rec({ station_id: 'st-singerei' })], STATII), null);
  assert.equal(deciziaTlx(cursa(), [rec({ nr_auto: 'MRR 739' })], STATII), null);
  assert.equal(deciziaTlx(cursa(), [rec({ is_deleted: true })], STATII), null);
  assert.equal(deciziaTlx(cursa(), [rec()], STATII, new Set(['r1'])), null);
  assert.equal(deciziaTlx(cursa(), [rec({ nr_auto: null })], STATII), null);
});

test('TLX: recepția din afara ferestrei cursei nu o închide (e a altei curse)', () => {
  assert.equal(deciziaTlx(cursa(), [rec({ unloaded_at: '2026-09-01T09:30:00Z' })], STATII), null);
  assert.equal(deciziaTlx(cursa(), [rec({ unloaded_at: '2026-09-20T09:30:00Z' })], STATII), null);
  // întârziere de 2 zile față de plan — încă în fereastră
  assert.ok(deciziaTlx(cursa(), [rec({ unloaded_at: '2026-09-10T09:30:00Z' })], STATII));
});

test('TLX: fără unloaded_at se ia created_at', () => {
  const d = deciziaTlx(cursa(), [rec({ unloaded_at: null })], STATII);
  assert.equal(d.tlx_receipt_at, '2026-09-08T11:00:00.000Z');
});

test('TLX: punctul de descărcare fără stație TLX (baza Briceni) — rămâne dispecerul', () => {
  const c = cursa({ unloadPoint: { lat: 48.3535, lon: 27.1013, radius_m: 800 } });
  assert.equal(deciziaTlx(c, [rec()], STATII), null);
});

test('TLX: închide din orice stare cu marfă, inclusiv «la descărcare»; nu din planificată', () => {
  for (const status of ['la_incarcare', 'asteapta_descarcare', 'spre_descarcare', 'la_descarcare']) {
    assert.equal(deciziaTlx(cursa({ status }), [rec()], STATII)?.status, 'incheiata', status);
  }
  for (const status of ['planificata', 'spre_incarcare', 'incheiata', 'anulata']) {
    assert.equal(deciziaTlx(cursa({ status }), [rec()], STATII), null, status);
  }
});

test('TLX: dintre mai multe recepții potrivite se ia cea mai timpurie', () => {
  const d = deciziaTlx(cursa(), [rec({ id: 'r2', unloaded_at: '2026-09-08T10:30:00Z' }), rec()], STATII);
  assert.equal(d.tlx_receipt_id, 'r1');
});

test('inMoldova: Moldova / Republica Moldova / MD, nu România sau gol', () => {
  assert.equal(inMoldova({ country: 'Moldova' }), true);
  assert.equal(inMoldova({ country: 'Republica Moldova' }), true);
  assert.equal(inMoldova({ country: ' md ' }), true);
  assert.equal(inMoldova({ country: 'România' }), false);
  assert.equal(inMoldova({ country: null }), false);
  assert.equal(inMoldova(null), false);
});

// Punct în afara Moldovei, cu aceleași coordonate ca stația (cazul teoretic în
// care cineva pune o stație TLX cu țara greșită) — regula e în cod, nu în hartă.
const BALTI_RO = { ...BALTI, country: 'România' };
const RUSE = { lat: 43.8564, lon: 25.9707, radius_m: 2000, country: 'Bulgaria' };
const IN_RUSE = { lat: 43.8570, lon: 25.9710 };

test('TLX: închiderea automată doar în Moldova', () => {
  assert.equal(deciziaTlx(cursa({ unloadPoint: BALTI_RO }), [rec()], STATII), null);
  assert.equal(deciziaTlx(cursa({ unloadPoint: { ...BALTI, country: null } }), [rec()], STATII), null);
  assert.ok(deciziaTlx(cursa(), [rec()], STATII));
});

test('GPS: dieselul trece «la descărcare» doar în Moldova; biodieselul și la Ruse', () => {
  const stand = (pozitie) => ({ ...pozitie, speed: 0, at: iso(-1) });
  assert.equal(deciziaGps(cursa({ cargo: 'diesel', unloadPoint: RUSE, unload_seen_at: iso(-20) }), stand(IN_RUSE), ACUM), null);
  assert.equal(deciziaGps(cursa({ cargo: 'diesel', unloadPoint: RUSE }), stand(IN_RUSE), ACUM), null);
  assert.equal(deciziaGps(cursa({ cargo: 'biodiesel', unloadPoint: RUSE, unload_seen_at: iso(-20) }), stand(IN_RUSE), ACUM)?.status, 'la_descarcare');
  assert.equal(deciziaGps(cursa({ cargo: 'cereale', unloadPoint: RUSE, unload_seen_at: iso(-20) }), stand(IN_RUSE), ACUM)?.status, 'la_descarcare');
  assert.equal(deciziaGps(cursa({ cargo: 'diesel', unload_seen_at: iso(-20) }), stand(IN_RAZA), ACUM)?.status, 'la_descarcare');
});
