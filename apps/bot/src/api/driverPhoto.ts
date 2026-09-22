/**
 * POST /app/v1/driver-photo { tripId, driverId, imageBase64, lat, lon } — poza
 * șoferului la cursă. Storage (soferi/<data>/<tripId>-<ts>.jpg) → Claude →
 * driver_appearance_checks cu verdictele modelului. Verdictul e final (Ion, 08.09:
 * «aplicația fixează, operatorul doar face poza»): *_model și uniform_ok/groomed_ok
 * primesc aceleași valori, POST /report le copiază în `reports` și ignoră ce trimite
 * aplicația. Întoarce driverCheckId pe care /report îl cere la status OK.
 * `driverId` din corp se scrie în driver_id: pe el GET /day întoarce `driverChecks`
 * (prima poză acceptată de azi per șofer), iar poza e valabilă la toate cursele
 * șoferului din ziua aceea (Ion, 09.09: «o dată pe zi per șofer»).
 *
 * Nu se vede o persoană → 200 cu code 'NO_PERSON'; cadrul nu e cel cerut (din față,
 * întreg, încălțăminte → cap) → 200 cu code 'REFA_POZA' și `message` cu ce lipsește.
 * În ambele cazuri nu se scrie nimic, fișierul se scoate din bucket, aplicația cere
 * refacerea pozei.
 * Model indisponibil / răspuns stricat → verdict 'EROARE': linia se scrie cu
 * verdictele null, raportul se scrie cu null — nu se inventează.
 *
 * Identitate (migr. 381, Ion 19.09: «să nu poată pune alt om în poză operatorul ca
 * să închidă, dar nu tare rigid»): după cadrul bun, poza se compară cu referințele
 * șoferului (driverIdentity.ts). «nu» sigur → 200 cu code 'ALT_OM', dar cel mult o
 * dată pe șofer pe zi; rândul RĂMÂNE cu rejected_code='ALT_OM' și fișierul în
 * bucket (proba), adminul primește poza. A doua oară trece, marcată, tot cu poză la
 * admin. «nesigur», fără referințe sau model căzut → trece. «da» sigur → poate
 * intra la referințe.
 *
 * Șoferul FĂRĂ etaloane (Ion, 22.09): poza trece ca până acum, dar pleacă la admin
 * o dată pe zi, cu «verificați că e chiar el». Fără referințe nu există comparație,
 * deci un nume ales greșit din listă trecea în tăcere — așa au stat pozele lui
 * Marian Ion pe Popovici Anatol și pe Bzovii Alexandr, cu penalități de aspect pe
 * oameni care nici n-au fost la cursă.
 */
import type { DriverReferencePhoto } from '@translux/db';
import { escapeHtml, sendAdminPhoto } from '../services/adminAlert.js';
import {
  countDriverChecksToday,
  countIdentityBlocksToday,
  createDriverAppearanceCheck,
  getAllTripsForDirection,
  getDirectionForPoint,
  getDriverName,
  isDriverBeardExempt,
  listDriverReferences,
} from '../services/db.js';
import { DRIVER_CHECK_MODEL, analyzeDriverPhoto } from '../services/driverCheck.js';
import { altOmMessage, compareDriverIdentity, shouldBlockIdentity, isReferenceWorthy, type IdentityResult } from '../services/driverIdentity.js';
import { loadReferenceImages, maybeAddReference } from '../services/driverReferences.js';
import { removeReportPhotos, uploadReportPhoto } from '../services/photoStorage.js';
import { getTodayDate } from '../utils.js';
import type { AppUser } from './auth.js';
import { assertNotDayOff } from './dayState.js';
import { ApiError, badRequest } from './errors.js';
import { decodeJpegBase64, parseCoords, requireId } from './photo.js';
import { asObject } from './server.js';

export type DriverPhotoRetakeCode = 'NO_PERSON' | 'REFA_POZA' | 'ALT_OM';

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

interface IdentityOutcome {
  result: IdentityResult | null;
  refs: DriverReferencePhoto[];
  refsUsed: number;
  block: boolean;
  /** Șoferul chiar n-are niciun etalon (nu o eroare de citire) — n-avem cu ce compara. */
  noReferences: boolean;
}

