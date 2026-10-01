// Mejgorod — cursele reale din GPS: pentru fiecare rută × sens × zi din grafic, urma mașinii în
// fereastra cursei, tăiată între capete, cu km, acoperirea opririlor și trecerea pe la fiecare oprire (ION-55).
// Tăietura și filtrele sunt cele din route-shapes.mjs (ION-43); aici se păstrează TOATE zilele, nu doar cea mai bună.
//   cd /root/lde-worker/mejgorod/cod && nohup node --env-file=../../.env curse.mjs > ../curse.log 2>&1 &
import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
import { hav, dp, nmea, normPlate, inMd, toMin, localToUtc, utcText, departeDe, STATII, GARA_M } from './geo.mjs';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));

const SUFIX = process.env.SUFIX || '';   // '-sapt' = fișierele săptămânale, lângă cele ale scheletului
const N = JSON.parse(readFileSync(`../date/nomenclator${SUFIX}.json`, 'utf8'));
const PE_LANGA_KM = 3, TRECERE_KM = 3.0;   // trecerea se notează până la 3 km (satul de lângă șosea); «atinsă» (≤1 km) se judecă în etalon.mjs
const DOAR = process.argv.find((a) => a.startsWith('--ruta='))?.slice(7);

const t = new pg.Client({ host: process.env.TRACKER_HOST, port: +(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB });
await t.connect();
const { rows: devs } = await t.query(`SELECT id, "CarName", "RegNo" FROM devices`);
const devsByPlate = new Map();
for (const d of devs) for (const p of new Set([normPlate(d.CarName), normPlate(d.RegNo)])) {
  if (!p) continue; if (!devsByPlate.has(p)) devsByPlate.set(p, []); devsByPlate.get(p).push(d.id);
}

// punctele unei mașini într-o zi (00:00 local → 04:00 a doua zi), o singură cerere pe mașină-zi
const cache = new Map();
async function ziua(plate, date) {
  const k = `${plate}|${date}`; if (cache.has(k)) return cache.get(k);
  const ids = devsByPlate.get(plate); if (!ids?.length) { cache.set(k, null); return null; }
  const from = localToUtc(date, 0), to = localToUtc(date, 28 * 60);
  const { rows } = await t.query(`SELECT w_date, x, y, speed FROM track WHERE id = ANY($1) AND w_date BETWEEN $2 AND $3 AND x < 9000 AND y < 9000 ORDER BY w_date`, [ids, utcText(from.getTime()), utcText(to.getTime())]);
  const pts = rows.map((r) => ({ lat: nmea(+r.x), lon: nmea(+r.y), at: r.w_date.getTime(), v: r.speed == null ? null : +r.speed })).filter(inMd);
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  cache.set(k, pts); return pts;
}

const curse = [], faraTracker = new Set(); let n = 0, sarite = 0;
const rute = new Map(N.rute.map((r) => [r.id, r]));
for (const a of N.atribuiri) {
  if (DOAR && String(a.r) !== DOAR) continue;
  const r = rute.get(a.r); const plate = normPlate(a.m);
  if (!devsByPlate.has(plate)) { faraTracker.add(a.m); continue; }
  const hourKey = a.s === 'tur' ? 'hN' : 'hC';
  const stops = (a.s === 'tur' ? r.opriri : [...r.opriri].reverse());
  const inOrder = stops.map((s) => toMin(s[hourKey])).filter((x) => x != null);
  if (inOrder.length < 2) { sarite++; continue; }
  for (let i = 1; i < inOrder.length; i++) while (inOrder[i] < inOrder[i - 1] - 12 * 60) inOrder[i] += 1440;
  const m0 = inOrder[0], m1 = inOrder[inOrder.length - 1];
  if (m1 <= m0) { sarite++; continue; }
  const from = localToUtc(a.z, m0).getTime() - 30 * 6e4, to = localToUtc(a.z, m1).getTime() + 90 * 6e4;
  const all = await ziua(plate, a.z); if (!all) continue;
  const raw = all.filter((p) => p.at >= from && p.at <= to);
  // punctele fără tremur pe loc, fără salturi (route-shapes.mjs)
  const pts = [];
  for (const p of raw) {
    if (p.v != null && p.v < 5 && pts.length) continue;
    const q = pts[pts.length - 1];
    if (q) { const d = hav(p, q), h = (p.at - q.at) / 36e5; if (d < 0.015) continue; if (h > 0 && d / h > 150) continue; }
    pts.push(p);
  }
  const onTrip = stops.filter((s) => s.lat != null && toMin(s[hourKey]) != null).map((s) => ({ ...s, pt: { lat: s.lat, lon: s.lon } }));
  const rec = { r: a.r, s: a.s, z: a.z, m: a.m, n: pts.length, motiv: null };
  if (pts.length < 50) { rec.motiv = `${pts.length} puncte`; curse.push(rec); continue; }
  if (onTrip.length < 2) { rec.motiv = 'sub 2 opriri cu oră'; curse.push(rec); continue; }
  const A = onTrip[0].pt, B = onTrip[onTrip.length - 1].pt;
  // Capetele REALE ale cursei, nu ale graficului: mașina nu ajunge mereu la ultima oprire din grafic (ruta 24 se
  // termină la Briceni, nu la Criva Vama), iar după capăt merge acasă — uneori înapoi pe drum (ruta 1: Lipcani →
  // Colicăuți). Deci cursa se termină la oprirea cea mai AVANSATĂ în ordinea graficului pe lângă care trece urma, în
  // punctul cel mai apropiat de ea, și începe la oprirea cea mai din urmă atinsă înainte de asta.
  const prog = pts.map((p) => { let b = -1, bd = PE_LANGA_KM; onTrip.forEach((s, j) => { const d = hav(p, s.pt); if (d <= bd) { bd = d; b = j; } }); return b; });
  const firstNear = prog.findIndex((x) => x >= 0);
  if (firstNear < 0) { rec.motiv = 'urma nu trece pe lângă nicio oprire'; curse.push(rec); continue; }
  let jB = -1; for (let i = firstNear; i < pts.length; i++) if (prog[i] > jB) jB = prog[i];
  const Br = onTrip[jB].pt;
  let iB = pts.findIndex((p, i) => i >= firstNear && hav(p, Br) <= PE_LANGA_KM);
  for (let i = iB + 1; i < pts.length && hav(pts[i], Br) <= PE_LANGA_KM; i++) if (hav(pts[i], Br) < hav(pts[iB], Br)) iB = i;
  let jA = jB; for (let i = 0; i <= iB; i++) if (prog[i] >= 0 && prog[i] < jA) jA = prog[i];
  const Ar = onTrip[jA].pt;
  let iA = -1; for (let i = iB - 1; i >= 0; i--) if (hav(pts[i], Ar) <= PE_LANGA_KM) { iA = i; break; }
  if (iA < 0) iA = firstNear;
  for (let i = iA - 1; i >= 0 && hav(pts[i], Ar) <= PE_LANGA_KM; i--) if (hav(pts[i], Ar) < hav(pts[iA], Ar)) iA = i;
  if (iB - iA < 30) { rec.motiv = `prea scurt: ${iB - iA} puncte`; curse.push(rec); continue; }
  const seg = pts.slice(iA, iB + 1);
  // ora plecării de la A = ultimul punct (în mers) la ≤300 m de A înainte ca mașina să se depărteze la >1 km;
  // ora sosirii la B = primul punct la ≤300 m de B după ce a venit de la >1 km. Punctul cel mai apropiat de peron
  // e adesea din așteptarea de dinainte de plecare / de după sosire (la ruta 21 sosirea în Chișinău ieșea 18:55 — ora
  // plecării returului), deci capetele au ora lor, nu ora punctului cel mai apropiat.
  let tA = seg[0].at, tB = seg[seg.length - 1].at;
  // pragul «la capăt» = cel mai apropiat punct + 100 m, dar cel puțin 300 m: la Otaci autobuzul stă la 580 m de punctul OSM al satului
  { let i = 0; while (i < seg.length && hav(seg[i], A) <= 1) i++; const pr = Math.max(0.3, Math.min(...seg.slice(0, Math.max(i, 1)).map((p) => hav(p, A))) + 0.1);
    for (let j = i - 1; j >= 0; j--) if (hav(seg[j], A) <= pr) { tA = seg[j].at; break; } }
  { let i = seg.length - 1; while (i >= 0 && hav(seg[i], B) <= 1) i--; const pr = Math.max(0.3, Math.min(...seg.slice(Math.min(i + 1, seg.length - 1)).map((p) => hav(p, B))) + 0.1);
    for (let j = i + 1; j < seg.length; j++) if (hav(seg[j], B) <= pr) { tB = seg[j].at; break; } }
  const cum = [0]; for (let i = 1; i < seg.length; i++) cum.push(cum[i - 1] + hav(seg[i - 1], seg[i]));
  // trecerea pe la fiecare oprire: punctul cel mai apropiat (≤1 km), în ordinea drumului; km-ul și ora lui
  const pass = []; let cursor = 0;
  for (const s of onTrip) {
    let best = -1, bd = Infinity;
    for (let i = cursor; i < seg.length; i++) { const d = hav(seg[i], s.pt); if (d < bd) { bd = d; best = i; } }
    if (bd <= TRECERE_KM) { pass.push({ o: s.o, km: +cum[best].toFixed(1), t: seg[best].at, d: Math.round(bd * 1000) }); cursor = best; }
    else pass.push({ o: s.o, km: null, t: null, d: Math.round(bd * 1000) });
  }
  const near = onTrip.filter((s) => departeDe(s.pt, seg) <= PE_LANGA_KM).length;
  const gari = onTrip.filter((s) => s.gara);
  const gariAtinse = gari.filter((s) => departeDe(STATII.get(s.gara), seg) * 1000 <= GARA_M).map((s) => s.gara);
  const gariHit = gariAtinse.length;
  const keep = dp(seg, 0, seg.length - 1, 15);
  Object.assign(rec, {
    km: +cum[cum.length - 1].toFixed(1), cover: +(near / onTrip.length).toFixed(2), opriri: onTrip.length, gari: gari.length, gariHit, gariAtinse,
    dA: +hav(seg[0], A).toFixed(2), dB: +hav(seg[seg.length - 1], B).toFixed(2), oA: onTrip[jA].o, oB: onTrip[jB].o, t0: seg[0].at, t1: seg[seg.length - 1].at, tA, tB,
    pass, pts: keep.map((i) => [+seg[i].lat.toFixed(5), +seg[i].lon.toFixed(5)]),
  });
  curse.push(rec); n++;
  if (n % 100 === 0) console.log(`${new Date().toISOString().slice(11, 19)} ${n} curse · ${curse.length} atribuiri · ultima ${a.z} ruta ${a.r} ${a.s} ${a.m}`);
}
await t.end();
writeFileSync(DOAR ? `../date/curse-${DOAR}.json` : `../date/curse${SUFIX}.json`, JSON.stringify({ FROM: N.FROM, TO: N.TO, curse, faraTracker: [...faraTracker] }));
console.log(`gata: ${n} curse cu urmă din ${curse.length} atribuiri · sărite (fără ore): ${sarite} · fără tracker: ${[...faraTracker].join(', ') || '—'}`);
