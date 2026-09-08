/**
 * Fixture-urile zilei, rulate prin serviciile REALE ale botului peste fake-ul
 * montat cu mocks.ts — dovada că S02/S03 pot chema orice din services/* fără rețea.
 */
import { alerts, installMocks, modelCalls, nextModelAnswer, telegram } from './mocks.js'; // primul import: setează env-ul
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeSupabase } from './fakeSupabase.js';
import { BALTI_TIMES, CHISINAU_TIMES, IDS, PLATES, TELEGRAM, crmRouteId, linkCodeRow, seedDay, tripId } from './fixtures.js';
import {
  autoCloseReclamaTask,
  climateQuestionNeeded,
  createReclamaTask,
  createReport,
  getActiveDrivers,
  getActiveVehicles,
  getAllTripsForDirection,
  getAssignmentForTrip,
  getOpenReclamaTask,
  getOpenReclamaTasks,
  getReportedTripIds,
  getUserByTelegramId,
  getZadachnikAssignee,
  isDayValidated,
  validateDay,
} from '../services/db.js';
import { analyzeCleaningPhoto } from '../services/cleaningCheck.js';
import { analyzeDriverPhoto } from '../services/driverCheck.js';
import { getAdminChatIds, getBotApi, sendAdminAlert } from '../services/adminAlert.js';
import { linkWithCode } from '../api/auth.js';
import { config } from '../config.js';

vi.mock('../supabase.js', () => import('./mocks.js').then((m) => m.supabaseModuleFactory()));
vi.mock('@anthropic-ai/sdk', () => import('./mocks.js').then((m) => m.anthropicModuleFactory()));
vi.mock('../services/adminAlert.js', () => import('./mocks.js').then((m) => m.adminAlertModuleFactory()));

const DATE = '2026-06-10';
let fake: FakeSupabase;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-10T06:20:00+03:00'));
  fake = installMocks(seedDay(DATE));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('mediul de test', () => {
  it('config-ul vede cheia falsă de model și niciun token Telegram', () => {
    expect(config.anthropicApiKey).toBe('test-anthropic-key');
    expect(config.botToken).toBe('');
    expect(process.env.TELEGRAM_BOT_TOKEN).toBe('');
  });
});

describe('cursele zilei', () => {
  it('Chișinău → Bălți: 29 de curse în ordinea plecării, cu route_name și crm_route_id', async () => {
    const trips = await getAllTripsForDirection('CHISINAU_BALTI');
    expect(trips.map((t) => t.departure_time.slice(0, 5))).toEqual([...CHISINAU_TIMES]);
    expect(trips.every((t) => t.route_name === 'Chișinău – Bălți')).toBe(true);
    expect(trips[0]).toMatchObject({ id: tripId('CHISINAU', '06:55'), crm_route_id: crmRouteId('06:55') });
    expect((trips[0] as any).routes).toBeUndefined();
  });

  it('Bălți → Chișinău: 29 de curse, fără crm_route_id', async () => {
    const trips = await getAllTripsForDirection('BALTI_CHISINAU');
    expect(trips.map((t) => t.departure_time.slice(0, 5))).toEqual([...BALTI_TIMES]);
    expect(trips.every((t) => t.crm_route_id === null)).toBe(true);
  });
});

describe('operatori, șoferi, auto', () => {
  it('Vitalie și Andrei se găsesc după telegram_id; un id necunoscut dă null', async () => {
    expect(await getUserByTelegramId(TELEGRAM.vitalie)).toMatchObject({ id: IDS.users.vitalie, role: 'CONTROLLER', point: 'CHISINAU' });
    expect(await getUserByTelegramId(TELEGRAM.andrei)).toMatchObject({ point: 'BALTI' });
    expect(await getUserByTelegramId(1)).toBeNull();
  });

  it('getActiveDrivers întoarce exact cei 4 interurbani activi — fără inactiv, fără LDE', async () => {
    const drivers = await getActiveDrivers();
    expect(drivers.map((d) => d.full_name)).toEqual(['Ion Munteanu', 'Petru Ciobanu', 'Sergiu Lungu', 'Vasile Rusu']);
  });

  it('getActiveVehicles întoarce cele 3 auto, ordonate după placă', async () => {
    const vehicles = await getActiveVehicles();
    expect(vehicles.map((v) => v.plate_number)).toEqual([PLATES.wvw526, PLATES.tcp998, PLATES.lyy735]);
  });

  it('executorul sarcinilor reclamă e utilizatorul DIGITAL', async () => {
    expect(await getZadachnikAssignee()).toEqual({ id: IDS.users.digital, name: 'Iurie', telegram_id: TELEGRAM.digital });
  });
});

