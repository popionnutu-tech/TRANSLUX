/**
 * Ziua lui Andrei (operator Bălți) jucată cap-coadă prin /app/v1/* — fluxul scurt al
 * botului (conversations/report.ts pentru BALTI): fără poartă de curățenie, fără poză
 * de șofer, fără șofer/auto/verificări, «microbuz complet» permis, locația cerută la
 * TOATE cursele (și la 06:55). Spec: docs/specs/peron-app-e2e.md, S03 pasul 1.
 *
 * Un singur scenariu, testele rulează în ordine și împart același fake (o zi = o stare).
 * Timpul e controlat doar pe `Date` (ca în e2e.chisinau.test.ts).
 */
import { alerts, installMocks, telegram } from '../test/mocks.js'; // PRIMUL import: setează env-ul
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FakeSupabase, Row } from '../test/fakeSupabase.js';
import { BALTI_TIMES, IDS, PLATES, TELEGRAM, linkCodeRow, seedDay, tripId } from '../test/fixtures.js';
import { startApi, type TestApi } from '../test/server.js';
import { syncContractFixture, withoutOk } from '../test/contractFixtures.js';
import { config } from '../config.js';

vi.mock('../supabase.js', () => import('../test/mocks.js').then((m) => m.supabaseModuleFactory()));
vi.mock('@anthropic-ai/sdk', () => import('../test/mocks.js').then((m) => m.anthropicModuleFactory()));
vi.mock('../services/adminAlert.js', () => import('../test/mocks.js').then((m) => m.adminAlertModuleFactory()));

// ── Ziua, locurile ───────────────────────────────────────────────────────────

const DATE = '2026-06-10'; // miercuri
const STATION = config.stations.BALTI;
const IN_ZONE = { lat: STATION.lat, lon: STATION.lon, accuracyM: 9 };
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]).toString('base64');
const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const T = (hhmm: string) => tripId('BALTI', hhmm);

function at(hhmm: string): Date {
  return new Date(`${DATE}T${hhmm}:00+03:00`);
}
function iso(hhmm: string): string {
  return at(hhmm).toISOString();
}
function clock(hhmm: string): void {
  vi.setSystemTime(at(hhmm));
}

// ── Etalonul: ce scrie botul pentru Bălți (conversations/report.ts, blocul «Save») ──
// La BALTI botul nu întreabă nimic despre șofer/auto/verificări → toate null; status
// FULL ajunge în DB ca OK cu passengers_count -1 (createReport din services/db.ts);
// requiresLocation(BALTI) e mereu true → location_ok e true/false, niciodată null.

type Status = 'OK' | 'ABSENT' | 'FULL';

function botBaltiRow(time: string, status: Status, passengers: number | null, coords: { lat: number; lon: number } | null) {
  const inZone = coords ? Math.hypot(coords.lat - STATION.lat, coords.lon - STATION.lon) < 0.001 : false; // în test: fie la stație, fie nimic
  return {
    report_date: DATE,
    point: 'BALTI',
    trip_id: T(time),
    driver_id: null,
    status: status === 'FULL' ? 'OK' : status,
    passengers_count: status === 'FULL' ? -1 : status === 'ABSENT' ? null : passengers,
    exterior_ok: null,
    uniform_ok: null,
    loading_help_ok: null,
    auto_curat: null,
    reclama_ok: null,
    reclama_deadline: null,
    reclama_problem: null,
    wash_grade: null,
    ac_status: null,
    heat_status: null,
    vehicle_id: null,
    created_by_user: IDS.users.andrei,
    location_ok: inZone,
  };
}

function botBaltiSummary(time: string, status: Status, passengers: number | null): string {
  if (status === 'ABSENT') return `☑ ${time} — absent`;
  if (status === 'FULL') return `☑ ${time} — microbuz complet`;
  return `☑ ${time} — ${passengers} pas.`; // fără « | Șofer» la Bălți
}

function expectRowLikeBot(row: Row, time: string, status: Status, passengers: number | null, coords: { lat: number; lon: number } | null) {
  const etalon = botBaltiRow(time, status, passengers, coords);
  const picked: Row = {};
  for (const k of Object.keys(etalon)) picked[k] = row[k];
  expect(picked).toEqual(etalon);
  expect(row.source).toBe('app');
  expect(row.driver_check_id).toBeNull();
  expect(row.cancelled_at ?? null).toBeNull();
  expect(row.id).toMatch(UUID);
}