/** Comparația cu referințele; fără referințe sau fără șofer → nimic. Nu aruncă. */
async function checkIdentity(driverId: string | null, jpeg: Buffer, checkDate: string): Promise<IdentityOutcome> {
  const none: IdentityOutcome = { result: null, refs: [], refsUsed: 0, block: false, noReferences: false };
  if (!driverId) return none;
  try {
    const refs = await listDriverReferences(driverId);
    if (refs.length === 0) return { ...none, noReferences: true };
    const images = await loadReferenceImages(refs);
    if (images.length === 0) return { ...none, refs };
    const result = await compareDriverIdentity(images.map((i) => i.base64), jpeg.toString('base64'));
    const blocksToday = result.verdict === 'OK' && result.same === 'nu' ? await countIdentityBlocksToday(driverId, checkDate) : 0;
    return { result, refs, refsUsed: images.length, block: shouldBlockIdentity(result, blocksToday), noReferences: false };
  } catch (err) {
    console.error('[driver-photo] verificarea identității a picat:', err);
    return none;
  }
}

function identityColumns(o: IdentityOutcome) {
  const r = o.result;
  return {
    identity_verdict: r?.verdict === 'OK' ? r.same : null,
    identity_confidence: r?.verdict === 'OK' ? r.confidence : null,
    identity_reason: r?.verdict === 'OK' ? r.reason : (r?.description ?? null),
    identity_refs: o.refsUsed,
  };
}

