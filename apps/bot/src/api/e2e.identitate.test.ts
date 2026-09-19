/**
 * Identitatea șoferului la peron (migr. 381), cap-coadă prin POST /app/v1/driver-photo.
 * Ion, 19.09: «să nu poată pune alt om în poză operatorul ca să închidă, dar nu tare rigid».
 *
 * Un singur scenariu, testele în ordine, același fake (o zi = o stare), ca în
 * e2e.chisinau.test.ts. Modelul fals răspunde din coadă: la fiecare poză, întâi
 * verdictul de aspect (driverCheck), apoi — doar dacă șoferul are referințe —
 * comparația de identitate (driverIdentity).
 */
import { adminPhotos, installMocks, modelCalls, nextModelAnswer, type ModelAnswer } from '../test/mocks.js'; // PRIMUL import: setează env-ul
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FakeSupabase, Row } from '../test/fakeSupabase.js';
import { IDS, linkCodeRow, seedDay, tripId } from '../test/fixtures.js';
import { startApi, type TestApi } from '../test/server.js';
import { config } from '../config.js';
import { DRIVER_IDENTITY_MODEL } from '../services/driverIdentity.js';
import { referenceStorageKey } from '../services/driverReferences.js';

vi.mock('../supabase.js', () => import('../test/mocks.js').then((m) => m.supabaseModuleFactory()));
vi.mock('@anthropic-ai/sdk', () => import('../test/mocks.js').then((m) => m.anthropicModuleFactory()));
vi.mock('../services/adminAlert.js', () => import('../test/mocks.js').then((m) => m.adminAlertModuleFactory()));

const DATE = '2026-06-10'; // miercuri
const STATION = config.stations.CHISINAU;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const JPEG_B64 = JPEG.toString('base64');
const T = (hhmm: string) => tripId('CHISINAU', hhmm);

const DRIVER_OK: ModelAnswer = {
  json: { cadru_complet: true, persoana_vizibila: true, uniforma: true, barbierit: true, aspect_ingrijit: true, descriere: 'Tricou TRANSLUX, adidași, bărbierit.' },
};
const SAME = (same: 'da' | 'nesigur' | 'nu', confidence: number, reason = 'trăsături'): ModelAnswer => ({
  json: { aceeasi_persoana: same, incredere: confidence, motiv: reason },
});

/** Referință a șoferului: rând + fișier în bucket. */
function reference(driverId: string, checkDate: string, source: 'bootstrap' | 'single' | 'match' = 'bootstrap'): { row: Row; key: string } {
  const key = referenceStorageKey(driverId, `ref-${checkDate}`);
  return { row: { id: `ref-${driverId}-${checkDate}`, driver_id: driverId, storage_key: key, source_check_id: null, check_date: checkDate, source, created_at: `${checkDate}T09:00:00.000Z` }, key };
}

let fake: FakeSupabase;
let srv: TestApi;
let token = '';

const checks = () => fake._tables.driver_appearance_checks;
const refsOf = (driverId: string) => fake._tables.driver_reference_photos.filter((r) => r.driver_id === driverId);
const day = () => srv.api('GET', 'day', undefined, token);

