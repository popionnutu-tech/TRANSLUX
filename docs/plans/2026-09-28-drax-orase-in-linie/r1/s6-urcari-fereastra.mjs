// ION-124 r1 · s6: urcările din oraș pe cursele liniilor, din urma BRUTĂ a trackerului, în fereastra scheletului.
// Doar citire (SELECT pe track). Rulare pe VPS: cd /root/lde-worker && node --env-file=.env /tmp/ion124-s6.mjs [luna,luna…] > /tmp/ion124-s6.json
// Cursa = obs-ideal.json (curse.mjs: tur de la ultima odihnă ≥ 25 min la poartă; retur de la poartă la următoarea odihnă).
// Oprire scurtă («halt») = puncte consecutive < 10 km/h, 15 s – 5 min; > 5 min = așteptare. Casa = ≤ 0,4 km de începutul turului
// (locul odihnei) / de sfârșitul returului. Zona orașului = cel mai apropiat loc OSM city/town/village (≤ 3 km) e orașul.
// Partea: tur — oprirea înaintea celei mai apropiate treceri pe lângă capătul scheletului (capatC) = DINCOLO; după = pe drum.
//         retur — după trecerea pe lângă capăt = DINCOLO; înainte = pe drum.
import fs from 'fs';
import pg from '/root/lde-worker/node_modules/pg/lib/index.js';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));
const LUNI = (process.argv[2] ?? '2026-05,2026-06,2026-07,2026-09').split(',');
const O = JSON.parse(fs.readFileSync('/root/lde-worker/drax/date/ideal-v4.3/obs-ideal.json', 'utf8'));
const S = JSON.parse(fs.readFileSync('/root/lde-worker/drax/date/saptamanal/2026-09-14/schelet-ideal.json', 'utf8'));
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const nk = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const nmea = (v) => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const ORASE = { R19: ['Sîngerei'], R9: ['Glodeni'], R3: ['Rîșcani'], R16: ['Florești', 'Mărculești'], R17: ['Mărculești'], R23: ['Fălești'],
  R21: ['Biruința'], R15: ['Drochia'], R31: ['Ghindești'], R8: ['Costești'], R1: ['Dondușeni'] };
const PL = [];
for (const line of fs.readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) {
  const cl = line.replace(/\x1e/g, '').trim(); if (!cl) continue; let f; try { f = JSON.parse(cl); } catch { continue; }
  const pl = f.properties?.place; if (!['city', 'town', 'village'].includes(pl)) continue;
  const [lon, lat] = f.geometry.coordinates; if (lat < 47.3 || lat > 48.4 || lon < 27 || lon > 28.8) continue;
  PL.push({ n: f.properties['name:ro'] ?? f.properties.name, lat, lon, pl });
}
const loc = (p) => { let b = null, bd = 9; for (const q of PL) { const d = hav(p, q); if (d < bd) { bd = d; b = q; } } return b && bd <= 3 ? b : null; };
const med = (a) => { const q = [...a].sort((x, y) => x - y); const n = q.length; return n ? +(n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2).toFixed(1) : null; };
const linii = new Map(S.filter((e) => ORASE[e.ruta] && !e.faraIdeal && e.capatC).map((e) => [`${e.ruta}|${e.linie}`, e]));
const cur = O.curse.filter((c) => linii.has(`${c.ruta}|${c.linie}`) && LUNI.includes(c.zi.slice(0, 7)));
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER,
  password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
