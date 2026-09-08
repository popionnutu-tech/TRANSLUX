/**
 * Logica pură a ecranului de cursă (spec peron-app-android, S07): starea formularului,
 * validarea locală («se poate trimite?») și construirea corpului pentru POST /app/v1/report.
 * Fără React, fără rețea — testată în buildReport.test.ts (`node --test`).
 *
 * Regulile sunt cele din apps/bot/src/api/reportRules.ts (serverul le re-validează):
 * - ABSENT / FULL / Bălți → toate câmpurile de calitate null;
 * - Chișinău + OK → cifră 0–27, poza șoferului (driverCheckId) și verdictele confirmate
 *   de operator, verificările manuale (toate «OK» implicit);
 * - reclamaOk se trimite doar când există auto; la «Totul OK» pe o mașină cu sarcină
 *   reclamă deschisă operatorul confirmă «a fost reparat?» (report.ts:664–712);
 * - clima doar când /day spune că sezonul cere întrebarea pentru mașina aleasă.
 * Corpul nu conține washGrade — nota de spălare nu se mai cere în aplicație.
 */
import type {
  ClimateStatus,
  DayAssignment,
  DayResponse,
  DriverPhotoResponse,
  PointEnum,
  ReclamaProblem,
  ReportBody,
  ReportStatus,
} from './types';

export const MAX_PASSENGERS = 27;
export const LATE_THRESHOLD_MIN = 10;
export const QUICK_PASSENGERS: readonly number[] = [5, 10, 15, 20, 25];

export type ReclamaChoice = 'ok' | ReclamaProblem;
export type RepairAnswer = 'da' | 'nu';

/** Poza șoferului după răspunsul serverului — verdictele de aici sunt propunerea modelului. */
export interface DriverPhotoState {
  driverCheckId: string;
  uri: string; // miniatura locală
  verdict: DriverPhotoResponse['verdict'];
  modelUniformOk: boolean | null;
  modelGroomedOk: boolean | null;
  description: string;
}

export interface Coords {
  lat: number;
  lon: number;
  accuracyM: number | null;
}

export interface TripFormState {
  status: ReportStatus;
  passengers: number | null; // null = neintrodus
  driverId: string | null;
  vehicleId: string | null;
  photo: DriverPhotoState | null;
  /** Verdictele confirmate de operator (pornesc de la propunerea modelului; null = «necunoscut», trebuie ales). */
  uniformOk: boolean | null;
  exteriorOk: boolean | null;
  loadingHelpOk: boolean;
  autoCurat: boolean;
  reclama: ReclamaChoice;
  /** Răspunsul la «A fost reparat?» — contează doar la reclama 'ok' pe o mașină cu sarcină deschisă. */
  repair: RepairAnswer | null;
  climate: ClimateStatus;
}

/** Ce știe ecranul din /day despre cursa deschisă. */
export interface TripContext {
  point: PointEnum;
  tripId: string;
  assignment: DayAssignment | null;
  vehicles: DayResponse['vehicles'];
  openReclama: DayResponse['openReclama'];
  climate: DayResponse['climate'];
}

export function tripContext(day: DayResponse, tripId: string): TripContext {
  return {
    point: day.point,
    tripId,
    assignment: day.assignments[tripId] ?? null,
    vehicles: day.vehicles,
    openReclama: day.openReclama,
    climate: day.climate,
  };
}

/** Starea implicită: repartizarea din /day, toate verificările «OK», fără cifră și fără poză. */
export function initialState(ctx: TripContext): TripFormState {
  return {
    status: 'OK',
    passengers: null,
    driverId: ctx.assignment?.driver_id ?? null,
    vehicleId: ctx.assignment?.vehicle_id ?? null,
    photo: null,
    uniformOk: null,
    exteriorOk: null,
    loadingHelpOk: true,
    autoCurat: true,
    reclama: 'ok',
    repair: null,
    climate: 'works',
  };
}

/** Starea după ce serverul a judecat poza: verdictele modelului devin propunerea de pe ecran. */
export function withPhoto(state: TripFormState, photo: DriverPhotoState | null): TripFormState {
  return {
    ...state,
    photo,
    uniformOk: photo?.modelUniformOk ?? null,
    exteriorOk: photo?.modelGroomedOk ?? null,
  };
}

export function plateOf(ctx: TripContext, vehicleId: string | null): string | null {
  if (!vehicleId) return null;
  if (ctx.assignment?.vehicle_id === vehicleId && ctx.assignment.plate) return ctx.assignment.plate;
  return ctx.vehicles.find((v) => v.id === vehicleId)?.plate ?? null;
}

/** Sarcina reclamă deschisă pe mașina aleasă (per placă în /day). */
export function openReclamaFor(ctx: TripContext, vehicleId: string | null): { taskId: string; description: string; lastComment: string | null } | null {
  const plate = plateOf(ctx, vehicleId);
  return plate ? ctx.openReclama[plate] ?? null : null;
}

