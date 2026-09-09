/**
 * Ziua lui Vitalie (operator Chișinău) jucată cap-coadă prin /app/v1/*, comparată pas
 * cu pas cu ce ar fi scris botul (conversations/report.ts). Spec: docs/specs/peron-app-e2e.md, S02.
 *
 * Un singur scenariu, testele rulează în ordine și împart același fake (o zi = o stare).
 * Timpul e controlat doar pe `Date` (nu și pe timers — altfel http/fetch se blochează):
 * `clock('09:25')` mută ceasul înainte de fiecare cursă, ca `minutesLate`, `getTodayDate`
 * și cheile din Storage (Date.now()) să fie deterministe.
 *
 * Etalonul e botul: `botReportRow` și `botSummary` sunt copiate literal din
 * report.ts (blocul «Save» și răspunsul de după salvare), nu importate din API.
 */
import { alerts, installMocks, modelCalls, nextModelAnswer, telegram, type ModelAnswer } from '../test/mocks.js'; // PRIMUL import: setează env-ul
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PointEnum } from '@translux/db';
import type { FakeSupabase, Row } from '../test/fakeSupabase.js';
import { CHISINAU_TIMES, IDS, PLATES, TELEGRAM, crmRouteId, linkCodeRow, seedDay, tripId } from '../test/fixtures.js';
import { startApi, type TestApi } from '../test/server.js';
import { config } from '../config.js';
import { haversineDistance } from '../utils.js';
import { sendCompactDigest } from '../services/dailyDigest.js';

vi.mock('../supabase.js', () => import('../test/mocks.js').then((m) => m.supabaseModuleFactory()));
vi.mock('@anthropic-ai/sdk', () => import('../test/mocks.js').then((m) => m.anthropicModuleFactory()));
vi.mock('../services/adminAlert.js', () => import('../test/mocks.js').then((m) => m.adminAlertModuleFactory()));

// ── Ziua, locurile, poza ─────────────────────────────────────────────────────

const DATE = '2026-06-10'; // miercuri, sezon A/C
const STATION = config.stations.CHISINAU;
/** ~0.00045° latitudine ≈ 50 m; ~0.0036° ≈ 400 m (1° ≈ 111 km). */
const IN_ZONE = { lat: STATION.lat, lon: STATION.lon, accuracyM: 8 };
const NEAR_50M = { lat: STATION.lat + 0.00045, lon: STATION.lon, accuracyM: 12 };
const FAR_400M = { lat: STATION.lat + 0.0036, lon: STATION.lon, accuracyM: 15 };
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const JPEG_B64 = JPEG.toString('base64');
const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const T = (hhmm: string) => tripId('CHISINAU', hhmm);

/** Ora Chișinăului din ziua scenariului → Date. */
function at(hhmm: string, date = DATE): Date {
  return new Date(`${date}T${hhmm}:00+03:00`);
}
function iso(hhmm: string): string {
  return at(hhmm).toISOString();
}
/** Mută ceasul (doar Date) la ora dată. */
function clock(hhmm: string): void {
  vi.setSystemTime(at(hhmm));
}

// ── Răspunsurile modelului fals ──────────────────────────────────────────────

const CLEAN_OK: ModelAnswer = { json: { loc_corect: true, verdict: 'CURAT', probleme: [], descriere: 'Pavaj măturat, coșuri goale.' } };
const CLEAN_DIRTY: ModelAnswer = { json: { loc_corect: true, verdict: 'MURDAR', probleme: ['praf pe pavaj', 'mucuri la stâlp'], descriere: 'Nemăturat la bordură.' } };
const CLEAN_WRONG_PLACE: ModelAnswer = { json: { loc_corect: false, verdict: 'CURAT', probleme: [], descriere: 'Nu se vede stația GARA.' } };
const CLEAN_THROWS: ModelAnswer = { throws: new Error('model indisponibil') };
/** Răspunsul modelului la poza șoferului: cadrul încălțăminte → cap, cele trei verdicte. */
type DriverJson = { cadru_complet: boolean; persoana_vizibila: boolean; uniforma: boolean; barbierit: boolean; aspect_ingrijit: boolean; descriere: string };
const driverJson = (o: Partial<DriverJson>): ModelAnswer => ({
  json: { cadru_complet: true, persoana_vizibila: true, uniforma: true, barbierit: true, aspect_ingrijit: true, descriere: 'Cămașă TRANSLUX, pantofi negri, bărbierit.', ...o },
});
const DRIVER_OK = driverJson({});
const DRIVER_UNIFORM_NOT_SHAVED = driverJson({ barbierit: false, descriere: 'Cămașă TRANSLUX, nebărbierit.' });
const DRIVER_NO_UNIFORM = driverJson({ uniforma: false, descriere: 'Tricou negru, șlapi.' });
const DRIVER_NOBODY = driverJson({ cadru_complet: false, persoana_vizibila: false, uniforma: false, barbierit: false, aspect_ingrijit: false, descriere: 'Nimeni în cadru.' });
const DRIVER_CUT_FRAME = driverJson({ cadru_complet: false, uniforma: false, barbierit: false, aspect_ingrijit: false, descriere: 'Nu se vede încălțămintea.' });
const DRIVER_MODEL_DOWN: ModelAnswer = { throws: new Error('model indisponibil') };

/** Ce scrie serverul în reports din verdictul modelului: uniform_ok = uniforma, exterior_ok = bărbierit && aspect. */
function modelVerdicts(answer: ModelAnswer): { uniformOk: boolean | null; exteriorOk: boolean | null } {
  const j = answer.json as DriverJson | undefined;
  if (!j) return { uniformOk: null, exteriorOk: null }; // EROARE
  return { uniformOk: j.uniforma, exteriorOk: j.barbierit && j.aspect_ingrijit };
}

// ── Etalonul: ce scrie botul (copiat din conversations/report.ts) ────────────

type Status = 'OK' | 'ABSENT' | 'FULL';
type ReclamaProblem = 'bus' | 'panou_ruta' | 'ambele' | null;
type Climate = 'works' | 'broken' | 'none' | null;

interface BotVars {
  point: PointEnum;
  time: string; // HH:MM al cursei
  status: Status;
  passengersCount: number | null;
  driverId: string | null;
  driverFull: string | null; // full_name din nomenclator, ca în `drivers`
  vehicleId: string | null;
  exteriorOk: boolean | null;
  uniformOk: boolean | null;
  loadingHelpOk: boolean | null;
  autoCurat: boolean | null;
  reclamaOk: boolean | null;
  reclamaProblem: ReclamaProblem;
  washGrade: number | null;
  acStatus: Climate;
  heatStatus: Climate;
  coords: { lat: number; lon: number } | null;
}

/** report.ts:43 — requiresLocation. */
function botNeedsLoc(point: PointEnum, time: string): boolean {
  if (point === 'BALTI') return true;
  return !(config.chisinauExemptTimes as readonly string[]).includes(time);
}

/** report.ts:720–743 — obiectul dat lui createReport, cu aceleași variabile. */
function botReportRow(v: BotVars, userId: string) {
  const needsLoc = botNeedsLoc(v.point, v.time);
  let locationOk = false; // report.ts:255 — fără locație primită rămâne false
  if (needsLoc && v.coords) {
    const station = config.stations[v.point];
    locationOk = haversineDistance(v.coords.lat, v.coords.lon, station.lat, station.lon) <= station.radiusM;
  }
  return {
    report_date: DATE,
    point: v.point,
    trip_id: T(v.time),
    driver_id: v.driverId,
    status: v.status,
    passengers_count: v.passengersCount,
    exterior_ok: v.exteriorOk,
    uniform_ok: v.uniformOk,
    loading_help_ok: v.loadingHelpOk,
    auto_curat: v.autoCurat,
    reclama_ok: v.reclamaOk,
    reclama_deadline: null,
    reclama_problem: v.reclamaProblem,
    wash_grade: v.washGrade,
    ac_status: v.acStatus,
    heat_status: v.heatStatus,
    vehicle_id: v.vehicleId,
    created_by_user: userId,
    location_ok: needsLoc ? locationOk : null,
  };
}

/** report.ts:838–866 — textul trimis operatorului după salvare. */
function botSummary(v: BotVars): string {
  const driverFull = v.driverId ? v.driverFull || '—' : '—';
  const driverParts = driverFull.split(' ');
  const driverName = driverParts.length > 1
    ? `${driverParts[0]} ${driverParts.slice(1).map((p) => p[0] + '.').join('')}`
    : driverFull;

  if (v.status === 'ABSENT') return `☑ ${v.time} — absent`;
  if (v.status === 'FULL') return `☑ ${v.time} — microbuz complet`;
  const passengerInfo = `☑ ${v.time} — ${v.passengersCount} pas.`;
  const driverInfo = v.point !== 'BALTI' ? ` | ${driverName}` : '';
  const washInfo = v.washGrade !== null ? ` · spălare ${v.washGrade}` : '';
  const reclamaProblemLabel = v.reclamaProblem === 'bus' ? 'autobuz'
    : v.reclamaProblem === 'panou_ruta' ? 'panou'
    : v.reclamaProblem === 'ambele' ? 'ambele' : '';
  const warningParts: string[] = [];
  if (v.loadingHelpOk === false) warningParts.push('nu ajută la încărcat');
  if (v.uniformOk === false) warningParts.push('uniformă');
  if (v.exteriorOk === false) warningParts.push('aspect');
  if (v.autoCurat === false) warningParts.push('auto exterior murdar');
  if (v.reclamaOk === false) warningParts.push(`reclamă${reclamaProblemLabel ? ` ${reclamaProblemLabel}` : ''}`);
  const warnings = warningParts.length > 0 ? `\n⚠ ${warningParts.join(', ')}` : '';
  return passengerInfo + driverInfo + washInfo + warnings;
}

