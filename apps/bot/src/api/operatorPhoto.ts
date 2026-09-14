/**
 * POST /app/v1/operator-photo { imageBase64, lat, lon } — poza OPERATORULUI de peron
 * la deschiderea turei, făcută de un șofer (Ion, 14.09: «la început de smenă operatorul
 * să fie fotografiat de șofer, să se vadă că și el respectă uniforma»).
 *
 * Același drum ca la poza șoferului (driverPhoto.ts): Storage
 * (operator/<data>/<user>-<ts>.jpg) → Claude cu aceleași criterii → peron_operator_checks.
 * Verdictul e final. Nimeni în cadru → 200 NO_PERSON; cadru tăiat → 200 REFA_POZA cu
 * `message`; în ambele cazuri fără rând, fișierul se scoate. Model picat → EROARE cu
 * verdictele null (rândul există, nu blochează operatorul).
 *
 * O dată pe zi per operator: GET /day întoarce `operatorCheck` (prima poză acceptată);
 * poarta de dimineață din POST /report o cere de la aplicațiile care o cunosc
 * (antetul X-Peron-App ≥ 2, vezi server.ts) — aplicația veche nu e blocată.
 */
import { createOperatorCheck } from '../services/db.js';
import { DRIVER_CHECK_MODEL, analyzeDriverPhoto } from '../services/driverCheck.js';
import { removeReportPhotos, uploadReportPhoto } from '../services/photoStorage.js';
import { getTodayDate } from '../utils.js';
import type { AppUser } from './auth.js';
import { assertNotDayOff } from './dayState.js';
import type { DriverPhotoRetakeCode } from './driverPhoto.js';
import { ApiError } from './errors.js';
import { decodeJpegBase64, parseCoords } from './photo.js';
import { asObject } from './server.js';

export interface OperatorPhotoResponse {
  verdict: 'OK' | 'EROARE' | DriverPhotoRetakeCode;
  /** Prezent doar când poza trebuie refăcută; `message` spune de ce. */
  code?: DriverPhotoRetakeCode;
  message?: string;
  operatorCheckId: string | null;
  personVisible: boolean | null;
  frameOk: boolean | null;
  uniformOk: boolean | null;
  shavedOk: boolean | null;
  groomedOk: boolean | null;
  description: string;
}

export function parseOperatorPhotoBody(rawBody: unknown): { jpeg: Buffer; lat: number | null; lon: number | null } {
  const b = asObject(rawBody);
  const jpeg = decodeJpegBase64(b.imageBase64);
  const { lat, lon } = parseCoords(b);
  return { jpeg, lat, lon };
}

/** Mesajul pentru operator la refacerea pozei: ce a văzut modelul + cadrul cerut. */
export function operatorRetakeMessage(code: DriverPhotoRetakeCode, description: string): string {
  const seen = description.trim();
  const lead = code === 'NO_PERSON' ? 'Nu se vede nicio persoană în poză.' : 'Poza nu te arată întreg.';
  return `${seen || lead} Refă poza: dă telefonul unui șofer — tu din față, întreg, să se vadă încălțămintea și capul.`;
}

export async function postOperatorPhoto(user: AppUser, rawBody: unknown): Promise<OperatorPhotoResponse> {
  if (user.point !== 'CHISINAU') {
    throw new ApiError(403, 'NOT_CHISINAU', 'Poza operatorului se face doar la peronul din Chișinău');
  }
  const body = parseOperatorPhotoBody(rawBody);
  const checkDate = getTodayDate();
  assertNotDayOff(user.point, checkDate);

  const storageKey = `operator/${checkDate}/${user.id}-${Date.now()}.jpg`;
  await uploadReportPhoto(storageKey, body.jpeg);

  const result = await analyzeDriverPhoto(body.jpeg.toString('base64'), 'operator');
  const who = user.name ?? user.id;
  if (result.verdict === 'EROARE') {
    console.warn(`[operator-photo] ${who} → EROARE (modelul n-a răspuns): ${result.description}`);
  } else if (result.personVisible && result.frameOk) {
    console.log(`[operator-photo] ${who} → uniformă=${result.uniformOk} bărbierit=${result.shavedOk} aspect=${result.groomedOk}: ${result.description}`);
  }

  if (result.verdict === 'OK' && (!result.personVisible || !result.frameOk)) {
    const code: DriverPhotoRetakeCode = result.personVisible ? 'REFA_POZA' : 'NO_PERSON';
    console.warn(`[operator-photo] ${who} → ${code}: ${result.description}`);
    try {
      await removeReportPhotos([storageKey]);
    } catch (e) {
      console.error('[app-api] removeReportPhotos error:', e);
    }
    return {
      verdict: code,
      code,
      message: operatorRetakeMessage(code, result.description),
      operatorCheckId: null,
      personVisible: result.personVisible,
      frameOk: false,
      uniformOk: null,
      shavedOk: null,
      groomedOk: null,
      description: result.description,
    };
  }

  const ok = result.verdict === 'OK' ? result : null;
  const operatorCheckId = await createOperatorCheck({
    check_date: checkDate,
    user_id: user.id,
    storage_key: storageKey,
    person_visible: ok ? ok.personVisible : null,
    uniform_ok: ok ? ok.uniformOk : null,
    shaved_ok: ok ? ok.shavedOk : null,
    groomed_ok: ok ? ok.groomedOk : null,
    description: result.description,
    model: DRIVER_CHECK_MODEL,
    location_lat: body.lat,
    location_lon: body.lon,
  });

  return {
    verdict: ok ? 'OK' : 'EROARE',
    operatorCheckId,
    personVisible: ok ? ok.personVisible : null,
    frameOk: ok ? ok.frameOk : null,
    uniformOk: ok ? ok.uniformOk : null,
    shavedOk: ok ? ok.shavedOk : null,
    groomedOk: ok ? ok.groomedOk : null,
    description: result.description,
  };
}
