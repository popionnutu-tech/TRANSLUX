// ION-99: ordinea punctelor cu același w_date — care ordonare reproduce km din curse-ideal (doar citire tracker, câteva curse)
import pg from 'pg';
import { readFileSync } from 'node:fs';
const DIR = '/root/lde-worker/drax/date/ideal-v3.1';
const R = JSON.parse(readFileSync(`${DIR}/carpire-raport.json`, 'utf8')), GC = JSON.parse(readFileSync(`${DIR}/goluri-curse.json`, 'utf8'));
const nmea = v => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r; const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const km = rows => { const P = rows.map(r => ({ lat: nmea(+r.x), lon: nmea(+r.y) })).filter(p => p.lat > 45 && p.lat < 49 && p.lon > 26 && p.lon < 31); let s = 0; for (let i = 1; i < P.length; i++) { const d = hav(P[i - 1], P[i]); if (d < 5) s += d; } return s.toFixed(2); };
const txt = x => new Date(x).toISOString().replace('T', ' ').replace('Z', '');
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
await t.connect();
for (const s of R.statistica.nepotrivite.filter((_, i) => [0, 7, 16, 29, 30].includes(i))) {
  const k = s.split(': ')[0]; const g = GC.find(x => `${x.m}|${x.dev}|${x.t0}` === k); const want = s.match(/≠ ([\d.]+)/)[1]; const out = [];
  for (const ord of ['w_date', 'w_date, ctid', 'w_date, ctid DESC']) { const { rows } = await t.query(`SELECT w_date,x,y FROM track WHERE id=$1 AND w_date>=$2 AND w_date<=$3 ORDER BY ${ord}`, [String(g.dev), txt(g.t0), txt(g.t1)]); out.push(`${ord}: ${km(rows)}`); }
  console.log(k, 'dorit', want, '|', out.join(' | '));
}
await t.end();
