/**
 * Partea pură a lui POST /app/v1/report: validarea corpului, calculul `location_ok`,
 * poarta de curățenie, maparea pe linia din `reports` și textul de rezumat.
 * Fără DB, fără rețea — testată în reportRules.test.ts. Regulile sunt cele din
 * conversations/report.ts (botul), ca un raport din aplicație să arate identic.
 */
import type { CleaningSlot, CleaningZone, PointEnum } from '@translux/db';
import { config } from '../config.js';
import { formatTime, haversineDistance } from '../utils.js';
import { ApiError, badRequest } from './errors.js';

export type ReportStatus = 'OK' | 'ABSENT' | 'FULL';
export type ReclamaProblem = 'bus' | 'panou_ruta' | 'ambele';
export type ClimateStatus = 'works' | 'broken' | 'none';

export const MAX_PASSENGERS = 27;
export const CLEANING_ZONES: readonly CleaningZone[] = ['PERON', 'PIETONI', 'VECEU'];

/** Corpul validat. La BALTI și la ABSENT câmpurile de calitate sunt deja null. */
export interface ReportBody {
  tripId: string;
  status: ReportStatus;
  passengersCount: number | null;
  driverId: string | null;
  vehicleId: string | null;
  assignmentChanged: boolean;
  loadingHelpOk: boolean | null;
  autoCurat: boolean | null;
  driverCheckId: string | null;
  /** Acceptate de la clienți vechi, dar IGNORATE: verdictul e al modelului (vezi withModelVerdicts). */
  uniformOk: boolean | null;
  exteriorOk: boolean | null;
  reclamaOk: boolean | null;
  reclamaProblem: ReclamaProblem | null;
  reclamaRepairConfirmed: boolean;
  reclamaTaskId: string | null;
  acStatus: ClimateStatus | null;
  heatStatus: ClimateStatus | null;
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
}

const RECLAMA_PROBLEMS: readonly string[] = ['bus', 'panou_ruta', 'ambele'];
const CLIMATE_STATUSES: readonly string[] = ['works', 'broken', 'none'];

function str(v: unknown, name: string): string {
  if (typeof v !== 'string' || !v.trim()) throw badRequest(`Lipsește ${name}`);
  return v.trim();
}

function strOrNull(v: unknown, name: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') throw badRequest(`${name} trebuie să fie text sau null`);
  return v.trim();
}

function bool(v: unknown, name: string): boolean {
  if (typeof v !== 'boolean') throw badRequest(`${name} trebuie să fie true sau false`);
  return v;
}

function boolOrNull(v: unknown, name: string): boolean | null {
  if (v === null || v === undefined) return null;
  return bool(v, name);
}

function numOrNull(v: unknown, name: string): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw badRequest(`${name} trebuie să fie număr sau null`);
  return v;
}

function oneOfOrNull<T extends string>(v: unknown, allowed: readonly string[], name: string): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || !allowed.includes(v)) throw badRequest(`${name} trebuie să fie ${allowed.join(' | ')} sau null`);
  return v as T;
}

/**
 * Validează corpul cererii pentru punctul operatorului. Aruncă ApiError 400.
 * - FULL doar la BALTI; OK cere passengersCount 0–27; ABSENT/FULL → fără cifră.
 * - BALTI: se acceptă doar status, passengersCount, lat, lon, accuracyM; restul → null.
 * - CHISINAU + OK: cere driverCheckId (DRIVER_PHOTO_REQUIRED) și verificările manuale;
 *   uniformOk / exteriorOk sunt opționale și nu contează — verdictul vine din poza șoferului.
 * - ABSENT: toate câmpurile de calitate → null (ca în bot).
 */