// ── Starea scenariului ───────────────────────────────────────────────────────

let fake: FakeSupabase;
let srv: TestApi;
let token = ''; // Andrei
let tokenVitalie = '';
const realFetch = globalThis.fetch;

const reports = () => fake._tables.reports;
const reportFor = (time: string): Row => {
  const r = reports().find((x) => x.trip_id === T(time));
  if (!r) throw new Error(`nu există raport Bălți pentru ${time}`);
  return r;
};
const day = () => srv.api('GET', 'day', undefined, token);
const report = (body: unknown) => srv.api('POST', 'report', body, token);
const board = () => telegram.filter((t) => t.method === 'sendMessage' || t.method === 'editMessageText');

async function digestViolations(): Promise<Row[]> {
  const buf = fake._storage['report-photos']?.[`digest/${DATE}.json`];
  return buf ? JSON.parse(buf.toString('utf8')).violations : [];
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  clock('05:00');
  fake = installMocks(seedDay(DATE));

  // Nimic din test nu are voie să iasă spre rețea în afara serverului local.
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('http://127.0.0.1:')) throw new Error(`scurgere spre rețea în test: ${url}`);
    return realFetch(input, init);
  });

  srv = await startApi();
});

afterAll(async () => {
  await srv.stop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ════════════════════════════════════════════════════════════════════════════

describe('1. Cod și token pentru Andrei', () => {
  it('codul 573201 → 200, utilizatorul e Andrei cu punctul BALTI', async () => {
    fake._tables.peron_app_link_codes.push(linkCodeRow('573201', IDS.users.andrei));
    const res = await srv.api('POST', 'auth/link', { code: '573201', deviceLabel: 'Samsung test' });
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(HEX64);
    expect(res.body.user).toEqual({ id: IDS.users.andrei, name: '@andrei_balti', point: 'BALTI' });
    token = res.body.token;
    expect(fake._tables.peron_app_sessions).toHaveLength(1);
    expect(fake._tables.peron_app_sessions[0]).toMatchObject({ user_id: IDS.users.andrei, device_label: 'Samsung test' });
  });

  it('și Vitalie primește un token (pentru testul cu FULL din Chișinău)', async () => {
    fake._tables.peron_app_link_codes.push(linkCodeRow('482913', IDS.users.vitalie));
    const res = await srv.api('POST', 'auth/link', { code: '482913' });
    expect(res.status).toBe(200);
    expect(res.body.user.point).toBe('CHISINAU');
    tokenVitalie = res.body.token;
  });
});

describe('2. /day la 05:00 — fluxul scurt', () => {
  it('29 de curse Bălți în ordinea plecării: 05:20 `next`, restul `locked`', async () => {
    const { status, body } = await day();
    expect(status).toBe(200);
    expect(body.date).toBe(DATE);
    expect(body.point).toBe('BALTI');
    expect(body.user).toEqual({ id: IDS.users.andrei, name: '@andrei_balti', point: 'BALTI' });
    expect(body.trips).toHaveLength(29);
    expect(body.trips.map((t: any) => t.departure_time)).toEqual([...BALTI_TIMES]);
    expect(body.trips.map((t: any) => t.state)).toEqual(['next', ...Array(28).fill('locked')]);
    expect(body.trips[0]).toEqual({ id: T('05:20'), departure_time: '05:20', route_name: 'Chișinău – Bălți', crm_route_id: null, state: 'next', passengers: null });
  });

  it('listele goale, fără poartă de curățenie, fără excepții de locație, allowFull, fereastra 04:50–20:50, stația Bălți', async () => {
    const { body } = await day();
    expect(body.assignments).toEqual({});
    expect(body.drivers).toEqual([]);
    expect(body.vehicles).toEqual([]);
    expect(body.openReclama).toEqual({});
    expect(body.climate).toEqual({});
    expect(body.cleaning).toEqual({ DIMINEATA: [], ZIUA: [] });
    expect(body.cleaningGateTripTime).toBeNull();
    expect(body.locationExemptTimes).toEqual([]);
    expect(body.allowFull).toBe(true);
    expect(body.presenceWindow).toEqual({ from: '04:50', to: '20:50' });
    expect(body.station).toEqual(STATION);
  });

  it('contract: răspunsul real al /day e fixture-ul day.balti.json al aplicației', async () => {
    const { body } = await day();
    const outcome = syncContractFixture('day.balti', withoutOk(body));
    expect(outcome, 'day.balti.json lipsește — rulează o dată cu WRITE_FIXTURES=1').not.toBe('missing');
  });
});

describe('3. Raport 05:20 fără coordonate — la Bălți locația e cerută la orice cursă', () => {
  it('200; location_ok false; rândul are toate câmpurile de calitate null; summary fără șofer', async () => {
    clock('05:20');
    const res = await report({ tripId: T('05:20'), status: 'OK', passengersCount: 8 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, summary: '☑ 05:20 — 8 pas.', allDone: false });
    expect(res.body.summary).toBe(botBaltiSummary('05:20', 'OK', 8));

    expect(reports()).toHaveLength(1);
    const row = reportFor('05:20');
    expectRowLikeBot(row, '05:20', 'OK', 8, null);
    expect(row).toMatchObject({ location_ok: false, location_lat: null, location_lon: null, location_accuracy_m: null, created_at: iso('05:20') });
  });

  it('încălcarea de locație intră în digest (distanță necunoscută), nimic către admini acum', async () => {
    const v = await digestViolations();
    expect(v).toHaveLength(1);
    expect(v[0]).toEqual({ time: '05:20', point: 'Bălți', operator: '@andrei_balti', locationBad: true, distanceM: null, late: false, minutesLate: 0 });
    expect(alerts).toEqual([]);
  });

  it('loading board-ul Bălți: un sendMessage «🚌 Bălți → Chișinău» cu «05:20 · 8», stare sub loading-board-balti/', () => {
    expect(board()).toHaveLength(1);
    expect(board()[0]).toMatchObject({ method: 'sendMessage', chatId: TELEGRAM.admin });
    expect(board()[0].text).toContain('🚌 Bălți → Chișinău');
    expect(board()[0].text).toContain('05:20 · 8');
    expect(board()[0].text).toContain('👤 Bălți: Andrei · Chișinău: —'); // board-ul arată numele din users, nu username-ul
    const state = JSON.parse(fake._storage['report-photos'][`loading-board-balti/${DATE}.json`].toString('utf8'));
    expect(state).toEqual({ date: DATE, messages: { [String(TELEGRAM.admin)]: board()[0].messageId } });
    expect(fake._storage['report-photos'][`loading-board/${DATE}.json`]).toBeUndefined();
  });
});

describe('4. Microbuz complet (FULL)', () => {
  it("05:30 FULL în zonă → status 'OK', passengers_count -1, summary «☑ 05:30 — microbuz complet»", async () => {
    clock('05:30');
    const res = await report({ tripId: T('05:30'), status: 'FULL', ...IN_ZONE });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, summary: '☑ 05:30 — microbuz complet', allDone: false });
    expect(res.body.summary).toBe(botBaltiSummary('05:30', 'FULL', null));

    const row = reportFor('05:30');
    expectRowLikeBot(row, '05:30', 'FULL', null, IN_ZONE);
    expect(row).toMatchObject({ status: 'OK', passengers_count: -1, location_ok: true, location_lat: IN_ZONE.lat, location_lon: IN_ZONE.lon, location_accuracy_m: 9 });
    expect(await digestViolations()).toHaveLength(1);
  });

  it('board-ul se editează: «05:30 · full»', () => {
    expect(board()).toHaveLength(2);
    expect(board()[1]).toMatchObject({ method: 'editMessageText', chatId: TELEGRAM.admin, messageId: board()[0].messageId });
    expect(board()[1].text).toContain('05:30 · full');
  });

  it('FULL trimis de Vitalie (Chișinău) → 400, fără rând', async () => {
    const res = await srv.api('POST', 'report', { tripId: tripId('CHISINAU', '06:55'), status: 'FULL' }, tokenVitalie);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
    expect(res.body.message).toContain('Bălți');
    expect(reports()).toHaveLength(2);
    expect(reports().every((r) => r.point === 'BALTI')).toBe(true);
  });
});