/** 'ac' / 'heat' dacă sezonul cere întrebarea pentru mașina aleasă; altfel null (rândul nu apare). */
export function climateKindFor(ctx: TripContext, vehicleId: string | null): 'ac' | 'heat' | null {
  if (!vehicleId) return null;
  return ctx.climate[vehicleId] ?? null;
}

/** Întârzierea față de ora cursei, în minute, după ceasul telefonului (negativ = înainte de plecare). */
export function minutesLate(now: Date, departureTime: string): number {
  const [dh = 0, dm = 0] = departureTime.slice(0, 5).split(':').map(Number);
  return now.getHours() * 60 + now.getMinutes() - (dh * 60 + dm);
}

export function isValidPassengers(n: number | null): n is number {
  return n !== null && Number.isInteger(n) && n >= 0 && n <= MAX_PASSENGERS;
}

export function clampPassengers(n: number): number {
  return Math.min(MAX_PASSENGERS, Math.max(0, Math.round(n)));
}

/** Ecranul cere secțiunile de calitate (șofer, poză, verificări)? Doar Chișinău cu status OK. */
export function needsQuality(ctx: TripContext, state: TripFormState): boolean {
  return ctx.point === 'CHISINAU' && state.status === 'OK';
}

/**
 * De ce nu se poate trimite încă (null = se poate). Textul e cel arătat sub butonul «Trimite».
 */
export function blockingReason(ctx: TripContext, state: TripFormState): string | null {
  if (state.status !== 'OK') return null;
  if (!isValidPassengers(state.passengers)) return `Introdu numărul de pasageri (0–${MAX_PASSENGERS})`;
  if (ctx.point !== 'CHISINAU') return null;
  if (!state.photo) return 'Fă poza șoferului';
  if (state.uniformOk === null || state.exteriorOk === null) return 'Alege verdictele de sub poza șoferului';
  if (state.vehicleId && state.reclama === 'ok' && openReclamaFor(ctx, state.vehicleId)) {
    if (state.repair === null) return 'Răspunde: a fost reparat defectul marcat?';
    if (state.repair === 'nu') return 'Dacă nu e reparat, alege defectul la «Reclamă»';
  }
  return null;
}

/** Corpul exact pentru POST /app/v1/report. Nu conține washGrade. */
export function buildReportBody(ctx: TripContext, state: TripFormState, coords: Coords | null): ReportBody {
  const base: ReportBody = {
    tripId: ctx.tripId,
    status: state.status,
    passengersCount: state.status === 'OK' ? state.passengers : null,
    driverId: null,
    vehicleId: null,
    assignmentChanged: false,
    loadingHelpOk: null,
    autoCurat: null,
    driverCheckId: null,
    uniformOk: null,
    exteriorOk: null,
    reclamaOk: null,
    reclamaProblem: null,
    reclamaRepairConfirmed: false,
    reclamaTaskId: null,
    acStatus: null,
    heatStatus: null,
    lat: coords?.lat ?? null,
    lon: coords?.lon ?? null,
    accuracyM: coords?.accuracyM ?? null,
  };
  if (!needsQuality(ctx, state)) return base;

  const vehicleId = state.vehicleId;
  const reclamaOk = vehicleId ? state.reclama === 'ok' : null;
  const openTask = reclamaOk ? openReclamaFor(ctx, vehicleId) : null;
  const repairConfirmed = !!openTask && state.repair === 'da';
  const climateKind = climateKindFor(ctx, vehicleId);
  const a = ctx.assignment;
  const assignmentChanged = !!a && (a.driver_id !== state.driverId || (a.vehicle_id ?? null) !== vehicleId);

  return {
    ...base,
    driverId: state.driverId,
    vehicleId,
    assignmentChanged,
    loadingHelpOk: state.loadingHelpOk,
    autoCurat: state.autoCurat,
    driverCheckId: state.photo?.driverCheckId ?? null,
    uniformOk: state.uniformOk,
    exteriorOk: state.exteriorOk,
    reclamaOk,
    reclamaProblem: reclamaOk === false ? state.reclama as ReclamaProblem : null,
    reclamaRepairConfirmed: repairConfirmed,
    reclamaTaskId: repairConfirmed ? openTask.taskId : null,
    acStatus: climateKind === 'ac' ? state.climate : null,
    heatStatus: climateKind === 'heat' ? state.climate : null,
  };
}

/** «📍 42 m de stație» / «📍 fără GPS» / «📍 se caută…». */
export function locationLabel(distanceM: number | null, searching: boolean): string {
  if (searching) return '📍 se caută…';
  if (distanceM === null) return '📍 fără GPS';
  return `📍 ${Math.round(distanceM)} m de stație`;
}

/** Textul de după «Trimite» când toate cursele zilei sunt raportate — ca la bot (report.ts), fără emoji (mockup-ul nu are emoji în UI). */
export function missionDoneText(tripCount: number): string {
  return `MISIUNE ÎNDEPLINITĂ\n\nToate cele ${tripCount} curse au fost completate.\n\nDrumul de azi e parcurs.\nOdihnește-te. Noapte bună.`;
}