describe('repartizări', () => {
  it('primele 3 curse din Chișinău au repartizare; a 4-a nu; Bălți (crm_route_id null) nu', async () => {
    expect(await getAssignmentForTrip(crmRouteId('06:55'), DATE)).toEqual({
      driver_id: IDS.drivers.ionMunteanu, driver_name: 'Ion Munteanu', vehicle_id: IDS.vehicles.tcp998, plate_number: PLATES.tcp998,
    });
    expect(await getAssignmentForTrip(crmRouteId('08:15'), DATE)).toMatchObject({ plate_number: PLATES.lyy735 });
    expect(await getAssignmentForTrip(crmRouteId('08:50'), DATE)).toBeNull();
    expect(await getAssignmentForTrip(null, DATE)).toBeNull();
    expect(await getAssignmentForTrip(crmRouteId('06:55'), '2026-06-11')).toBeNull();
  });
});

describe('sarcina reclamă din seed', () => {
  it("getOpenReclamaTask('LYY 735') o întoarce; celelalte auto nu au", async () => {
    expect(await getOpenReclamaTask(PLATES.lyy735)).toEqual({
      id: IDS.reclamaTask, description: 'LYY 735 — panou cu ruta, de reparat', lastReport: null,
    });
    expect(await getOpenReclamaTask(PLATES.tcp998)).toBeNull();
    expect(await getOpenReclamaTasks()).toEqual([{ id: IDS.reclamaTask, plate: PLATES.lyy735, description: 'LYY 735 — panou cu ruta, de reparat', lastReport: null }]);
  });

  it('createReclamaTask: pe LYY 735 doar «bus» e nou (panoul e acoperit); a doua oară nimic', async () => {
    expect(await createReclamaTask({ creatorId: IDS.users.vitalie, vehiclePlate: PLATES.lyy735, reclamaProblem: 'ambele' })).toBe(true);
    const created = fake._tables.obligations.filter((o) => o.id !== IDS.reclamaTask);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ source: 'reclama', vehicle_plate: PLATES.lyy735, reclama_problem: 'bus', current_state: 'sent', assignee_id: IDS.users.digital });
    expect(fake._tables.obligation_events.map((e) => e.event_type)).toEqual(['created', 'sent']);
    expect(await createReclamaTask({ creatorId: IDS.users.vitalie, vehiclePlate: PLATES.lyy735, reclamaProblem: 'ambele' })).toBe(false);
    expect(alerts).toEqual([]); // executor există → nicio alertă
  });

  it('autoCloseReclamaTask fără raport al executorului → cancelled, cu eveniment', async () => {
    expect(await autoCloseReclamaTask(PLATES.lyy735, DATE, IDS.reclamaTask)).toBe(true);
    expect(fake._tables.obligations[0].current_state).toBe('cancelled');
    expect(fake._tables.obligation_events.at(-1)).toMatchObject({ obligation_id: IDS.reclamaTask, event_type: 'cancelled' });
    expect(await getOpenReclamaTask(PLATES.lyy735)).toBeNull();
  });
});