/** Rândul din `reports` are exact valorile botului pe coloanele botului (+ ce adaugă aplicația). */
function expectRowLikeBot(row: Row, v: BotVars) {
  const etalon = botReportRow(v, IDS.users.vitalie);
  const picked: Row = {};
  for (const k of Object.keys(etalon)) picked[k] = row[k];
  expect(picked).toEqual(etalon);
  expect(row.source).toBe('app');
  expect(row.cancelled_at ?? null).toBeNull();
  expect(row.id).toMatch(UUID);
}

const DRIVER_NAME: Record<string, string> = {
  [IDS.drivers.ionMunteanu]: 'Ion Munteanu',
  [IDS.drivers.vasileRusu]: 'Vasile Rusu',
  [IDS.drivers.petruCiobanu]: 'Petru Ciobanu',
  [IDS.drivers.sergiuLungu]: 'Sergiu Lungu',
};

// ── Corpuri de cerere ─────────────────────────────────────────────────────────

interface OkOverrides {
  passengersCount?: number;
  driverId?: string | null;
  vehicleId?: string | null;
  assignmentChanged?: boolean;
  loadingHelpOk?: boolean;
  autoCurat?: boolean;
  uniformOk?: boolean;
  exteriorOk?: boolean;
  reclamaOk?: boolean;
  reclamaProblem?: ReclamaProblem;
  reclamaRepairConfirmed?: boolean;
  reclamaTaskId?: string | null;
  acStatus?: Climate;
  heatStatus?: Climate;
  coords?: { lat: number; lon: number; accuracyM?: number } | null;
}

/** Corpul unui raport OK complet, ca din aplicație; coordonatele în zonă dacă nu se spune altfel. */
function okBody(time: string, driverCheckId: string | null, o: OkOverrides = {}) {
  const coords = o.coords === undefined ? IN_ZONE : o.coords;
  return {
    tripId: T(time),
    status: 'OK' as const,
    passengersCount: o.passengersCount ?? 12,
    driverId: o.driverId === undefined ? IDS.drivers.ionMunteanu : o.driverId,
    vehicleId: o.vehicleId === undefined ? IDS.vehicles.tcp998 : o.vehicleId,
    assignmentChanged: o.assignmentChanged ?? false,
    loadingHelpOk: o.loadingHelpOk ?? true,
    autoCurat: o.autoCurat ?? true,
    driverCheckId,
    uniformOk: o.uniformOk ?? true,
    exteriorOk: o.exteriorOk ?? true,
    reclamaOk: o.reclamaOk ?? true,
    reclamaProblem: o.reclamaProblem ?? null,
    reclamaRepairConfirmed: o.reclamaRepairConfirmed ?? false,
    reclamaTaskId: o.reclamaTaskId ?? null,
    acStatus: o.acStatus ?? null,
    heatStatus: o.heatStatus ?? null,
    lat: coords ? coords.lat : null,
    lon: coords ? coords.lon : null,
    accuracyM: coords ? coords.accuracyM ?? null : null,
  };
}

/**
 * Variabilele botului pentru același raport OK. Uniforma și aspectul NU vin din corp:
 * operatorul nu mai bifează nimic, verdictul e al modelului din poza șoferului.
 */
function botVarsFor(body: ReturnType<typeof okBody>, time: string, driverAnswer: ModelAnswer): BotVars {
  const verdict = modelVerdicts(driverAnswer);
  return {
    point: 'CHISINAU',
    time,
    status: 'OK',
    passengersCount: body.passengersCount,
    driverId: body.driverId,
    driverFull: body.driverId ? DRIVER_NAME[body.driverId] ?? null : null,
    vehicleId: body.vehicleId,
    exteriorOk: verdict.exteriorOk,
    uniformOk: verdict.uniformOk,
    loadingHelpOk: body.loadingHelpOk,
    autoCurat: body.autoCurat,
    reclamaOk: body.vehicleId ? body.reclamaOk : null,
    reclamaProblem: body.vehicleId && body.reclamaOk === false ? body.reclamaProblem : null,
    washGrade: null, // nota de spălare nu se mai cere în aplicație
    acStatus: body.acStatus,
    heatStatus: body.heatStatus,
    coords: body.lat !== null && body.lon !== null ? { lat: body.lat, lon: body.lon } : null,
  };
}

// ── Mesajele către executor (notifyTelegram din db.ts merge direct pe fetch) ──

interface ExecutorMessage {
  chatId: number;
  text: string;
}
const executorMessages: ExecutorMessage[] = [];

// ── Starea scenariului ───────────────────────────────────────────────────────

let fake: FakeSupabase;
let srv: TestApi;
let token = '';
const realFetch = globalThis.fetch;

const reports = () => fake._tables.reports;
const reportFor = (time: string): Row => {
  const r = reports().find((x) => x.trip_id === T(time));
  if (!r) throw new Error(`nu există raport pentru ${time}`);
  return r;
};
const day = () => srv.api('GET', 'day', undefined, token);
const report = (body: unknown) => srv.api('POST', 'report', body, token);

async function cleaningPhoto(slot: 'DIMINEATA' | 'ZIUA', zone: 'PERON' | 'PIETONI' | 'VECEU', answer: ModelAnswer) {
  nextModelAnswer(answer);
  return srv.api('POST', 'cleaning-photo', { slot, zone, imageBase64: JPEG_B64, lat: IN_ZONE.lat, lon: IN_ZONE.lon }, token);
}

async function driverPhoto(time: string, driverId: string | null, answer: ModelAnswer) {
  nextModelAnswer(answer);
  return srv.api('POST', 'driver-photo', { tripId: T(time), driverId, imageBase64: JPEG_B64, lat: IN_ZONE.lat, lon: IN_ZONE.lon }, token);
}

/** Poza șoferului + raportul OK, cu verificările comune: 200, rând ca la bot, summary ca la bot. */
async function fullTrip(time: string, o: OkOverrides = {}, driverAnswer: ModelAnswer = DRIVER_OK) {
  const photo = await driverPhoto(time, o.driverId === undefined ? IDS.drivers.ionMunteanu : o.driverId, driverAnswer);
  expect(photo.status, `driver-photo ${time}`).toBe(200);
  const driverCheckId = photo.body.driverCheckId as string;
  const body = okBody(time, driverCheckId, o);
  const res = await report(body);
  expect(res.status, `report ${time}: ${JSON.stringify(res.body)}`).toBe(200);
  const vars = botVarsFor(body, time, driverAnswer);
  expectRowLikeBot(reportFor(time), vars);
  expect(reportFor(time).driver_check_id).toBe(driverCheckId);
  expect(res.body.summary).toBe(botSummary(vars));
  return { res, body, driverCheckId, vars };
}

async function digestState(): Promise<{ date: string; violations: Row[] } | null> {
  const buf = fake._storage['report-photos']?.[`digest/${DATE}.json`];
  return buf ? JSON.parse(buf.toString('utf8')) : null;
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  clock('06:20');
  fake = installMocks(seedDay(DATE));

  // Executorul sarcinilor reclamă e anunțat de db.ts prin fetch direct pe api.telegram.org,
  // nu prin adminAlert — îl capturăm aici. Orice altă adresă în afara serverului local e o scurgere.
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://api.telegram.org/bottest-bot-token/sendMessage')) {
      const payload = JSON.parse(String(init?.body ?? '{}'));
      executorMessages.push({ chatId: payload.chat_id, text: payload.text });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }
    if (!url.startsWith('http://127.0.0.1:')) throw new Error(`scurgere spre rețea în test: ${url}`);
    return realFetch(input, init);
  });

  srv = await startApi();
});

afterAll(async () => {
  await srv.stop();
  vi.unstubAllGlobals();
  process.env.TELEGRAM_BOT_TOKEN = '';
  vi.useRealTimers();
});

// ════════════════════════════════════════════════════════════════════════════