await t.connect();
const Q = (d) => d.toISOString().replace('T', ' ').replace('Z', '');
const out = {}; const exemple = [];
for (const c of cur) {
  const k = `${c.ruta}|${c.linie}`; const e = linii.get(k); const cap = { lat: e.capatC[0], lon: e.capatC[1] };
  const { rows } = await t.query('SELECT w_date,x,y,speed FROM track WHERE id=$1 AND w_date>=$2 AND w_date<=$3 ORDER BY w_date', [Number(c.dev), Q(new Date(c.t0)), Q(new Date(c.t1))]);
  const P = rows.map((r) => ({ lat: nmea(Number(r.x)), lon: nmea(Number(r.y)), v: Number(r.speed) * 1.852, t: r.w_date.getTime() })).filter((p) => p.lat > 45 && p.lat < 49);
  if (P.length < 10) continue;
  const cum = [0]; for (let i = 1; i < P.length; i++) { const d = hav(P[i - 1], P[i]); cum.push(cum[i - 1] + (d < 5 ? d : 0)); }
  let iCap = 0, dCap = 99; for (let i = 0; i < P.length; i++) { const d = hav(P[i], cap); if (d < dCap) { dCap = d; iCap = i; } }
  const acasa = c.sens === 'tur' ? P[0] : P[P.length - 1];
  const halts = [];
  for (let i = 0; i < P.length;) { if (P[i].v >= 10) { i++; continue; } let j = i; while (j + 1 < P.length && P[j + 1].v < 10) j++;
    const dur = (P[Math.min(j + 1, P.length - 1)].t - P[Math.max(i - 1, 0)].t) / 1000 - 0; const mid = P[(i + j) >> 1];
    halts.push({ i: (i + j) >> 1, dur, lat: mid.lat, lon: mid.lon }); i = j + 1; }
  const L = out[k] ??= { n: { tur: 0, retur: 0 }, capat: e.capat, kmSchelet: e.km, dincolo: { tur: [], retur: [] }, peDrum: { tur: 0, retur: 0 }, doarCasa: { tur: 0, retur: 0 }, asteptare: { tur: 0, retur: 0 }, dCapMax: [] };
  L.n[c.sens]++; const PM = (L.perM ??= {})[c.m] ??= { tur: 0, retur: 0, dTur: 0, dRetur: 0 }; PM[c.sens]++; L.dCapMax.push(dCap);
  const inOras = halts.filter((h) => { const l = loc(h); return l && ORASE[c.ruta].some((n) => nk(n) === nk(l.n)) && l.pl === 'town'; });
  const casa = inOras.filter((h) => hav(h, acasa) <= 0.4);
  const scurte = inOras.filter((h) => !casa.includes(h) && h.dur >= 15 && h.dur <= 300);
  const lungi = inOras.filter((h) => !casa.includes(h) && h.dur > 300);
  const dinc = scurte.filter((h) => c.sens === 'tur' ? h.i < iCap : h.i > iCap);
  const drum = scurte.filter((h) => !dinc.includes(h));
  const distinct = (a) => { const r = []; for (const h of a) if (!r.some((x) => hav(x, h) < 0.15)) r.push(h); return r; };
  const dd = distinct(dinc);
  if (drum.length >= 1) L.peDrum[c.sens]++;
  if (casa.length && !dinc.length) L.doarCasa[c.sens]++;
  if (lungi.some((h) => c.sens === 'tur' ? h.i < iCap : h.i > iCap)) L.asteptare[c.sens]++;
  if (dd.length >= 2) {
    const kmD = c.sens === 'tur' ? cum[iCap] - cum[Math.min(...dd.map((h) => h.i))] : cum[Math.max(...dd.map((h) => h.i))] - cum[iCap];
    const prim = c.sens === 'tur' ? dd.reduce((a, h) => (h.i < a.i ? h : a)) : dd.reduce((a, h) => (h.i > a.i ? h : a));
    PM[c.sens === "tur" ? "dTur" : "dRetur"]++; L.dincolo[c.sens].push({ km: +kmD.toFixed(1), n: dd.length, lat: +prim.lat.toFixed(4), lon: +prim.lon.toFixed(4) });
    if (exemple.length < 400) exemple.push({ k, m: c.m, zi: c.zi, sens: c.sens, n: dd.length, km: +kmD.toFixed(1), casaLa: [+acasa.lat.toFixed(4), +acasa.lon.toFixed(4)] });
  }
}
await t.end();
const rez = {};
for (const [k, L] of Object.entries(out)) {
  rez[k] = { perM: L.perM, capat: L.capat, kmSchelet: L.kmSchelet, n: L.n, dCapatMed: med(L.dCapMax),
    peDrum: L.peDrum, doarCasa: L.doarCasa, asteptareDincolo: L.asteptare,
    dincolo: Object.fromEntries(['tur', 'retur'].map((s) => [s, { curse: L.dincolo[s].length, pct: L.n[s] ? Math.round(100 * L.dincolo[s].length / L.n[s]) : null,
      kmMed: med(L.dincolo[s].map((x) => x.km)), opririMed: med(L.dincolo[s].map((x) => x.n)),
      punctMed: L.dincolo[s].length ? [med(L.dincolo[s].map((x) => x.lat * 1e4)) / 1e4, med(L.dincolo[s].map((x) => x.lon * 1e4)) / 1e4] : null }])) };
}
console.log(JSON.stringify({ luni: LUNI, curse: cur.length, rez, exemple }, null, 1));
