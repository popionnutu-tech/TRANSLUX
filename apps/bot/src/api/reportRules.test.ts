import { describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { ApiError } from './errors.js';
import {
  CleaningRequiredError,
  buildSummary,
  cleaningGateSlot,
  cleaningMissing,
  computeLocation,
  normalizePlate,
  parseReportBody,
  shortDriverName,
  toReportRow,
  withModelVerdicts,
} from './reportRules.js';

const okBody = {
  tripId: 't1',
  status: 'OK',
  passengersCount: 12,
  driverId: 'd1',
  vehicleId: 'v1',
  assignmentChanged: false,
  loadingHelpOk: true,
  autoCurat: true,
  driverCheckId: 'chk1',
  uniformOk: true,
  exteriorOk: true,
  reclamaOk: true,
  reclamaProblem: null,
  reclamaRepairConfirmed: false,
  reclamaTaskId: null,
  acStatus: null,
  heatStatus: null,
  lat: 47.0236,
  lon: 28.8627,
  accuracyM: 12.4,
};

function apiErr(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('nu a aruncat');
}

describe('parseReportBody — CHISINAU', () => {
  it('corp complet OK → toate câmpurile, accuracy rotunjit', () => {
    const b = parseReportBody(okBody, 'CHISINAU');
    expect(b.status).toBe('OK');
    expect(b.passengersCount).toBe(12);
    expect(b.driverCheckId).toBe('chk1');
    expect(b.reclamaOk).toBe(true);
    expect(b.reclamaProblem).toBeNull();
    expect(b.accuracyM).toBe(12);
  });

  it('uniformOk / exteriorOk sunt opționale (verdictul e al pozei); alt tip decât boolean → 400', () => {
    const { uniformOk: _u, exteriorOk: _e, ...withoutVerdicts } = okBody;
    const b = parseReportBody(withoutVerdicts, 'CHISINAU');
    expect(b.uniformOk).toBeNull();
    expect(b.exteriorOk).toBeNull();
    expect(parseReportBody({ ...okBody, uniformOk: null, exteriorOk: null }, 'CHISINAU')).toMatchObject({ uniformOk: null, exteriorOk: null });
    expect(apiErr(() => parseReportBody({ ...okBody, uniformOk: 'da' }, 'CHISINAU')).status).toBe(400);
  });

  it('OK fără driverCheckId → 400 DRIVER_PHOTO_REQUIRED', () => {
    const e = apiErr(() => parseReportBody({ ...okBody, driverCheckId: null }, 'CHISINAU'));
    expect(e.status).toBe(400);
    expect(e.code).toBe('DRIVER_PHOTO_REQUIRED');
  });

  it('28 pasageri → 400; -1 și 3.5 la fel', () => {
    for (const n of [28, -1, 3.5, null, '12']) {
      const e = apiErr(() => parseReportBody({ ...okBody, passengersCount: n }, 'CHISINAU'));
      expect(e.status).toBe(400);
    }
    expect(parseReportBody({ ...okBody, passengersCount: 0 }, 'CHISINAU').passengersCount).toBe(0);
    expect(parseReportBody({ ...okBody, passengersCount: 27 }, 'CHISINAU').passengersCount).toBe(27);
  });

  it('ABSENT fără cifră și fără poză e valid → câmpurile de calitate null', () => {
    const b = parseReportBody({ tripId: 't1', status: 'ABSENT', lat: null, lon: null }, 'CHISINAU');
    expect(b.status).toBe('ABSENT');
    expect(b.passengersCount).toBeNull();
    expect(b.driverCheckId).toBeNull();
    expect(b.uniformOk).toBeNull();
    expect(b.loadingHelpOk).toBeNull();
    expect(b.reclamaOk).toBeNull();
    expect(b.driverId).toBeNull();
    expect(b.vehicleId).toBeNull();
  });

  it('FULL la CHISINAU → 400', () => {
    const e = apiErr(() => parseReportBody({ ...okBody, status: 'FULL' }, 'CHISINAU'));
    expect(e.status).toBe(400);
  });

  it('reclamă ≠ OK cere reclamaProblem; cu problemă → se păstrează', () => {
    expect(apiErr(() => parseReportBody({ ...okBody, reclamaOk: false }, 'CHISINAU')).status).toBe(400);
    const b = parseReportBody({ ...okBody, reclamaOk: false, reclamaProblem: 'panou_ruta' }, 'CHISINAU');
    expect(b.reclamaOk).toBe(false);
    expect(b.reclamaProblem).toBe('panou_ruta');
    expect(b.reclamaRepairConfirmed).toBe(false);
  });

  it('fără auto → reclama nu se cere (null), ca în bot', () => {
    const b = parseReportBody({ ...okBody, vehicleId: null, reclamaOk: undefined }, 'CHISINAU');
    expect(b.reclamaOk).toBeNull();
    expect(b.reclamaProblem).toBeNull();
  });

  it('«Da, reparat» → reclamaRepairConfirmed + taskId; problema devine null', () => {
    const b = parseReportBody({ ...okBody, reclamaOk: true, reclamaRepairConfirmed: true, reclamaTaskId: 'ob1' }, 'CHISINAU');
    expect(b.reclamaRepairConfirmed).toBe(true);
    expect(b.reclamaTaskId).toBe('ob1');
    expect(b.reclamaProblem).toBeNull();
  });

  it('acStatus în afara listei → 400; valoare bună → se păstrează', () => {
    expect(apiErr(() => parseReportBody({ ...okBody, acStatus: 'ok' }, 'CHISINAU')).status).toBe(400);
    expect(parseReportBody({ ...okBody, acStatus: 'broken' }, 'CHISINAU').acStatus).toBe('broken');
  });

  it('lat fără lon → 400; tripId lipsă → 400; status necunoscut → 400', () => {
    expect(apiErr(() => parseReportBody({ ...okBody, lon: null }, 'CHISINAU')).status).toBe(400);
    expect(apiErr(() => parseReportBody({ ...okBody, tripId: '' }, 'CHISINAU')).status).toBe(400);
    expect(apiErr(() => parseReportBody({ ...okBody, status: 'LATE' }, 'CHISINAU')).status).toBe(400);
    expect(apiErr(() => parseReportBody(null, 'CHISINAU')).status).toBe(400);
  });
});

describe('parseReportBody — BALTI', () => {
  it('FULL → status FULL, fără cifră, restul null; coordonatele rămân', () => {
    const b = parseReportBody({ tripId: 't1', status: 'FULL', passengersCount: 5, lat: 47.77, lon: 27.94, accuracyM: 8 }, 'BALTI');
    expect(b.status).toBe('FULL');
    expect(b.passengersCount).toBeNull();
    expect(b.lat).toBe(47.77);
    expect(b.driverCheckId).toBeNull();
  });

  it('OK cu cifră; câmpurile de Chișinău se ignoră (nu cer poză)', () => {
    const b = parseReportBody({ tripId: 't1', status: 'OK', passengersCount: 9, driverId: 'd1', uniformOk: false }, 'BALTI');
    expect(b.passengersCount).toBe(9);
    expect(b.driverId).toBeNull();
    expect(b.uniformOk).toBeNull();
  });
});

describe('withModelVerdicts', () => {
  it('uniform_ok / exterior_ok vin din *_model, ce a trimis aplicația se pierde', () => {
    const sent = parseReportBody({ ...okBody, uniformOk: true, exteriorOk: true }, 'CHISINAU');
    const b = withModelVerdicts(sent, { uniform_ok_model: false, groomed_ok_model: true });
    expect(b).toMatchObject({ uniformOk: false, exteriorOk: true });
    expect(toReportRow(b, { date: '2026-06-10', point: 'CHISINAU', userId: 'u', locationOk: true })).toMatchObject({ uniform_ok: false, exterior_ok: true });
    expect(buildSummary(b, { point: 'CHISINAU', departureTime: '14:30:00', driverName: null })).toBe('☑ 14:30 — 12 pas. | —\n⚠ uniformă');
  });

  it('EROARE (verdicte null în rând) → null în raport, nu se inventează; fără rând → null', () => {
    const sent = parseReportBody({ ...okBody, uniformOk: false, exteriorOk: false }, 'CHISINAU');
    expect(withModelVerdicts(sent, { uniform_ok_model: null, groomed_ok_model: null })).toMatchObject({ uniformOk: null, exteriorOk: null });
    expect(withModelVerdicts(sent, null)).toMatchObject({ uniformOk: null, exteriorOk: null });
  });

  it('fără driverCheckId (ABSENT, Bălți) corpul rămâne neatins', () => {
    const absent = parseReportBody({ tripId: 't', status: 'ABSENT' }, 'CHISINAU');
    expect(withModelVerdicts(absent, { uniform_ok_model: false, groomed_ok_model: false })).toBe(absent);
  });
});

describe('toReportRow', () => {
  it('scrie source app, wash_grade null, coordonatele și poza', () => {
    const b = parseReportBody(okBody, 'CHISINAU');
    const row = toReportRow(b, { date: '2026-09-08', point: 'CHISINAU', userId: 'u1', locationOk: true });
    expect(row.source).toBe('app');
    expect(row.wash_grade).toBeNull();
    expect(row.driver_check_id).toBe('chk1');
    expect(row.location_lat).toBe(47.0236);
    expect(row.location_accuracy_m).toBe(12);
    expect(row.created_by_user).toBe('u1');
    expect(row.location_ok).toBe(true);
    expect(row.status).toBe('OK');
  });

  it('FULL rămâne FULL în rând — createReport îl stochează ca OK cu -1', () => {
    const b = parseReportBody({ tripId: 't1', status: 'FULL' }, 'BALTI');
    const row = toReportRow(b, { date: '2026-09-08', point: 'BALTI', userId: 'u1', locationOk: false });
    expect(row.status).toBe('FULL');
    expect(row.passengers_count).toBeNull();
    expect(row.driver_check_id).toBeNull();
  });
});

describe('computeLocation', () => {
  const st = config.stations.CHISINAU;
  // ~50 m nord: 1° lat ≈ 111 km → 50 m ≈ 0.00045°
  const near = { lat: st.lat + 0.00045, lon: st.lon };
  // ~400 m nord
  const far = { lat: st.lat + 0.0036, lon: st.lon };

  it('cursă exceptată (06:55, 20:00) → null, indiferent de coordonate', () => {
    expect(computeLocation('CHISINAU', '06:55:00', far.lat, far.lon).ok).toBeNull();
    expect(computeLocation('CHISINAU', '20:00:00', null, null).ok).toBeNull();
  });

  it('fără coordonate → false', () => {
    expect(computeLocation('CHISINAU', '14:30:00', null, null)).toEqual({ ok: false, distanceM: null });
  });

  it('la 50 m → true; la 400 m → false, cu distanța', () => {
    const ok = computeLocation('CHISINAU', '14:30:00', near.lat, near.lon);
    expect(ok.ok).toBe(true);
    expect(ok.distanceM!).toBeGreaterThan(40);
    expect(ok.distanceM!).toBeLessThan(60);
    const bad = computeLocation('CHISINAU', '14:30:00', far.lat, far.lon);
    expect(bad.ok).toBe(false);
    expect(bad.distanceM!).toBeGreaterThan(350);
  });

  it('Bălți: fără excepții de oră, față de stația Bălți', () => {
    const b = config.stations.BALTI;
    expect(computeLocation('BALTI', '05:20:00', b.lat, b.lon).ok).toBe(true);
    expect(computeLocation('BALTI', '05:20:00', null, null).ok).toBe(false);
    expect(computeLocation('BALTI', '05:20:00', st.lat, st.lon).ok).toBe(false);
  });
});

describe('poarta de curățenie', () => {
  const trips = [
    { id: 'a', departure_time: '06:55:00' },
    { id: 'b', departure_time: '08:30:00' },
    { id: 'c', departure_time: '16:25:00' },
    { id: 'd', departure_time: '20:00:00' },
  ];

  it('prima cursă → DIMINEATA; 16:25 → ZIUA; a doua → nimic; Bălți → nimic', () => {
    expect(cleaningGateSlot('CHISINAU', trips, 'a')).toBe('DIMINEATA');
    expect(cleaningGateSlot('CHISINAU', trips, 'c')).toBe('ZIUA');
    expect(cleaningGateSlot('CHISINAU', trips, 'b')).toBeNull();
    expect(cleaningGateSlot('CHISINAU', trips, 'd')).toBeNull();
    expect(cleaningGateSlot('BALTI', trips, 'a')).toBeNull();
  });

  it('set incomplet → CLEANING_REQUIRED cu slot și zonele lipsă', () => {
    const missing = cleaningMissing(new Set(['PERON']));
    expect(missing).toEqual(['PIETONI', 'VECEU']);
    const e = new CleaningRequiredError('DIMINEATA', missing, '06:55:00');
    expect(e.status).toBe(409);
    expect(e.code).toBe('CLEANING_REQUIRED');
    expect(e.details).toEqual({ slot: 'DIMINEATA', missing: ['PIETONI', 'VECEU'] });
    expect(e.message).toContain('06:55');
  });

  it('set complet → nimic lipsă', () => {
    expect(cleaningMissing(new Set(['PERON', 'PIETONI', 'VECEU']))).toEqual([]);
  });
});

describe('buildSummary', () => {
  it('OK fără probleme → «☑ 14:30 — 12 pas. | Ion P.»', () => {
    const b = parseReportBody(okBody, 'CHISINAU');
    expect(buildSummary(b, { point: 'CHISINAU', departureTime: '14:30:00', driverName: 'Ion Popescu' })).toBe('☑ 14:30 — 12 pas. | Ion P.');
  });

  it('cu probleme → rândul ⚠ în ordinea botului', () => {
    const b = parseReportBody({ ...okBody, loadingHelpOk: false, uniformOk: false, autoCurat: false, reclamaOk: false, reclamaProblem: 'bus' }, 'CHISINAU');
    expect(buildSummary(b, { point: 'CHISINAU', departureTime: '14:30:00', driverName: null })).toBe(
      '☑ 14:30 — 12 pas. | —\n⚠ nu ajută la încărcat, uniformă, auto exterior murdar, reclamă autobuz',
    );
  });

  it('ABSENT, FULL și Bălți OK (fără șofer)', () => {
    expect(buildSummary(parseReportBody({ tripId: 't', status: 'ABSENT' }, 'CHISINAU'), { point: 'CHISINAU', departureTime: '14:30:00', driverName: null })).toBe('☑ 14:30 — absent');
    expect(buildSummary(parseReportBody({ tripId: 't', status: 'FULL' }, 'BALTI'), { point: 'BALTI', departureTime: '05:20:00', driverName: null })).toBe('☑ 05:20 — microbuz complet');
    expect(buildSummary(parseReportBody({ tripId: 't', status: 'OK', passengersCount: 3 }, 'BALTI'), { point: 'BALTI', departureTime: '05:20:00', driverName: null })).toBe('☑ 05:20 — 3 pas.');
  });

  it('shortDriverName', () => {
    expect(shortDriverName('Ion Popescu')).toBe('Ion P.');
    expect(shortDriverName('Ion Popescu Andrei')).toBe('Ion P.A.');
    expect(shortDriverName('Ion')).toBe('Ion');
    expect(shortDriverName(null)).toBe('—');
  });
});

describe('normalizePlate', () => {
  it('majuscule, fără spații; sub 4 caractere → 400', () => {
    expect(normalizePlate(' 998 tcp ')).toBe('998TCP');
    expect(apiErr(() => normalizePlate('ab')).status).toBe(400);
    expect(apiErr(() => normalizePlate(undefined)).status).toBe(400);
  });
});