describe('1. Cod și token', () => {
  it('codul 482913 al lui Vitalie → 200 cu token de 64 hex și sesiune cu hash, nu cu token', async () => {
    fake._tables.peron_app_link_codes.push(linkCodeRow('482913', IDS.users.vitalie));
    const res = await srv.api('POST', 'auth/link', { code: '482913', deviceLabel: 'Pixel test' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toMatch(HEX64);
    expect(res.body.user).toEqual({ id: IDS.users.vitalie, name: '@vitalie_peron', point: 'CHISINAU' });
    token = res.body.token;

    expect(fake._tables.peron_app_sessions).toHaveLength(1);
    expect(fake._tables.peron_app_sessions[0]).toMatchObject({ user_id: IDS.users.vitalie, device_label: 'Pixel test', revoked_at: null });
    expect(fake._tables.peron_app_sessions[0].token_hash).toMatch(HEX64);
    expect(fake._tables.peron_app_sessions[0].token_hash).not.toBe(token);
    expect(fake._tables.peron_app_link_codes[0].used_at).toBe(new Date().toISOString());
  });

  it('același cod a doua oară → 401 BAD_CODE', async () => {
    const res = await srv.api('POST', 'auth/link', { code: '482913' });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, code: 'BAD_CODE' });
    expect(fake._tables.peron_app_sessions).toHaveLength(1);
  });

  it('cod expirat (emis acum 25 h) → 401 BAD_CODE, rămâne nefolosit', async () => {
    fake._tables.peron_app_link_codes.push(linkCodeRow('111111', IDS.users.vitalie, new Date(Date.now() - 25 * 3600_000)));
    const res = await srv.api('POST', 'auth/link', { code: '111111' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('BAD_CODE');
    expect(fake._tables.peron_app_link_codes[1].used_at).toBeNull();
  });

  it('GET day fără Bearer → 401; cu token inventat → 401', async () => {
    const none = await srv.api('GET', 'day');
    expect(none.status).toBe(401);
    expect(none.body).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
    const bogus = await srv.api('GET', 'day', undefined, 'ab'.repeat(32));
    expect(bogus.status).toBe(401);
    expect(bogus.body.code).toBe('UNAUTHORIZED');
  });

  it('GET day cu token → 200, iar sesiunea primește last_seen_at', async () => {
    const res = await day();
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toEqual({ id: IDS.users.vitalie, name: '@vitalie_peron', point: 'CHISINAU' });
    expect(fake._tables.peron_app_sessions[0].last_seen_at).toBe(new Date().toISOString());
  });
});

describe('2. /day la 06:20', () => {
  it('29 de curse în ordinea plecării: prima `next`, restul `locked`', async () => {
    const { body } = await day();
    expect(body.date).toBe(DATE);
    expect(body.point).toBe('CHISINAU');
    expect(body.trips).toHaveLength(29);
    expect(body.trips.map((t: any) => t.departure_time)).toEqual([...CHISINAU_TIMES]);
    expect(body.trips.map((t: any) => t.state)).toEqual(['next', ...Array(28).fill('locked')]);
    expect(body.trips[0]).toEqual({ id: T('06:55'), departure_time: '06:55', route_name: 'Chișinău – Bălți', crm_route_id: crmRouteId('06:55'), state: 'next' });
  });

  it('repartizări pentru 3 curse, 4 șoferi, 3 auto', async () => {
    const { body } = await day();
    expect(Object.keys(body.assignments).sort()).toEqual([T('06:55'), T('07:35'), T('08:15')].sort());
    expect(body.assignments[T('06:55')]).toEqual({ driver_id: IDS.drivers.ionMunteanu, driver_name: 'Ion Munteanu', vehicle_id: IDS.vehicles.tcp998, plate: PLATES.tcp998 });
    expect(body.assignments[T('07:35')]).toEqual({ driver_id: IDS.drivers.vasileRusu, driver_name: 'Vasile Rusu', vehicle_id: IDS.vehicles.wvw526, plate: PLATES.wvw526 });
    expect(body.assignments[T('08:15')]).toEqual({ driver_id: IDS.drivers.petruCiobanu, driver_name: 'Petru Ciobanu', vehicle_id: IDS.vehicles.lyy735, plate: PLATES.lyy735 });
    expect(body.drivers.map((d: any) => d.name)).toEqual(['Ion Munteanu', 'Petru Ciobanu', 'Sergiu Lungu', 'Vasile Rusu']);
    expect(body.vehicles.map((v: any) => v.plate)).toEqual([PLATES.wvw526, PLATES.tcp998, PLATES.lyy735]);
  });

  it("openReclama['LYY 735'] e sarcina din seed; clima e 'ac' pentru fiecare auto (iunie, încă neîntrebată)", async () => {
    const { body } = await day();
    expect(body.openReclama).toEqual({
      [PLATES.lyy735]: { taskId: IDS.reclamaTask, description: 'LYY 735 — panou cu ruta, de reparat', lastComment: null },
    });
    expect(body.climate).toEqual({ [IDS.vehicles.lyy735]: 'ac', [IDS.vehicles.tcp998]: 'ac', [IDS.vehicles.wvw526]: 'ac' });
  });

  it('curățenie goală, poarta 16:25, fereastra de prezență 06:25–20:30, excepțiile de locație, stația', async () => {
    const { body } = await day();
    expect(body.cleaning).toEqual({ DIMINEATA: [], ZIUA: [] });
    expect(body.cleaningGateTripTime).toBe('16:25');
    expect(body.presenceWindow).toEqual({ from: '06:25', to: '20:30' });
    expect(body.locationExemptTimes).toEqual(['06:55', '20:00']);
    expect(body.station).toEqual(STATION);
    expect(body.allowFull).toBe(false);
    expect(body.driverChecks).toEqual({}); // nicio poză de șofer încă
  });
});

describe('3. Poarta de dimineață', () => {
  it('raport pe 06:55 înaintea pozelor → 409 CLEANING_REQUIRED { DIMINEATA, toate 3 zonele }', async () => {
    const res = await report(okBody('06:55', '00000000-0000-4000-8000-00000000dead', { coords: null }));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, code: 'CLEANING_REQUIRED', slot: 'DIMINEATA', missing: ['PERON', 'PIETONI', 'VECEU'] });
    expect(res.body.message).toContain('06:55');
    expect(reports()).toHaveLength(0);
  });
});

describe('4. Curățenie de dimineață', () => {
  it('PERON → CURAT; modelul a primit poza și zona; zona se închide', async () => {
    clock('06:30');
    const res = await cleaningPhoto('DIMINEATA', 'PERON', CLEAN_OK);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, verdict: 'CURAT', problems: [], description: 'Pavaj măturat, coșuri goale.', zonesDone: ['PERON'] });
    expect(modelCalls.at(-1)).toMatchObject({ model: 'claude-opus-5', hasImage: true });
    expect(modelCalls.at(-1)!.userText).toContain('PERON');
  });

  it('PIETONI cu loc_corect=false → ALT_LOC, zona rămâne deschisă în /day', async () => {
    clock('06:31');
    const res = await cleaningPhoto('DIMINEATA', 'PIETONI', CLEAN_WRONG_PLACE);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ verdict: 'ALT_LOC', problems: [], zonesDone: ['PERON'] });
    const { body } = await day();
    expect(body.cleaning.DIMINEATA).toEqual(['PERON']);
  });

  it('PIETONI din nou → MURDAR cu 2 probleme; zona se închide (MURDAR nu blochează)', async () => {
    clock('06:32');
    const res = await cleaningPhoto('DIMINEATA', 'PIETONI', CLEAN_DIRTY);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ verdict: 'MURDAR', problems: ['praf pe pavaj', 'mucuri la stâlp'] });
    expect([...res.body.zonesDone].sort()).toEqual(['PERON', 'PIETONI']);
  });

  it('VECEU cu modelul picat → EROARE; zona se închide totuși', async () => {
    clock('06:33');
    const res = await cleaningPhoto('DIMINEATA', 'VECEU', CLEAN_THROWS);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ verdict: 'EROARE', problems: [], description: 'Verificarea automată a eșuat.' });
    expect([...res.body.zonesDone].sort()).toEqual(['PERON', 'PIETONI', 'VECEU']);
  });

  it("peron_cleaning_checks: 4 rânduri source 'app' sub curatenie/2026-06-10/DIMINEATA/, pozele sunt în Storage, /day are 3 zone", async () => {
    const rows = fake._tables.peron_cleaning_checks;
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => [r.zone, r.verdict])).toEqual([['PERON', 'CURAT'], ['PIETONI', 'ALT_LOC'], ['PIETONI', 'MURDAR'], ['VECEU', 'EROARE']]);
    for (const r of rows) {
      expect(r).toMatchObject({ check_date: DATE, slot: 'DIMINEATA', source: 'app', created_by_user: IDS.users.vitalie, telegram_file_id: '', model: 'claude-opus-5', location_lat: IN_ZONE.lat, location_lon: IN_ZONE.lon, photo_deleted_at: null });
      expect(r.storage_key).toMatch(new RegExp(`^curatenie/${DATE}/DIMINEATA/${r.zone}-\\d+\\.jpg$`));
      expect(fake._storage['report-photos'][r.storage_key]).toEqual(JPEG);
    }
    expect(new Set(rows.map((r) => r.storage_key)).size).toBe(4);
    const { body } = await day();
    expect([...body.cleaning.DIMINEATA].sort()).toEqual(['PERON', 'PIETONI', 'VECEU']);
    expect(body.cleaning.ZIUA).toEqual([]);
  });
});

