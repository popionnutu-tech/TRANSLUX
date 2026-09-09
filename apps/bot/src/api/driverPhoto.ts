/**
 * POST /app/v1/driver-photo { tripId, driverId, imageBase64, lat, lon } — poza
 * șoferului la cursă. Storage (soferi/<data>/<tripId>-<ts>.jpg) → Claude →
 * driver_appearance_checks cu verdictele modelului. Verdictul e final (Ion, 08.09:
 * «aplicația fixează, operatorul doar face poza»): *_model și uniform_ok/groomed_ok
 * primesc aceleași valori, POST /report le copiază în `reports` și ignoră ce trimite
 * aplicația. Întoarce driverCheckId pe care /report îl cere la status OK.
 *
 * Nu se vede o persoană → 200 cu code 'NO_PERSON'; cadrul nu e cel cerut (din față,
 * întreg, încălțăminte → cap) → 200 cu code 'REFA_POZA' și `message` cu ce lipsește.
 * În ambele cazuri nu se scrie nimic, fișierul se scoate din bucket, aplicația cere
 * refacerea pozei.
 * Model indisponibil / răspuns stricat → verdict 'EROARE': linia se scrie cu
 * verdictele null, raportul se scrie cu null — nu se inventează.
 */
import { createDriverAppearanceCheck, getAllTripsForDirection, getDirectionForPoint } from '../services/db.js';
import { DRIVER_CHECK_MODEL, analyzeDriverPhoto } from '../services/driverCheck.js';
import { removeReportPhotos, uploadReportPhoto } from '../services/photoStorage.js';
import { getTodayDate } from '../utils.js';
import type { AppUser } from './auth.js';
import { ApiError, badRequest } from './errors.js';
import { decodeJpegBase64, parseCoords, requireId } from './photo.js';
import { asObject } from './server.js';

export type DriverPhotoRetakeCode = 'NO_PERSON' | 'REFA_POZA';

export interface DriverPhotoResponse {
  verdict: 'OK' | 'EROARE' | DriverPhotoRetakeCode;
  /** Prezent doar când poza trebuie refăcută; `message` spune de ce. */
  code?: DriverPhotoRetakeCode;
  message?: string;
  driverCheckId: string | null;
  personVisible: boolean | null;
  frameOk: boolean | null;
  uniformOk: boolean | null;
  shavedOk: boolean | null;
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

/** Mesajul pentru operator la refacerea pozei: ce a văzut modelul + cadrul cerut. */
export function retakeMessage(code: DriverPhotoRetakeCode, description: string): string {
  const seen = description.trim();
  const lead = code === 'NO_PERSON' ? 'Nu se vede nicio persoană în poză.' : 'Poza nu arată tot șoferul.';
  return `${seen || lead} Refă poza: șoferul din față, întreg, să se vadă încălțămintea și capul.`;
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
  if (result.verdict === 'EROARE') {
    console.warn(`[driver-photo] ${user.name ?? user.id} cursa ${body.tripId.slice(-4)} → EROARE (modelul n-a răspuns): ${result.description}`);
  } else if (result.personVisible && result.frameOk) {
    console.log(`[driver-photo] ${user.name ?? user.id} cursa ${body.tripId.slice(-4)} → uniformă=${result.uniformOk} bărbierit=${result.shavedOk} aspect=${result.groomedOk}: ${result.description}`);
  }

  // Poza trebuie refăcută: nimeni în cadru sau cadrul nu e cel cerut. Fără rând, fără fișier.
  if (result.verdict === 'OK' && (!result.personVisible || !result.frameOk)) {
    const code: DriverPhotoRetakeCode = result.personVisible ? 'REFA_POZA' : 'NO_PERSON';
    // Ion (09.09): «să vedem motivele» — fiecare refuz rămâne în jurnal cu ce a văzut modelul.
    console.warn(`[driver-photo] ${user.name ?? user.id} cursa ${body.tripId.slice(-4)} → ${code}: ${result.description}`);
    try {
      await removeReportPhotos([storageKey]);
    } catch (e) {
      console.error('[app-api] removeReportPhotos error:', e);
    }
    return {
      verdict: code,
      code,
      message: retakeMessage(code, result.description),
      driverCheckId: null,
      personVisible: result.personVisible,
      frameOk: false,
      uniformOk: null,
      shavedOk: null,
      groomedOk: null,
      description: result.description,
    };
  }

  const ok = result.verdict === 'OK' ? result : null;
  // Verdictele care intră în raport: uniform_ok = uniforma; groomed_ok = bărbierit && aspect îngrijit.
  const uniformOk = ok ? ok.uniformOk : null;
  const groomedOk = ok ? ok.shavedOk && ok.groomedOk : null;
  let driverCheckId: string;
  try {
    driverCheckId = await createDriverAppearanceCheck({
      check_date: checkDate,
      trip_id: body.tripId,
      driver_id: body.driverId,
      storage_key: storageKey,
      person_visible: ok ? ok.personVisible : null,
      uniform_ok_model: uniformOk,
      groomed_ok_model: groomedOk,
      uniform_ok: uniformOk,
      groomed_ok: groomedOk,
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
    frameOk: ok ? ok.frameOk : null,
    uniformOk,
    shavedOk: ok ? ok.shavedOk : null,
    groomedOk: ok ? ok.groomedOk : null,
    description: result.description,
  };
}