export function parseReportBody(body: unknown, point: PointEnum): ReportBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Corpul trebuie să fie un obiect JSON');
  const b = body as Record<string, unknown>;

  const tripId = str(b.tripId, 'tripId');
  const status = b.status;
  if (status !== 'OK' && status !== 'ABSENT' && status !== 'FULL') throw badRequest('status trebuie să fie OK | ABSENT | FULL');
  if (status === 'FULL' && point !== 'BALTI') throw badRequest('«Microbuzul full» există doar la Bălți');

  let passengersCount: number | null = null;
  if (status === 'OK') {
    const n = b.passengersCount;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_PASSENGERS) {
      throw badRequest(`passengersCount trebuie să fie un întreg între 0 și ${MAX_PASSENGERS}`);
    }
    passengersCount = n;
  }

  const lat = numOrNull(b.lat, 'lat');
  const lon = numOrNull(b.lon, 'lon');
  if ((lat === null) !== (lon === null)) throw badRequest('lat și lon vin împreună sau deloc');
  if (lat !== null && (Math.abs(lat) > 90 || Math.abs(lon!) > 180)) throw badRequest('lat/lon în afara intervalului');
  const accRaw = numOrNull(b.accuracyM, 'accuracyM');
  const accuracyM = accRaw === null ? null : Math.max(0, Math.round(accRaw));

  const empty: ReportBody = {
    tripId,
    status,
    passengersCount,
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
    lat,
    lon,
    accuracyM,
  };

  // Bălți: fluxul scurt. ABSENT: fără șofer/auto/verificări, ca în bot.
  if (point === 'BALTI' || status !== 'OK') return empty;

  const driverCheckId = strOrNull(b.driverCheckId, 'driverCheckId');
  if (!driverCheckId) throw new ApiError(400, 'DRIVER_PHOTO_REQUIRED', 'Lipsește poza șoferului (driverCheckId)');
  // Ion (09.09): «să nu poată pune operatorul fără șofer poza, obligatoriu» — o cursă OK are
  // întotdeauna un șofer; «Fără șofer» nu există în aplicație.
  if (!strOrNull(b.driverId, 'driverId')) throw new ApiError(400, 'DRIVER_REQUIRED', 'Alege șoferul — o cursă cu pasageri are întotdeauna șofer');

  const vehicleId = strOrNull(b.vehicleId, 'vehicleId');
  const reclamaOk = vehicleId ? bool(b.reclamaOk, 'reclamaOk') : null;
  const reclamaProblem = vehicleId && reclamaOk === false
    ? oneOfOrNull<ReclamaProblem>(b.reclamaProblem, RECLAMA_PROBLEMS, 'reclamaProblem')
    : null;
  if (vehicleId && reclamaOk === false && !reclamaProblem) throw badRequest('La reclamă ≠ OK trebuie reclamaProblem');
  const reclamaRepairConfirmed = !!vehicleId && reclamaOk === true && b.reclamaRepairConfirmed === true;

  return {
    ...empty,
    driverId: strOrNull(b.driverId, 'driverId'),
    vehicleId,
    assignmentChanged: b.assignmentChanged === true,
    loadingHelpOk: bool(b.loadingHelpOk, 'loadingHelpOk'),
    autoCurat: bool(b.autoCurat, 'autoCurat'),
    driverCheckId,
    uniformOk: boolOrNull(b.uniformOk, 'uniformOk'),
    exteriorOk: boolOrNull(b.exteriorOk, 'exteriorOk'),
    reclamaOk,
    reclamaProblem,
    reclamaRepairConfirmed,
    reclamaTaskId: reclamaRepairConfirmed ? strOrNull(b.reclamaTaskId, 'reclamaTaskId') : null,
    acStatus: oneOfOrNull<ClimateStatus>(b.acStatus, CLIMATE_STATUSES, 'acStatus'),
    heatStatus: oneOfOrNull<ClimateStatus>(b.heatStatus, CLIMATE_STATUSES, 'heatStatus'),
  };
}

/**
 * Verdictul șoferului e al modelului, nu al operatorului (Ion, 08.09): `uniform_ok` =
 * uniforma, `exterior_ok` = bărbierit && aspect îngrijit, ambele deja calculate în
 * driver_appearance_checks (*_model). La EROARE (model picat) rămân null — nu se
 * inventează. Ce a trimis aplicația în uniformOk / exteriorOk se pierde aici.
 */
