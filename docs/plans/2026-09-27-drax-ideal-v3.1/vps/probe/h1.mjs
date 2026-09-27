// ION-99 proba: distribuția intervalelor între puncte consecutive (dt, distanță, viteză implicită) pe câteva dispozitive — doar citire tracker
import pg from 'pg';
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
await t.connect();
const ids = process.argv.slice(2);
const sql = `WITH p AS (SELECT w_date, (floor(x::float8/100) + (x::float8 - floor(x::float8/100)*100)/60) lat, (floor(y::float8/100) + (y::float8 - floor(y::float8/100)*100)/60) lon, speed::float8*1.852 v
  FROM track WHERE id=$1 AND w_date >= '2026-09-01 00:00' AND w_date < '2026-09-26 00:00'),
 q AS (SELECT w_date, lat, lon, v, lag(w_date) OVER w pt, lag(lat) OVER w plat, lag(lon) OVER w plon, lag(v) OVER w pv FROM p WINDOW w AS (ORDER BY w_date)),
 r AS (SELECT extract(epoch from w_date - pt) dt, sqrt(power((lat-plat)*110.57,2) + power((lon-plon)*111.32*cos(radians(lat)),2)) d, v, pv FROM q WHERE pt IS NOT NULL)
 SELECT CASE WHEN dt<=15 THEN 'a ≤15' WHEN dt<=30 THEN 'b ≤30' WHEN dt<=60 THEN 'c ≤60' WHEN dt<=120 THEN 'd ≤120' WHEN dt<=300 THEN 'e ≤300' WHEN dt<=600 THEN 'f ≤600' WHEN dt<=1800 THEN 'g ≤1800' WHEN dt<=7200 THEN 'h ≤7200' ELSE 'i >7200' END b,
  count(*) n, sum(CASE WHEN d > 0.05 THEN 1 ELSE 0 END) mis, sum(CASE WHEN d > 0.5 THEN 1 ELSE 0 END) d05, sum(CASE WHEN d > 1 THEN 1 ELSE 0 END) d1, sum(CASE WHEN d > 2 THEN 1 ELSE 0 END) d2, sum(CASE WHEN d > 5 THEN 1 ELSE 0 END) d5,
  round(sum(d)::numeric,1) dsum
 FROM r GROUP BY 1 ORDER BY 1`;
for (const id of ids) { const t0 = Date.now(); const { rows } = await t.query(sql, [id]); console.log(`dev ${id} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); console.table(rows); }
await t.end();
