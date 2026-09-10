/**
 * POST /app/v1/skip { tripId, status?: 'OK' | 'ABSENT', passengersCount } — «N-am fost la
 * cursă»: operatorul marchează cursa `next` ca sărită (Vitalie, 09.09: Aurel vine la
 * 07:30 și nu poate raporta 06:55) ȘI dă cifra de pasageri, luată de la șofer.
 *
 * Ion (10.09): «obligatoriu la rutele la care chiar nu a fost operatorul de introdus
 * numărul de pasageri, și la ziua când operatorul nu este». De aceea:
 *  - cifra e obligatorie (0–27) sau, dacă microbuzul n-a venit, `status: 'ABSENT'`;
 *    fără ea → 400 PASSENGERS_REQUIRED;
 *  - se scrie un rând în `reports` (source 'app', fără șofer, auto, poze, verificări sau
 *    GPS — nimic din ce operatorul n-a văzut), ca tabla de încărcare, pivotul și
 *    validarea zilei să aibă cifra; rândul din operator_trip_skips rămâne semnul că
 *    operatorul n-a fost acolo (digestul îl listează cu numele);
 *  - ruta merge și în ziua fără operator (vineri la Chișinău): e singura rută de
 *    scriere deschisă atunci — /report, /cleaning-photo, /driver-photo dau 409 DAY_OFF.
 *
 * Se poate sări DOAR cursa `next` (pentru 06:55 și 07:35 se apasă de două ori).
 * Refuzuri: 400 UNKNOWN_TRIP / PASSENGERS_REQUIRED; 409 ALREADY_REPORTED (cursa are
 * raport); 409 ALREADY_SKIPPED (deja sărită, inclusiv 23505 la inserare); 409 NOT_NEXT.
 */
import {
  createReport,
  createTripSkip,
  getAllTripsForDirection,
  getDirectionForPoint,
  getReportedTripIds,
  getSkippedTripIds,
  validateDay,
} from '../services/db.js';
import { updateLoadingBoard, updateLoadingBoardBalti } from '../services/loadingBoard.js';
import { formatTime, getTodayDate } from '../utils.js';
import type { AppUser } from './auth.js';
import { nextTripId } from './dayState.js';
import { ApiError, badRequest } from './errors.js';
import { MAX_PASSENGERS } from './reportRules.js';
import { asObject } from './server.js';

export interface SkipBody {
  tripId: string;
  status: 'OK' | 'ABSENT';
  /** Cifra de la șofer; null doar la ABSENT. */
  passengersCount: number | null;
}

export interface SkipResponse {
  /** Cursa care a devenit `next` după sărire; null când nu mai e niciuna. */
  next: string | null;
  /** «☑ 06:55 — 12 pas. (n-ai fost)» — textul pentru ecran, în stilul raportului. */
  summary: string;
  /** Toate cursele zilei au rând în `reports` — ziua s-a validat singură. */
  allDone: boolean;
}

export function parseSkipBody(rawBody: unknown): SkipBody {
  const b = asObject(rawBody);
  if (typeof b.tripId !== 'string' || !b.tripId.trim()) throw badRequest('Lipsește tripId');
  const status = b.status === undefined || b.status === null ? 'OK' : b.status;
  if (status !== 'OK' && status !== 'ABSENT') throw badRequest('status trebuie să fie OK | ABSENT');

  let passengersCount: number | null = null;
  if (status === 'OK') {
    const n = b.passengersCount;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_PASSENGERS) {
      throw new ApiError(
        400,
        'PASSENGERS_REQUIRED',
        `Și la cursa la care n-ai fost se pune numărul de pasageri (0–${MAX_PASSENGERS}), luat de la șofer — sau «absent» dacă microbuzul n-a venit`,
      );
    }
    passengersCount = n;
  }
  return { tripId: b.tripId.trim(), status, passengersCount };
}

export async function postSkip(user: AppUser, rawBody: unknown): Promise<SkipResponse> {
  const { tripId, status, passengersCount } = parseSkipBody(rawBody);
  const point = user.point;
  const date = getTodayDate();
  // Fără assertNotDayOff: vinerea cifrele intră tot pe aici (Ion, 10.09).

  const [allTrips, reportedIds, skippedIds] = await Promise.all([
    getAllTripsForDirection(getDirectionForPoint(point)),
    getReportedTripIds(date, point),
    getSkippedTripIds(date, point),
  ]);
  const trip = allTrips.find((t) => t.id === tripId);
  if (!trip) throw badRequest('Cursă necunoscută pentru punctul tău', 'UNKNOWN_TRIP');
  if (skippedIds.has(trip.id)) throw new ApiError(409, 'ALREADY_SKIPPED', 'Ai marcat deja că n-ai fost la această cursă');
  if (reportedIds.has(trip.id)) throw new ApiError(409, 'ALREADY_REPORTED', 'Această cursă a fost deja înregistrată — nu se poate sări');

  const next = nextTripId(allTrips, reportedIds, skippedIds);
  if (next !== trip.id) {
    const nextTrip = allTrips.find((t) => t.id === next);
    throw new ApiError(
      409,
      'NOT_NEXT',
      nextTrip ? `Se poate sări doar cursa care urmează: ${formatTime(nextTrip.departure_time)}` : 'Toate cursele sunt închise',
    );
  }

  // Întâi cifra (rândul din reports), apoi semnul «n-am fost». Dacă rândul din reports
  // există deja (altă filă a salvat între timp) → 409, fără să rămână o sărire orfană.
  try {
    await createReport({
      report_date: date,
      point,
      trip_id: trip.id,
      driver_id: null,
      status,
      passengers_count: passengersCount,
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
      created_by_user: user.id,
      location_ok: null,
      source: 'app',
      driver_check_id: null,
      location_lat: null,
      location_lon: null,
      location_accuracy_m: null,
    });
  } catch (err: any) {
    if (err?.code === '23505') throw new ApiError(409, 'ALREADY_REPORTED', 'Această cursă a fost deja înregistrată — nu se poate sări');
    throw err;
  }
  try {
    await createTripSkip({ skip_date: date, point, trip_id: trip.id, user_id: user.id });
  } catch (err: any) {
    if (err?.code === '23505') throw new ApiError(409, 'ALREADY_SKIPPED', 'Ai marcat deja că n-ai fost la această cursă');
    throw err;
  }
  const time = formatTime(trip.departure_time);
  console.log(`[app-api] ${user.name ?? user.id} n-a fost la cursa ${time} (${point}): ${status === 'ABSENT' ? 'absent' : `${passengersCount} pas.`}`);

  // Efecte secundare ca la /report: tabla de încărcare vede cifra; ziua se validează
  // când toate cursele au rând. Fiecare în try/catch — rândurile sunt deja scrise.
  try {
    if (point === 'BALTI') await updateLoadingBoardBalti();
    else await updateLoadingBoard();
  } catch (e) {
    console.error('[app-api] Loading board update error:', e);
  }
  let allDone = false;
  try {
    const updated = await getReportedTripIds(date, point);
    allDone = allTrips.every((t) => updated.has(t.id));
    if (allDone) await validateDay(user.id, date);
  } catch (e) {
    console.error('[app-api] validateDay error:', e);
  }

  skippedIds.add(trip.id);
  const summary = status === 'ABSENT' ? `☑ ${time} — absent (n-ai fost)` : `☑ ${time} — ${passengersCount} pas. (n-ai fost)`;
  return { next: nextTripId(allTrips, reportedIds, skippedIds), summary, allDone };
}
