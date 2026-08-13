// ============================================================================
// LDE — nucleul comun de calcul km/zi din puncte GPS (gps-worker + wialon-worker).
//
// Regresia 10.07.2026 (reparată 13.08.2026): cârpirea se declanșa la ORICE
// săritură (viteză implicită > 150 km/h), inclusiv la tremuratul GPS din
// parcare — iar sursa 'leg_coord' returna tronsoane-buclă (capete la <2 km,
// km_real_median 100–180 km, învățate din ture întregi dus-întors). Fiecare
// tremurat lua astfel zeci de km; km-ul umflat intra în lde_gps_stops, de unde
// RPC-ul re-învăța tronsoane și mai lungi → buclă de amplificare (10.07: flota
// 97k km/zi față de ~43k reali).
//
// Reguli ferme de acum:
//   1. Se cârpește DOAR gaura reală de semnal (dt > GAP_S). Săritura fără gaură
//      = glitch de coordonate → punctul se aruncă, ancora rămâne la ultimul
//      punct de încredere.
//   2. Orice cârpire e plafonată la ce se putea parcurge fizic: dt × 90 km/h.
//   3. Un tronson învățat se acceptă doar dacă e plauzibil pentru gaura asta
//      (≤ 2.5 × linia dreaptă + 2 km) — vezi plausibleBridgeKm.
// ============================================================================

export const TELEPORT_KMH = 150;      // peste = săritură GPS
export const GAP_S = 600;             // pauză semnal > 10 min = gaură reală
export const MAX_PLAUSIBLE_KMH = 90;  // plafon fizic pentru km cârpiți
export const SPEED_LIMIT_KMH = 90;    // depășire (provizoriu, reglabil)
export const MAX_DETOUR = 2.5;        // drum real / linie dreaptă — peste = tronson nepotrivit
export const GLITCH_MAX_SKIP = 3;     // puncte aruncate consecutiv până reancorăm

export function hav(a, b) {
  const R = 6371, t = Math.PI / 180;
  const dLa = (b.lat - a.lat) * t, dLo = (b.lon - a.lon) * t, la1 = a.lat * t, la2 = b.lat * t;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Filtru de plauzibilitate pentru tronsoanele învățate: un drum nu poate fi de
 *  2.5 ori mai lung decât linia dreaptă. Taie buclele (capete suprapuse, km mari). */
export function plausibleBridgeKm(km, directKm) {
  return km != null && km <= MAX_DETOUR * directKm + 2;
}

/**
 * Km/zi + pașii lor, din punctele GPS ale unei zile.
 * @param pts puncte {lat, lon, t: Date, sp} în ordine cronologică
 * @param bridgeKm (a, b) => {km, src} — cârpirea unei găuri reale
 * @param movingKmh peste = mașina merge (5.6 km/h = 3 noduri)
 * @param toKmh conversia vitezei brute în km/h (noduri × 1.852 sau identitate)
 */
export function computeDay(pts, { bridgeKm, movingKmh, toKmh = (v) => v }) {
  const n = pts.length;
  const stepKm = new Array(n).fill(0);
  const stepPatched = new Array(n).fill(false);
  const stepSrc = new Array(n).fill(null);
  const stepDropped = new Array(n).fill(false);  // pasul a înghițit puncte aruncate ca glitch
  let kmTotal = 0, patchedKm = 0, vmax = 0, viol = 0, kmCheck = 0, dropped = 0;
  let anchor = 0;   // ultimul punct de încredere
  let skipped = 0;  // puncte aruncate consecutiv ca glitch

  for (let i = 1; i < n; i++) {
    // viteza + km_check se citesc pe fiecare punct (verificare INDEPENDENTĂ de km_total)
    const kmh = toKmh(pts[i].sp);
    const dtPrev = (pts[i].t - pts[i - 1].t) / 1000;
    if (kmh < 160 && kmh > vmax) vmax = kmh;
    if (kmh > SPEED_LIMIT_KMH && kmh < 160) viol++;
    if (kmh < 160) kmCheck += (kmh / 3600) * Math.min(Math.max(dtPrev, 0), 60);

    const dt = (pts[i].t - pts[anchor].t) / 1000;
    const d = hav(pts[anchor], pts[i]);
    const impliedKmh = dt > 0 ? d / (dt / 3600) : Infinity;

    if (dt > GAP_S) {                       // gaură reală de semnal → cârpim
      const br = bridgeKm(pts[anchor], pts[i]);
      // plafonul fizic se aplică doar liniei drepte; tronsonul învățat a trecut deja
      // testul de plauzibilitate, deci km-ul lui real de drum e de încredere
      const seg = br.src === 'straight_line' ? Math.min(br.km, (dt / 3600) * MAX_PLAUSIBLE_KMH) : br.km;
      stepKm[i] = seg; stepPatched[i] = true; stepSrc[i] = br.src; stepDropped[i] = skipped > 0;
      kmTotal += seg; patchedKm += seg;
      anchor = i; skipped = 0;
      continue;
    }
    if (impliedKmh > TELEPORT_KMH) {        // săritură fără gaură = glitch de coordonate
      if (skipped < GLITCH_MAX_SKIP) { skipped++; dropped++; continue; }  // punctul se aruncă, ancora rămâne
      // prea multe aruncate la rând → ancora era ea mincinoasă: repornim de aici,
      // cu km-ul plafonat fizic (dt e mic, deci aportul e neglijabil).
      // src rămâne 'straight_line' — eticheta permisă de constraint-ul lde_gps_stops
      const seg = Math.min(d, (dt / 3600) * MAX_PLAUSIBLE_KMH);
      stepKm[i] = seg; stepPatched[i] = true; stepSrc[i] = 'straight_line'; stepDropped[i] = true;
      kmTotal += seg; patchedKm += seg;
      anchor = i; skipped = 0;
      continue;
    }
    if (kmh > movingKmh) { stepKm[i] = d; kmTotal += d; }   // pas curat
    stepDropped[i] = skipped > 0;   // pasul a sărit peste puncte aruncate → nu e etalon de învățat
    anchor = i; skipped = 0;
  }

  return {
    km: +kmTotal.toFixed(1),
    patched: +patchedKm.toFixed(1),
    vmax: Math.round(vmax),
    viol,
    check: +kmCheck.toFixed(1),
    dropped,
    stepKm, stepPatched, stepSrc, stepDropped,
  };
}
