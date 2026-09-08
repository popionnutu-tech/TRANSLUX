/**
 * Rulare: `cd peron-android && node --test src/buildReport.test.ts` (Node ≥ 22.18 rulează .ts direct).
 * Fără runner de teste în aplicație — doar node:test, doar pentru logica pură.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  blockingReason,
  buildReportBody,
  climateKindFor,
  exteriorOkOf,
  initialState,
  locationLabel,
  minutesLate,
  openReclamaFor,
  tripContext,
  withPhoto,
  type DriverPhotoState,
  type TripContext,
} from './buildReport.ts';
import type { DayResponse } from './types.ts';

const day: DayResponse = {
  date: '2026-09-08',
  point: 'CHISINAU',
  user: { id: 'u1', name: 'ion', point: 'CHISINAU' },
  trips: [
    { id: 't1', departure_time: '06:55', route_name: 'Chișinău–Briceni', crm_route_id: null, state: 'done' },
    { id: 't2', departure_time: '08:30', route_name: 'Chișinău–Briceni', crm_route_id: null, state: 'next' },
  ],
  assignments: { t2: { driver_id: 'd1', driver_name: 'Ion Moldovan', vehicle_id: 'v1', plate: 'LYY735' } },
  drivers: [
    { id: 'd1', name: 'Ion Moldovan' },
    { id: 'd2', name: 'Vasile Rusu' },
  ],
  vehicles: [
    { id: 'v1', plate: 'LYY735' },
    { id: 'v2', plate: '998TCP' },
  ],
  openReclama: { '998TCP': { taskId: 'task-9', description: 'panou rută rupt', lastComment: null } },
  climate: { v1: 'ac', v2: null },
  cleaning: { DIMINEATA: ['PERON', 'PIETONI', 'VECEU'], ZIUA: [] },
  cleaningGateTripTime: '16:25',
  locationExemptTimes: ['06:55', '20:00'],
  station: { lat: 47.0, lon: 28.8, radiusM: 150 },
  allowFull: false,
  presenceWindow: { from: '06:25', to: '20:30' },
};

const ctx: TripContext = tripContext(day, 't2');
const photo: DriverPhotoState = {
  driverCheckId: 'chk-1',
  uri: 'file:///x.jpg',
  verdict: 'OK',
  uniformOk: true,
  shavedOk: true,
  groomedOk: true,
  description: 'uniformă: da · bărbierit: da · aspect: da · cămașă vișinie TRANSLUX, pantofi negri',
};
/** Modelul n-a răspuns: rândul există, verdictele sunt null. */
const eroarePhoto: DriverPhotoState = { ...photo, driverCheckId: 'chk-err', verdict: 'EROARE', uniformOk: null, shavedOk: null, groomedOk: null, description: '' };
const coords = { lat: 47.0001, lon: 28.8001, accuracyM: 12 };

describe('initialState', () => {
  it('pornește de la repartizare, cu toate verificările OK și fără cifră/poză', () => {
    const s = initialState(ctx);
    assert.equal(s.status, 'OK');
    assert.equal(s.passengers, null);
    assert.equal(s.driverId, 'd1');
    assert.equal(s.vehicleId, 'v1');
    assert.equal(s.photo, null);
    assert.equal(s.loadingHelpOk, true);
    assert.equal(s.autoCurat, true);
    assert.equal(s.reclama, 'ok');
    assert.equal(s.climate, 'works');
  });

  it('fără repartizare → șofer și auto null', () => {
    const s = initialState(tripContext(day, 't1'));
    assert.equal(s.driverId, null);
    assert.equal(s.vehicleId, null);
  });
});

