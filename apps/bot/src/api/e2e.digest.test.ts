/**
 * Raportul de seară (services/dailyDigest.ts → sendCompactDigest) după o zi jucată
 * prin /app/v1/* la AMBELE puncte: încălcările per punct (formatul existent al
 * botului), secțiunea «🧹 Curățenie Chișinău» cu ambele ture (toate cele patru
 * randări: ✅ / 🔴 cu probleme / ❔ neverificat / ⬜ lipsă) și secțiunea de prezență cu
 * ambii operatori — Andrei «toată tura în zonă», Vitalie cu perioade și «urmărire
 * pornită abia la 06:50». Spec: docs/specs/peron-app-e2e.md, S03 pasul 2.
 *
 * Mesajul se verifică LITERAL, cap-coadă — e textul pe care îl citesc adminii.
 * Aici se scriu și fixture-urile de contract ale Chișinăului (day.chisinau.json,
 * report.ok.json), pentru că /day de aici e cel mai bogat: repartizări, reclamă,
 * climă și curățenie, toate nenule.
 */
import { alerts, installMocks, nextModelAnswer, telegram, type ModelAnswer } from '../test/mocks.js'; // PRIMUL import: setează env-ul
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FakeSupabase, Row } from '../test/fakeSupabase.js';
import { IDS, PLATES, linkCodeRow, seedDay, tripId } from '../test/fixtures.js';
import { startApi, type TestApi } from '../test/server.js';
import { syncContractFixture, withoutOk } from '../test/contractFixtures.js';
import { config } from '../config.js';
import { sendCompactDigest } from '../services/dailyDigest.js';

vi.mock('../supabase.js', () => import('../test/mocks.js').then((m) => m.supabaseModuleFactory()));
vi.mock('@anthropic-ai/sdk', () => import('../test/mocks.js').then((m) => m.anthropicModuleFactory()));
vi.mock('../services/adminAlert.js', () => import('../test/mocks.js').then((m) => m.adminAlertModuleFactory()));

// ── Ziua, locurile, poza ─────────────────────────────────────────────────────

const DATE = '2026-06-10'; // miercuri, sezon A/C
const CH = config.stations.CHISINAU;
const BA = config.stations.BALTI;
const CH_ZONE = { lat: CH.lat, lon: CH.lon, accuracyM: 8 };
const BA_ZONE = { lat: BA.lat, lon: BA.lon, accuracyM: 9 };
/** ~0.0036° latitudine ≈ 400 m — în afara razei de 150 m. */
const CH_FAR = { lat: CH.lat + 0.0036, lon: CH.lon };
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]).toString('base64');

const TC = (hhmm: string) => tripId('CHISINAU', hhmm);
const TB = (hhmm: string) => tripId('BALTI', hhmm);

