/**
 * Ziua de fixture pentru testele cap-coadă (docs/specs/peron-app-e2e.md, «Decizii»):
 * orele curselor sunt cele din baza de producție (citite pe 08.09.2026); tot
 * restul — nume, telefoane, plăcuțe în afara celor trei din spec — e inventat.
 *
 * Id-urile sunt UUID-uri deterministe și lizibile: cursa Chișinău 06:55 e
 * `7c000000-0000-4000-8000-000000000655`, Bălți 05:20 e `ba000000-…-000000000520`
 * (vezi tripId()). Așa un test picat spune singur despre ce cursă e vorba.
 */
import type { Seed, Row } from './fakeSupabase.js';

export const CHISINAU_TIMES = [
  '06:55', '07:35', '08:15', '08:50', '09:25', '10:00', '10:30', '11:00', '11:28', '11:55',
  '12:20', '12:45', '13:10', '13:35', '14:00', '14:25', '14:50', '15:15', '15:40', '16:05',
  '16:25', '16:45', '17:20', '17:50', '18:10', '18:30', '18:55', '19:25', '20:00',
] as const;

export const BALTI_TIMES = [
  '05:20', '05:30', '06:30', '06:55', '07:35', '08:15', '08:35', '09:00', '09:20', '09:30',
  '10:05', '10:25', '10:50', '11:10', '11:45', '12:10', '12:45', '13:10', '13:55', '14:20',
  '15:20', '15:45', '16:00', '16:20', '17:00', '18:25', '18:40', '19:20', '20:20',
] as const;