describe('5. Câmpurile de calitate se ignoră la Bălți', () => {
  it('06:30 cu driverCheckId, șofer, auto, verificări și reclamă → 200, toate scrise null, fără sarcină și fără repartizare', async () => {
    clock('06:30');
    const obligationsBefore = fake._tables.obligations.length;
    const res = await report({
      tripId: T('06:30'),
      status: 'OK',
      passengersCount: 5,
      driverCheckId: '00000000-0000-4000-8000-00000000dead',
      driverId: IDS.drivers.ionMunteanu,
      vehicleId: IDS.vehicles.lyy735,
      assignmentChanged: true,
      loadingHelpOk: false,
      autoCurat: false,
      uniformOk: false,
      exteriorOk: false,
      reclamaOk: false,
      reclamaProblem: 'bus',
      reclamaRepairConfirmed: true,
      reclamaTaskId: IDS.reclamaTask,
      acStatus: 'works',
      heatStatus: 'broken',
      ...IN_ZONE,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, summary: '☑ 06:30 — 5 pas.', allDone: false }); // fără ⚠, fără șofer

    const row = reportFor('06:30');
    expectRowLikeBot(row, '06:30', 'OK', 5, IN_ZONE);
    expect(row).toMatchObject({ driver_id: null, vehicle_id: null, driver_check_id: null, uniform_ok: null, reclama_ok: null, reclama_problem: null, ac_status: null, heat_status: null });
    expect(fake._tables.obligations).toHaveLength(obligationsBefore);
    expect(fake._tables.obligations.find((o) => o.id === IDS.reclamaTask)!.current_state).toBe('sent');
    expect(fake._tables.driver_appearance_checks).toHaveLength(0);
    expect(fake._tables.daily_assignments.every((a) => a.assignment_date === DATE && a.direction === 'CHISINAU_NORD')).toBe(true);
    expect(fake._tables.daily_assignments.find((a) => a.schedule_id === 1)).toMatchObject({ driver_id: IDS.drivers.ionMunteanu, vehicle_id: IDS.vehicles.tcp998 });
  });

  it('28 de pasageri → 400 și la Bălți (limita botului e 27)', async () => {
    const res = await report({ tripId: T('06:55'), status: 'OK', passengersCount: 28, ...IN_ZONE });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
    expect(reports()).toHaveLength(3);
  });
});