describe('buildReportBody', () => {
  it('Absent → status ABSENT, driverCheckId null, toate câmpurile de calitate null, fără washGrade', () => {
    const s = { ...initialState(ctx), status: 'ABSENT' as const, passengers: 7 };
    const body = buildReportBody(ctx, s, coords);
    assert.equal(body.status, 'ABSENT');
    assert.equal(body.tripId, 't2');
    assert.equal(body.passengersCount, null);
    assert.equal(body.driverCheckId, null);
    assert.equal(body.driverId, null);
    assert.equal(body.vehicleId, null);
    assert.equal(body.assignmentChanged, false);
    for (const k of ['loadingHelpOk', 'autoCurat', 'uniformOk', 'exteriorOk', 'reclamaOk', 'reclamaProblem', 'reclamaTaskId', 'acStatus', 'heatStatus'] as const) {
      assert.equal(body[k], null, k);
    }
    assert.equal(body.reclamaRepairConfirmed, false);
    assert.equal(body.lat, coords.lat);
    assert.equal(body.accuracyM, 12);
    assert.ok(!('washGrade' in body));
    assert.equal(blockingReason(ctx, s), null);
  });

  it('starea implicită cu 12 pasageri și verdictul modelului OK → toate *_ok true, reclamaOk true, driverCheckId setat', () => {
    const s = { ...withPhoto(initialState(ctx), photo), passengers: 12 };
    assert.equal(blockingReason(ctx, s), null);
    const body = buildReportBody(ctx, s, coords);
    assert.equal(body.status, 'OK');
    assert.equal(body.passengersCount, 12);
    assert.equal(body.driverId, 'd1');
    assert.equal(body.vehicleId, 'v1');
    assert.equal(body.assignmentChanged, false);
    assert.equal(body.driverCheckId, 'chk-1');
    assert.equal(body.loadingHelpOk, true);
    assert.equal(body.autoCurat, true);
    assert.equal(body.uniformOk, true);
    assert.equal(body.exteriorOk, true);
    assert.equal(body.reclamaOk, true);
    assert.equal(body.reclamaProblem, null);
    assert.equal(body.reclamaRepairConfirmed, false);
    assert.equal(body.reclamaTaskId, null);
    assert.equal(body.acStatus, 'works'); // v1 e în sezonul de aer condiționat
    assert.equal(body.heatStatus, null);
    assert.ok(!('washGrade' in body));
  });

  it('verdictul modelului pleacă neschimbat: uniformOk = uniforma, exteriorOk = bărbierit && aspect', () => {
    const noUniform = { ...withPhoto(initialState(ctx), { ...photo, uniformOk: false }), passengers: 3 };
    assert.equal(buildReportBody(ctx, noUniform, null).uniformOk, false);
    assert.equal(buildReportBody(ctx, noUniform, null).exteriorOk, true);
    assert.equal(buildReportBody(ctx, noUniform, null).lat, null);

    const unshaved = { ...withPhoto(initialState(ctx), { ...photo, shavedOk: false }), passengers: 3 };
    assert.equal(buildReportBody(ctx, unshaved, null).uniformOk, true);
    assert.equal(buildReportBody(ctx, unshaved, null).exteriorOk, false);

    const untidy = { ...withPhoto(initialState(ctx), { ...photo, groomedOk: false }), passengers: 3 };
    assert.equal(buildReportBody(ctx, untidy, null).exteriorOk, false);
    assert.equal(blockingReason(ctx, untidy), null);
  });

  it('starea formularului nu are verdicte proprii — nu există nimic de răsturnat', () => {
    const s = withPhoto(initialState(ctx), photo);
    assert.ok(!('uniformOk' in s));
    assert.ok(!('exteriorOk' in s));
  });

  it('EROARE (modelul n-a răspuns): raportul pleacă cu driverCheckId și verdicte null, nu se inventează', () => {
    const s = { ...withPhoto(initialState(ctx), eroarePhoto), passengers: 3 };
    assert.equal(blockingReason(ctx, s), null);
    const body = buildReportBody(ctx, s, null);
    assert.equal(body.driverCheckId, 'chk-err');
    assert.equal(body.uniformOk, null);
    assert.equal(body.exteriorOk, null);
  });

  it('exteriorOkOf: null dacă lipsește vreun verdict, altfel bărbierit && aspect', () => {
    assert.equal(exteriorOkOf(null), null);
    assert.equal(exteriorOkOf(eroarePhoto), null);
    assert.equal(exteriorOkOf({ ...photo, shavedOk: null }), null);
    assert.equal(exteriorOkOf({ ...photo, groomedOk: null }), null);
    assert.equal(exteriorOkOf(photo), true);
    assert.equal(exteriorOkOf({ ...photo, shavedOk: false }), false);
    assert.equal(exteriorOkOf({ ...photo, groomedOk: false }), false);
  });

  it('reclamă ≠ OK → reclamaOk false + reclamaProblem', () => {
    const s = { ...withPhoto(initialState(ctx), photo), passengers: 3, reclama: 'panou_ruta' as const };
    const body = buildReportBody(ctx, s, null);
    assert.equal(body.reclamaOk, false);
    assert.equal(body.reclamaProblem, 'panou_ruta');
  });

  it('fără auto → reclamaOk null și fără climă; schimbarea șoferului → assignmentChanged', () => {
    const s = { ...withPhoto(initialState(ctx), photo), passengers: 3, vehicleId: null, driverId: 'd2' };
    const body = buildReportBody(ctx, s, null);
    assert.equal(body.reclamaOk, null);
    assert.equal(body.acStatus, null);
    assert.equal(body.assignmentChanged, true);
  });

  it('mașină cu sarcină reclamă deschisă: «Totul OK» cere «a fost reparat?», «da» trimite reclamaTaskId', () => {
    const s = { ...withPhoto(initialState(ctx), photo), passengers: 3, vehicleId: 'v2' };
    assert.deepEqual(openReclamaFor(ctx, 'v2')?.taskId, 'task-9');
    assert.equal(climateKindFor(ctx, 'v2'), null);
    assert.match(blockingReason(ctx, s) ?? '', /reparat/);
    assert.match(blockingReason(ctx, { ...s, repair: 'nu' }) ?? '', /alege defectul/);
    const body = buildReportBody(ctx, { ...s, repair: 'da' }, null);
    assert.equal(body.reclamaOk, true);
    assert.equal(body.reclamaRepairConfirmed, true);
    assert.equal(body.reclamaTaskId, 'task-9');
    assert.equal(body.assignmentChanged, true);
    assert.equal(body.acStatus, null);
    // dacă alege un defect, întrebarea de reparație nu mai contează
    const fixed = buildReportBody(ctx, { ...s, repair: 'nu', reclama: 'bus' }, null);
    assert.equal(blockingReason(ctx, { ...s, repair: 'nu', reclama: 'bus' }), null);
    assert.equal(fixed.reclamaRepairConfirmed, false);
    assert.equal(fixed.reclamaProblem, 'bus');
  });

  it('Bălți: doar status, cifră și locație; FULL fără cifră', () => {
    const balti: TripContext = { ...ctx, point: 'BALTI', assignment: null };
    const ok = buildReportBody(balti, { ...withPhoto(initialState(balti), photo), passengers: 9 }, coords);
    assert.equal(ok.passengersCount, 9);
    assert.equal(ok.driverCheckId, null);
    assert.equal(ok.loadingHelpOk, null);
    assert.equal(ok.reclamaOk, null);
    assert.equal(blockingReason(balti, { ...initialState(balti), passengers: 9 }), null);
    const full = buildReportBody(balti, { ...initialState(balti), status: 'FULL', passengers: 9 }, coords);
    assert.equal(full.status, 'FULL');
    assert.equal(full.passengersCount, null);
  });
});