describe('5. Poza șoferului', () => {
  let noPersonKeys: string[] = [];

  it('raport pe 06:55 fără driverCheckId → 400 DRIVER_PHOTO_REQUIRED', async () => {
    clock('06:40');
    const res = await report(okBody('06:55', null, { coords: null }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DRIVER_PHOTO_REQUIRED');
  });

  it('raport cu un driverCheckId inexistent → 400 DRIVER_PHOTO_REQUIRED (poza trebuie să existe și să fie de azi)', async () => {
    const res = await report(okBody('06:55', '00000000-0000-4000-8000-00000000dead', { coords: null }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DRIVER_PHOTO_REQUIRED');
    expect(reports()).toHaveLength(0);
  });

  it('persoana_vizibila=false → 200 NO_PERSON, fără rând, poza scoasă din Storage', async () => {
    clock('06:41');
    const before = Object.keys(fake._storage['report-photos']).filter((k) => k.startsWith('soferi/'));
    const res = await driverPhoto('06:55', IDS.drivers.ionMunteanu, DRIVER_NOBODY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true, verdict: 'NO_PERSON', code: 'NO_PERSON',
      message: 'Nimeni în cadru. Refă poza: șoferul din față, întreg, să se vadă încălțămintea și capul.',
      driverCheckId: null, personVisible: false, frameOk: false, uniformOk: null, shavedOk: null, groomedOk: null, description: 'Nimeni în cadru.',
    });
    expect(fake._tables.driver_appearance_checks).toHaveLength(0);
    noPersonKeys = fake._storageOps.filter((o) => o.op === 'remove').flatMap((o) => o.paths);
    expect(noPersonKeys).toHaveLength(1);
    expect(noPersonKeys[0]).toMatch(new RegExp(`^soferi/${DATE}/${T('06:55')}-\\d+\\.jpg$`));
    expect(Object.keys(fake._storage['report-photos']).filter((k) => k.startsWith('soferi/'))).toEqual(before);
  });

  it('cadru_complet=false (nu se vede încălțămintea) → 200 REFA_POZA cu mesaj, fără rând, poza scoasă din Storage', async () => {
    clock('06:41');
    const before = Object.keys(fake._storage['report-photos']).filter((k) => k.startsWith('soferi/'));
    const res = await driverPhoto('06:55', IDS.drivers.ionMunteanu, DRIVER_CUT_FRAME);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true, verdict: 'REFA_POZA', code: 'REFA_POZA',
      message: 'Nu se vede încălțămintea. Refă poza: șoferul din față, întreg, să se vadă încălțămintea și capul.',
      driverCheckId: null, personVisible: true, frameOk: false, uniformOk: null, shavedOk: null, groomedOk: null, description: 'Nu se vede încălțămintea.',
    });
    expect(fake._tables.driver_appearance_checks).toHaveLength(0);
    const removed = fake._storageOps.filter((o) => o.op === 'remove').flatMap((o) => o.paths);
    expect(removed).toHaveLength(2); // NO_PERSON + REFA_POZA
    expect(removed[1]).toMatch(new RegExp(`^soferi/${DATE}/${T('06:55')}-\\d+\\.jpg$`));
    expect(Object.keys(fake._storage['report-photos']).filter((k) => k.startsWith('soferi/'))).toEqual(before);
    // modelul a fost chemat cu poza și cu cerința de cadru
    expect(modelCalls.at(-1)).toMatchObject({ model: 'claude-opus-5', hasImage: true });
    expect(modelCalls.at(-1)!.userText).toContain('încălțăminte');
  });

  it('uniforma=true, bărbierit=false → rând în driver_appearance_checks: *_model = uniform_ok/groomed_ok (verdict final), descrierea cu cele trei verdicte', async () => {
    clock('06:42');
    const res = await driverPhoto('06:55', IDS.drivers.ionMunteanu, DRIVER_UNIFORM_NOT_SHAVED);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      verdict: 'OK', personVisible: true, frameOk: true, uniformOk: true, shavedOk: false, groomedOk: true,
      description: 'uniformă: da · bărbierit: nu · aspect: da · Cămașă TRANSLUX, nebărbierit.',
    });
    expect(res.body.code).toBeUndefined();
    expect(res.body.driverCheckId).toMatch(UUID);
    const rows = fake._tables.driver_appearance_checks;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: res.body.driverCheckId,
      check_date: DATE,
      trip_id: T('06:55'),
      driver_id: IDS.drivers.ionMunteanu,
      person_visible: true,
      uniform_ok_model: true,
      groomed_ok_model: false, // bărbierit && aspect
      uniform_ok: true,
      groomed_ok: false,
      description: 'uniformă: da · bărbierit: nu · aspect: da · Cămașă TRANSLUX, nebărbierit.',
      model: 'claude-opus-5',
      location_lat: IN_ZONE.lat,
      location_lon: IN_ZONE.lon,
      created_by_user: IDS.users.vitalie,
      photo_deleted_at: null,
    });
    expect(rows[0].storage_key).toMatch(new RegExp(`^soferi/${DATE}/${T('06:55')}-\\d+\\.jpg$`));
    expect(fake._storage['report-photos'][rows[0].storage_key]).toEqual(JPEG);
  });
});

describe('6. Raport 06:55', () => {
  it('200; rândul din reports are exact coloanele botului (location_ok null — cursă exceptată) + source app, driver_check_id; exterior_ok = verdictul modelului (nebărbierit), nu ce a bifat aplicația', async () => {
    clock('06:55');
    const driverCheckId = fake._tables.driver_appearance_checks[0].id as string;
    // aplicația trimite uniformOk/exteriorOk true (clienți vechi) — serverul le ignoră
    const body = okBody('06:55', driverCheckId, { passengersCount: 12, acStatus: 'works', coords: null, uniformOk: true, exteriorOk: true });
    const res = await report(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, summary: '☑ 06:55 — 12 pas. | Ion M.\n⚠ aspect', allDone: false });

    expect(reports()).toHaveLength(1);
    const row = reportFor('06:55');
    const vars = botVarsFor(body, '06:55', DRIVER_UNIFORM_NOT_SHAVED);
    expectRowLikeBot(row, vars);
    expect(row).toMatchObject({
      status: 'OK', passengers_count: 12, driver_id: IDS.drivers.ionMunteanu, vehicle_id: IDS.vehicles.tcp998,
      exterior_ok: false, uniform_ok: true, loading_help_ok: true, auto_curat: true, reclama_ok: true, reclama_problem: null,
      wash_grade: null, ac_status: 'works', heat_status: null, location_ok: null, source: 'app',
      driver_check_id: driverCheckId, created_by_user: IDS.users.vitalie, location_lat: null, location_lon: null, location_accuracy_m: null,
    });
    expect(row.created_at).toBe(iso('06:55'));
    expect(res.body.summary).toBe(botSummary(vars));
  });

  it('rândul pozei rămâne neatins de raport: uniform_ok/groomed_ok = *_model (nu există confirmare de operator)', () => {
    expect(fake._tables.driver_appearance_checks[0]).toMatchObject({ uniform_ok: true, groomed_ok: false, uniform_ok_model: true, groomed_ok_model: false });
  });

  it('loading board: un sendMessage către admin cu «06:55», starea salvată în Storage; nicio alertă (06:55 e exceptată)', () => {
    const board = telegram.filter((t) => t.method === 'sendMessage' || t.method === 'editMessageText');
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ method: 'sendMessage', chatId: TELEGRAM.admin });
    expect(board[0].text).toContain('06:55');
    expect(board[0].text).toContain('12 pas.');
    expect(board[0].text).toContain('🚌 Chișinău');
    const state = JSON.parse(fake._storage['report-photos'][`loading-board/${DATE}.json`].toString('utf8'));
    expect(state).toEqual({ date: DATE, messages: { [String(TELEGRAM.admin)]: board[0].messageId } });
    expect(alerts).toEqual([]);
    expect(fake._storage['report-photos'][`digest/${DATE}.json`]).toBeUndefined();
  });

  it('/day: 06:55 done, 07:35 next; Ion Munteanu și 998 TCP nu se mai listează; clima pentru 998 TCP e null luna asta', async () => {
    const { body } = await day();
    expect(body.trips.slice(0, 3).map((t: any) => t.state)).toEqual(['done', 'next', 'locked']);
    expect(body.drivers.map((d: any) => d.name)).toEqual(['Petru Ciobanu', 'Sergiu Lungu', 'Vasile Rusu']);
    expect(body.vehicles.map((v: any) => v.plate)).toEqual([PLATES.wvw526, PLATES.lyy735]);
    expect(body.climate).toEqual({ [IDS.vehicles.lyy735]: 'ac', [IDS.vehicles.tcp998]: null, [IDS.vehicles.wvw526]: 'ac' });
  });

  it('/day: driverChecks[Ion Munteanu] = poza de la 06:42 (id-ul rândului, verdictele modelului, ora) — valabilă toată ziua', async () => {
    const { body } = await day();
    expect(body.driverChecks).toEqual({
      [IDS.drivers.ionMunteanu]: { id: fake._tables.driver_appearance_checks[0].id, uniformOk: true, groomedOk: false, at: '06:42' },
    });
  });
});

