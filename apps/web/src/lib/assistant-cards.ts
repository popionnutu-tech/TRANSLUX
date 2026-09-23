// Cardurile trimise de central-hub sub mesajul asistentului (ION-39). Forma e cea din
// apps/admin/src/lib/site-assistant/cards.ts — cele două aplicații nu-și împart codul.

/** Prenumele șoferului, mașina și numărul lui (ION-39). */
export interface Crew { driver: string | null; plate: string | null; phone: string | null }

export type Card =
  | { type: 'trips'; from: string; to: string; date: string; total: number;
      trips: (Crew & { time: string; price: number | null })[] }
  | { type: 'station'; key: 'chisinau' | 'balti'; name_ro: string; name_ru: string;
      address_ro: string; address_ru: string; maps: string; waze: string }
  | { type: 'pick'; from: string; to: string; trips: (Crew & { departure: string; minutes_ago: number })[] }
  | ({ type: 'bus'; from: string; to: string; departure: string; lat: number; lon: number;
      near: string | null; at: string; maps: string } & Crew);

export const MAP_ZOOM = 13;

/**
 * Plăcile OpenStreetMap din jurul punctului, 3×3, fiecare cu deplasarea ei față de
 * centrul cutiei (unde stă acul). Punctul cade exact în centru la orice lățime a cardului.
 */
export function busTiles(lat: number, lon: number, zoom = MAP_ZOOM) {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const px = ((lon + 180) / 360) * n * 256;
  const py = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n * 256;
  const tx = Math.floor(px / 256);
  const ty = Math.floor(py / 256);
  const tiles: { src: string; dx: number; dy: number }[] = [];
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const x = tx + i;
      const y = ty + j;
      if (y < 0 || y >= n) continue;
      tiles.push({
        src: `https://tile.openstreetmap.org/${zoom}/${((x % n) + n) % n}/${y}.png`,
        dx: Math.round(x * 256 - px),
        dy: Math.round(y * 256 - py),
      });
    }
  }
  return { tiles, attribution: '© OpenStreetMap' };
}
