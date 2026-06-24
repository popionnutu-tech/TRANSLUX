// ============================================================================
// LDE — REGULI GEO (etalon rute, abateri marsrut, etichetare sate)
//
// ⚠️ REGULĂ FERMĂ — NU repeta eroarea identificată 23.06.2026.
//
// EROAREA: a calcula km-ul / geometria-etalon a unei rute RUTÂND PRIN CENTRELE
// satelor (geocodate) forțează mașina să INTRE-ȘI-IASĂ din fiecare sat → km umflați.
// Caz real: Briceni→Mărcăuți ≈ 20 km de facto (autobuzul stă pe drumul principal,
// NU intră în sate; oprește la răscrucea/intrarea satului). Rutarea forțată prin
// centrele satelor a dat 25 km — FALS. Centrul satului ≠ punct pe drum.
//
// REGULILE (de respectat în worker-ul geo + oriunde se calculează geometrie/km):
//  1. NU calcula km/geometria-etalon rutând prin centrele satelor. NICIODATĂ.
//  2. Geometria-etalon = URMA GPS REALĂ a autobuzului, map-matched cu Valhalla.
//     Se construiește din prima cursă reală, când curge GPS-ul. Asta e adevărul.
//  3. Satele = ETICHETE (deservite-în-apropiere), NU puncte de rutare. Marchezi
//     un sat ca "pe traseu" dacă urma trece în pragul LDE_GEO_VILLAGE_PROXIMITY_KM
//     de nodul lui OSM — separat de construirea drumului.
//  4. Până la GPS, km AUTORITAR = cifra reală (operator / odometru / suburban_routes),
//     NU una calculată de Valhalla din nume de sate.
//  5. Etichetarea satelor = noduri OSM LOCALE (din PBF-ul Moldovei), NU Nominatim —
//     nearest-node local e mai precis pe traseu (a găsit corect Tabani/Trestieni
//     pe care Nominatim le ratase atribuindu-le la satul administrativ mai mare).
//
// Pe scurt: ETALON DIN GPS, SATE = ETICHETE, NU RUTĂM PRIN CENTRE.
// ============================================================================

/** Prag (km) pentru a eticheta un sat drept "deservit pe traseu" — vezi Regula 3.
 *  NU se folosește pentru a construi drumul, doar pentru etichetare. */
export const LDE_GEO_VILLAGE_PROXIMITY_KM = 2.0;

/** Sursa autoritară a geometriei-etalon a unei rute. Vezi Regula 2.
 *  'gps_trace' = corect (map-matched din urmă reală). 'operator_km' = provizoriu
 *  (cifră declarată, fără geometrie). NICIODATĂ 'routed_centroids'. */
export type LdeGeoEtalonSource = 'gps_trace' | 'operator_km';

/** Distanța haversine (km) între două puncte [lat, lon]. Pură. Folosită la
 *  etichetarea satelor (Regula 3) și la verificări de proximitate. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const la1 = (a[0] * Math.PI) / 180;
  const la2 = (b[0] * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)) * 100) / 100;
}

/** Etichetează satele deservite de-a lungul unei urme (puncte [lat,lon]) folosind
 *  noduri OSM locale (Regula 3 + 5). Întoarce numele satelor în ordine, deduplicate.
 *  NU construiește drumul — doar etichetează ce e aproape de urmă. */
export function labelVillagesAlong(
  trace: Array<[number, number]>,
  osmPlaces: Array<{ name: string; lat: number; lon: number }>,
  proximityKm: number = LDE_GEO_VILLAGE_PROXIMITY_KM,
): string[] {
  const out: string[] = [];
  for (const [lat, lon] of trace) {
    let best: string | null = null;
    let bestD = Infinity;
    for (const p of osmPlaces) {
      const d = haversineKm([lat, lon], [p.lat, p.lon]);
      if (d < bestD) {
        bestD = d;
        best = p.name;
      }
    }
    if (best && bestD <= proximityKm && (out.length === 0 || out[out.length - 1] !== best)) {
      out.push(best);
    }
  }
  return out;
}
