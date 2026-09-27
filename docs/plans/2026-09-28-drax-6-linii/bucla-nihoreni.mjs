// ION-112 v15 Q1: bucla de ~12 km a grupei D la Nihoreni — are opriri cu oameni? Picioarele septembrie R3 Nihoreni (obs-ideal v4.3), toate mașinile:
// porțiunea dintre prima și ultima trecere pe lângă capătul Nihoreni (≤ 0,8 km), km, opriri (< 8 km/h real = noduri × 1,852, 20 s – 15 min), unde.
import pg from 'pg';
import { readFileSync } from 'node:fs';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));
const D = '/root/lde-worker/drax/date/ideal-v4.3';
const O = JSON.parse(readFileSync(`${D}/obs-ideal.json`, 'utf8')); const obs = O.curse ?? O;
const SK = JSON.parse(readFileSync(`${D}/schelet-ideal.json`, 'utf8'));
const L = SK.find((e) => e.ruta === 'R3' && e.linie === 'Nihoreni'); const cap = { lat: L.capatC[0], lon: L.capatC[1] };
const nmea = (v) => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const ANCORA = Date.parse('2026-09-21T00:00:00Z');
const faza = (zi) => { const s = Math.floor((Date.parse(zi + 'T12:00:00Z') - ANCORA) / (7 * 864e5)); return (((s % 2) + 2) % 2) === 0 ? 'A' : 'B'; };
const grupa = (zi, sc) => (faza(zi) === 'A') === (sc === 's1') ? 'D' : 'EZ';
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
await t.connect();
const { rows: dv } = await t.query(`SELECT id,"CarName","RegNo" FROM devices`);
const canon = (s) => { const p = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const m = p.match(/^([A-Z]{3})(\d{3})$/); return m ? m[2] + m[1] : p; };
const Q = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);
const loc = new Map(); const locDe = async (p) => { const k = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`; if (!loc.has(k)) {
  try { const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${p.lat}&lon=${p.lon}&format=json&zoom=14`, { headers: { 'User-Agent': 'translux-lde/1.0' } }); const j = await r.json();
    loc.set(k, j.address?.village || j.address?.town || j.address?.city || j.name || '?'); await new Promise((s) => setTimeout(s, 1100)); } catch { loc.set(k, '?'); } } return loc.get(k); };
const rez = [];
for (const o of obs.filter((o) => o.ruta === 'R3' && o.linie === 'Nihoreni' && o.schimb && o.zi >= '2026-09-01')) {
  const ids = dv.filter((d) => canon(d.CarName) === o.m || canon(d.RegNo) === o.m).map((d) => d.id); if (!ids.length) continue;
  const { rows } = await t.query('SELECT w_date, x, y, speed FROM track WHERE id = ANY($1) AND w_date >= $2 AND w_date < $3 ORDER BY w_date', [ids, Q(Date.parse(o.t0) - 600e3), Q(Date.parse(o.t1) + 600e3)]);
  const P = rows.map((r) => ({ t: r.w_date.getTime(), lat: nmea(+r.x), lon: nmea(+r.y), v: +r.speed * 1.852 })).filter((p) => p.lat > 45);
  const inN = P.map((p) => hav(p, cap) <= 0.8); const i0 = inN.indexOf(true), i1 = inN.lastIndexOf(true);
  if (i0 < 0) continue;
  // bucla = porțiunea dintre ieșirea din zona capătului și reintrarea în ea
  let km = 0; const opr = []; let st = null, afara = false, maxD = 0;
  for (let i = i0 + 1; i <= i1; i++) { const p = P[i]; if (!inN[i]) afara = true; const d = hav(P[i - 1], p); if (d <= 5 && !inN[i]) km += d; maxD = Math.max(maxD, hav(p, cap));
    if (!inN[i] && p.v < 8) { st ??= p; st.u = p; } else { if (st && st.u.t - st.t >= 20e3 && st.u.t - st.t <= 900e3) opr.push(st); st = null; } }
  const sate = []; for (const s of opr.slice(0, 6)) sate.push(await locDe(s));
  rez.push({ m: o.m, zi: o.zi, sens: o.sens, grupa: grupa(o.zi, o.schimb), bucla: afara, kmBucla: +km.toFixed(1), maxDeCapat: +maxD.toFixed(1), opriri: opr.length, unde: [...new Set(sate)].join(',') });
}
await t.end();
for (const r of rez.sort((a, b) => (a.grupa + a.m + a.zi).localeCompare(b.grupa + b.m + b.zi))) console.log(Object.values(r).join(' | '));
for (const g of ['D', 'EZ']) { const q = rez.filter((r) => r.grupa === g); const b = q.filter((r) => r.bucla && r.kmBucla > 3);
  console.log(`${g}: picioare ${q.length}, cu buclă > 3 km ${b.length}, cu opriri în buclă ${b.filter((r) => r.opriri).length}, mașini ${[...new Set(b.map((r) => r.m))].join(' ')}`); }
