// 744ARF, turul de dimineață pe schimbul 1: minut cu minut, de la plecarea de acasă până la poartă
import pg from 'pg';
import { loadPlaces, buildPlacesIndex } from '/root/lde-worker/places-index.mjs';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));
const idx = buildPlacesIndex(loadPlaces('/root/lde-worker/places.geojsonseq'));
const nmea = (v) => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const HN = { lat: 47.8556, lon: 27.9067 }, EST = { lat: 47.78513, lon: 27.94307 };
const FMT = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const zile = process.argv.slice(2);
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
await t.connect();
const { rows: dv } = await t.query(`SELECT id,"CarName","RegNo" FROM devices WHERE "CarName" ILIKE '%744%ARF%' OR "RegNo" ILIKE '%744%ARF%'`);
const ids = dv.map((d) => d.id);
const rez = [];
for (const z of zile) {
  const a = `${z} 01:40:00`, b = `${z} 03:20:00`;
  const { rows } = await t.query('SELECT id, w_date, x, y, speed FROM track WHERE id = ANY($1) AND w_date >= $2 AND w_date < $3 ORDER BY w_date', [ids, a, b]);
  const pts = rows.map((r) => ({ t: r.w_date.getTime(), lat: nmea(+r.x), lon: nmea(+r.y), v: +r.speed })).filter((p) => p.lat > 45 && p.lat < 49);
  // în Hăsnășenii Noi (≤ 1,2 km de centru): cât timp, viteza minimă, câte opriri (< 8 km/h, ≥ 20 s)
  const inSat = pts.filter((p) => hav(p, HN) <= 1.2);
  let opriri = 0, st = null; for (const p of inSat) { if (p.v < 8) { st ??= p; } else { if (st && p.t - st.t >= 20e3) opriri++; st = null; } }
  const minV = inSat.length ? Math.min(...inSat.map((p) => p.v)) : null;
  const durata = inSat.length ? Math.round((inSat.at(-1).t - inSat[0].t) / 1000) : 0;
  const poarta = pts.find((p) => hav(p, EST) <= 0.9);
  const loc = (p) => idx.nearestWithin({ lat: p.lat, lon: p.lon }, 2)?.name ?? '·';
  const start = pts.find((p) => p.v > 10);
  rez.push(`${z}: pleacă ${start ? FMT.format(new Date(start.t)) + ' ' + loc(start) : '—'} · în Hăsnășenii Noi ${inSat.length ? FMT.format(new Date(inSat[0].t)) + '–' + FMT.format(new Date(inSat.at(-1).t)) : '—'} (${durata} s, viteza min ${minV ?? '—'}, opriri ${opriri}, ${inSat.length} puncte) · la poartă ${poarta ? FMT.format(new Date(poarta.t)) : '—'}`);
  if (z === zile[0]) for (const p of pts.filter((p, i) => i % 3 === 0)) console.log('   ', FMT.format(new Date(p.t)), String(p.v).padStart(3), 'km/h', loc(p), 'HN', hav(p, HN).toFixed(2), 'EST', hav(p, EST).toFixed(1));
}
await t.end();
console.log(rez.join('\n'));
