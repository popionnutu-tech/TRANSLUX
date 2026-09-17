// Douglas–Peucker pentru urma unei curse. Parametri fixați în plan, nu aleși la
// implementare: toleranță 20 m, plafon 250 de puncte pe segment (dacă se depășește,
// toleranța crește până intră sub plafon). Ieșirea e MultiLineString — o parte pe
// secvență continuă de puncte acceptate: două puncte despărțite de o pauză de semnal
// NU sunt vecini, iar o dreaptă trasă peste gaură ar putea tăia raza unei porți.
import { hav } from './km-core.mjs';

export const TOLERANTA_M = 20;
export const PLAFON_PUNCTE = 250;

function distPunctLinie(p, a, b) {
  const dx = b.lon - a.lon, dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) return hav(p, a) * 1000;
  const t = Math.max(0, Math.min(1, ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy)));
  return hav(p, { lat: a.lat + t * dy, lon: a.lon + t * dx }) * 1000;
}

export function dp(pts, from, to, tolM) {
  if (to - from < 2) return [from, to];
  let idx = -1, max = 0;
  for (let i = from + 1; i < to; i++) {
    const d = distPunctLinie(pts[i], pts[from], pts[to]);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tolM) return [from, to];
  return [...dp(pts, from, idx, tolM).slice(0, -1), ...dp(pts, idx, to, tolM)];
}

/** MultiLineString GeoJSON pentru intervalul [from, to], tăiat la discontinuități. */
export function simplifica(pts, calc, from, to, tolM = TOLERANTA_M, plafon = PLAFON_PUNCTE) {
  const parti = [];
  let start = from;
  for (let i = from + 1; i <= to; i++) {
    if (!calc.stepAccepted[i] || calc.stepCut[i]) {
      if (i - 1 > start) parti.push([start, i - 1]);
      start = calc.stepAccepted[i] ? i : i + 1;
    }
  }
  if (to > start) parti.push([start, to]);

  const linii = [];
  for (const [a, b] of parti) {
    let tol = tolM, idxs = dp(pts, a, b, tol);
    while (idxs.length > plafon) { tol *= 2; idxs = dp(pts, a, b, tol); }
    if (idxs.length >= 2) linii.push(idxs.map((i) => [+pts[i].lon.toFixed(5), +pts[i].lat.toFixed(5)]));
  }
  return linii.length ? { type: 'MultiLineString', coordinates: linii } : null;
}
