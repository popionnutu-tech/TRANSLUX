/**
 * POST /app/v1/skip { tripId } — «N-am fost la cursă»: operatorul marchează cursa
 * `next` ca sărită (Vitalie, 09.09: Aurel vine la 07:30 și nu poate raporta 06:55).
 *
 * Nu cere poze, nici GPS. Se poate sări DOAR cursa `next` (pentru 06:55 și 07:35 se
 * apasă de două ori) — altfel s-ar sări în bloc fără sens. Nu se scrie nimic în
 * `reports`: rândul intră în operator_trip_skips, cursa apare `skipped` în /day și
 * într-un rând al digestului de seară, cu numele operatorului.
 *
 * Refuzuri: 400 UNKNOWN_TRIP; 409 DAY_OFF (zi fără operator); 409 ALREADY_REPORTED
 * (cursa are raport); 409 ALREADY_SKIPPED (deja sărită, inclusiv 23505 la inserare);
 * 409 NOT_NEXT (nu e rândul ei).
 */
import { createTripSkip, getAllTripsForDirection, getDirectionForPoint, getReportedTripIds, getSkippedTripIds } from '../services/db.js';
import { formatTime, getTodayDate } from '../utils.js';
import type { AppUser } from './auth.js';
import { assertNotDayOff, nextTripId } from './dayState.js';
import { ApiError, badRequest } from './errors.js';
import { asObject } from './server.js';

export interface SkipResponse {
  /** Cursa care a devenit `next` după sărire; null când nu mai e niciuna. */
  next: string | null;
}

export function parseSkipBody(rawBody: unknown): { tripId: string } {
  const b = asObject(rawBody);
  if (typeof b.tripId !== 'string' || !b.tripId.trim()) throw badRequest('Lipsește tripId');
  return { tripId: b.tripId.trim() };
}

export async function postSkip(user: AppUser, rawBody: unknown): Promise<SkipResponse> {
  const { tripId } = parseSkipBody(rawBody);
  const point = user.point;
  const date = getTodayDate();
  assertNotDayOff(point, date);

  const [allTrips, reportedIds, skippedIds] = await Promise.all([
    getAllTripsForDirection(getDirectionForPoint(point)),
    getReportedTripIds(date, point),
    getSkippedTripIds(date, point),
  ]);
  const trip = allTrips.find((t) => t.id === tripId);
  if (!trip) throw badRequest('Cursă necunoscută pentru punctul tău', 'UNKNOWN_TRIP');
  if (reportedIds.has(trip.id)) throw new ApiError(409, 'ALREADY_REPORTED', 'Această cursă a fost deja înregistrată — nu se poate sări');
  if (skippedIds.has(trip.id)) throw new ApiError(409, 'ALREADY_SKIPPED', 'Ai marcat deja că n-ai fost la această cursă');

  const next = nextTripId(allTrips, reportedIds, skippedIds);
  if (next !== trip.id) {
    const nextTrip = allTrips.find((t) => t.id === next);
    throw new ApiError(
      409,
      'NOT_NEXT',
      nextTrip ? `Se poate sări doar cursa care urmează: ${formatTime(nextTrip.departure_time)}` : 'Toate cursele sunt închise',
    );
  }

  try {
    await createTripSkip({ skip_date: date, point, trip_id: trip.id, user_id: user.id });
  } catch (err: any) {
    if (err?.code === '23505') throw new ApiError(409, 'ALREADY_SKIPPED', 'Ai marcat deja că n-ai fost la această cursă');
    throw err;
  }
  console.log(`[app-api] ${user.name ?? user.id} n-a fost la cursa ${formatTime(trip.departure_time)} (${point})`);

  skippedIds.add(trip.id);
  return { next: nextTripId(allTrips, reportedIds, skippedIds) };
}
