// ION-124 r1 · s5: fereastra scheletului (ideal-v4.3/obs-ideal.json, 04.05–17.07 + 01.09–25.09) — pe fiecare linie a celor
// 11 rute cu oraș în act: turul/returul opresc în oraș? de ce parte a capătului? cu câți km dincolo de capăt?
// opr[] din curse.mjs = un rând pe fiecare trecere pe lângă un loc OSM (≤ 0,8 km), păstrat dacă vmin < 8 km/h și ≥ 20 s lent.
// Partea: tur — km < kmCap − 0,8 = înaintea capătului (DINCOLO, dinspre poartă), km ≥ kmCap − 0,8 = pe drum spre poartă;
//         retur — km > kmCap + 0,8 = dincolo; altfel pe drum.
// Rulare: node /tmp/ion124-s5.mjs > s5-fereastra.json
import fs from 'fs';
const O = JSON.parse(fs.readFileSync('/root/lde-worker/drax/date/ideal-v4.3/obs-ideal.json', 'utf8'));
const S = JSON.parse(fs.readFileSync('/root/lde-worker/drax/date/saptamanal/2026-09-14/schelet-ideal.json', 'utf8'));
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const nk = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const ORASE = { R19: ['Sîngerei'], R9: ['Glodeni'], R3: ['Rîșcani'], R16: ['Florești', 'Mărculești'], R17: ['Mărculești'], R23: ['Fălești'],
  R21: ['Biruința'], R15: ['Drochia'], R31: ['Ghindești'], R8: ['Costești'], R1: ['Dondușeni'] };
const C = { 'Sîngerei': [47.636085, 28.1455434], 'Glodeni': [47.7744001, 27.50441], 'Rîșcani': [47.9535987, 27.5514453], 'Florești': [47.8938318, 28.2996474],
  'Mărculești': [47.8693441, 28.2415422], 'Fălești': [47.5735141, 27.7068016], 'Biruința': [47.8114451, 28.066453], 'Drochia': [48.0318141, 27.8157233],
  'Ghindești': [47.8623849, 28.3870348], 'Costești': [47.8582386, 27.2582159], 'Dondușeni': [48.2374994, 27.610869] };
const med = (a) => { const q = [...a].sort((x, y) => x - y); const n = q.length; return n ? +(n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2).toFixed(1) : null; };
const out = {};
for (const c of O.curse) {
  const oras = ORASE[c.ruta]; if (!oras) continue;
  const k = `${c.ruta}|${c.linie}`; const L = out[k] ??= { n: {}, dincolo: {}, peDrum: {}, niciuna: {}, kmDincolo: { tur: [], retur: [] }, dCapatOras: null, pctDincolo: {}, lunile: {} };
  const s = c.sens; L.n[s] = (L.n[s] ?? 0) + 1;
  const inOras = c.opr.filter((o) => oras.some((n) => nk(o.n) === nk(n) || hav(o, { lat: C[n][0], lon: C[n][1] }) <= 2.5));
  const dinc = inOras.filter((o) => s === 'tur' ? o.km < c.kmCap - 0.8 : o.km > c.kmCap + 0.8);
  const drum = inOras.filter((o) => !dinc.includes(o));
  if (dinc.length) { L.dincolo[s] = (L.dincolo[s] ?? 0) + 1; L.kmDincolo[s].push(s === 'tur' ? c.kmCap - Math.min(...dinc.map((o) => o.km)) : Math.max(...dinc.map((o) => o.km)) - c.kmCap);
    const luna = c.zi.slice(0, 7); L.lunile[luna] = (L.lunile[luna] ?? 0) + 1; }
  if (drum.length) L.peDrum[s] = (L.peDrum[s] ?? 0) + 1;
  if (!inOras.length) L.niciuna[s] = (L.niciuna[s] ?? 0) + 1;
}
for (const [k, L] of Object.entries(out)) {
  const [r, lin] = k.split('|'); const e = S.find((x) => x.ruta === r && x.linie === lin);
  if (e?.capatC) L.dCapatOras = Object.fromEntries(ORASE[r].map((n) => [n, +hav({ lat: e.capatC[0], lon: e.capatC[1] }, { lat: C[n][0], lon: C[n][1] }).toFixed(1)]));
  L.schelet = e ? (e.faraIdeal ? 'fără ideal' : { capat: e.capat, km: e.km, poarta: e.poarta, tureZi: e.tureZi }) : 'absentă';
  for (const s of ['tur', 'retur']) { L.pctDincolo[s] = L.n[s] ? Math.round(100 * (L.dincolo[s] ?? 0) / L.n[s]) : null; L.kmDincolo[s] = { n: L.kmDincolo[s].length, med: med(L.kmDincolo[s]) }; }
}
console.log(JSON.stringify(out, null, 1));