export function withModelVerdicts(
  body: ReportBody,
  check: { uniform_ok_model: boolean | null; groomed_ok_model: boolean | null } | null,
): ReportBody {
  if (!body.driverCheckId) return body;
  return { ...body, uniformOk: check?.uniform_ok_model ?? null, exteriorOk: check?.groomed_ok_model ?? null };
}

/** Cursa cere locație? Bălți: toate. Chișinău: toate în afară de 06:55 și 20:00 (ca în bot). */
export function requiresLocation(point: PointEnum, departureTime: string): boolean {
  if (point === 'BALTI') return true;
  return !(config.chisinauExemptTimes as readonly string[]).includes(formatTime(departureTime));
}

export interface LocationResult {
  ok: boolean | null; // null = cursă exceptată
  distanceM: number | null;
}

/**
 * `location_ok` ca în bot: null la orele exceptate; false fără coordonate (permisiune
 * refuzată); altfel distanța haversine față de stația punctului ≤ rază.
 */
export function computeLocation(
  point: PointEnum,
  departureTime: string,
  lat: number | null,
  lon: number | null,
): LocationResult {
  if (!requiresLocation(point, departureTime)) return { ok: null, distanceM: null };
  if (lat === null || lon === null) return { ok: false, distanceM: null };
  const station = config.stations[point];
  const distanceM = haversineDistance(lat, lon, station.lat, station.lon);
  return { ok: distanceM <= station.radiusM, distanceM };
}

/**
 * Poarta de curățenie (doar Chișinău):
 *  - DIMINEATA la PRIMA cursă raportată efectiv azi (niciun rând în `reports`), nu la
 *    prima din orar — operatorul care a sărit 06:55 și 07:35 face pozele la 08:15
 *    (Vitalie, 09.09);
 *  - ZIUA la cursa `config.cleaningGateTripTime` (16:25) sau, dacă aceea a fost sărită,
 *    la prima cursă raportată după ea.
 * Altfel null. Când ambele s-ar aplica (toate cursele de până după 16:25 sărite), întâi
 * DIMINEATA — următoarea încercare cere ZIUA.
 */
export function cleaningGateSlot<T extends { id: string; departure_time: string }>(
  point: PointEnum,
  trips: readonly T[],
  tripId: string,
  reportedIds: ReadonlySet<string>,
  skippedIds: ReadonlySet<string>,
): CleaningSlot | null {
  if (point !== 'CHISINAU') return null;
  const idx = trips.findIndex((t) => t.id === tripId);
  if (idx < 0) return null;
  if (reportedIds.size === 0) return 'DIMINEATA';
  const trip = trips[idx];
  if (formatTime(trip.departure_time) === config.cleaningGateTripTime) return 'ZIUA';
  const gateIdx = trips.findIndex((t) => formatTime(t.departure_time) === config.cleaningGateTripTime);
  if (gateIdx >= 0 && gateIdx < idx && skippedIds.has(trips[gateIdx].id)) {
    const reportedBetween = trips.slice(gateIdx + 1, idx).some((t) => reportedIds.has(t.id));
    if (!reportedBetween) return 'ZIUA';
  }
  return null;
}

/** Zonele care lipsesc din set. Gol = setul e complet. */
export function cleaningMissing(done: ReadonlySet<CleaningZone>): CleaningZone[] {
  return CLEANING_ZONES.filter((z) => !done.has(z));
}

/** 409 CLEANING_REQUIRED cu { slot, missing } — aplicația deschide camera pe zonele lipsă. */
export class CleaningRequiredError extends ApiError {
  constructor(
    public readonly slot: CleaningSlot,
    public readonly missing: CleaningZone[],
    departureTime: string,
  ) {
    super(
      409,
      'CLEANING_REQUIRED',
      `Înainte de cursa ${formatTime(departureTime)} trebuie pozele de curățenie (${missing.join(', ')})`,
      { slot, missing },
    );
  }
}

