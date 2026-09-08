/**
 * POST /app/v1/report — raportul unei curse din aplicația de peron.
 *
 * Face exact ce face botul după ce operatorul a răspuns la toate întrebările
 * (conversations/report.ts, «Save»): scrie linia în `reports` cu `source = 'app'`,
 * apoi efectele secundare în aceeași ordine — digest (încălcare locație / întârziere),
 * loading board, sarcină reclamă, închiderea sarcinii reclamă confirmate, validarea
 * zilei când toate cursele sunt raportate. Fiecare efect e în try/catch: raportul
 * e deja salvat, răspunsul nu se strică.
 *
 * Regulile pure (validare, location_ok, poarta de curățenie, rezumat) sunt în
 * reportRules.ts. Aici e doar orchestrarea cu DB-ul.
 */
import { POINT_LABELS } from '@translux/db';
import {
  autoCloseReclamaTask,
  confirmDriverAppearance,
  createReclamaTask,
  createReport,
  getActiveDrivers,
  getAllTripsForDirection,
  getAssignmentForTrip,
  getCleaningZonesDone,
  getDirectionForPoint,
  getDriverAppearanceCheck,
  getReportedTripIds,
  getVehiclePlate,
  updateAssignmentDriverVehicle,
  validateDay,
} from '../services/db.js';
import { addViolation } from '../services/dailyDigest.js';
import { updateLoadingBoard, updateLoadingBoardBalti } from '../services/loadingBoard.js';
import { formatTime, getTodayDate, minutesLate } from '../utils.js';
import type { AppUser } from './auth.js';
import { nextTripId } from './dayState.js';
import { ApiError, badRequest } from './errors.js';
import {
  CleaningRequiredError,
  buildSummary,
  cleaningGateSlot,
  cleaningMissing,
  computeLocation,
  parseReportBody,
  toReportRow,
} from './reportRules.js';

export const LATE_THRESHOLD_MIN = 10;

export interface ReportResponse {
  summary: string;
  allDone: boolean;
}

/** Cum apare operatorul în digestul de seară: @username, altfel #telegram_id, altfel id-ul. */
export function operatorLabel(user: Pick<AppUser, 'name' | 'telegram_id' | 'id'>): string {
  if (user.name) return user.name;
  if (user.telegram_id) return `#${user.telegram_id}`;
  return user.id;
}