describe('6. Pozele există doar la Chișinău', () => {
  it('cleaning-photo de la Andrei → 403 NOT_CHISINAU, fără rând, fără fișier, modelul nu e chemat', async () => {
    const res = await srv.api('POST', 'cleaning-photo', { slot: 'DIMINEATA', zone: 'PERON', imageBase64: JPEG_B64, lat: IN_ZONE.lat, lon: IN_ZONE.lon }, token);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ ok: false, code: 'NOT_CHISINAU' });
    expect(fake._tables.peron_cleaning_checks).toHaveLength(0);
    expect(Object.keys(fake._storage['report-photos']).filter((k) => k.startsWith('curatenie/'))).toEqual([]);
  });

  it('driver-photo de la Andrei → 403 NOT_CHISINAU', async () => {
    const res = await srv.api('POST', 'driver-photo', { tripId: T('06:55'), driverId: IDS.drivers.ionMunteanu, imageBase64: JPEG_B64 }, token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_CHISINAU');
    expect(fake._tables.driver_appearance_checks).toHaveLength(0);
    expect(Object.keys(fake._storage['report-photos']).filter((k) => k.startsWith('soferi/'))).toEqual([]);
  });
});

describe('7. Ordinea, 06:55 fără excepție, absent', () => {
  it('raport pe 07:35 când urmează 06:55 → 409 NOT_NEXT', async () => {
    clock('06:55');
    const res = await report({ tripId: T('07:35'), status: 'OK', passengersCount: 3, ...IN_ZONE });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, code: 'NOT_NEXT' });
    expect(res.body.message).toContain('06:55');
  });

  it('06:55 fără coordonate → location_ok false (06:55 e exceptată doar la Chișinău) + a doua încălcare', async () => {
    const res = await report({ tripId: T('06:55'), status: 'OK', passengersCount: 11 });
    expect(res.status).toBe(200);
    expectRowLikeBot(reportFor('06:55'), '06:55', 'OK', 11, null);
    expect(reportFor('06:55').location_ok).toBe(false);
    const v = await digestViolations();
    expect(v).toHaveLength(2);
    expect(v[1]).toMatchObject({ time: '06:55', point: 'Bălți', locationBad: true, late: false });
  });

  it('07:35 ABSENT în zonă → passengers_count null, location_ok true, summary «☑ 07:35 — absent»; board «07:35 · absent»', async () => {
    clock('07:35');
    const res = await report({ tripId: T('07:35'), status: 'ABSENT', ...IN_ZONE });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, summary: '☑ 07:35 — absent', allDone: false });
    expectRowLikeBot(reportFor('07:35'), '07:35', 'ABSENT', null, IN_ZONE);
    expect(reportFor('07:35')).toMatchObject({ passengers_count: null, location_ok: true });
    expect(board().at(-1)!.text).toContain('07:35 · absent');
    expect(await digestViolations()).toHaveLength(2);
  });

  it('06:55 din nou → 409 ALREADY_REPORTED', async () => {
    const res = await report({ tripId: T('06:55'), status: 'OK', passengersCount: 1, ...IN_ZONE });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_REPORTED');
    expect(reports()).toHaveLength(5);
  });
});

