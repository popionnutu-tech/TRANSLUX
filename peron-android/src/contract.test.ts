/**
 * Rulare: `cd peron-android && npm test` (node:test, Node ≥ 22.18 rulează .ts direct).
 *
 * Contractul cu API-ul botului, partea de RULARE: fixture-urile din `__fixtures__/`
 * (răspunsuri reale ale API-ului, scrise de testele cap-coadă din bot) au valorile
 * în formele pe care se bazează ecranele — enum-urile, HH:MM, YYYY-MM-DD, listele.
 * Potrivirea cheilor și a tipurilor o face `tsc --noEmit` prin contract.ts.
 *
 * JSON-ul se citește cu readFileSync (nu import): `import … with { type: 'json' }`
 * nu e acceptat de tsconfig-ul Expo, iar aici tipurile sunt oricum doar `import type`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { DayResponse, ReportResponse } from './types.ts';

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url), 'utf8')) as T;
}

const dayChisinau = fixture<DayResponse>('day.chisinau');
const dayBalti = fixture<DayResponse>('day.balti');
const reportOk = fixture<ReportResponse>('report.ok');

const HHMM = /^\d{2}:\d{2}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES = new Set(['done', 'next', 'locked']);
const ZONES = new Set(['PERON', 'PIETONI', 'VECEU']);

function checkDay(day: DayResponse, point: 'CHISINAU' | 'BALTI') {
  assert.equal(day.point, point);
  assert.equal(day.user.point, point);
  assert.match(day.date, YMD);
  assert.match(day.user.id, UUID);
  assert.ok(day.user.name === null || day.user.name.startsWith('@'));
  assert.ok(!('ok' in day), 'fixture-ul e corpul fără învelișul ok');

  assert.equal(day.trips.length, 29, 'graficul zilei are 29 de curse la fiecare punct');
  for (const t of day.trips) {
    assert.match(t.id, UUID);
    assert.match(t.departure_time, HHMM);
    assert.ok(t.route_name.length > 0);
    assert.ok(t.crm_route_id === null || Number.isInteger(t.crm_route_id));
    assert.ok(STATES.has(t.state), `stare necunoscută: ${t.state}`);
  }
  const times = day.trips.map((t) => t.departure_time);
  assert.deepEqual(times, [...times].sort(), 'cursele vin în ordinea plecării');
  assert.equal(day.trips.filter((t) => t.state === 'next').length, 1, 'exact o cursă e `next`');

  for (const [tripId, a] of Object.entries(day.assignments)) {
    assert.ok(day.trips.some((t) => t.id === tripId), 'repartizarea e pe o cursă din listă');
    assert.match(a.driver_id, UUID);
    assert.ok(a.driver_name.length > 0);
    assert.ok(a.vehicle_id === null || UUID.test(a.vehicle_id));
    assert.ok(a.plate === null || a.plate.length > 0);
  }
  for (const [vehicleId, kind] of Object.entries(day.climate)) {
    assert.match(vehicleId, UUID);
    assert.ok(kind === 'ac' || kind === 'heat' || kind === null);
  }
  for (const slot of ['DIMINEATA', 'ZIUA'] as const) {
    for (const z of day.cleaning[slot]) assert.ok(ZONES.has(z), `zonă necunoscută: ${z}`);
  }
  // poza șoferului o dată pe zi: per driver_id, prima poză acceptată de azi (S02 criteria-v2)
  assert.ok(day.driverChecks && typeof day.driverChecks === 'object' && !Array.isArray(day.driverChecks));
  for (const [driverId, c] of Object.entries(day.driverChecks)) {
    assert.match(driverId, UUID);
    assert.match(c.id, UUID);
    assert.equal(typeof c.uniformOk, 'boolean');
    assert.equal(typeof c.groomedOk, 'boolean');
    assert.match(c.at, HHMM);
    assert.ok(!('shavedOk' in c), 'DB-ul ține doar groomed_ok = bărbierit && aspect');
  }
  assert.ok(day.cleaningGateTripTime === null || HHMM.test(day.cleaningGateTripTime));
  for (const t of day.locationExemptTimes) assert.match(t, HHMM);
  assert.ok(Number.isFinite(day.station.lat) && Number.isFinite(day.station.lon) && day.station.radiusM > 0);
  assert.equal(typeof day.allowFull, 'boolean');
  assert.ok(day.presenceWindow !== null, 'punctul are curse → are fereastră de prezență');
  assert.match(day.presenceWindow.from, HHMM);
  assert.match(day.presenceWindow.to, HHMM);
  assert.ok(day.presenceWindow.from < times[0]!, 'fereastra începe înaintea primei curse');
  assert.ok(day.presenceWindow.to > times[times.length - 1]!, 'fereastra se termină după ultima cursă');
}

describe('GET /day — Chișinău (day.chisinau.json)', () => {
  it('are forma pe care o desenează ecranul zilei', () => checkDay(dayChisinau, 'CHISINAU'));

  it('fluxul complet: repartizări, șoferi, auto, reclamă deschisă, climă și curățenia de dimineață — toate nenule', () => {
    assert.ok(Object.keys(dayChisinau.assignments).length > 0);
    assert.ok(dayChisinau.drivers.length > 0 && dayChisinau.vehicles.length > 0);
    for (const [plate, r] of Object.entries(dayChisinau.openReclama)) {
      assert.ok(plate.length > 0);
      assert.match(r.taskId, UUID);
      assert.ok(r.description.length > 0);
      assert.ok(r.lastComment === null || typeof r.lastComment === 'string');
    }
    assert.ok(Object.keys(dayChisinau.openReclama).length > 0);
    assert.ok(Object.values(dayChisinau.climate).some((k) => k === 'ac'));
    assert.deepEqual([...dayChisinau.cleaning.DIMINEATA].sort(), ['PERON', 'PIETONI', 'VECEU']);
    assert.equal(dayChisinau.cleaningGateTripTime, '16:25');
    assert.deepEqual(dayChisinau.locationExemptTimes, ['06:55', '20:00']);
    assert.equal(dayChisinau.allowFull, false);
    assert.deepEqual(dayChisinau.presenceWindow, { from: '06:25', to: '20:30' });
  });
});

describe('GET /day — Bălți (day.balti.json)', () => {
  it('are forma pe care o desenează ecranul zilei', () => checkDay(dayBalti, 'BALTI'));

  it('fluxul scurt: liste goale, fără poartă, fără excepții, allowFull', () => {
    assert.deepEqual(dayBalti.assignments, {});
    assert.deepEqual(dayBalti.drivers, []);
    assert.deepEqual(dayBalti.vehicles, []);
    assert.deepEqual(dayBalti.openReclama, {});
    assert.deepEqual(dayBalti.climate, {});
    assert.deepEqual(dayBalti.cleaning, { DIMINEATA: [], ZIUA: [] });
    assert.equal(dayBalti.cleaningGateTripTime, null);
    assert.deepEqual(dayBalti.locationExemptTimes, []);
    assert.equal(dayBalti.allowFull, true);
    assert.deepEqual(dayBalti.presenceWindow, { from: '04:50', to: '20:50' });
  });
});

describe('POST /report — răspuns reușit (report.ok.json)', () => {
  it('summary e linia «☑ HH:MM — …» pe care o arată aplicația; allDone e boolean', () => {
    assert.ok(!('ok' in reportOk));
    assert.match(reportOk.summary, /^☑ \d{2}:\d{2} — /);
    assert.equal(typeof reportOk.allDone, 'boolean');
  });
});
