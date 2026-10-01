// Mejgorod — unde doarme fiecare mașină în fiecare noapte: ULTIMUL punct trimis înainte de ora 03 (Chișinău) a zilei
// (tracker-ul transmite doar cu motorul pornit, deci la 03 nu e niciun punct; ultimul punct din seară e parcarea).
// O cerere mică, indexată, pe mașină × zi — varianta cu EXTRACT pe 100 de zile scana toată urma și nu se termina.
//   cd /root/lde-worker/mejgorod/cod && node --env-file=../../.env parcare.mjs → ../date/parcare.json
import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
import { nmea, normPlate, inMd, localToUtc, utcText } from './geo.mjs';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));
const SUFIX = process.env.SUFIX || '';
const N = JSON.parse(readFileSync(`../date/nomenclator${SUFIX}.json`, 'utf8'));
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: +(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB });
await t.connect();
const { rows: devs } = await t.query(`SELECT id, "CarName", "RegNo" FROM devices`);
const byPlate = new Map();
for (const d of devs) for (const p of new Set([normPlate(d.CarName), normPlate(d.RegNo)])) { if (!p) continue; if (!byPlate.has(p)) byPlate.set(p, []); byPlate.get(p).push(d.id); }
const plates = [...new Set(N.atribuiri.map((a) => a.m))];
const zile = []; for (let d = Date.parse(N.FROM); d <= Date.parse(N.TO) + 864e5; d += 864e5) zile.push(new Date(d).toISOString().slice(0, 10));
const out = {}; let n = 0;
for (const m of plates) {
  const ids = byPlate.get(normPlate(m)); if (!ids) continue;
  out[m] = {};
  for (const z of zile) {
    const t03 = localToUtc(z, 3 * 60).getTime();
    const { rows } = await t.query(`SELECT x, y, w_date FROM track WHERE id = ANY($1) AND w_date > $2 AND w_date <= $3 AND x < 9000 AND y < 9000 ORDER BY w_date DESC LIMIT 1`, [ids, utcText(t03 - 10 * 36e5), utcText(t03)]);
    if (!rows.length) continue;
    const p = { lat: +nmea(+rows[0].x).toFixed(5), lon: +nmea(+rows[0].y).toFixed(5) };
    if (inMd(p)) { out[m][z] = [p.lat, p.lon, rows[0].w_date.toISOString().slice(11, 16)]; n++; }
  }
  console.log(`${m.padEnd(8)} ${Object.keys(out[m]).length} nopți`);
}
await t.end();
writeFileSync(`../date/parcare${SUFIX}.json`, JSON.stringify(out));
console.log(`gata: ${n} nopți`);