describe('7. Ordinea curselor', () => {
  it('raport pe 08:15 când urmează 07:35 → 409 NOT_NEXT', async () => {
    const res = await report(okBody('08:15', fake._tables.driver_appearance_checks[0].id));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, code: 'NOT_NEXT' });
    expect(res.body.message).toContain('07:35');
  });

  it('06:55 din nou → 409 ALREADY_REPORTED, fără rând nou', async () => {
    const res = await report(okBody('06:55', fake._tables.driver_appearance_checks[0].id, { coords: null }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_REPORTED');
    expect(reports()).toHaveLength(1);
  });
});

describe('8. 07:35 cu schimbare de repartizare și auto nou', () => {
  let abc: { id: string; plate_number: string };

  it("POST vehicle { plate: 'ABC 123' } → auto nou ABC123; a doua oară → același, existed: true", async () => {
    clock('07:33');
    const first = await srv.api('POST', 'vehicle', { plate: 'ABC 123' }, token);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, plate_number: 'ABC123', existed: false });
    expect(first.body.id).toMatch(UUID);
    abc = { id: first.body.id, plate_number: first.body.plate_number };
    expect(fake._tables.vehicles.find((v) => v.id === abc.id)).toMatchObject({ plate_number: 'ABC123', active: true, is_lde: false, directions: ['interurban'] });

    const again = await srv.api('POST', 'vehicle', { plate: 'abc123' }, token);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ id: abc.id, plate_number: 'ABC123', existed: true });
    expect(fake._tables.vehicles).toHaveLength(4);

    const { body } = await day();
    expect(body.vehicles.map((v: any) => v.plate)).toEqual([PLATES.wvw526, 'ABC123', PLATES.lyy735]);
    expect(body.climate[abc.id]).toBe('ac');
  });

  it('raport cu assignmentChanged, Sergiu Lungu și ABC123; modelul zice fără uniformă, aplicația trimite invers → serverul scrie verdictul modelului, summary cu ⚠ uniformă', async () => {
    clock('07:35');
    const { res, vars } = await fullTrip('07:35', { passengersCount: 9, driverId: IDS.drivers.sergiuLungu, vehicleId: abc.id, assignmentChanged: true, uniformOk: true, exteriorOk: false }, DRIVER_NO_UNIFORM);
    expect(res.body.summary).toBe('☑ 07:35 — 9 pas. | Sergiu L.\n⚠ uniformă');
    expect(botSummary(vars)).toBe('☑ 07:35 — 9 pas. | Sergiu L.\n⚠ uniformă');
    expect(reportFor('07:35')).toMatchObject({ location_ok: true, location_lat: IN_ZONE.lat, location_lon: IN_ZONE.lon, location_accuracy_m: 8, uniform_ok: false, exterior_ok: true });
    expect(fake._tables.driver_appearance_checks.at(-1)).toMatchObject({ uniform_ok_model: false, groomed_ok_model: true, uniform_ok: false, groomed_ok: true });

    const assignment = fake._tables.daily_assignments.find((a) => a.trip_id === T('07:35'));
    expect(assignment).toMatchObject({ crm_route_id: crmRouteId('07:35'), driver_id: IDS.drivers.sergiuLungu, vehicle_id: abc.id });
    // celelalte repartizări rămân neatinse
    expect(fake._tables.daily_assignments.find((a) => a.trip_id === T('06:55'))).toMatchObject({ driver_id: IDS.drivers.ionMunteanu, vehicle_id: IDS.vehicles.tcp998 });
  });

  it('/day: nu mai listează șoferii și auto folosite; repartizarea 07:35 arată noul șofer/auto', async () => {
    const { body } = await day();
    expect(body.drivers.map((d: any) => d.name)).toEqual(['Petru Ciobanu', 'Vasile Rusu']);
    expect(body.vehicles.map((v: any) => v.plate)).toEqual([PLATES.wvw526, PLATES.lyy735]);
    expect(body.assignments[T('07:35')]).toEqual({ driver_id: IDS.drivers.sergiuLungu, driver_name: 'Sergiu Lungu', vehicle_id: abc.id, plate: 'ABC123' });
    expect(telegram.filter((t) => t.method === 'editMessageText')).toHaveLength(1);
    // poza lui Sergiu (fără uniformă) intră în driverChecks; a lui Ion rămâne cea de la 06:42
    expect(body.driverChecks).toEqual({
      [IDS.drivers.ionMunteanu]: { id: fake._tables.driver_appearance_checks[0].id, uniformOk: true, groomedOk: false, at: '06:42' },
      [IDS.drivers.sergiuLungu]: { id: reportFor('07:35').driver_check_id, uniformOk: false, groomedOk: true, at: '07:35' },
    });
  });
});

describe('9. 08:15 cu reclamă pe LYY 735, apoi 08:50 cu reparare confirmată', () => {
  let busTaskId = '';

  it("reclamaOk false / 'bus' → o sarcină nouă doar pentru «bus» (panoul e deja deschis), executorul e anunțat, adminii nu", async () => {
    clock('08:15');
    const { res } = await fullTrip('08:15', { passengersCount: 18, driverId: IDS.drivers.petruCiobanu, vehicleId: IDS.vehicles.lyy735, reclamaOk: false, reclamaProblem: 'bus', acStatus: 'broken' });
    expect(res.body.summary).toBe('☑ 08:15 — 18 pas. | Petru C.\n⚠ reclamă autobuz');
    expect(reportFor('08:15')).toMatchObject({ reclama_ok: false, reclama_problem: 'bus', ac_status: 'broken' });

    const tasks = fake._tables.obligations.filter((o) => o.vehicle_plate === PLATES.lyy735);
    expect(tasks).toHaveLength(2);
    const created = tasks.find((o) => o.id !== IDS.reclamaTask)!;
    busTaskId = created.id;
    expect(created).toMatchObject({
      source: 'reclama', reclama_problem: 'bus', current_state: 'sent', assignee_id: IDS.users.digital, creator_id: IDS.users.vitalie,
      title: 'Reclamă LYY 735', description: 'LYY 735 — reclamă pe autobuz, de reparat', category: 'MARKETING_AUTO', points: 30,
    });
    expect(fake._tables.obligation_events.filter((e) => e.obligation_id === busTaskId).map((e) => e.event_type)).toEqual(['created', 'sent']);

    expect(executorMessages).toHaveLength(1);
    expect(executorMessages[0].chatId).toBe(TELEGRAM.digital);
    expect(executorMessages[0].text).toContain('Sarcină nouă (auto)');
    expect(executorMessages[0].text).toContain('LYY 735 — reclamă pe autobuz, de reparat');
    expect(alerts).toEqual([]);
  });

  it('08:50 același auto, reclamaOk + reparare confirmată pe sarcina «panou» → cancelled (executorul nu raportase); «bus» rămâne deschisă', async () => {
    clock('08:50');
    const { res } = await fullTrip('08:50', { passengersCount: 7, driverId: IDS.drivers.petruCiobanu, vehicleId: IDS.vehicles.lyy735, reclamaOk: true, reclamaRepairConfirmed: true, reclamaTaskId: IDS.reclamaTask });
    expect(res.body.summary).toBe('☑ 08:50 — 7 pas. | Petru C.');
    expect(reportFor('08:50')).toMatchObject({ reclama_ok: true, reclama_problem: null });

    const panou = fake._tables.obligations.find((o) => o.id === IDS.reclamaTask)!;
    expect(panou.current_state).toBe('cancelled');
    expect(fake._tables.obligation_events.at(-1)).toMatchObject({
      obligation_id: IDS.reclamaTask, event_type: 'cancelled', actor_id: null,
      data: { via: 'operator_reclama_ok_fara_raport', vehicle_plate: PLATES.lyy735, report_date: DATE },
    });
    expect(fake._tables.obligations.find((o) => o.id === busTaskId)!.current_state).toBe('sent');

    expect(executorMessages).toHaveLength(2);
    expect(executorMessages[1].chatId).toBe(TELEGRAM.digital);
    expect(executorMessages[1].text).toContain('Reclamă LYY 735 — sarcina s-a anulat');

    const { body } = await day();
    expect(body.openReclama).toEqual({ [PLATES.lyy735]: { taskId: busTaskId, description: 'LYY 735 — reclamă pe autobuz, de reparat', lastComment: null } });
    expect(body.climate[IDS.vehicles.lyy735]).toBeNull();
  });
});

