// Ideal-v3.1 (ION-99) pasul 1e-b — URMELE BRUTE ale curselor cu gol, doar citire din tracker (track), DOAR pentru cursele din
// goluri-curse.json; sursa se salvează în dosarul v3.1 (urme-gol.json: pe cheia m|dev|t0, punctele [w_date UTC, x, y, speed] brute, ca
// cârpirea să refacă exact calculul din curse.mjs). Rulat o dată; cârpirea nu mai citește trackerul.
//   cd /root/lde-worker/drax/cod/ideal-v4 && node --env-file=/root/lde-worker/.env urme-gol.mjs
import pg from 'pg';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
pg.types.setTypeParser(1114, v => new Date(v.replace(' ', 'T') + 'Z'));   // w_date e UTC fără fus (curse.mjs:14)
const DIR = '../../date/ideal-v4.1';
const GC = JSON.parse(readFileSync(`${DIR}/goluri-curse.json`, 'utf8'));
const txt = t => new Date(t).toISOString().replace('T', ' ').replace('Z', '');
const out = { rulat: new Date().toISOString(), sursa: 'tracker track, doar citire, intervalul [t0, t1] al fiecărei curse cu gol, pe dispozitivul ei', urme: {} };
let next = 0, n = 0;
async function lucrator() {
  const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
  await t.connect();
  while (next < GC.length) { const c = GC[next++];
    const { rows } = await t.query(`SELECT w_date,x,y,speed FROM track WHERE id=$1 AND w_date>=$2 AND w_date<=$3 ORDER BY w_date`, [String(c.dev), txt(c.t0), txt(c.t1)]);
    out.urme[`${c.m}|${c.dev}|${c.t0}`] = rows.map(r => [r.w_date.toISOString(), r.x, r.y, r.speed]); n++; }
  await t.end();
}
await Promise.all([lucrator(), lucrator(), lucrator(), lucrator()]);
writeFileSync(`${DIR}/urme-gol.json.tmp`, JSON.stringify(out)); renameSync(`${DIR}/urme-gol.json.tmp`, `${DIR}/urme-gol.json`);
console.log(`urme citite: ${n} curse · puncte ${Object.values(out.urme).reduce((s, u) => s + u.length, 0)}`);