export async function postDriverPhoto(user: AppUser, rawBody: unknown): Promise<DriverPhotoResponse> {
  if (user.point !== 'CHISINAU') {
    throw new ApiError(403, 'NOT_CHISINAU', 'Poza șoferului se face doar la peronul din Chișinău');
  }
  const body = parseDriverPhotoBody(rawBody);
  const checkDate = getTodayDate();
  assertNotDayOff(user.point, checkDate);

  const trips = await getAllTripsForDirection(getDirectionForPoint(user.point));
  if (!trips.some((t) => t.id === body.tripId)) throw badRequest('Cursă necunoscută pentru punctul tău', 'UNKNOWN_TRIP');

  const storageKey = `soferi/${checkDate}/${body.tripId}-${Date.now()}.jpg`;
  await uploadReportPhoto(storageKey, body.jpeg);

  // Scutirea medicală de bărbierit (migr. 358): verdictul modelului rămâne în
  // descriere, dar nu mai cade pe șofer și nu mai intră în groomed_ok.
  const beardExempt = await isDriverBeardExempt(body.driverId);
  const result = await analyzeDriverPhoto(body.jpeg.toString('base64'), 'driver', { beardExempt });
  const who = `${user.name ?? user.id} cursa ${body.tripId.slice(-4)}`;
  if (result.verdict === 'EROARE') {
    console.warn(`[driver-photo] ${who} → EROARE (modelul n-a răspuns): ${result.description}`);
  } else if (result.personVisible && result.frameOk) {
    console.log(`[driver-photo] ${who} → uniformă=${result.uniformOk} bărbierit=${result.shavedOk}${beardExempt ? ' (scutit)' : ''} aspect=${result.groomedOk}: ${result.description}`);
  }

  // Poza trebuie refăcută: nimeni în cadru sau cadrul nu e cel cerut. Fără rând, fără fișier.
  if (result.verdict === 'OK' && (!result.personVisible || !result.frameOk)) {
    const code: DriverPhotoRetakeCode = result.personVisible ? 'REFA_POZA' : 'NO_PERSON';
    // Ion (09.09): «să vedem motivele» — fiecare refuz rămâne în jurnal cu ce a văzut modelul.
    console.warn(`[driver-photo] ${who} → ${code}: ${result.description}`);
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

  // Identitatea se judecă doar pe cadru bun (la EROARE de aspect nu știm ce e în poză).
  const identity: IdentityOutcome =
    result.verdict === 'OK'
      ? await checkIdentity(body.driverId, body.jpeg, checkDate)
      : { result: null, refs: [], refsUsed: 0, block: false, noReferences: false };
  if (identity.result?.verdict === 'OK') {
    console.log(`[driver-photo] ${who} identitate → ${identity.result.same} (${identity.result.confidence.toFixed(2)}, ${identity.refsUsed} ref.)${identity.block ? ' → ALT_OM' : ''}: ${identity.result.reason}`);
  } else if (identity.result) {
    console.warn(`[driver-photo] ${who} identitate → EROARE: ${identity.result.description}`);
  }

  const ok = result.verdict === 'OK' ? result : null;
  // Verdictele care intră în raport: uniform_ok = uniforma; groomed_ok = bărbierit
  // && aspect îngrijit. La șoferul scutit medical, «bărbierit» vine deja true din
  // parseDriverAnswer, deci barba nu mai trage groomed_ok în jos și nu mai costă.
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
      ...identityColumns(identity),
      rejected_code: identity.block ? 'ALT_OM' : null,
    });
  } catch (err: any) {
    if (err?.code === '23503') throw badRequest('Cursă sau șofer necunoscut', 'UNKNOWN_REFERENCE');
    throw err;
  }

  // «nu» — refuzat sau trecut a doua oară — ajunge la admin cu poza, ca probă.
  if (identity.result?.verdict === 'OK' && identity.result.same === 'nu') {
    const driverName = await getDriverName(body.driverId);
    const head = identity.block ? '🚫 Poză refuzată operatorului' : '⚠️ Poză trecută, dar persoana nu pare a fi șoferul';
    await sendAdminPhoto(
      body.jpeg,
      `${head}\nȘofer: <b>${escapeHtml(driverName ?? '?')}</b> · operator: ${escapeHtml(user.name ?? user.id)} · ${checkDate}\n` +
        `Modelul: ${escapeHtml(identity.result.reason)} (${Math.round(identity.result.confidence * 100)}%)`,
    );
  }

  // Șoferul fără etaloane: n-avem cu ce compara, deci un nume ales greșit din listă
  // trece în tăcere. Ion, 22.09: poza lui Marian Ion a stat o săptămână pe Popovici
  // Anatol, cu 30 de lei pe el, fiindcă Popovici n-avea nicio referință. Poza nu se
  // refuză (Ion, 19.09: «nu tare rigid») — pleacă la admin, o dată pe zi per șofer,
  // ca cineva să vadă cine a fost pus acolo.
  if (body.driverId && identity.noReferences) {
    const driverName = await getDriverName(body.driverId);
    const trip = trips.find((t) => t.id === body.tripId);
    const cursa = trip ? [trip.departure_time.slice(0, 5), trip.route_name].filter(Boolean).join(' ') : body.tripId.slice(-4);
    const first = (await countDriverChecksToday(body.driverId, checkDate).catch(() => 1)) <= 1;
    if (first) {
      await sendAdminPhoto(
        body.jpeg,
        `👤 Șofer fără etaloane — verificați că e chiar el\n` +
          `Șofer: <b>${escapeHtml(driverName ?? '?')}</b> · operator: ${escapeHtml(user.name ?? user.id)} · ${checkDate} · cursa ${escapeHtml(cursa)}\n` +
          `Poza n-a avut cu ce fi comparată; dacă e altcineva, mutați verificarea pe omul potrivit.`,
      );
    }
  }

  if (identity.block) {
    const driverName = await getDriverName(body.driverId);
    const reason = identity.result?.verdict === 'OK' ? identity.result.reason : '';
    return {
      verdict: 'ALT_OM',
      code: 'ALT_OM',
      message: altOmMessage(driverName, reason),
      driverCheckId: null,
      personVisible: true,
      frameOk: true,
      uniformOk: null,
      shavedOk: null,
      groomedOk: null,
      description: result.description,
    };
  }

  // Poza confirmată «da» sigur împrospătează referințele (când sunt puține sau vechi).
  if (body.driverId && identity.result && isReferenceWorthy(identity.result)) {
    await maybeAddReference(body.driverId, identity.refs, { id: driverCheckId, storage_key: storageKey, check_date: checkDate });
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