describe('10. Locație și întârziere', () => {
  it('punctele de test sunt la ~400 m și ~50 m de stație', () => {
    const far = haversineDistance(FAR_400M.lat, FAR_400M.lon, STATION.lat, STATION.lon);
    const near = haversineDistance(NEAR_50M.lat, NEAR_50M.lon, STATION.lat, STATION.lon);
    expect(far).toBeGreaterThan(380);
    expect(far).toBeLessThan(420);
    expect(near).toBeGreaterThan(40);
    expect(near).toBeLessThan(60);
  });

  it('09:25 la ~400 m → location_ok false și o încălcare de locație în digest (nimic către admini acum)', async () => {
    clock('09:25');
    await fullTrip('09:25', { passengersCount: 15, driverId: IDS.drivers.vasileRusu, vehicleId: IDS.vehicles.wvw526, coords: FAR_400M });
    expect(reportFor('09:25')).toMatchObject({ location_ok: false, location_lat: FAR_400M.lat, location_lon: FAR_400M.lon, location_accuracy_m: 15 });

    const digest = await digestState();
    expect(digest?.violations).toHaveLength(1);
    expect(digest!.violations[0]).toMatchObject({ time: '09:25', point: 'Chișinău', operator: '@vitalie_peron', locationBad: true, late: false, minutesLate: 0 });
    expect(digest!.violations[0].distanceM).toBeGreaterThan(380);
    expect(digest!.violations[0].distanceM).toBeLessThan(420);
    expect(alerts).toEqual([]);
  });

  it('10:00 trimis la 10:12 → încălcare de întârziere (12 min), locația e bună; a doua cursă a lui Ion Munteanu FĂRĂ poză nouă — driverCheckId din /day.driverChecks → 200 cu verdictele pozei de la 06:42', async () => {
    clock('10:12');
    const before = fake._tables.driver_appearance_checks.length;
    const { body: dayBody } = await day();
    const todays = dayBody.driverChecks[IDS.drivers.ionMunteanu];
    expect(todays).toEqual({ id: fake._tables.driver_appearance_checks[0].id, uniformOk: true, groomedOk: false, at: '06:42' });

    const body = okBody('10:00', todays.id, { passengersCount: 20, driverId: IDS.drivers.ionMunteanu, vehicleId: IDS.vehicles.tcp998 });
    const res = await report(body);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const vars = botVarsFor(body, '10:00', DRIVER_UNIFORM_NOT_SHAVED);
    expectRowLikeBot(reportFor('10:00'), vars);
    expect(res.body.summary).toBe(botSummary(vars));
    expect(res.body.summary).toBe('☑ 10:00 — 20 pas. | Ion M.\n⚠ aspect');
    expect(reportFor('10:00')).toMatchObject({ driver_check_id: todays.id, uniform_ok: true, exterior_ok: false });
    expect(fake._tables.driver_appearance_checks).toHaveLength(before); // niciun rând nou, nicio poză nouă
    expect(reportFor('10:00')).toMatchObject({ location_ok: true });
    expect(reportFor('10:00').created_at).toBe(iso('10:12'));
    const digest = await digestState();
    expect(digest?.violations).toHaveLength(2);
    expect(digest!.violations[1]).toMatchObject({ time: '10:00', locationBad: false, distanceM: 0, late: true, minutesLate: 12 });
  });

  it('10:30 la 50 m și la timp → location_ok true, fără încălcare nouă', async () => {
    clock('10:30');
    await fullTrip('10:30', { passengersCount: 4, driverId: IDS.drivers.sergiuLungu, vehicleId: IDS.vehicles.wvw526, coords: NEAR_50M });
    expect(reportFor('10:30')).toMatchObject({ location_ok: true, location_accuracy_m: 12 });
    expect((await digestState())!.violations).toHaveLength(2);
  });
});

describe('11. Absent', () => {
  it("11:00 ABSENT fără poză și fără cifră → passengers_count null, câmpurile de calitate null, summary '☑ 11:00 — absent'", async () => {
    clock('11:00');
    const res = await report({ tripId: T('11:00'), status: 'ABSENT', lat: IN_ZONE.lat, lon: IN_ZONE.lon, accuracyM: 8 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, summary: '☑ 11:00 — absent', allDone: false });

    const vars: BotVars = {
      point: 'CHISINAU', time: '11:00', status: 'ABSENT', passengersCount: null, driverId: null, driverFull: null, vehicleId: null,
      exteriorOk: null, uniformOk: null, loadingHelpOk: null, autoCurat: null, reclamaOk: null, reclamaProblem: null,
      washGrade: null, acStatus: null, heatStatus: null, coords: { lat: IN_ZONE.lat, lon: IN_ZONE.lon },
    };
    const row = reportFor('11:00');
    expectRowLikeBot(row, vars);
    expect(row).toMatchObject({ status: 'ABSENT', passengers_count: null, driver_id: null, vehicle_id: null, driver_check_id: null, location_ok: true });
    expect(res.body.summary).toBe(botSummary(vars));
    expect((await digestState())!.violations).toHaveLength(2);
  });
});

describe('12. Restul curselor până la 16:05', () => {
  const LOOP_TIMES = ['11:28', '11:55', '12:20', '12:45', '13:10', '13:35', '14:00', '14:25', '14:50', '15:15', '15:40', '16:05'];
  const PAX = [0, 27, 5, 14, 3, 21, 8, 17, 11, 6, 19, 2];
  const DRIVERS = [IDS.drivers.ionMunteanu, IDS.drivers.vasileRusu, IDS.drivers.petruCiobanu, IDS.drivers.sergiuLungu];
  const VEHICLES = () => [IDS.vehicles.tcp998, IDS.vehicles.wvw526, IDS.vehicles.lyy735, fake._tables.vehicles.find((v) => v.plate_number === 'ABC123')!.id];

  it('28 de pasageri → 400 (limita botului e 27); 11:28 trimis la exact +10 min nu e întârziere; modelul picat → EROARE, raportul cu uniform_ok/exterior_ok null', async () => {
    clock('11:38');
    const photo = await driverPhoto('11:28', IDS.drivers.ionMunteanu, DRIVER_MODEL_DOWN);
    expect(photo.status).toBe(200);
    expect(photo.body).toMatchObject({ verdict: 'EROARE', personVisible: null, frameOk: null, uniformOk: null, shavedOk: null, groomedOk: null, description: 'Verificarea automată a eșuat.' });
    expect(photo.body.driverCheckId).toMatch(UUID);
    expect(fake._tables.driver_appearance_checks.at(-1)).toMatchObject({ id: photo.body.driverCheckId, uniform_ok_model: null, groomed_ok_model: null, uniform_ok: null, groomed_ok: null });

    const tooMany = await report(okBody('11:28', photo.body.driverCheckId, { passengersCount: 28 }));
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.code).toBe('BAD_REQUEST');
    expect(tooMany.body.message).toContain('27');

    // aplicația (client vechi) trimite false/false — nu se inventează nimic peste EROARE
    const ok = await report(okBody('11:28', photo.body.driverCheckId, { passengersCount: PAX[0], driverId: DRIVERS[0], vehicleId: VEHICLES()[0], uniformOk: false, exteriorOk: false }));
    expect(ok.status).toBe(200);
    expect(ok.body.summary).toBe('☑ 11:28 — 0 pas. | Ion M.');
    expect(reportFor('11:28')).toMatchObject({ passengers_count: 0, location_ok: true, uniform_ok: null, exterior_ok: null });
    expect((await digestState())!.violations).toHaveLength(2);
  });

  it('11:55 … 16:05 cu poză de șofer la fiecare, 0–27 pasageri (27 inclus), fiecare rând și rezumat ca la bot', async () => {
    for (let i = 1; i < LOOP_TIMES.length; i++) {
      const time = LOOP_TIMES[i];
      clock(time);
      const { res } = await fullTrip(time, { passengersCount: PAX[i], driverId: DRIVERS[i % 4], vehicleId: VEHICLES()[i % 4] });
      expect(res.body.allDone).toBe(false);
    }
    expect(reportFor('11:55')).toMatchObject({ passengers_count: 27 });
    expect(reports()).toHaveLength(20); // 06:55 … 16:05
    expect(reports().map((r) => r.trip_id)).toEqual(CHISINAU_TIMES.slice(0, 20).map((t) => T(t)));
    expect(fake._tables.day_validations).toHaveLength(0);
  });

  it('/day după 16:05: 20 done, 16:25 next; toți șoferii și toate auto sunt folosite → listele goale', async () => {
    const { body } = await day();
    const states = body.trips.map((t: any) => t.state);
    expect(states.slice(0, 20).every((s: string) => s === 'done')).toBe(true);
    expect(states[20]).toBe('next');
    expect(body.trips[20].departure_time).toBe('16:25');
    expect(body.drivers).toEqual([]);
    expect(body.vehicles).toEqual([]);
    // toți cei 4 șoferi au poza zilei; a lui Ion e tot cea de la 06:42 — nu cea de la 11:28 (EROARE, fără verdict)
    expect(Object.keys(body.driverChecks).sort()).toEqual([...DRIVERS].sort());
    expect(body.driverChecks[IDS.drivers.ionMunteanu]).toEqual({ id: fake._tables.driver_appearance_checks[0].id, uniformOk: true, groomedOk: false, at: '06:42' });
    expect(body.driverChecks[IDS.drivers.vasileRusu]).toEqual({ id: reportFor('09:25').driver_check_id, uniformOk: true, groomedOk: true, at: '09:25' });
  });
});

