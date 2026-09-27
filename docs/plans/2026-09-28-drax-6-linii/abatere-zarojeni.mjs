// ION-112 r4: unde se abate turul de dimineață (faza B) de la drumul de seară (faza A) la Zarojeni — puncte la > 0,5 km de urma de referință,
// cu opririle (< 8 km/h real, ≥ 20 s) din abatere și satul cel mai apropiat din nomenclator.
import pg from 'pg';
import { readFileSync } from 'node:fs';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));
const D = '/root/lde-worker/drax/date/ideal-v4.3';
const O = JSON.parse(readFileSync(`${D}/obs-ideal.json`, 'utf8')); const obs = O.curse ?? O;
const N = JSON.parse(readFileSync(`${D}/nomenclator.json`, 'utf8'));
const sate = []; JSON.stringify(N, (k, v) => { if (v && typeof v === 'object' && typeof v.lat === 'number' && (v.nume || v.sat || v.name)) sate.push({ n: v.nume || v.sat || v.name, lat: v.lat, lon: v.lon }); return v; });
const nmea = (v) => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
await t.connect();
const { rows: dv } = await t.query(`SELECT id,"CarName","RegNo" FROM devices`);
const canon = (s) => { const p = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const m = p.match(/^([A-Z]{3})(\d{3})$/); return m ? m[2] + m[1] : p; };
const ids = (m) => dv.filter((d) => canon(d.CarName) === m || canon(d.RegNo) === m).map((d) => d.id);
const Q = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);
const urma = async (m, zi, sens) => { const o = obs.find((x) => x.m === m && x.zi === zi && x.sens === sens && x.schimb);
  const { rows } = await t.query('SELECT w_date, x, y, speed FROM track WHERE id = ANY($1) AND w_date >= $2 AND w_date < $3 ORDER BY w_date', [ids(m), Q(Date.parse(o.t0) - 600e3), Q(Date.parse(o.t1) + 60e3)]);
  return rows.map((r) => ({ t: r.w_date.getTime(), lat: nmea(+r.x), lon: nmea(+r.y), v: +r.speed * 1.852 })).filter((p) => p.lat > 45); };
const ref = [...await urma('348KAJ', '2026-09-22', 'tur'), ...await urma('348KAJ', '2026-09-21', 'tur')];
const aproape = (p) => sate.map((s) => ({ ...s, d: hav(p, s) })).sort((a, b) => a.d - b.d)[0];
const ora = (x) => new Date(x + 3 * 3600e3).toISOString().slice(11, 16);
for (const [m, zi] of [['348KAJ', '2026-09-17'], ['763LYY', '2026-09-15'], ['763LYY', '2026-09-18'], ['348KAJ', '2026-09-24']]) {
  const P = await urma(m, zi, 'tur'); let km = 0, bloc = null; const blocuri = [];
  for (let i = 1; i < P.length; i++) { const p = P[i], d = hav(P[i - 1], p); const dev = Math.min(...ref.map((r) => hav(r, p))) > 0.5;
    if (dev) { bloc ??= { a: p, km: 0, stop: [] }; if (d <= 5) bloc.km += d; if (p.v < 8) bloc.stop.push(p); bloc.b = p; } else if (bloc) { blocuri.push(bloc); bloc = null; } }
  if (bloc) blocuri.push(bloc);
  console.log(`== ${m} ${zi} tur`);
  for (const b of blocuri.filter((b) => b.km > 0.3)) { const s = aproape(b.stop[0] ?? b.a);
    console.log(`  abatere ${ora(b.a.t)}–${ora(b.b.t)} ${b.km.toFixed(1)} km · opriri ${b.stop.length} · lângă ${s?.n} (${s?.d.toFixed(1)} km) · ${b.a.lat.toFixed(4)},${b.a.lon.toFixed(4)} → ${b.b.lat.toFixed(4)},${b.b.lon.toFixed(4)}`); }
}
await t.end();