function at(hhmm: string): Date {
  return new Date(`${DATE}T${hhmm}:00+03:00`);
}
function iso(hhmm: string): string {
  return at(hhmm).toISOString();
}
function clock(hhmm: string): void {
  vi.setSystemTime(at(hhmm));
}
/** 'HH:MM' de la `from` la `to` inclusiv, la `step` minute. */
function every(from: string, to: string, step: number): string[] {
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const out: string[] = [];
  for (let m = fh * 60 + fm; m <= th * 60 + tm; m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

const CLEAN_OK: ModelAnswer = { json: { loc_corect: true, verdict: 'CURAT', probleme: [], descriere: 'Curat.' } };
const CLEAN_DIRTY_ONE: ModelAnswer = { json: { loc_corect: true, verdict: 'MURDAR', probleme: ['praf pe pavaj'], descriere: 'Nemăturat.' } };
const CLEAN_WRONG_PLACE: ModelAnswer = { json: { loc_corect: false, verdict: 'CURAT', probleme: [], descriere: 'Alt loc.' } };
const CLEAN_THROWS: ModelAnswer = { throws: new Error('model indisponibil') };
const DRIVER_OK: ModelAnswer = { json: { persoana_vizibila: true, uniforma: true, aspect_ingrijit: true, descriere: 'OK.' } };

// ── Starea scenariului ───────────────────────────────────────────────────────

let fake: FakeSupabase;
let srv: TestApi;
let tokenV = ''; // Vitalie, Chișinău
let tokenA = ''; // Andrei, Bălți
const realFetch = globalThis.fetch;

async function link(code: string, userId: string): Promise<string> {
  fake._tables.peron_app_link_codes.push(linkCodeRow(code, userId));
  const res = await srv.api('POST', 'auth/link', { code });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

async function cleaningPhoto(slot: 'DIMINEATA' | 'ZIUA', zone: 'PERON' | 'PIETONI' | 'VECEU', answer: ModelAnswer) {
  nextModelAnswer(answer);
  const res = await srv.api('POST', 'cleaning-photo', { slot, zone, imageBase64: JPEG_B64, lat: CH.lat, lon: CH.lon }, tokenV);
  expect(res.status, `cleaning-photo ${slot}/${zone}`).toBe(200);
  return res.body;
}

/** Poza șoferului + raportul OK din Chișinău, la ora curentă a ceasului. */
async function chisinauTrip(time: string, passengers: number, driverId: string, vehicleId: string, coords: { lat: number; lon: number; accuracyM?: number } | null) {
  nextModelAnswer(DRIVER_OK);
  const photo = await srv.api('POST', 'driver-photo', { tripId: TC(time), driverId, imageBase64: JPEG_B64, lat: CH.lat, lon: CH.lon }, tokenV);
  expect(photo.status, `driver-photo ${time}`).toBe(200);
  const res = await srv.api('POST', 'report', {
    tripId: TC(time), status: 'OK', passengersCount: passengers, driverId, vehicleId, assignmentChanged: false,
    loadingHelpOk: true, autoCurat: true, driverCheckId: photo.body.driverCheckId, uniformOk: true, exteriorOk: true,
    reclamaOk: true, reclamaProblem: null, reclamaRepairConfirmed: false, reclamaTaskId: null, acStatus: null, heatStatus: null,
    lat: coords?.lat ?? null, lon: coords?.lon ?? null, accuracyM: coords ? coords.accuracyM ?? null : null,
  }, tokenV);
  expect(res.status, `report ${time}: ${JSON.stringify(res.body)}`).toBe(200);
  return res;
}

/** Ping-uri în loturi de maximum 200 (limita API-ului), toate la coordonatele date. */
async function presence(token: string, times: string[], coords: { lat: number; lon: number }): Promise<number> {
  let accepted = 0;
  for (let i = 0; i < times.length; i += 200) {
    const pings = times.slice(i, i + 200).map((t) => ({ at: iso(t), lat: coords.lat, lon: coords.lon, accuracyM: 10 }));
    const res = await srv.api('POST', 'presence', { pings }, token);
    expect(res.status).toBe(200);
    accepted += res.body.accepted as number;
  }
  return accepted;
}

async function digestViolations(): Promise<Row[]> {
  const buf = fake._storage['report-photos']?.[`digest/${DATE}.json`];
  return buf ? JSON.parse(buf.toString('utf8')).violations : [];
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  clock('04:30');
  fake = installMocks(seedDay(DATE));
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

describe('1. Zi fără nimic', () => {
  // Spec-ul S03 presupune «fără digest → false când nu e nimic», dar botul trimite
  // digestul intenționat și fără încălcări, ca adminii să vadă pozele de curățenie
  // LIPSĂ (commit 751c154: «se trimite acum și fără încălcări, ca să arate pozele
  // lipsă»). Etalonul e botul → testul verifică comportamentul real.
  it('sendCompactDigest() pe o zi goală → true: «0 încălcări din 0 rapoarte» + curățenia toată lipsă, fără prezență', async () => {
    clock('20:30');
    expect(await sendCompactDigest()).toBe(true);
    expect(alerts).toEqual([
      [
        '📋 Raport 10.06 — 0 încălcări din 0 rapoarte',
        '',
        '🧹 Curățenie Chișinău',
        'dimineață: ⬜ peron lipsă · ⬜ pietoni lipsă · ⬜ veceu lipsă',
        '15:00: ⬜ peron lipsă · ⬜ pietoni lipsă · ⬜ veceu lipsă',
      ].join('\n'),
    ]);
    expect(telegram).toEqual([]);
  });

  it('→ false doar când nu e nimic de spus: fără încălcări, fără prezență și secțiunea de curățenie picată (tabelul inaccesibil)', async () => {
    fake = installMocks(seedDay(DATE));
    delete fake._tables.peron_cleaning_checks; // query-ul aruncă → buildCleaningLines întoarce []
    expect(await sendCompactDigest()).toBe(false);
    expect(alerts).toEqual([]);
  });
});

describe('2. Ziua cu ambele puncte', () => {
  it('cei doi operatori se conectează', async () => {
    fake = installMocks(seedDay(DATE)); // zi nouă, capturi goale
    clock('04:40');
    tokenA = await link('573201', IDS.users.andrei);
    tokenV = await link('482913', IDS.users.vitalie);
  });

  it('Bălți: 05:20 fără coordonate (locație), 05:30 FULL la timp, 06:30 trimis la 06:45 (întârziere 15 min)', async () => {
    clock('05:20');
    let res = await srv.api('POST', 'report', { tripId: TB('05:20'), status: 'OK', passengersCount: 8 }, tokenA);
    expect(res.status).toBe(200);
    clock('05:30');
    res = await srv.api('POST', 'report', { tripId: TB('05:30'), status: 'FULL', ...BA_ZONE }, tokenA);
    expect(res.status).toBe(200);
    clock('06:45');
    res = await srv.api('POST', 'report', { tripId: TB('06:30'), status: 'OK', passengersCount: 14, ...BA_ZONE }, tokenA);
    expect(res.status).toBe(200);

    const v = await digestViolations();
    expect(v).toHaveLength(2);
    expect(v[0]).toMatchObject({ time: '05:20', point: 'Bălți', operator: '@andrei_balti', locationBad: true, distanceM: null, late: false });
    expect(v[1]).toMatchObject({ time: '06:30', point: 'Bălți', operator: '@andrei_balti', locationBad: false, late: true, minutesLate: 15 });
  });

  it('Chișinău dimineața: PERON CURAT, PIETONI MURDAR (o problemă), VECEU cu modelul picat → EROARE', async () => {
    clock('06:30');
    expect((await cleaningPhoto('DIMINEATA', 'PERON', CLEAN_OK)).verdict).toBe('CURAT');
    clock('06:31');
    expect((await cleaningPhoto('DIMINEATA', 'PIETONI', CLEAN_DIRTY_ONE)).verdict).toBe('MURDAR');
    clock('06:32');
    const veceu = await cleaningPhoto('DIMINEATA', 'VECEU', CLEAN_THROWS);
    expect(veceu.verdict).toBe('EROARE');
    expect([...veceu.zonesDone].sort()).toEqual(['PERON', 'PIETONI', 'VECEU']);
  });

  it('contract: /day al lui Vitalie (repartizări, reclamă, climă, curățenie — toate nenule) e day.chisinau.json', async () => {
    clock('06:40');
    const { status, body } = await srv.api('GET', 'day', undefined, tokenV);
    expect(status).toBe(200);
    expect(Object.keys(body.assignments)).toHaveLength(3);
    expect(body.openReclama[PLATES.lyy735].taskId).toBe(IDS.reclamaTask);
    expect(Object.values(body.climate)).toEqual(['ac', 'ac', 'ac']);
    expect([...body.cleaning.DIMINEATA].sort()).toEqual(['PERON', 'PIETONI', 'VECEU']);
    const outcome = syncContractFixture('day.chisinau', withoutOk(body));
    expect(outcome, 'day.chisinau.json lipsește — rulează o dată cu WRITE_FIXTURES=1').not.toBe('missing');
  });

  it('Chișinău: 06:55 la timp (exceptată), 07:35 trimis la 07:50 → întârziere; răspunsul e report.ok.json', async () => {
    clock('06:55');
    const first = await chisinauTrip('06:55', 12, IDS.drivers.ionMunteanu, IDS.vehicles.tcp998, null);
    expect(first.body).toEqual({ ok: true, summary: '☑ 06:55 — 12 pas. | Ion M.', allDone: false });

    clock('07:50');
    const second = await chisinauTrip('07:35', 9, IDS.drivers.vasileRusu, IDS.vehicles.wvw526, CH_ZONE);
    expect(second.body).toEqual({ ok: true, summary: '☑ 07:35 — 9 pas. | Vasile R.', allDone: false });
    const outcome = syncContractFixture('report.ok', withoutOk(second.body));
    expect(outcome, 'report.ok.json lipsește — rulează o dată cu WRITE_FIXTURES=1').not.toBe('missing');

    const v = await digestViolations();
    expect(v).toHaveLength(3);
    expect(v[2]).toMatchObject({ time: '07:35', point: 'Chișinău', operator: '@vitalie_peron', locationBad: false, late: true, minutesLate: 15 });
  });

  it('Chișinău la 15:00: PERON CURAT, PIETONI în alt loc (rămâne lipsă), VECEU fără poză', async () => {
    clock('15:00');
    expect((await cleaningPhoto('ZIUA', 'PERON', CLEAN_OK)).verdict).toBe('CURAT');
    clock('15:01');
    const pietoni = await cleaningPhoto('ZIUA', 'PIETONI', CLEAN_WRONG_PLACE);
    expect(pietoni.verdict).toBe('ALT_LOC');
    expect(pietoni.zonesDone).toEqual(['PERON']);
    expect(fake._tables.peron_cleaning_checks).toHaveLength(5);
  });

  it('prezență: Andrei 04:50–20:30 tot timpul la stația Bălți; Vitalie pornește abia la 06:50 și lipsește 09:00–09:12', async () => {
    clock('20:29');
    const andrei = every('04:50', '20:30', 2);
    expect(await presence(tokenA, andrei, BA)).toBe(andrei.length);

    const vitalie = every('06:50', '20:30', 2);
    const away = new Set(every('09:00', '09:12', 2)); // 7 ping-uri la ~400 m → lipsă 12 min
    expect(await presence(tokenV, vitalie.filter((t) => !away.has(t)), CH)).toBe(vitalie.length - away.size);
    expect(await presence(tokenV, [...away], CH_FAR)).toBe(away.size);

    const pings = fake._tables.peron_presence_pings;
    expect(pings.filter((p) => p.user_id === IDS.users.andrei).every((p) => p.in_zone === true)).toBe(true);
    expect(pings.filter((p) => p.user_id === IDS.users.vitalie && p.in_zone === false)).toHaveLength(7);
  });

  it('nimic către admini în timpul zilei, în afara celor două loading board-uri', () => {
    expect(alerts).toEqual([]);
    const boards = telegram.filter((t) => t.method === 'sendMessage');
    expect(boards).toHaveLength(2);
    expect(boards.map((b) => b.text!.split('\n')[0].split(' — ')[0]).sort()).toEqual(['🚌 Bălți → Chișinău', '🚌 Chișinău']);
  });

  it('digestul de la 20:30: un singur mesaj, textul exact', async () => {
    clock('20:30');
    expect(await sendCompactDigest()).toBe(true);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toBe(
      [
        '📋 Raport 10.06 — 3 încălcări din 5 rapoarte',
        'Bălți: 2 (locație: 1, întârziere: 1)',
        'Chișinău: 1 (întârziere: 1)',
        '',
        '🧹 Curățenie Chișinău',
        'dimineață: ✅ peron · 🔴 pietoni (praf pe pavaj) · ❔ veceu neverificat',
        '15:00: ✅ peron · ⬜ pietoni lipsă · ⬜ veceu lipsă',
        '',
        '📍 Prezență în zona de lucru',
        '@vitalie_peron (Chișinău): fără semnal 06:25–06:50 (25 min) · lipsă 09:00–09:12 (12 min) · urmărire pornită abia la 06:50',
        '@andrei_balti (Bălți): toată tura în zonă',
      ].join('\n'),
    );
    // digestul nu trimite nimic pe API-ul botului (loading board), doar prin sendAdminAlert
    expect(telegram.filter((t) => t.method === 'sendMessage')).toHaveLength(2);
  });
});