describe('rapoarte și validarea zilei', () => {
  const base = {
    report_date: DATE,
    point: 'CHISINAU' as const,
    trip_id: tripId('CHISINAU', '06:55'),
    driver_id: IDS.drivers.ionMunteanu,
    status: 'OK' as const,
    passengers_count: 12,
    exterior_ok: true,
    uniform_ok: true,
    loading_help_ok: true,
    auto_curat: true,
    reclama_ok: true,
    reclama_deadline: null,
    vehicle_id: IDS.vehicles.tcp998,
    created_by_user: IDS.users.vitalie,
    location_ok: null,
  };

  it('createReport scrie rândul cu source implicit «bot», iar cu source «app» îl păstrează; duplicatul activ dă 23505', async () => {
    const r = await createReport(base);
    expect(r).toMatchObject({ ...base, source: 'bot', driver_check_id: null, ac_status: null });
    expect(await getReportedTripIds(DATE, 'CHISINAU')).toEqual(new Set([base.trip_id]));

    const app = await createReport({ ...base, trip_id: tripId('CHISINAU', '07:35'), source: 'app', location_lat: 47.02, location_lon: 28.86, location_accuracy_m: 8 });
    expect(app).toMatchObject({ source: 'app', location_accuracy_m: 8 });

    await expect(createReport(base)).rejects.toMatchObject({ code: '23505' });
  });

  it('FULL se scrie ca OK cu passengers_count -1', async () => {
    const r = await createReport({ ...base, point: 'BALTI', trip_id: tripId('BALTI', '05:30'), status: 'FULL', passengers_count: null, driver_id: null, vehicle_id: null });
    expect(r).toMatchObject({ status: 'OK', passengers_count: -1 });
  });

  it('climateQuestionNeeded: iunie → ac; după un raport cu ac_status în luna asta → null', async () => {
    expect(await climateQuestionNeeded(IDS.vehicles.tcp998, DATE)).toBe('ac');
    await createReport({ ...base, ac_status: 'works' });
    expect(await climateQuestionNeeded(IDS.vehicles.tcp998, DATE)).toBeNull();
    expect(await climateQuestionNeeded(IDS.vehicles.lyy735, DATE)).toBe('ac');
  });

  it('validateDay scrie rândul în day_validations; a doua validare nu dublează rândul', async () => {
    await validateDay(IDS.users.vitalie, DATE);
    expect(fake._tables.day_validations).toHaveLength(1);
    expect(fake._tables.day_validations[0]).toMatchObject({ user_id: IDS.users.vitalie, validation_date: DATE });
    expect(await isDayValidated(IDS.users.vitalie, DATE)).toBe(true);
    // upsert fără onConflict → 23505 pe (user_id, validation_date); validateDay doar loghează
    await validateDay(IDS.users.vitalie, DATE);
    expect(fake._tables.day_validations).toHaveLength(1);
  });

  it('isDayValidated cu 0 rânduri: .single() dă PGRST116 și funcția întoarce true — la fel ca pe PostgREST-ul real', async () => {
    expect(await isDayValidated(IDS.users.vitalie, DATE)).toBe(true);
    const { error } = await fake.from('day_validations').select('id').eq('user_id', IDS.users.vitalie).eq('validation_date', DATE).single();
    expect(error?.code).toBe('PGRST116');
  });
});

describe('codul de conectare (auth.ts peste fake)', () => {
  it('linkWithCode dă token de 64 hex, marchează codul folosit și creează sesiunea cu hash', async () => {
    fake._tables.peron_app_link_codes.push(linkCodeRow('482913', IDS.users.vitalie));
    const { token, user } = await linkWithCode('482913', 'Pixel test');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(user).toEqual({ id: IDS.users.vitalie, name: '@vitalie_peron', point: 'CHISINAU' });
    expect(fake._tables.peron_app_link_codes[0].used_at).toBeTruthy();
    expect(fake._tables.peron_app_sessions).toHaveLength(1);
    expect(fake._tables.peron_app_sessions[0]).toMatchObject({ user_id: IDS.users.vitalie, device_label: 'Pixel test' });
    expect(fake._tables.peron_app_sessions[0].token_hash).not.toBe(token);
    await expect(linkWithCode('482913', null)).rejects.toMatchObject({ status: 401, code: 'BAD_CODE' });
  });
});