/** Linia pentru `createReport` din services/db.ts — aceleași reguli ca în bot. */
export interface ReportRow {
  report_date: string;
  point: PointEnum;
  trip_id: string;
  driver_id: string | null;
  status: ReportStatus;
  passengers_count: number | null;
  exterior_ok: boolean | null;
  uniform_ok: boolean | null;
  loading_help_ok: boolean | null;
  auto_curat: boolean | null;
  reclama_ok: boolean | null;
  reclama_deadline: null;
  reclama_problem: ReclamaProblem | null;
  wash_grade: null;
  ac_status: ClimateStatus | null;
  heat_status: ClimateStatus | null;
  vehicle_id: string | null;
  created_by_user: string;
  location_ok: boolean | null;
  source: 'app';
  driver_check_id: string | null;
  location_lat: number | null;
  location_lon: number | null;
  location_accuracy_m: number | null;
}

export function toReportRow(
  body: ReportBody,
  ctx: { date: string; point: PointEnum; userId: string; locationOk: boolean | null },
): ReportRow {
  return {
    report_date: ctx.date,
    point: ctx.point,
    trip_id: body.tripId,
    driver_id: body.driverId,
    status: body.status, // FULL → createReport îl stochează ca OK cu passengers_count -1
    passengers_count: body.passengersCount,
    exterior_ok: body.exteriorOk,
    uniform_ok: body.uniformOk,
    loading_help_ok: body.loadingHelpOk,
    auto_curat: body.autoCurat,
    reclama_ok: body.reclamaOk,
    reclama_deadline: null,
    reclama_problem: body.reclamaProblem,
    wash_grade: null, // nota de spălare nu se mai cere în aplicație (Ion, 08.09)
    ac_status: body.acStatus,
    heat_status: body.heatStatus,
    vehicle_id: body.vehicleId,
    created_by_user: ctx.userId,
    location_ok: ctx.locationOk,
    source: 'app',
    driver_check_id: body.driverCheckId,
    location_lat: body.lat,
    location_lon: body.lon,
    location_accuracy_m: body.accuracyM,
  };
}

/** «Ion Popescu» → «Ion P.», ca în grila botului. */
export function shortDriverName(fullName: string | null | undefined): string {
  if (!fullName) return '—';
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts.slice(1).map((p) => p[0] + '.').join('')}` : fullName;
}

/** Textul de rezumat, identic cu răspunsul botului după salvare (report.ts). */
export function buildSummary(
  body: ReportBody,
  ctx: { point: PointEnum; departureTime: string; driverName: string | null },
): string {
  const time = formatTime(ctx.departureTime);
  if (body.status === 'ABSENT') return `☑ ${time} — absent`;
  if (body.status === 'FULL') return `☑ ${time} — microbuz complet`;

  const passengerInfo = `☑ ${time} — ${body.passengersCount} pas.`;
  const driverInfo = ctx.point !== 'BALTI' ? ` | ${shortDriverName(ctx.driverName)}` : '';
  const reclamaProblemLabel = body.reclamaProblem === 'bus' ? 'autobuz'
    : body.reclamaProblem === 'panou_ruta' ? 'panou'
    : body.reclamaProblem === 'ambele' ? 'ambele' : '';
  const warningParts: string[] = [];
  if (body.loadingHelpOk === false) warningParts.push('nu ajută la încărcat');
  if (body.uniformOk === false) warningParts.push('uniformă');
  if (body.exteriorOk === false) warningParts.push('aspect');
  if (body.autoCurat === false) warningParts.push('auto exterior murdar');
  if (body.reclamaOk === false) warningParts.push(`reclamă${reclamaProblemLabel ? ` ${reclamaProblemLabel}` : ''}`);
  const warnings = warningParts.length > 0 ? `\n⚠ ${warningParts.join(', ')}` : '';
  return passengerInfo + driverInfo + warnings;
}

/** Placa normalizată pentru POST /app/v1/vehicle: majuscule, fără spații, minim 4 caractere. */
export function normalizePlate(v: unknown): string {
  if (typeof v !== 'string') throw badRequest('Lipsește plate');
  const plate = v.trim().toUpperCase().replace(/\s/g, '');
  if (plate.length < 4) throw badRequest('Număr invalid: minim 4 caractere (ex: 998TCP)');
  if (plate.length > 16) throw badRequest('Număr invalid: prea lung');
  return plate;
}
