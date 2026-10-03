// Sursa UNICĂ a plăcilor de hartă de pe translux.md (ION-206): harta «Acum» (NowResults) și
// harta din chatul asistentului (BusMap) iau de aici URL-ul, atribuirea și Leaflet-ul.
//
// Ion, 03.10 («site ultrafast», punctul 7): «furnizor cu CDN în loc de tile.openstreetmap.org».
// Verificat pe viu, 03.10, 08:20: Carto Voyager/light FĂRĂ cheie întoarce placa «API KEY REQUIRED»
// (2049 B, carto.com/basemaps/apikey) — nu e variantă fără cheie. tile.openstreetmap.org e DEJA
// pe CDN-ul Fastly (x-served-by: cache-sof…-SOF — nodul din Sofia), 66–160 ms de aici, cu
// max-age de 6 zile; osm.de/osm.fr 200–670 ms fără CDN; Esri (CloudFront) 77–265 ms, alt aspect.
// Rămâne OSM, cu preconnect. Alt furnizor (cu cheie, când Ion o ia) = doar variabilele de mediu
// de mai jos la build, fără cod: NEXT_PUBLIC_MAP_TILE_URL și NEXT_PUBLIC_MAP_TILE_ATTRIBUTION.
// CSP-ul (next.config.js, img-src … https:) lasă orice furnizor https.

export const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || '© OpenStreetMap';
export const TILE_MAX_ZOOM = 18;

/** Originea serverului de plăci, pentru preconnect: `{s}` → primul subdomeniu obișnuit. */
export function tileOrigin(): string {
  try { return new URL(TILE_URL.replace('{s}', 'a')).origin; } catch { return ''; }
}

let preconnected = false;
/**
 * Deschide legătura TLS cu serverul de plăci ÎNAINTE să existe harta (în paralel cu Leaflet și cu
 * cererea datelor). Fără `crossorigin`: Leaflet încarcă plăcile ca <img> simplu, iar o legătură
 * deschisă în mod CORS nu s-ar refolosi pentru ele.
 */
export function preconnectTiles(): void {
  if (preconnected || typeof document === 'undefined') return;
  preconnected = true;
  const origin = tileOrigin();
  if (!origin) return;
  for (const rel of ['preconnect', 'dns-prefetch']) {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = origin;
    document.head.appendChild(link);
  }
}

export type Leaflet = typeof import('leaflet');
let leaflet: Promise<Leaflet> | null = null;
/** Leaflet se descarcă o singură dată pe pagină; chemat la deschiderea filei, nu după ce vin datele. */
export function loadLeaflet(): Promise<Leaflet> {
  return (leaflet ??= import('leaflet').then((m) => m.default));
}