describe('blockingReason', () => {
  it('cere pe rând cifra și poza; după poză nu mai cere nimic (verdictul e al modelului)', () => {
    const s = initialState(ctx);
    assert.match(blockingReason(ctx, s) ?? '', /pasageri/);
    assert.match(blockingReason(ctx, { ...s, passengers: 28 }) ?? '', /pasageri/);
    assert.match(blockingReason(ctx, { ...s, passengers: 0 }) ?? '', /poza/);
    assert.equal(blockingReason(ctx, withPhoto({ ...s, passengers: 0 }, photo)), null);
    assert.equal(blockingReason(ctx, withPhoto({ ...s, passengers: 0 }, { ...photo, uniformOk: false, shavedOk: false, groomedOk: false })), null);
    assert.equal(blockingReason(ctx, withPhoto({ ...s, passengers: 0 }, eroarePhoto)), null);
    // «Refă poza» / alt șofer → poza dispare → iar cere poza
    assert.match(blockingReason(ctx, withPhoto(withPhoto({ ...s, passengers: 0 }, photo), null)) ?? '', /poza/);
  });
});

describe('minutesLate / locationLabel', () => {
  it('întârzierea după ceasul telefonului', () => {
    assert.equal(minutesLate(new Date(2026, 8, 8, 8, 45), '08:30'), 15);
    assert.equal(minutesLate(new Date(2026, 8, 8, 8, 20), '08:30:00'), -10);
  });
  it('etichetele locației', () => {
    assert.equal(locationLabel(null, true), '📍 se caută…');
    assert.equal(locationLabel(null, false), '📍 fără GPS');
    assert.equal(locationLabel(41.6, false), '📍 42 m de stație');
  });
});
