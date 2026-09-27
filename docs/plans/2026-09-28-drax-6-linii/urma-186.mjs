// ION-112 v15 Q1: urma unui tur D (186OMM) la Nihoreni, eșantion ~1 km: distanța de capăt și de poarta EST, opriri, localitatea.
import pg from 'pg';
import { readFileSync } from 'node:fs';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));
const D = '/root/lde-worker/drax/date/ideal-v4.3';
const O = JSON.parse(readFileSync(`${D}/obs-ideal.json`, 'utf8')); const obs = O.curse ?? O;
const SK = JSON.parse(readFileSync(`${D}/schelet-ideal.json`, 'utf8'));
const L = SK.find((e) => e.ruta === 'R3' && e.linie === 'Nihoreni'); const cap = { lat: L.capatC[0], lon: L.capatC[1] };
const EST = { lat: 47.78513, lon: 27.94307 };
const nmea = (v) => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
await t.connect();
const { rows: dv } = await t.query(`SELECT id,"CarName","RegNo" FROM devices`);
const canon = (s) => { const p = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const m = p.match(/^([A-Z]{3})(\d{3})$/); return m ? m[2] + m[1] : p; };
const Q = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);
const [m, zi, sens] = process.argv.slice(2);
const o = obs.find((x) => x.m === m && x.zi === zi && x.sens === sens && x.ruta === 'R3');
console.log('obs', o.t0, o.t1, 'plin', o.plin, 'km', o.km);
const ids = dv.filter((d) => canon(d.CarName) === m || canon(d.RegNo) === m).map((d) => d.id);
const { rows } = await t.query('SELECT w_date, x, y, speed FROM track WHERE id = ANY($1) AND w_date >= $2 AND w_date < $3 ORDER BY w_date', [ids, Q(Date.parse(o.t0) - 1800e3), Q(Date.parse(o.t1) + 600e3)]);
const P = rows.map((r) => ({ t: r.w_date.getTime(), lat: nmea(+r.x), lon: nmea(+r.y), v: +r.speed * 1.852 })).filter((p) => p.lat > 45);
let km = 0, next = 0;
for (let i = 0; i < P.length; i++) { if (i) { const d = hav(P[i - 1], P[i]); if (d <= 5) km += d; }
  if (km >= next || P[i].v < 8) { if (km >= next) next = Math.floor(km) + 1;
    console.log(new Date(P[i].t + 3 * 3600e3).toISOString().slice(11, 19), km.toFixed(1).padStart(5), 'cap', hav(P[i], cap).toFixed(1).padStart(5), 'EST', hav(P[i], EST).toFixed(1).padStart(5), P[i].v < 8 ? 'STOP' : '', P[i].lat.toFixed(4), P[i].lon.toFixed(4)); } }
await t.end();