describe('13. Poarta de zi (16:25)', () => {
  it('16:25 fără setul ZIUA → 409 CLEANING_REQUIRED { ZIUA, toate 3 zonele }', async () => {
    clock('16:25');
    const photo = await driverPhoto('16:25', IDS.drivers.ionMunteanu, DRIVER_OK);
    const res = await report(okBody('16:25', photo.body.driverCheckId));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'CLEANING_REQUIRED', slot: 'ZIUA', missing: ['PERON', 'PIETONI', 'VECEU'] });
    expect(reports()).toHaveLength(20);
  });

  it('setul ZIUA din 3 poze CURAT → 16:25 trece', async () => {
    for (const [i, zone] of (['PERON', 'PIETONI', 'VECEU'] as const).entries()) {
      clock(`16:2${6 + i}`);
      const res = await cleaningPhoto('ZIUA', zone, CLEAN_OK);
      expect(res.status).toBe(200);
      expect(res.body.verdict).toBe('CURAT');
    }
    expect(fake._tables.peron_cleaning_checks.filter((r) => r.slot === 'ZIUA').map((r) => r.storage_key)).toEqual(
      expect.arrayContaining([expect.stringMatching(new RegExp(`^curatenie/${DATE}/ZIUA/PERON-\\d+\\.jpg$`))]),
    );
    const { body } = await day();
    expect([...body.cleaning.ZIUA].sort()).toEqual(['PERON', 'PIETONI', 'VECEU']);

    clock('16:29');
    const { res } = await fullTrip('16:25', { passengersCount: 13, driverId: IDS.drivers.vasileRusu, vehicleId: IDS.vehicles.wvw526 });
    expect(res.body.summary).toBe('☑ 16:25 — 13 pas. | Vasile R.');
    expect(reports()).toHaveLength(21);
  });
});

