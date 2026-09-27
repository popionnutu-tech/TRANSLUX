// ION-99 pas 1a: goluri de semnal pe TOATĂ flota idealului — doar citire tracker (track), aceeași fereastră ca curse.mjs (04.05–26.09 fără
// 18.07–01.09, limitele = 03:00 locală prin inceputZiLucru). Pe fiecare dispozitiv din curse-ideal.json (c.dev), O interogare:
//   (1) histograma intervalelor dintre puncte consecutive cu coordonate valide (45–49 N, 26–31 E), pe perechi «în mișcare» (d > 0,05 km):
//       dt pe trepte; și distanța pe trepte pentru perechile cu dt ≤ 60 s (pasul normal);
//   (2) perechile-candidat de gol: dt > 60 s ȘI d > 0,3 km (prag de jos, larg; pragul final se alege din (1), în goluri-prag.mjs).
// 4 conexiuni în paralel. Ieșire: ../goluri-brute.json (sursa, salvată în dosarul v3.1), ../goluri-scan.stare (progres).
import pg from 'pg';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { inceputZiLucru } from '/root/lde-worker/drax/cod/ideal-v3.1/timp.mjs';
const DIR = '/root/lde-worker/drax/date/ideal-v3.1';
const C = JSON.parse(readFileSync(`${DIR}/curse-ideal.json`, 'utf8'));
const devs = [...new Set(C.curse.map(c => c.dev).filter(d => d != null).map(String))].sort();   // o cursă fără dispozitiv (350KAJ, dispozitiv.mjs) nu se scanează
import { existsSync, mkdirSync } from 'node:fs';
const PD = `${DIR}/proba/goluri-dev`; mkdirSync(PD, { recursive: true });   // un fișier pe dispozitiv: reluare fără a pierde ce e gata
const Q = z => inceputZiLucru(z).toISOString().replace('T', ' ').replace('Z', '');
const FROM = C.FROM, TO = C.TO, EX = C.EXCLUS;
const SQL = `WITH p AS (SELECT w_date, (floor(x::float8/100) + (x::float8 - floor(x::float8/100)*100)/60) lat, (floor(y::float8/100) + (y::float8 - floor(y::float8/100)*100)/60) lon, speed::float8*1.852 v
  FROM track WHERE id=$1 AND w_date>=$2 AND w_date<$3 AND NOT (w_date>=$4 AND w_date<$5)),
 pv AS (SELECT * FROM p WHERE lat > 45 AND lat < 49 AND lon > 26 AND lon < 31),
 q AS (SELECT w_date, lat, lon, v, lag(w_date) OVER w pt, lag(lat) OVER w plat, lag(lon) OVER w plon, lag(v) OVER w pv FROM pv WINDOW w AS (ORDER BY w_date)),
 r AS (SELECT w_date, pt, lat, lon, plat, plon, v, pv, extract(epoch from w_date - pt) dt, sqrt(power((lat-plat)*110.57,2) + power((lon-plon)*111.32*cos(radians(lat)),2)) d FROM q WHERE pt IS NOT NULL)
 SELECT 'dt' k, CASE WHEN dt<=10 THEN 10 WHEN dt<=15 THEN 15 WHEN dt<=20 THEN 20 WHEN dt<=30 THEN 30 WHEN dt<=45 THEN 45 WHEN dt<=60 THEN 60 WHEN dt<=90 THEN 90 WHEN dt<=120 THEN 120
   WHEN dt<=180 THEN 180 WHEN dt<=300 THEN 300 WHEN dt<=600 THEN 600 WHEN dt<=1800 THEN 1800 WHEN dt<=7200 THEN 7200 ELSE 99999 END::float8 b, count(*)::float8 n, sum(d) s,
   NULL::text t0, NULL::text t1, NULL::float8 dt, NULL::float8 d, NULL::float8 plat, NULL::float8 plon, NULL::float8 lat, NULL::float8 lon, NULL::float8 pv, NULL::float8 v FROM r WHERE d > 0.05 GROUP BY 1,2
 UNION ALL
 SELECT 'd60' k, CASE WHEN d<=0.25 THEN 0.25 WHEN d<=0.5 THEN 0.5 WHEN d<=0.75 THEN 0.75 WHEN d<=1 THEN 1 WHEN d<=1.5 THEN 1.5 WHEN d<=2 THEN 2 WHEN d<=3 THEN 3 WHEN d<=5 THEN 5 ELSE 999 END::float8 b, count(*)::float8 n, sum(d) s,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL FROM r WHERE dt <= 60 AND d > 0.05 GROUP BY 1,2
 UNION ALL
 SELECT 'gol', NULL, NULL, NULL, to_char(pt,'YYYY-MM-DD"T"HH24:MI:SS"Z"'), to_char(w_date,'YYYY-MM-DD"T"HH24:MI:SS"Z"'), dt, d, plat, plon, lat, lon, pv, v FROM r WHERE dt > 60 AND d > 0.3`;
const out = { rulat: new Date().toISOString(), sursa: 'tracker track, doar citire; fereastra curse-ideal (FROM/TO/EXCLUS)', FROM, TO, EXCLUS: EX, dispozitive: {} };
const stare = s => writeFileSync(`${DIR}/proba/goluri-scan.stare`, s + '\n', { flag: 'a' });
let next = 0, gata = 0;
async function lucrator() {
  const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
  await t.connect();
  while (next < devs.length) {
    const id = devs[next++]; const t0 = Date.now();
    if (existsSync(`${PD}/${id}.json`)) { out.dispozitive[id] = JSON.parse(readFileSync(`${PD}/${id}.json`, 'utf8')); gata++; continue; }
    const rows = (await t.query(SQL, [id, Q(FROM), Q(TO), Q(EX[0]), Q(EX[1])])).rows;
    const hist = rows.filter(r => r.k !== 'gol').map(r => ({ k: r.k, b: +r.b, n: +r.n, s: +(+r.s).toFixed(2) }));
    const goluri = rows.filter(r => r.k === 'gol').sort((a, b) => a.t1.localeCompare(b.t1)).map(r => ({ t0: r.t0, t1: r.t1, dt: +r.dt, d: +(+r.d).toFixed(3),
      a: [+(+r.plat).toFixed(6), +(+r.plon).toFixed(6)], b: [+(+r.lat).toFixed(6), +(+r.lon).toFixed(6)], va: +(+r.pv).toFixed(1), vb: +(+r.v).toFixed(1) }));
    out.dispozitive[id] = { hist, goluri }; gata++; writeFileSync(`${PD}/${id}.json`, JSON.stringify(out.dispozitive[id]));
    stare(`${gata}/${devs.length} dev ${id} ${((Date.now() - t0) / 1000).toFixed(0)} s goluri ${goluri.length} · ${new Date().toISOString()}`);
  }
  await t.end();
}
await Promise.all([lucrator(), lucrator(), lucrator(), lucrator()]);
writeFileSync(`${DIR}/proba/goluri-brute.json.tmp`, JSON.stringify(out)); renameSync(`${DIR}/proba/goluri-brute.json.tmp`, `${DIR}/proba/goluri-brute.json`);
stare(`GATA ${new Date().toISOString()}`);