describe('modelul fals', () => {
  it('curățenie: CURAT / MURDAR cu probleme / loc_corect=false → ALT_LOC / excepție → EROARE / refuz → EROARE', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64');
    nextModelAnswer({ json: { loc_corect: true, verdict: 'CURAT', probleme: [], descriere: 'Pavaj măturat.' } });
    expect(await analyzeCleaningPhoto('PERON', jpeg)).toEqual({ verdict: 'CURAT', problems: [], description: 'Pavaj măturat.' });
    expect(modelCalls.at(-1)).toMatchObject({ model: 'claude-opus-5', hasImage: true });
    expect(modelCalls.at(-1)?.userText).toContain('PERON');

    nextModelAnswer({ json: { loc_corect: true, verdict: 'MURDAR', probleme: ['praf pe pavaj', 'mucuri la stâlp'], descriere: 'Nemăturat.' } });
    expect(await analyzeCleaningPhoto('PIETONI', jpeg)).toMatchObject({ verdict: 'MURDAR', problems: ['praf pe pavaj', 'mucuri la stâlp'] });

    nextModelAnswer({ json: { loc_corect: false, verdict: 'CURAT', probleme: [], descriere: 'Alt loc.' } });
    expect(await analyzeCleaningPhoto('PIETONI', jpeg)).toMatchObject({ verdict: 'ALT_LOC' });

    nextModelAnswer({ throws: new Error('model down') });
    expect(await analyzeCleaningPhoto('VECEU', jpeg)).toMatchObject({ verdict: 'EROARE' });

    nextModelAnswer({ refusal: true });
    expect(await analyzeCleaningPhoto('VECEU', jpeg)).toMatchObject({ verdict: 'EROARE', description: 'Modelul a refuzat evaluarea.' });
  });

  it('șofer: verdicte, persoana_vizibila=false, JSON stricat → EROARE; coadă goală → testul pică zgomotos', async () => {
    nextModelAnswer({ json: { persoana_vizibila: true, uniforma: true, aspect_ingrijit: false, descriere: 'Cămașă TRANSLUX, nebărbierit.' } });
    expect(await analyzeDriverPhoto('AAAA')).toEqual({ verdict: 'OK', personVisible: true, uniformOk: true, groomedOk: false, description: 'Cămașă TRANSLUX, nebărbierit.' });

    nextModelAnswer({ json: { persoana_vizibila: false, uniforma: false, aspect_ingrijit: false, descriere: 'Nimeni în cadru.' } });
    expect(await analyzeDriverPhoto('AAAA')).toMatchObject({ verdict: 'OK', personVisible: false });

    nextModelAnswer({ text: '{nu e json' });
    expect(await analyzeDriverPhoto('AAAA')).toMatchObject({ verdict: 'EROARE' });

    // fără răspuns pregătit: serviciul întoarce EROARE (înghite), dar apelul e înregistrat —
    // testele e2e trebuie să verifice verdictul, nu doar că «nu a aruncat».
    const before = modelCalls.length;
    expect(await analyzeDriverPhoto('AAAA')).toMatchObject({ verdict: 'EROARE', description: 'Verificarea automată a eșuat.' });
    expect(modelCalls.length).toBe(before + 1);
  });
});

describe('Telegram capturat', () => {
  it('sendAdminAlert → alerts[]; getBotApi().sendMessage/editMessageText → telegram[]; adminii = ADMIN-ul din seed', async () => {
    await sendAdminAlert('<b>test</b>');
    expect(alerts).toEqual(['<b>test</b>']);
    expect(await getAdminChatIds()).toEqual(new Set([TELEGRAM.admin]));
    const api = getBotApi()!;
    const sent = await api.sendMessage(TELEGRAM.admin, 'tabla');
    await api.editMessageText(TELEGRAM.admin, sent.message_id, 'tabla v2');
    expect(telegram).toEqual([
      { method: 'sendMessage', chatId: TELEGRAM.admin, text: 'tabla', messageId: sent.message_id },
      { method: 'editMessageText', chatId: TELEGRAM.admin, text: 'tabla v2', messageId: sent.message_id },
    ]);
  });

  it('installMocks golește capturile de la testul anterior', () => {
    expect(alerts).toEqual([]);
    expect(telegram).toEqual([]);
    expect(modelCalls).toEqual([]);
  });
});