async function driverPhoto(time: string, driverId: string, ...answers: ModelAnswer[]) {
  for (const a of answers) nextModelAnswer(a);
  modelCalls.length = 0;
  return srv.api('POST', 'driver-photo', { tripId: T(time), driverId, imageBase64: JPEG_B64, lat: STATION.lat, lon: STATION.lon }, token);
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${DATE}T06:40:00+03:00`));

  const seed = seedDay(DATE);
  const ion = reference(IDS.drivers.ionMunteanu, '2026-06-07');
  const petru = reference(IDS.drivers.petruCiobanu, '2026-06-08');
  const sergiu = reference(IDS.drivers.sergiuLungu, '2026-05-20', 'single');
  seed.tables.driver_reference_photos.push(ion.row, petru.row, sergiu.row);
  seed.storage = { 'report-photos': { [ion.key]: JPEG, [petru.key]: JPEG, [sergiu.key]: JPEG } };
  fake = installMocks(seed);
  fake._tables.peron_app_link_codes.push(linkCodeRow('482913', IDS.users.vitalie));

  srv = await startApi();
  const login = await srv.api('POST', 'auth/link', { code: '482913' });
  token = login.body.token;
});

afterAll(async () => {
  await srv.stop();
  vi.useRealTimers();
});

describe('1. Alt om în poză → refuzat o dată, apoi trece marcat', () => {
  it('«nu» sigur → 200 ALT_OM cu numele șoferului; rândul și fișierul rămân ca probă; adminul primește poza', async () => {
    const res = await driverPhoto('06:55', IDS.drivers.ionMunteanu, DRIVER_OK, SAME('nu', 0.8, 'față mai lată, păr grizonat'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ verdict: 'ALT_OM', code: 'ALT_OM', driverCheckId: null, personVisible: true, frameOk: true, uniformOk: null });
    expect(res.body.message).toBe('Persoana din poză nu pare a fi șoferul Ion Munteanu (față mai lată, păr grizonat). Refă poza cu șoferul Ion Munteanu.');

    // comparația a văzut referința + poza de azi, pe modelul de identitate
    expect(modelCalls).toHaveLength(2);
    expect(modelCalls[1]).toMatchObject({ model: DRIVER_IDENTITY_MODEL, hasImage: true });

    expect(checks()).toHaveLength(1);
    expect(checks()[0]).toMatchObject({
      driver_id: IDS.drivers.ionMunteanu,
      rejected_code: 'ALT_OM',
      identity_verdict: 'nu',
      identity_confidence: 0.8,
      identity_reason: 'față mai lată, păr grizonat',
      identity_refs: 1,
      uniform_ok_model: true,
    });
    expect(fake._storage['report-photos'][checks()[0].storage_key]).toEqual(JPEG);

    expect(adminPhotos).toHaveLength(1);
    expect(adminPhotos[0]).toContain('🚫 Poză refuzată operatorului');
    expect(adminPhotos[0]).toContain('Ion Munteanu');
    expect(adminPhotos[0]).toContain('80%');
  });

  it('poza refuzată nu închide ziua: GET /day nu are șoferul', async () => {
    const res = await day();
    expect(res.status).toBe(200);
    expect(res.body.driverChecks[IDS.drivers.ionMunteanu]).toBeUndefined();
  });

  it('a doua poză «nu» în aceeași zi trece (nu rigid), rămâne marcată, adminul primește și poza asta', async () => {
    const res = await driverPhoto('06:55', IDS.drivers.ionMunteanu, DRIVER_OK, SAME('nu', 0.9, 'alt om'));
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('OK');
    expect(res.body.code).toBeUndefined();
    expect(res.body.driverCheckId).toBe(checks()[1].id);
    expect(checks()[1]).toMatchObject({ rejected_code: null, identity_verdict: 'nu', identity_confidence: 0.9 });

    expect(adminPhotos).toHaveLength(2);
    expect(adminPhotos[1]).toContain('⚠️ Poză trecută, dar persoana nu pare a fi șoferul');

    const d = await day();
    expect(d.body.driverChecks[IDS.drivers.ionMunteanu]).toMatchObject({ id: checks()[1].id, uniformOk: true });
    // poza «nu» nu devine referință
    expect(refsOf(IDS.drivers.ionMunteanu)).toHaveLength(1);
  });
});

describe('2. Cazurile care trec fără gălăgie', () => {
  it('«nesigur» trece, fără poză la admin, fără referință nouă', async () => {
    const res = await driverPhoto('08:15', IDS.drivers.petruCiobanu, DRIVER_OK, SAME('nesigur', 0.5));
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('OK');
    expect(checks().at(-1)).toMatchObject({ driver_id: IDS.drivers.petruCiobanu, rejected_code: null, identity_verdict: 'nesigur', identity_refs: 1 });
    expect(adminPhotos).toHaveLength(2);
    expect(refsOf(IDS.drivers.petruCiobanu)).toHaveLength(1);
  });

  it('«nu» slab (sub prag) trece ca nesigur — nu se refuză', async () => {
    const res = await driverPhoto('08:50', IDS.drivers.petruCiobanu, DRIVER_OK, SAME('nu', 0.4));
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('OK');
    expect(checks().at(-1)).toMatchObject({ rejected_code: null, identity_verdict: 'nu', identity_confidence: 0.4 });
    // și ajunge totuși la admin: verdictul e «nu», chiar dacă slab
    expect(adminPhotos).toHaveLength(3);
  });

  it('șofer fără referințe → nicio comparație, verdict null, refs 0', async () => {
    const res = await driverPhoto('07:35', IDS.drivers.vasileRusu, DRIVER_OK);
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('OK');
    expect(modelCalls).toHaveLength(1); // doar aspectul
    expect(checks().at(-1)).toMatchObject({ driver_id: IDS.drivers.vasileRusu, identity_verdict: null, identity_refs: 0, rejected_code: null });
  });

  it('modelul de identitate cade → poza trece, motivul erorii rămâne pe rând', async () => {
    const res = await driverPhoto('09:25', IDS.drivers.petruCiobanu, DRIVER_OK, { throws: new Error('model indisponibil') });
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('OK');
    expect(checks().at(-1)).toMatchObject({ identity_verdict: null, identity_refs: 1, identity_reason: 'Verificarea automată a eșuat.', rejected_code: null });
  });
});

describe('3. «da» sigur împrospătează referințele', () => {
  it('șoferul cu o singură referință veche primește poza de azi ca referință «match»', async () => {
    const res = await driverPhoto('10:00', IDS.drivers.sergiuLungu, DRIVER_OK, SAME('da', 0.9));
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('OK');
    const check = checks().at(-1)!;
    expect(check).toMatchObject({ driver_id: IDS.drivers.sergiuLungu, identity_verdict: 'da' });

    const refs = refsOf(IDS.drivers.sergiuLungu);
    expect(refs).toHaveLength(2);
    const added = refs.find((r) => r.source_check_id === check.id)!;
    expect(added).toMatchObject({ check_date: DATE, source: 'match', storage_key: referenceStorageKey(IDS.drivers.sergiuLungu, check.id) });
    expect(fake._storage['report-photos'][added.storage_key]).toEqual(JPEG);
  });

  it('aceeași zi nu intră de două ori la referințe', async () => {
    await driverPhoto('10:30', IDS.drivers.sergiuLungu, DRIVER_OK, SAME('da', 0.95));
    expect(refsOf(IDS.drivers.sergiuLungu)).toHaveLength(2);
  });

  it('«da» slab nu devine referință', async () => {
    await driverPhoto('11:28', IDS.drivers.petruCiobanu, DRIVER_OK, SAME('da', 0.5));
    expect(refsOf(IDS.drivers.petruCiobanu)).toHaveLength(1);
  });
});