/** `uid('7c', 655)` → `7c000000-0000-4000-8000-000000000655` */
export function uid(prefix: string, n: number): string {
  return `${prefix.padEnd(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** Id-ul cursei după punct și ora plecării ('06:55'). */
export function tripId(point: 'CHISINAU' | 'BALTI', hhmm: string): string {
  return uid(point === 'CHISINAU' ? '7c' : 'ba', Number(hhmm.replace(':', '')));
}

/** crm_route_id al unei curse din Chișinău (Bălți nu are — fără repartizări acolo). */
export function crmRouteId(hhmm: string): number {
  return 1000 + Number(hhmm.replace(':', ''));
}

export const IDS = {
  route: uid('a0', 1),
  users: {
    vitalie: uid('0e', 1), // CONTROLLER, CHISINAU
    andrei: uid('0e', 2), // CONTROLLER, BALTI
    admin: uid('0e', 3), // ADMIN cu telegram_id — primește alertele
    digital: uid('0e', 4), // DIGITAL — executorul sarcinilor reclamă
  },
  drivers: {
    ionMunteanu: uid('d0', 1),
    vasileRusu: uid('d0', 2),
    petruCiobanu: uid('d0', 3),
    sergiuLungu: uid('d0', 4),
    inactiv: uid('d0', 5),
    lde: uid('d0', 6),
  },
  vehicles: {
    lyy735: uid('e0', 1),
    tcp998: uid('e0', 2),
    wvw526: uid('e0', 3),
  },
  reclamaTask: uid('0b', 1),
} as const;

export const TELEGRAM = {
  vitalie: 7115941429,
  andrei: 628056510,
  admin: 100000001,
  digital: 100000002,
} as const;

export const PLATES = { lyy735: 'LYY 735', tcp998: '998 TCP', wvw526: '526 WVW' } as const;

function shiftDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Seed-ul zilei `date` ('YYYY-MM-DD'): tabelele din «Decizii» populate, restul goale.
 * Rezultatul e un obiect nou la fiecare apel; createFakeSupabase îl clonează oricum.
 */
export function seedDay(date: string): Seed {
  const yesterday = `${shiftDays(date, -1)}T09:00:00.000Z`;
  const longAgo = `${shiftDays(date, -400)}T09:00:00.000Z`;

  const users: Row[] = [
    { id: IDS.users.vitalie, telegram_id: TELEGRAM.vitalie, username: 'vitalie_peron', name: 'Vitalie', role: 'CONTROLLER', point: 'CHISINAU', operator_kind: 'MAIN', active: true, created_at: longAgo },
    { id: IDS.users.andrei, telegram_id: TELEGRAM.andrei, username: 'andrei_balti', name: 'Andrei', role: 'CONTROLLER', point: 'BALTI', operator_kind: 'MAIN', active: true, created_at: longAgo },
    { id: IDS.users.admin, telegram_id: TELEGRAM.admin, username: 'admin_test', name: 'Admin', role: 'ADMIN', point: null, operator_kind: 'MAIN', active: true, created_at: longAgo },
    { id: IDS.users.digital, telegram_id: TELEGRAM.digital, username: 'digital_test', name: 'Iurie', role: 'DIGITAL', point: null, operator_kind: 'MAIN', active: true, created_at: longAgo },
  ];

  const routes: Row[] = [{ id: IDS.route, name: 'Chișinău – Bălți', active: true, created_at: longAgo }];

  const trips: Row[] = [
    ...CHISINAU_TIMES.map((t) => ({
      id: tripId('CHISINAU', t),
      route_id: IDS.route,
      direction: 'CHISINAU_BALTI',
      departure_time: `${t}:00`,
      crm_route_id: crmRouteId(t),
      active: true,
      nord_town: null,
      nord_departure: null,
      created_at: longAgo,
    })),
    ...BALTI_TIMES.map((t) => ({
      id: tripId('BALTI', t),
      route_id: IDS.route,
      direction: 'BALTI_CHISINAU',
      departure_time: `${t}:00`,
      crm_route_id: null,
      active: true,
      nord_town: null,
      nord_departure: null,
      created_at: longAgo,
    })),
  ];

  const driver = (id: string, full_name: string, extra: Partial<Row> = {}): Row => ({
    id, full_name, phone: null, active: true, is_lde: false, directions: ['interurban'], cashin_sofer_id: null, created_at: longAgo, ...extra,
  });
  const drivers: Row[] = [
    driver(IDS.drivers.ionMunteanu, 'Ion Munteanu'),
    driver(IDS.drivers.vasileRusu, 'Vasile Rusu'),
    driver(IDS.drivers.petruCiobanu, 'Petru Ciobanu'),
    driver(IDS.drivers.sergiuLungu, 'Sergiu Lungu'),
    driver(IDS.drivers.inactiv, 'Gheorghe Plecat', { active: false }),
    driver(IDS.drivers.lde, 'Dumitru Camion', { is_lde: true, directions: ['lde'] }),
  ];

  const vehicle = (id: string, plate_number: string): Row => ({
    id, plate_number, active: true, is_lde: false, directions: ['interurban'], created_at: longAgo,
  });
  const vehicles: Row[] = [
    vehicle(IDS.vehicles.lyy735, PLATES.lyy735),
    vehicle(IDS.vehicles.tcp998, PLATES.tcp998),
    vehicle(IDS.vehicles.wvw526, PLATES.wvw526),
  ];

  // Repartizările din grafic pentru primele 3 curse din Chișinău.
  // 08:15 merge cu LYY 735 — auto cu sarcina reclamă deschisă (S02, «08:15 cu reclamă»).
  const assignment = (n: number, hhmm: string, driver_id: string, vehicle_id: string): Row => ({
    id: uid('da', n),
    assignment_date: date,
    schedule_id: n,
    direction: 'CHISINAU_NORD',
    trip_id: tripId('CHISINAU', hhmm),
    crm_route_id: crmRouteId(hhmm),
    driver_id,
    vehicle_id,
    auto_copied: false,
    created_at: yesterday,
  });
  const daily_assignments: Row[] = [
    assignment(1, '06:55', IDS.drivers.ionMunteanu, IDS.vehicles.tcp998),
    assignment(2, '07:35', IDS.drivers.vasileRusu, IDS.vehicles.wvw526),
    assignment(3, '08:15', IDS.drivers.petruCiobanu, IDS.vehicles.lyy735),
  ];

  const deadline = `${shiftDays(date, 14)}T15:00:00.000Z`; // ≈ 10 zile lucrătoare, 18:00 Chișinău
  const obligations: Row[] = [
    {
      id: IDS.reclamaTask,
      organization_id: '00000000-0000-0000-0000-000000000001',
      creator_id: IDS.users.vitalie,
      assignee_id: IDS.users.digital,
      title: `Reclamă ${PLATES.lyy735}`,
      description: `${PLATES.lyy735} — panou cu ruta, de reparat`,
      points: 30,
      original_deadline: deadline,
      current_deadline: deadline,
      current_state: 'sent',
      rework_used: false,
      retry_number: 1,
      root_task_id: null,
      attachments: [],
      source: 'reclama',
      vehicle_plate: PLATES.lyy735,
      reclama_problem: 'panou_ruta',
      category: 'MARKETING_AUTO',
      recurring_template_id: null,
      goal: null,
      created_at: yesterday,
      updated_at: yesterday,
    },
  ];

  return {
    tables: {
      users,
      routes,
      trips,
      drivers,
      vehicles,
      daily_assignments,
      obligations,
      obligation_events: [],
      obligation_attempts: [],
      bot_storage: [],
      reports: [],
      report_photos: [],
      day_validations: [],
      peron_app_link_codes: [],
      peron_app_sessions: [],
      peron_cleaning_checks: [],
      driver_appearance_checks: [],
      peron_presence_pings: [],
      operator_trip_skips: [],
    },
    storage: { 'report-photos': {} },
  };
}

/** Un cod de conectare valid 24 h pentru un utilizator — de inserat în `peron_app_link_codes`. */
export function linkCodeRow(code: string, userId: string, now: Date = new Date()): Row {
  return {
    code,
    user_id: userId,
    created_by: null,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    used_at: null,
  };
}
