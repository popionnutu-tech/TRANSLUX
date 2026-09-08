/**
 * Partea pură a endpoint-urilor cu poze (cleaning-photo, driver-photo): decodarea
 * base64-ului, verificarea că e JPEG (primele 3 octeți FF D8 FF), limita de 6 MB
 * decodat și coordonatele opționale. Fără DB, fără rețea — testată în cleaning.test.ts.
 */
import { badRequest } from './errors.js';

export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

/** JPEG = SOI (FF D8) urmat de un marker (FF xx). */
export function isJpeg(buf: Uint8Array): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/**
 * `imageBase64` din corp → Buffer JPEG. Acceptă și prefixul `data:image/jpeg;base64,`.
 * 400 la câmp lipsă, base64 stricat, alt format decât JPEG sau peste MAX_PHOTO_BYTES.
 */
export function decodeJpegBase64(raw: unknown, maxBytes = MAX_PHOTO_BYTES): Buffer {
  if (typeof raw !== 'string' || raw.trim() === '') throw badRequest('Lipsește imageBase64', 'PHOTO_REQUIRED');
  let text = raw.trim();
  const comma = text.indexOf(',');
  if (text.startsWith('data:') && comma > 0) text = text.slice(comma + 1);
  // base64 → octeți ≈ 3/4; verificăm înainte de decodare ca să nu alocăm 8 MB degeaba
  if (text.length > Math.ceil((maxBytes * 4) / 3) + 4) {
    throw badRequest(`Poza depășește ${Math.round(maxBytes / 1024 / 1024)} MB`, 'PHOTO_TOO_LARGE');
  }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(text)) throw badRequest('imageBase64 nu e base64 valid', 'BAD_PHOTO');
  const buf = Buffer.from(text, 'base64');
  if (buf.length === 0) throw badRequest('imageBase64 nu e base64 valid', 'BAD_PHOTO');
  if (buf.length > maxBytes) {
    throw badRequest(`Poza depășește ${Math.round(maxBytes / 1024 / 1024)} MB`, 'PHOTO_TOO_LARGE');
  }
  if (!isJpeg(buf)) throw badRequest('Poza trebuie să fie JPEG', 'NOT_JPEG');
  return buf;
}

export interface Coords {
  lat: number | null;
  lon: number | null;
}

/** lat/lon opționale, ca la /report: vin împreună sau deloc, în intervalul geografic. */
export function parseCoords(b: Record<string, unknown>): Coords {
  const lat = numOrNull(b.lat, 'lat');
  const lon = numOrNull(b.lon, 'lon');
  if ((lat === null) !== (lon === null)) throw badRequest('lat și lon vin împreună sau deloc');
  if (lat !== null && (Math.abs(lat) > 90 || Math.abs(lon!) > 180)) throw badRequest('lat/lon în afara intervalului');
  return { lat, lon };
}

function numOrNull(v: unknown, field: string): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw badRequest(`${field} trebuie să fie număr`);
  return v;
}

/** Un id de rând (uuid) sau o eroare 400 cu numele câmpului. */
export function requireId(v: unknown, field: string): string {
  if (typeof v !== 'string' || !/^[0-9a-f-]{36}$/i.test(v.trim())) throw badRequest(`${field} lipsește sau nu e valid`);
  return v.trim();
}