describe('8. Restul zilei până la 20:20', () => {
  const REST = BALTI_TIMES.slice(5); // 08:15 … 20:20 (24 de curse)

  it('08:15 … 19:20 alternând OK / FULL, fiecare la ora ei în zonă → rânduri ca la bot, allDone false', async () => {
    for (const [i, time] of REST.slice(0, -1).entries()) {
      clock(time);
      const full = i % 3 === 2;
      const passengers = full ? null : (i * 7) % 28; // 0 … 27
      const res = await report(full ? { tripId: T(time), status: 'FULL', ...IN_ZONE } : { tripId: T(time), status: 'OK', passengersCount: passengers, ...IN_ZONE });
      expect(res.status, `report ${time}: ${JSON.stringify(res.body)}`).toBe(200);
      expect(res.body.allDone).toBe(false);
      expect(res.body.summary).toBe(botBaltiSummary(time, full ? 'FULL' : 'OK', passengers));
      expectRowLikeBot(reportFor(time), time, full ? 'FULL' : 'OK', passengers, IN_ZONE);
    }
    expect(reports()).toHaveLength(28);
    expect(fake._tables.day_validations).toHaveLength(0);
    expect(await digestViolations()).toHaveLength(2);
  });

  it('20:20 → allDone true și rândul lui Andrei în day_validations; /day → toate `done`', async () => {
    clock('20:20');
    const res = await report({ tripId: T('20:20'), status: 'OK', passengersCount: 27, ...IN_ZONE });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, summary: '☑ 20:20 — 27 pas.', allDone: true });
    expect(reports()).toHaveLength(29);
    expect(reports().map((r) => r.trip_id)).toEqual(BALTI_TIMES.map((t) => T(t)));
    expect(fake._tables.day_validations).toHaveLength(1);
    expect(fake._tables.day_validations[0]).toMatchObject({ user_id: IDS.users.andrei, validation_date: DATE });

    const { body } = await day();
    expect(body.trips.every((t: any) => t.state === 'done')).toBe(true);
  });

  it('board-ul Bălți: 1 sendMessage + 28 editări, ultima cu «20:20 · 27»; nicio alertă în timpul zilei', () => {
    expect(telegram.filter((t) => t.method === 'sendMessage')).toHaveLength(1);
    expect(telegram.filter((t) => t.method === 'editMessageText')).toHaveLength(28);
    expect(telegram.every((t) => t.chatId === TELEGRAM.admin)).toBe(true);
    expect(board().at(-1)!.text).toContain('20:20 · 27');
    expect(alerts).toEqual([]);
  });
});

describe('9. Prezența la Bălți: fereastra 04:50–20:50, zona e stația Bălți', () => {
  it('04:48 și 20:52 se ignoră; 04:50 și 20:50 se acceptă; un ping de la stația Chișinău e în afara zonei', async () => {
    clock('20:53');
    const ping = (t: string, lat: number, lon: number) => ({ at: iso(t), lat, lon, accuracyM: 10 });
    const res = await srv.api('POST', 'presence', {
      pings: [
        ping('04:48', STATION.lat, STATION.lon),
        ping('04:50', STATION.lat, STATION.lon),
        ping('12:00', config.stations.CHISINAU.lat, config.stations.CHISINAU.lon),
        ping('20:50', STATION.lat, STATION.lon),
        ping('20:52', STATION.lat, STATION.lon),
      ],
    }, token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, accepted: 3 });
    const rows = fake._tables.peron_presence_pings;
    expect(rows.map((p) => [p.at, p.in_zone])).toEqual([[iso('04:50'), true], [iso('12:00'), false], [iso('20:50'), true]]);
    expect(rows.every((p) => p.user_id === IDS.users.andrei && p.point === 'BALTI')).toBe(true);
  });
});