describe('14. Sfârșit de zi', () => {
  it('16:45 … 19:25 → allDone false, ziua încă nevalidată', async () => {
    const times = ['16:45', '17:20', '17:50', '18:10', '18:30', '18:55', '19:25'];
    const drivers = [IDS.drivers.ionMunteanu, IDS.drivers.vasileRusu, IDS.drivers.petruCiobanu, IDS.drivers.sergiuLungu];
    for (const [i, time] of times.entries()) {
      clock(time);
      const { res } = await fullTrip(time, { passengersCount: 10 + i, driverId: drivers[i % 4], vehicleId: [IDS.vehicles.tcp998, IDS.vehicles.wvw526, IDS.vehicles.lyy735][i % 3] });
      expect(res.body.allDone).toBe(false);
    }
    expect(reports()).toHaveLength(28);
    expect(fake._tables.day_validations).toHaveLength(0);
  });

  it('20:00 (exceptată de locație, fără coordonate) → allDone true și rândul lui Vitalie în day_validations', async () => {
    clock('20:00');
    const { res } = await fullTrip('20:00', { passengersCount: 6, driverId: IDS.drivers.petruCiobanu, vehicleId: IDS.vehicles.lyy735, coords: null });
    expect(res.body).toEqual({ ok: true, summary: '☑ 20:00 — 6 pas. | Petru C.', allDone: true });
    expect(reportFor('20:00')).toMatchObject({ location_ok: null, location_lat: null, location_lon: null });

    expect(fake._tables.day_validations).toHaveLength(1);
    expect(fake._tables.day_validations[0]).toMatchObject({ user_id: IDS.users.vitalie, validation_date: DATE });
    expect(reports()).toHaveLength(29);
    // 28 rapoarte OK; 10:00 a refolosit poza lui Ion de la 06:42 (o poză pe zi per șofer) → 27 poze referite;
    // +1 poză pentru 16:25 rămasă fără raport (poarta ZIUA a refuzat cererea) — rândul ei există, dar nu e
    // referit de nimeni. NO_PERSON și REFA_POZA n-au lăsat rând.
    expect(fake._tables.driver_appearance_checks).toHaveLength(28);
    const referenced = new Set(reports().filter((r) => r.status === 'OK').map((r) => r.driver_check_id));
    expect(referenced.size).toBe(27);
    expect(fake._tables.driver_appearance_checks.filter((c) => !referenced.has(c.id))).toHaveLength(1);
  });

  it('/day → toate cele 29 done; încă un raport → 409 ALREADY_REPORTED', async () => {
    const { body } = await day();
    expect(body.trips.every((t: any) => t.state === 'done')).toBe(true);
    const res = await report(okBody('20:00', fake._tables.driver_appearance_checks.at(-1)!.id, { coords: null }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_REPORTED');
    expect(reports()).toHaveLength(29);
  });
});

describe('15. Prezența GPS pe toată tura', () => {
  /** Ping-uri la orele date; `inZone` decide coordonatele. */
  const pings = (times: string[], inZone: boolean) =>
    times.map((t) => ({ at: iso(t), lat: inZone ? IN_ZONE.lat : FAR_400M.lat, lon: IN_ZONE.lon, accuracyM: 10 }));
  /** 'HH:MM' de la `from` la `to` inclusiv, la `step` minute. */
  const every = (from: string, to: string, step: number, skip: string[] = []): string[] => {
    const [fh, fm] = from.split(':').map(Number);
    const [th, tm] = to.split(':').map(Number);
    const out: string[] = [];
    for (let m = fh * 60 + fm; m <= th * 60 + tm; m += step) {
      const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      if (!skip.includes(hhmm)) out.push(hhmm);
    }
    return out;
  };
  const presence = (list: ReturnType<typeof pings>) => srv.api('POST', 'presence', { pings: list }, token);

  it('lotul 1: în zonă 06:25–12:38 la 2 min; ping-ul de la 06:10 (înainte de fereastră) e ignorat', async () => {
    clock('12:39');
    const list = [...pings(['06:10'], true), ...pings([...every('06:25', '12:37', 2), '12:38'], true)];
    expect(list).toHaveLength(189);
    const res = await presence(list);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, accepted: 188 });
    expect(fake._tables.peron_presence_pings).toHaveLength(188);
    expect(fake._tables.peron_presence_pings.every((p) => p.in_zone === true && p.user_id === IDS.users.vitalie && p.point === 'CHISINAU')).toBe(true);
  });

  it('lotul 2: în afara razei 12:40–13:05, în zonă până la 17:10 (cu o pauză de 8 min); duplicatul 12:38 nu se acceptă', async () => {
    clock('17:11');
    const outside = every('12:40', '13:05', 5); // 6 ping-uri la 5 min — sub pragul de 10 min «fără semnal»
    const inside = [...every('13:07', '17:09', 2, ['15:01', '15:03', '15:05']), '17:10'];
    const list = [...pings(outside, false), ...pings(inside, true), ...pings(['12:38'], true)];
    const res = await presence(list);
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(outside.length + inside.length);
    expect(fake._tables.peron_presence_pings.filter((p) => p.in_zone === false).map((p) => p.at)).toEqual(outside.map(iso));
  });

  it('lotul 3: 17:20–20:30 în zonă; 20:45 (după fereastră) ignorat', async () => {
    clock('20:31');
    const inside = every('17:20', '20:30', 2);
    const res = await presence([...pings(inside, true), ...pings(['20:45'], true)]);
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(inside.length);
    expect(fake._tables.peron_presence_pings).toHaveLength(188 + 6 + 119 + 1 + inside.length);
    expect(fake._tables.peron_presence_pings.some((p) => p.at === iso('20:45') || p.at === iso('06:10'))).toBe(false);
  });

  it('până la digest nimic n-a plecat către admini în afara loading board-ului; executorul a primit doar cele 2 mesaje de reclamă', () => {
    expect(alerts).toEqual([]);
    expect(telegram.every((t) => t.chatId === TELEGRAM.admin && (t.method === 'sendMessage' || t.method === 'editMessageText'))).toBe(true);
    expect(telegram.filter((t) => t.method === 'sendMessage')).toHaveLength(1);
    expect(telegram.filter((t) => t.method === 'editMessageText')).toHaveLength(28);
    expect(telegram.at(-1)!.text).toContain('20:00');
    expect(executorMessages).toHaveLength(2);
  });

  it('digestul de la 20:30: 2 încălcări (locație 1, întârziere 1), curățenia pe ambele ture, prezența cu lipsă 25 min și fără semnal 10 min', async () => {
    clock('20:30');
    expect(await sendCompactDigest()).toBe(true);
    expect(alerts).toHaveLength(1);
    const msg = alerts[0];
    expect(msg).toContain('📋 Raport 10.06 — 2 încălcări din 29 rapoarte');
    expect(msg).toContain('\nChișinău: 2 (locație: 1, întârziere: 1)');
    expect(msg).not.toContain('Bălți:');

    expect(msg).toContain('\n\n🧹 Curățenie Chișinău\n');
    expect(msg).toContain('dimineață: ✅ peron · 🔴 pietoni (praf pe pavaj; mucuri la stâlp) · ❔ veceu neverificat');
    expect(msg).toContain('15:00: ✅ peron · ✅ pietoni · ✅ veceu');

    expect(msg).toContain('\n\n📍 Prezență în zona de lucru\n');
    expect(msg).toContain('@vitalie_peron (Chișinău): lipsă 12:40–13:05 (25 min) · fără semnal 17:10–17:20 (10 min)');
    // pauza de 8 min (14:59 → 15:07) e sub pragul de 10 min și nu se raportează
    expect(msg).not.toContain('14:59');
    expect(msg).not.toContain('Andrei');
    expect(msg).not.toContain('Bălți');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Spec docs/specs/peron-app-skip-and-dayoff.md — «N-am fost la cursă». Zi NOUĂ
// (joi 11.06), fake reinstalat: Vitalie (în rolul lui Aurel) vine la 07:30, sare
// 06:55 și 07:35, face pozele de dimineață la 08:15; după-amiază sare tot până la
// 16:25 inclusiv, iar poarta de zi cade pe 16:45.

describe('16. «N-am fost la cursă» (Aurel vine la 07:30)', () => {
  const DATE2 = '2026-06-11'; // joi
  const clock2 = (hhmm: string) => vi.setSystemTime(at(hhmm, DATE2));
  const skip = (time: string) => srv.api('POST', 'skip', { tripId: T(time) }, token);
  const skips = () => fake._tables.operator_trip_skips;
  const stateOf = (body: any, time: string) => body.trips.find((t: any) => t.id === T(time)).state;
  /** Poza șoferului + raport OK → 200 (etalonul botului din `fullTrip` e legat de DATE, aici e altă zi). */
  async function okTrip(time: string, o: OkOverrides = {}) {
    const photo = await driverPhoto(time, o.driverId === undefined ? IDS.drivers.ionMunteanu : o.driverId, DRIVER_OK);
    expect(photo.status, `driver-photo ${time}`).toBe(200);
    const res = await report(okBody(time, photo.body.driverCheckId, o));
    expect(res.status, `report ${time}: ${JSON.stringify(res.body)}`).toBe(200);
    expect(reportFor(time)).toMatchObject({ report_date: DATE2, trip_id: T(time), status: 'OK', source: 'app', driver_check_id: photo.body.driverCheckId });
    return res;
  }

  it('zi nouă: Vitalie se conectează la 07:30; /day: 06:55 next, dayOff false, fereastra de prezență există', async () => {
    fake = installMocks(seedDay(DATE2));
    clock2('07:30');
    fake._tables.peron_app_link_codes.push(linkCodeRow('770011', IDS.users.vitalie));
    const link = await srv.api('POST', 'auth/link', { code: '770011' });
    expect(link.status).toBe(200);
    token = link.body.token;

    const { status, body } = await day();
    expect(status).toBe(200);
    expect(body.dayOff).toBe(false);
    expect(body.dayOffText).toBeNull();
    expect(body.presenceWindow).toEqual({ from: '06:25', to: '20:30' });
    expect(stateOf(body, '06:55')).toBe('next');
  });

  it('sărirea lui 07:35 când urmează 06:55 → 409 NOT_NEXT; fără tripId → 400; cursă străină → 400 UNKNOWN_TRIP', async () => {
    let res = await skip('07:35');
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'NOT_NEXT' });
    expect(res.body.message).toContain('06:55');
    res = await srv.api('POST', 'skip', {}, token);
    expect(res.status).toBe(400);
    res = await srv.api('POST', 'skip', { tripId: tripId('BALTI', '05:20') }, token);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNKNOWN_TRIP');
    expect(skips()).toHaveLength(0);
  });

  it('06:55 sărită → 200 { next: 07:35 }; încă o dată → 409 ALREADY_SKIPPED; 07:35 sărită → next 08:15', async () => {
    let res = await skip('06:55');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, next: T('07:35') });
    res = await skip('06:55');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_SKIPPED');
    res = await skip('07:35');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, next: T('08:15') });

    expect(skips()).toHaveLength(2);
    expect(skips()[0]).toMatchObject({ skip_date: DATE2, point: 'CHISINAU', trip_id: T('06:55'), user_id: IDS.users.vitalie });
    expect(skips()[1]).toMatchObject({ skip_date: DATE2, point: 'CHISINAU', trip_id: T('07:35'), user_id: IDS.users.vitalie });
    expect(reports()).toHaveLength(0); // nimic în reports — cursa sărită nu e «absent»
  });

  it('/day: 06:55 și 07:35 `skipped`, 08:15 `next`, restul locked', async () => {
    const { body } = await day();
    expect(body.trips.map((t: any) => t.state).slice(0, 4)).toEqual(['skipped', 'skipped', 'next', 'locked']);
    expect(body.trips.filter((t: any) => t.state === 'next')).toHaveLength(1);
  });

  it('raport pe o cursă sărită → 409 ALREADY_SKIPPED; pe 08:50 → 409 NOT_NEXT (urmează 08:15)', async () => {
    let res = await report({ tripId: T('06:55'), status: 'ABSENT' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_SKIPPED');
    res = await report({ tripId: T('08:50'), status: 'ABSENT' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'NOT_NEXT' });
    expect(res.body.message).toContain('08:15');
  });

  it('08:15 — prima cursă raportată efectiv — cere setul DIMINEATA (409 CLEANING_REQUIRED), deși nu e prima din orar', async () => {
    clock2('08:10');
    const photo = await driverPhoto('08:15', IDS.drivers.petruCiobanu, DRIVER_OK);
    expect(photo.status).toBe(200);
    const res = await report(okBody('08:15', photo.body.driverCheckId, { driverId: IDS.drivers.petruCiobanu, vehicleId: IDS.vehicles.lyy735 }));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'CLEANING_REQUIRED', slot: 'DIMINEATA', missing: ['PERON', 'PIETONI', 'VECEU'] });
    expect(res.body.message).toContain('08:15');
    expect(reports()).toHaveLength(0);
  });

  it('setul DIMINEATA din 3 poze → 08:15 trece (200), rândul e ca la bot; sărirea unei curse raportate → 409 ALREADY_REPORTED', async () => {
    for (const zone of ['PERON', 'PIETONI', 'VECEU'] as const) {
      expect((await cleaningPhoto('DIMINEATA', zone, CLEAN_OK)).status).toBe(200);
    }
    clock2('08:15');
    const ok = await okTrip('08:15', { driverId: IDS.drivers.petruCiobanu, vehicleId: IDS.vehicles.lyy735 });
    expect(ok.body.summary).toBe('☑ 08:15 — 12 pas. | Petru C.');
    expect(reports()).toHaveLength(1);

    const res = await skip('08:15');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_REPORTED');
    expect(skips()).toHaveLength(2);

    const { body } = await day();
    expect(body.trips.map((t: any) => t.state).slice(0, 5)).toEqual(['skipped', 'skipped', 'done', 'next', 'locked']);
  });

  it('după-amiază: operatorul sare tot de la 08:50 până la 16:25 inclusiv — fiecare sărire mută `next` cu una', async () => {
    clock2('16:30');
    const times = CHISINAU_TIMES.slice(CHISINAU_TIMES.indexOf('08:50'), CHISINAU_TIMES.indexOf('16:25') + 1);
    for (let i = 0; i < times.length; i++) {
      const res = await skip(times[i]);
      expect(res.status, `skip ${times[i]}: ${JSON.stringify(res.body)}`).toBe(200);
      expect(res.body.next).toBe(T(i + 1 < times.length ? times[i + 1] : '16:45'));
    }
    expect(skips()).toHaveLength(2 + times.length);
    const { body } = await day();
    expect(stateOf(body, '16:25')).toBe('skipped');
    expect(stateOf(body, '16:45')).toBe('next');
  });

  it('16:25 sărită → poarta de zi cade pe 16:45: fără setul ZIUA → 409 CLEANING_REQUIRED { ZIUA }', async () => {
    clock2('16:45');
    const photo = await driverPhoto('16:45', IDS.drivers.ionMunteanu, DRIVER_OK);
    expect(photo.status).toBe(200);
    const res = await report(okBody('16:45', photo.body.driverCheckId));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'CLEANING_REQUIRED', slot: 'ZIUA', missing: ['PERON', 'PIETONI', 'VECEU'] });
    expect(res.body.message).toContain('16:45');
  });

  it('setul ZIUA → 16:45 trece; 17:20 nu mai are nicio poartă', async () => {
    for (const zone of ['PERON', 'PIETONI', 'VECEU'] as const) {
      expect((await cleaningPhoto('ZIUA', zone, CLEAN_OK)).status).toBe(200);
    }
    await okTrip('16:45');
    clock2('17:20');
    await okTrip('17:20', { driverId: IDS.drivers.vasileRusu, vehicleId: IDS.vehicles.wvw526 });
    expect(reports()).toHaveLength(3);
  });

  it('digestul: rândul «Chișinău: operatorul n-a fost la 06:55, 07:35, … 16:25 (Vitalie)», curățenia completă, 3 rapoarte', async () => {
    clock2('20:30');
    expect(await sendCompactDigest()).toBe(true);
    const msg = alerts.at(-1)!;
    expect(msg).toContain('📋 Raport 11.06 — 0 încălcări din 3 rapoarte');
    expect(msg).toContain('\n\n⏭ Curse sărite\nChișinău: operatorul n-a fost la 06:55, 07:35, 08:50, 09:25, ');
    expect(msg).toContain(', 16:05, 16:25 (Vitalie)\n');
    expect(msg).not.toContain('Bălți');
    expect(msg).toContain('dimineață: ✅ peron · ✅ pietoni · ✅ veceu');
    expect(msg).toContain('15:00: ✅ peron · ✅ pietoni · ✅ veceu');
  });
});
