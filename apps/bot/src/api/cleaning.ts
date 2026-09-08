/**
 * POST /app/v1/cleaning-photo { slot, zone, imageBase64, lat, lon } — o poză de
 * curățenie din aplicație (camera, nu galeria). Același drum ca în bot după
 * descărcarea din Telegram: Storage → Claude → peron_cleaning_checks, cu
 * source 'app' și coordonatele telefonului. Răspunsul poartă și zonele închise
 * pe (azi, tură), ca aplicația să știe ce mai lipsește pentru poarta 06:55/16:25.
 */
import type { CleaningSlot, CleaningZone } from '@translux/db';
import { getCleaningZonesDone } from '../services/db.js';
import { CLEANING_ZONES, checkCleaningBuffer, type CleaningResult } from '../services/cleaningCheck.js';
import { getTodayDate } from '../utils.js';
import type { AppUser } from './auth.js';
import { ApiError, badRequest } from './errors.js';
import { decodeJpegBase64, parseCoords } from './photo.js';
import { asObject } from './server.js';

export const CLEANING_SLOTS: readonly CleaningSlot[] = ['DIMINEATA', 'ZIUA'];

export interface CleaningPhotoResponse extends CleaningResult {
  zonesDone: CleaningZone[];
}

export function parseCleaningBody(rawBody: unknown): { slot: CleaningSlot; zone: CleaningZone; jpeg: Buffer; lat: number | null; lon: number | null } {
  const b = asObject(rawBody);
  const slot = b.slot;
  if (typeof slot !== 'string' || !(CLEANING_SLOTS as readonly string[]).includes(slot)) {
    throw badRequest('slot trebuie să fie DIMINEATA sau ZIUA');
  }
  const zone = b.zone;
  if (typeof zone !== 'string' || !(CLEANING_ZONES as readonly string[]).includes(zone)) {
    throw badRequest('zone trebuie să fie PERON, PIETONI sau VECEU');
  }
  const jpeg = decodeJpegBase64(b.imageBase64);
  const { lat, lon } = parseCoords(b);
  return { slot: slot as CleaningSlot, zone: zone as CleaningZone, jpeg, lat, lon };
}

export async function postCleaningPhoto(user: AppUser, rawBody: unknown): Promise<CleaningPhotoResponse> {
  if (user.point !== 'CHISINAU') {
    throw new ApiError(403, 'NOT_CHISINAU', 'Pozele de curățenie se fac doar la peronul din Chișinău');
  }
  const body = parseCleaningBody(rawBody);
  const checkDate = getTodayDate();

  const result = await checkCleaningBuffer({
    checkDate,
    slot: body.slot,
    zone: body.zone,
    jpeg: body.jpeg,
    userId: user.id,
    source: 'app',
    lat: body.lat,
    lon: body.lon,
  });

  let zonesDone: CleaningZone[] = [];
  try {
    zonesDone = Array.from(await getCleaningZonesDone(checkDate, body.slot));
  } catch (e) {
    console.error('[app-api] getCleaningZonesDone error:', e);
  }

  return { ...result, zonesDone };
}
