/**
 * POST /app/v1/driver-photo { tripId, driverId, imageBase64, lat, lon } — poza
 * șoferului la cursă. Storage (soferi/<data>/<tripId>-<ts>.jpg) → Claude →
 * driver_appearance_checks cu verdictele modelului (*_model) și, inițial, aceleași
 * valori în uniform_ok/groomed_ok; POST /report le suprascrie cu ce confirmă
 * operatorul. Întoarce driverCheckId pe care /report îl cere la status OK.
 *
 * Nu se vede o persoană → 200 cu code 'NO_PERSON', fără linie în tabel, fișierul
 * se scoate din bucket (aplicația cere refacerea pozei).
 * Model indisponibil / răspuns stricat → verdict 'EROARE': linia se scrie cu
 * verdictele null, aplicația arată «necunoscut» și operatorul bifează manual.
 */
import { createDriverAppearanceCheck, getAllTripsForDirection, getDirectionForPoint } from '../services/db.js';
import { DRIVER_CHECK_MODEL, analyzeDriverPhoto } from '../services/driverCheck.js';
import { removeReportPhotos, uploadReportPhoto } from '../services/photoStorage.js';
import { getTodayDate } from '../utils.js';
import type { AppUser } from './auth.js';
import { ApiError, badRequest } from './errors.js';
import { decodeJpegBase64, parseCoords, requireId } from './photo.js';
import { asObject } from './server.js';

export interface DriverPhotoResponse {
  verdict: 'OK' | 'EROARE' | 'NO_PERSON';
  code?: 'NO_PERSON';
  driverCheckId: string | null;
  personVisible: boolean | null;
  uniformOk: boolean | null;
  groomedOk: boolean | null;
  description: string;
}

export function parseDriverPhotoBody(rawBody: unknown): { tripId: string; driverId: string | null; jpeg: Buffer; lat: number | null; lon: number | null } {
  const b = asObject(rawBody);
  const tripId = requireId(b.tripId, 'tripId');
  const driverId = b.driverId === undefined || b.driverId === null || b.driverId === '' ? null : requireId(b.driverId, 'driverId');
  const jpeg = decodeJpegBase64(b.imageBase64);
  const { lat, lon } = parseCoords(b);
  return { tripId, driverId, jpeg, lat, lon };
}

export async function postDriverPhoto(user: AppUser, rawBody: unknown): Promise<DriverPhotoResponse> {
  if (user.point !== 'CHISINAU') {
    throw new ApiError(403, 'NOT_CHISINAU', 'Poza șoferului se face doar la peronul din Chișinău');
  }
  const body = parseDriverPhotoBody(rawBody);
  const checkDate = getTodayDate();

  const trips = await getAllTripsForDirection(getDirectionForPoint(user.point));
  if (!trips.some((t) => t.id === body.tripId)) throw badRequest('Cursă necunoscută pentru punctul tău', 'UNKNOWN_TRIP');

  const storageKey = `soferi/${checkDate}/${body.tripId}-${Date.now()}.jpg`;
  await uploadReportPhoto(storageKey, body.jpeg);

  const result = await analyzeDriverPhoto(body.jpeg.toString('base64'));

  if (result.verdict === 'OK' && !result.personVisible) {
    try {
      await removeReportPhotos([storageKey]);
    } catch (e) {
      console.error('[app-api] removeReportPhotos error:', e);
    }
    return {
      verdict: 'NO_PERSON',
      code: 'NO_PERSON',
      driverCheckId: null,
      personVisible: false,
      uniformOk: null,
      groomedOk: null,
      description: result.description,
    };
  }

  const ok = result.verdict === 'OK' ? result : null;
  let driverCheckId: string;
  try {
    driverCheckId = await createDriverAppearanceCheck({
      check_date: checkDate,
      trip_id: body.tripId,
      driver_id: body.driverId,
      storage_key: storageKey,
      person_visible: ok ? ok.personVisible : null,
      uniform_ok_model: ok ? ok.uniformOk : null,
      groomed_ok_model: ok ? ok.groomedOk : null,
      uniform_ok: ok ? ok.uniformOk : null,
      groomed_ok: ok ? ok.groomedOk : null,
      description: result.description,
      model: DRIVER_CHECK_MODEL,
      location_lat: body.lat,
      location_lon: body.lon,
      created_by_user: user.id,
    });
  } catch (err: any) {
    if (err?.code === '23503') throw badRequest('Cursă sau șofer necunoscut', 'UNKNOWN_REFERENCE');
    throw err;
  }

  return {
    verdict: ok ? 'OK' : 'EROARE',
    driverCheckId,
    personVisible: ok ? ok.personVisible : null,
    uniformOk: ok ? ok.uniformOk : null,
    groomedOk: ok ? ok.groomedOk : null,
    description: result.description,
  };
}