export async function postReport(user: AppUser, rawBody: unknown): Promise<ReportResponse> {
  const point = user.point;
  const body = parseReportBody(rawBody, point);
  const date = getTodayDate();

  const [allTrips, reportedIds] = await Promise.all([
    getAllTripsForDirection(getDirectionForPoint(point)),
    getReportedTripIds(date, point),
  ]);
  const trip = allTrips.find((t) => t.id === body.tripId);
  if (!trip) throw badRequest('Cursă necunoscută pentru punctul tău', 'UNKNOWN_TRIP');

  // Ordinea rămâne secvențială, ca în bot: doar prima cursă neraportată se poate raporta.
  const next = nextTripId(allTrips, reportedIds);
  if (next !== trip.id) {
    if (reportedIds.has(trip.id)) throw new ApiError(409, 'ALREADY_REPORTED', 'Această cursă a fost deja înregistrată');
    const nextTrip = allTrips.find((t) => t.id === next);
    throw new ApiError(
      409,
      'NOT_NEXT',
      nextTrip ? `Completează mai întâi cursa ${formatTime(nextTrip.departure_time)}` : 'Toate cursele sunt raportate',
    );
  }

  // Poarta de curățenie (Chișinău): prima cursă cere setul DIMINEATA, 16:25 setul ZIUA.
  const slot = cleaningGateSlot(point, allTrips, trip.id);
  if (slot) {
    const missing = cleaningMissing(await getCleaningZonesDone(date, slot));
    if (missing.length > 0) throw new CleaningRequiredError(slot, missing, trip.departure_time);
  }

  // Poza șoferului trebuie să existe și să fie de azi (S04 o creează).
  if (body.driverCheckId) {
    const check = await getDriverAppearanceCheck(body.driverCheckId);
    if (!check || check.check_date !== date) {
      throw new ApiError(400, 'DRIVER_PHOTO_REQUIRED', 'Poza șoferului lipsește sau nu e de azi — fă poza din nou');
    }
  }

  const location = computeLocation(point, trip.departure_time, body.lat, body.lon);
  const late = minutesLate(trip.departure_time);

  try {
    await createReport(toReportRow(body, { date, point, userId: user.id, locationOk: location.ok }));
  } catch (err: any) {
    if (err?.code === '23505') throw new ApiError(409, 'ALREADY_REPORTED', 'Această cursă a fost deja înregistrată');
    throw err;
  }

  // Verdictele confirmate de operator, peste propunerea modelului (ambele rămân).
  if (body.driverCheckId) {
    try {
      await confirmDriverAppearance(body.driverCheckId, { uniform_ok: body.uniformOk, groomed_ok: body.exteriorOk });
    } catch (e) {
      console.error('[app-api] confirmDriverAppearance error:', e);
    }
  }

  // Operatorul a schimbat repartizarea din grafic → se scrie în daily_assignments, ca în bot.
  if (body.assignmentChanged && trip.crm_route_id && (body.driverId || body.vehicleId)) {
    try {
      const assignment = await getAssignmentForTrip(trip.crm_route_id, date);
      if (assignment) {
        await updateAssignmentDriverVehicle(trip.crm_route_id, date, body.driverId ?? assignment.driver_id, body.vehicleId);
      }
    } catch (e) {
      console.error('[app-api] Failed to update assignment:', e);
    }
  }

  // ── Efecte secundare, în ordinea din conversations/report.ts ──
  const hasLocationViolation = location.ok === false;
  const hasLateViolation = late > LATE_THRESHOLD_MIN;
  if (hasLocationViolation || hasLateViolation) {
    try {
      await addViolation({
        time: formatTime(trip.departure_time),
        point: POINT_LABELS[point],
        operator: operatorLabel(user),
        locationBad: hasLocationViolation,
        distanceM: location.distanceM != null ? Math.round(location.distanceM) : null,
        late: hasLateViolation,
        minutesLate: late,
      });
    } catch (e) {
      console.error('[app-api] Daily digest update error:', e);
    }
  }

  try {
    if (point === 'BALTI') await updateLoadingBoardBalti();
    else await updateLoadingBoard();
  } catch (e) {
    console.error('[app-api] Loading board update error:', e);
  }

  // Placa se citește o singură dată; e nevoie de ea la sarcina reclamă (creare sau închidere).
  let plate: string | null = null;
  if (body.vehicleId && (body.reclamaProblem || body.reclamaRepairConfirmed)) {
    try {
      plate = await getVehiclePlate(body.vehicleId);
    } catch (e) {
      console.error('[app-api] getVehiclePlate error:', e);
    }
  }

  if (body.reclamaProblem && plate) {
    try {
      await createReclamaTask({ creatorId: user.id, vehiclePlate: plate, reclamaProblem: body.reclamaProblem });
    } catch (e) {
      console.error('[app-api] createReclamaTask error:', e);
    }
  }

  if (body.reclamaRepairConfirmed && plate) {
    try {
      await autoCloseReclamaTask(plate, date, body.reclamaTaskId);
    } catch (e) {
      console.error('[app-api] autoCloseReclamaTask error:', e);
    }
  }

  let driverName: string | null = null;
  if (body.driverId) {
    try {
      driverName = (await getActiveDrivers()).find((d) => d.id === body.driverId)?.full_name ?? null;
    } catch (e) {
      console.error('[app-api] getActiveDrivers error:', e);
    }
  }
  const summary = buildSummary(body, { point, departureTime: trip.departure_time, driverName });

  // Toate cursele raportate → ziua se validează singură, ca în bot.
  let allDone = false;
  try {
    const updated = await getReportedTripIds(date, point);
    allDone = allTrips.every((t) => updated.has(t.id));
    if (allDone) await validateDay(user.id, date);
  } catch (e) {
    console.error('[app-api] validateDay error:', e);
  }

  return { summary, allDone };
}
