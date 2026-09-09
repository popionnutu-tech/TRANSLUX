/**
 * Rulare: `cd peron-android && node --test src/tripDraft.test.ts`. Fără AsyncStorage —
 * un store în memorie cu aceeași semnătură.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blockingReason, buildReportBody, initialState, preparationReason, tripContext, withPhoto, type DriverPhotoState, type TripContext, type TripFormState } from './buildReport.ts';
import {
  bodyFromDraft,
  clearDraft,
  clearOtherDays,
  draftFromState,
  draftKey,
  draftSummary,
  formFromDraft,
  loadDraft,
  parseDraft,
  preparedHHMM,
  saveDraft,
  serializeDraft,
  staleDraftKeys,
  type DraftStore,
  type TripDraft,
} from './tripDraft.ts';
import type { DayResponse } from './types.ts';

function memoryStore(): DraftStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    async getItem(k) {
      return map.get(k) ?? null;
    },
    async setItem(k, v) {
      map.set(k, v);
    },
    async removeItem(k) {
      map.delete(k);
    },
    async getAllKeys() {
      return [...map.keys()];
    },
    async multiRemove(keys) {
      for (const k of keys) map.delete(k);
    },
  };
}

const day: DayResponse = {
  date: '2026-09-09',
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
  driverChecks: {},
  cleaningGateTripTime: '16:25',
  locationExemptTimes: ['06:55', '20:00'],
  station: { lat: 47.0, lon: 28.8, radiusM: 150 },
  allowFull: false,
  presenceWindow: { from: '06:25', to: '20:30' },
};

const ctx: TripContext = tripContext(day, 't2');
const photo: DriverPhotoState = {
  driverCheckId: 'chk-1',
  uri: 'file:///cache/driver.jpg',
  verdict: 'OK',
  uniformOk: true,
  shavedOk: true,
  groomedOk: false,
  description: 'uniformă: da · bărbierit: da · aspect: nu',
};
const eroarePhoto: DriverPhotoState = { ...photo, driverCheckId: 'chk-err', verdict: 'EROARE', uniformOk: null, shavedOk: null, groomedOk: null, description: '' };
const coords = { lat: 47.0001, lon: 28.8001, accuracyM: 12 };
const at = new Date(2026, 8, 9, 7, 12, 30);

const prepared: TripFormState = withPhoto(initialState(ctx), photo);

describe('draftKey / staleDraftKeys', () => {
  it('cheia conține data și cursa', () => {
    assert.equal(draftKey('2026-09-09', 't2'), 'trip:draft:2026-09-09:t2');
  });
  it('cheile din alte zile sunt vechi; celelalte chei ale aplicației nu se ating', () => {
    const keys = ['trip:draft:2026-09-08:t1', 'trip:draft:2026-09-09:t2', 'trip:draft:2026-09-09:t3', 'battery:done', 'presence:plan'];
    assert.deepEqual(staleDraftKeys(keys, '2026-09-09'), ['trip:draft:2026-09-08:t1']);
    assert.deepEqual(staleDraftKeys([], '2026-09-09'), []);
  });
});

describe('draftFromState', () => {
  it('fără poză nu există ciornă', () => {
    assert.equal(draftFromState(ctx, initialState(ctx), at), null);
  });

  it('din starea implicită: repartizarea, verdictele modelului, verificările OK, clima pentru v1, ora pregătirii', () => {
    const d = draftFromState(ctx, prepared, at);
    assert.ok(d);
    assert.equal(d.driverId, 'd1');
    assert.equal(d.vehicleId, 'v1');
    assert.equal(d.assignmentChanged, false);
    assert.equal(d.driverCheckId, 'chk-1');
    assert.deepEqual(d.verdicts, { verdict: 'OK', uniformOk: true, shavedOk: true, groomedOk: false, description: photo.description });
    assert.equal(d.photoUri, photo.uri);
    assert.equal(d.loadingHelpOk, true);
    assert.equal(d.autoCurat, true);
    assert.equal(d.reclamaOk, true);
    assert.equal(d.reclamaProblem, null);
    assert.equal(d.reclamaRepairConfirmed, false);
    assert.equal(d.reclamaTaskId, null);
    assert.equal(d.acStatus, 'works');
    assert.equal(d.heatStatus, null);
    assert.equal(d.preparedAt, at.toISOString());
  });

  it('status-ul nu intră în ciornă: chiar cu ABSENT bifat, ciorna e cea a pregătirii', () => {
    const d = draftFromState(ctx, { ...prepared, status: 'ABSENT' }, at);
    assert.ok(d);
    assert.equal(d.driverCheckId, 'chk-1');
    assert.equal(d.reclamaOk, true);
  });
});

describe('bodyFromDraft = buildReportBody pentru aceeași stare', () => {
  const cases: Array<[string, TripFormState]> = [
    ['implicit', prepared],
    ['reclamă panou rută', { ...prepared, reclama: 'panou_ruta' }],
    ['fără auto, alt șofer', { ...prepared, vehicleId: null, driverId: 'd2' }],
    ['mașină cu sarcină deschisă, reparat', { ...prepared, vehicleId: 'v2', repair: 'da' }],
    ['mașină cu sarcină deschisă, defect ales', { ...prepared, vehicleId: 'v2', repair: 'nu', reclama: 'bus' }],
    ['clima stricată, nu ajută, exterior murdar', { ...prepared, climate: 'broken', loadingHelpOk: false, autoCurat: false }],
    ['modelul n-a răspuns (EROARE)', withPhoto(prepared, eroarePhoto)],
  ];
  for (const [name, state] of cases) {
    it(name, () => {
      const d = draftFromState(ctx, state, at);
      assert.ok(d);
      for (const c of [coords, null]) {
        assert.deepEqual(bodyFromDraft(ctx.tripId, d, 12, c), buildReportBody(ctx, { ...state, passengers: 12 }, c));
      }
    });
  }

  it('cifra și locația vin de la plecare, nu din ciornă', () => {
    const d = draftFromState(ctx, prepared, at)!;
    const body = bodyFromDraft('t2', d, 0, null);
    assert.equal(body.passengersCount, 0);
    assert.equal(body.lat, null);
    assert.equal(body.accuracyM, null);
    assert.equal(body.status, 'OK');
  });
});

describe('formFromDraft (Modifică pregătirea)', () => {
  it('reface starea formularului: poza cu verdictele, reclama, reparația, clima; cifra rămâne goală', () => {
    const state: TripFormState = { ...prepared, vehicleId: 'v2', repair: 'da', climate: 'works' };
    const f = formFromDraft(draftFromState(ctx, state, at)!);
    assert.equal(f.status, 'OK');
    assert.equal(f.passengers, null);
    assert.equal(f.driverId, 'd1');
    assert.equal(f.vehicleId, 'v2');
    assert.deepEqual(f.photo, photo);
    assert.equal(f.reclama, 'ok');
    assert.equal(f.repair, 'da');
    assert.equal(preparationReason(ctx, f), null);
    assert.match(blockingReason(ctx, f) ?? '', /pasageri/);
    assert.equal(blockingReason(ctx, { ...f, passengers: 4 }), null);
  });

  it('defect ales → reclama = defectul; clima din acStatus / heatStatus', () => {
    const f = formFromDraft(draftFromState(ctx, { ...prepared, reclama: 'ambele', climate: 'none' }, at)!);
    assert.equal(f.reclama, 'ambele');
    assert.equal(f.repair, null);
    assert.equal(f.climate, 'none');
    const heat = formFromDraft({ ...draftFromState(ctx, prepared, at)!, acStatus: null, heatStatus: 'broken' });
    assert.equal(heat.climate, 'broken');
  });

  it('dus-întors prin ciornă → același corp de raport', () => {
    for (const state of [prepared, { ...prepared, vehicleId: 'v2', reclama: 'bus' as const }, withPhoto(prepared, eroarePhoto)]) {
      const d = draftFromState(ctx, state, at)!;
      const again = draftFromState(ctx, formFromDraft(d), at)!;
      assert.deepEqual(again, d);
      assert.deepEqual(buildReportBody(ctx, { ...formFromDraft(d), passengers: 7 }, coords), buildReportBody(ctx, { ...state, passengers: 7 }, coords));
    }
  });
});

describe('serializare / parseDraft', () => {
  const d = draftFromState(ctx, prepared, at)!;

  it('JSON → înapoi aceeași ciornă', () => {
    assert.deepEqual(parseDraft(JSON.parse(serializeDraft(d))), d);
    const err = draftFromState(ctx, withPhoto(prepared, eroarePhoto), at)!;
    assert.deepEqual(parseDraft(JSON.parse(serializeDraft(err))), err);
  });

  it('ciornă veche fără photoUri → null la miniatură, restul intact', () => {
    const { photoUri: _skip, ...old } = d;
    assert.deepEqual(parseDraft(old), { ...d, photoUri: null });
  });

  it('forme greșite → null (nu pornim pasul 2 pe date stricate)', () => {
    assert.equal(parseDraft(null), null);
    assert.equal(parseDraft('x'), null);
    assert.equal(parseDraft({}), null);
    assert.equal(parseDraft({ ...d, driverCheckId: '' }), null);
    assert.equal(parseDraft({ ...d, driverCheckId: null }), null);
    assert.equal(parseDraft({ ...d, verdicts: { ...d.verdicts, verdict: 'REFA_POZA' } }), null);
    assert.equal(parseDraft({ ...d, verdicts: { ...d.verdicts, uniformOk: 'da' } }), null);
    assert.equal(parseDraft({ ...d, reclamaProblem: 'motor' }), null);
    assert.equal(parseDraft({ ...d, acStatus: 'ok' }), null);
    assert.equal(parseDraft({ ...d, preparedAt: 'ieri' }), null);
    assert.equal(parseDraft({ ...d, loadingHelpOk: 1 }), null);
  });
});

describe('saveDraft / loadDraft / clearDraft / clearOtherDays (store în memorie)', () => {
  const d = draftFromState(ctx, prepared, at)!;

  it('ce s-a salvat se citește înapoi; ștergerea o face să dispară', async () => {
    const store = memoryStore();
    assert.equal(await loadDraft(store, '2026-09-09', 't2'), null);
    await saveDraft(store, '2026-09-09', 't2', d);
    assert.deepEqual([...store.map.keys()], ['trip:draft:2026-09-09:t2']);
    assert.deepEqual(await loadDraft(store, '2026-09-09', 't2'), d);
    assert.equal(await loadDraft(store, '2026-09-09', 't1'), null);
    assert.equal(await loadDraft(store, '2026-09-08', 't2'), null);
    await clearDraft(store, '2026-09-09', 't2');
    assert.equal(await loadDraft(store, '2026-09-09', 't2'), null);
  });

  it('JSON stricat în store → null, fără excepție', async () => {
    const store = memoryStore();
    store.map.set(draftKey('2026-09-09', 't2'), '{nu e json');
    assert.equal(await loadDraft(store, '2026-09-09', 't2'), null);
    store.map.set(draftKey('2026-09-09', 't2'), JSON.stringify({ foo: 1 }));
    assert.equal(await loadDraft(store, '2026-09-09', 't2'), null);
  });

  it('clearOtherDays lasă ziua curentă și cheile străine', async () => {
    const store = memoryStore();
    await saveDraft(store, '2026-09-08', 't1', d);
    await saveDraft(store, '2026-09-09', 't2', d);
    store.map.set('battery:done', '1');
    await clearOtherDays(store, '2026-09-09');
    assert.deepEqual([...store.map.keys()].sort(), ['battery:done', 'trip:draft:2026-09-09:t2']);
    await clearOtherDays(store, '2026-09-09'); // nimic de șters — fără multiRemove([])
  });
});

describe('draftSummary', () => {
  const d: TripDraft = draftFromState(ctx, prepared, at)!;
  it('un rând: șofer · placă · uniformă · bărbierit · ora pregătirii', () => {
    assert.equal(preparedHHMM(d.preparedAt), '07:12');
    assert.equal(draftSummary(d, { driverName: 'Ion Moldovan', plate: 'LYY735' }), 'Ion Moldovan · LYY735 · uniformă da · bărbierit da · pregătit 07:12');
    assert.equal(draftSummary(d, { driverName: null, plate: null }), 'Fără șofer · Fără auto · uniformă da · bărbierit da · pregătit 07:12');
  });
  it('verdicte necunoscute (EROARE) și oră stricată', () => {
    const err = draftFromState(ctx, withPhoto(prepared, eroarePhoto), at)!;
    assert.equal(draftSummary({ ...err, preparedAt: 'x' }, { driverName: 'A', plate: 'B' }), 'A · B · uniformă necunoscut · bărbierit necunoscut · pregătit');
    assert.equal(preparedHHMM('x'), '');
  });
});

// ── Poza de azi din /day (spec peron-app-criteria-v2, S02) ────────────────────

describe('ciorna cu poza de azi din /day.driverChecks', () => {
  const dayWithChecks: DayResponse = { ...day, driverChecks: { d1: { id: 'chk-today', uniformOk: true, groomedOk: true, at: '06:42' } } };
  const ctxChecks = tripContext(dayWithChecks, 't2');

  it('«Pregătit» fără poză nouă: ciorna ia driverCheckId din /day, fără miniatură; corpul de la plecare îl trimite', () => {
    const state = initialState(ctxChecks);
    assert.equal(state.photo?.driverCheckId, 'chk-today');
    const d = draftFromState(ctxChecks, state, new Date('2026-09-09T07:12:00'));
    assert.ok(d);
    assert.equal(d.driverCheckId, 'chk-today');
    assert.equal(d.photoUri, null);
    assert.deepEqual(d.verdicts, { verdict: 'OK', uniformOk: true, shavedOk: true, groomedOk: true, description: 'Poză făcută azi la 06:42' });
    const body = bodyFromDraft('t2', d, 7, null);
    assert.equal(body.driverCheckId, 'chk-today');
    assert.equal(body.uniformOk, true);
    assert.equal(body.exteriorOk, true);
    assert.deepEqual(body, buildReportBody(ctxChecks, { ...state, passengers: 7 }, null));
    // dus-întors prin JSON: ciorna rămâne valabilă și cu photoUri null
    assert.deepEqual(parseDraft(JSON.parse(serializeDraft(d))), d);
    assert.equal(formFromDraft(d).photo?.driverCheckId, 'chk-today');
  });
});
