// Mejgorod (rutele interurbane nord ↔ Chișinău) — unelte comune ale lanțului (ION-55).
// Copiate din /root/lde-worker/route-shapes.mjs (ION-43), care rulează la import și nu poate fi importat;
// hav și dp sunt cele din km-core.mjs / geom-simplify.mjs, copiate ca lanțul să ruleze și în afara VPS-ului.
export const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
function distPunctLinie(p, a, b) {
  const dx = b.lon - a.lon, dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) return hav(p, a) * 1000;
  const t = Math.max(0, Math.min(1, ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy)));
  return hav(p, { lat: a.lat + t * dy, lon: a.lon + t * dx }) * 1000;
}
export function dp(pts, from, to, tolM) {
  if (to - from < 2) return [from, to];
  let idx = -1, max = 0;
  for (let i = from + 1; i < to; i++) { const d = distPunctLinie(pts[i], pts[from], pts[to]); if (d > max) { max = d; idx = i; } }
  if (max <= tolM) return [from, to];
  return [...dp(pts, from, idx, tolM).slice(0, -1), ...dp(pts, idx, to, tolM)];
}

export const nmea = (v) => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
export const normPlate = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const norm = (s) => String(s || '').replace(/\(.*?\)/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[şș]/g, 's').replace(/[ţț]/g, 't').replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();
export const MD = { latMin: 45.4, latMax: 48.6, lonMin: 26.6, lonMax: 30.2 };
export const inMd = (p) => p.lat > MD.latMin && p.lat < MD.latMax && p.lon > MD.lonMin && p.lon < MD.lonMax;
export const toMin = (s) => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/); const v = m ? +m[1] * 60 + +m[2] : 0; return v || null; };

/** «2026-09-22» + minute locale (pot trece de 1440) → Date UTC. Aceeași formulă ca în stop-times.mjs. */
export function localToUtc(date, minutes) {
  const h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
  const guess = Date.parse(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const local = new Date(guess).toLocaleString('sv-SE', { timeZone: 'Europe/Chisinau' }).replace(' ', 'T') + 'Z';
  return new Date(guess - (Date.parse(local) - guess) + Math.floor(minutes / 1440) * 864e5);
}
/** Parametru de timp către tracker: text UTC fără fus (w_date e «timestamp» fără fus cu ora UTC). */
export const utcText = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
/** Minutele locale (Chișinău) ale unui moment, 0..1439. */
export function localMin(ms) {
  const s = new Date(ms).toLocaleString('sv-SE', { timeZone: 'Europe/Chisinau' });
  return +s.slice(11, 13) * 60 + +s.slice(14, 16);
}
export const med = (a) => { const q = [...a].sort((x, y) => x - y); const n = q.length; return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : null; };

/** Peroanele (route-shapes.mjs): rutiera intră în gară și iese pe același drum. */
export const STATII = new Map([
  ['chisinau', { lat: 47.0237536, lon: 28.8627521 }],
  ['balti', { lat: 47.7697219, lon: 27.9417474 }],
  ['edinet', { lat: 48.1665595, lon: 27.3096485 }],
  ['briceni', { lat: 48.357826, lon: 27.092106 }],
  ['lipcani', { lat: 48.26297, lon: 26.805993 }],
  ['ocnita', { lat: 48.40768, lon: 27.487994 }],
  ['riscani', { lat: 47.949305, lon: 27.568182 }],
]);
export const GARA_M = 150, GARA_NET_M = 400;
export const departeDe = (p, line) => line.reduce((m, q) => Math.min(m, hav(p, q)), Infinity);

export function taieCarlige(pts, razaM = 60, inapoiKm = 8, pastreaza = []) {
  const out = [];
  const atingeGara = (from) => out.slice(from).some((q) => pastreaza.some((g) => hav(q, g) * 1000 <= GARA_M));
  for (const p of pts) {
    let cut = -1, back = 0;
    for (let j = out.length - 2; j >= 0; j--) {
      back += hav(out[j], out[j + 1]);
      if (back > inapoiKm) break;
      if (back > 0.15 && hav(out[j], p) * 1000 < razaM) cut = j;
    }
    if (cut >= 0 && !atingeGara(cut + 1)) out.length = cut + 1;
    out.push(p);
  }
  return out;
}
export function netezesteGari(pts, gari) {
  let out = pts;
  for (const g of gari) {
    const res = [];
    for (let i = 0; i < out.length; i++) {
      if (hav(out[i], g) * 1000 > GARA_NET_M) { res.push(out[i]); continue; }
      let j = i;
      while (j + 1 < out.length && hav(out[j + 1], g) * 1000 <= GARA_NET_M) j++;
      res.push(out[i]);
      if (out.slice(i, j + 1).some((q) => hav(q, g) * 1000 <= GARA_M)) res.push({ lat: g.lat, lon: g.lon });
      if (j > i) res.push(out[j]);
      i = j;
    }
    out = res;
  }
  return out;
}
export function taieVarfuri(pts, maxKm = 0.3, gari = [...STATII.values()]) {
  let out = pts, changed = true;
  while (changed) {
    changed = false;
    const res = [out[0]];
    for (let i = 1; i < out.length - 1; i++) {
      const a = res[res.length - 1], b = out[i], c = out[i + 1];
      const k = Math.cos((b.lat * Math.PI) / 180);
      const v1 = [(b.lon - a.lon) * k, b.lat - a.lat], v2 = [(c.lon - b.lon) * k, c.lat - b.lat];
      const n1 = Math.hypot(v1[0], v1[1]), n2 = Math.hypot(v2[0], v2[1]);
      const cos = n1 && n2 ? (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2) : 1;
      const gara = gari.some((g) => hav(b, g) * 1000 <= GARA_M);
      if (!gara && cos < -0.7 && (hav(a, b) < maxKm || hav(b, c) < maxKm)) { changed = true; continue; }
      res.push(b);
    }
    res.push(out[out.length - 1]);
    out = res;
  }
  return out;
}
export const lungime = (pts) => { let k = 0; for (let i = 1; i < pts.length; i++) k += hav(pts[i - 1], pts[i]); return k; };
