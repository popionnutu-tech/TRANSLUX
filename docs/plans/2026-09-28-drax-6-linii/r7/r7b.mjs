// ION-112 r7 (uzina-analist), a doua trecere: R3 Nihoreni, septembrie. Fără Nominatim.
// tur: km de la ieșirea din ultima așteptare (stop 5–40 min) din zonă (≤ 4,5 km de capăt) până la poartă, și de la prima oprire scurtă (20 s–5 min);
// retur: de la poartă la ultima oprire scurtă din zonă. Nord = urma trece la nord de lat 47,962 (Rîșcani-N, str. Kotovski, ~3,2 km de capăt).
// Acoperire: puncte, prima/ultima oră, distanța maximă de EST (dacă picior-ul are urmă în zonă).
import pg from 'pg';
import { readFileSync } from 'node:fs';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));
const D = '/root/lde-worker/drax/date/ideal-v4.3';
const O = JSON.parse(readFileSync(`${D}/obs-ideal.json`, 'utf8')); const obs = O.curse ?? O;
const SK = JSON.parse(readFileSync(`${D}/schelet-ideal.json`, 'utf8'));
const L = SK.find((e) => e.ruta === 'R3' && e.linie === 'Nihoreni'); const cap = { lat: L.capatC[0], lon: L.capatC[1] };
console.log('card schelet R3 Nihoreni:', JSON.stringify({ km: L.km, ture: L.ture ?? L.turePeZi, capatC: L.capatC, porti: L.porti ?? L.poarta }));
const nmea = (v) => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const EST = { n: 'EST', lat: 47.78513, lon: 27.94307, r: 0.6 }, VEST = { n: 'VEST', lat: 47.77408, lon: 27.91593, r: 0.5 };
const poarta = (p) => [EST, VEST].find((g) => hav(p, g) <= g.r + 0.1);
const ANCORA = Date.parse('2026-09-21T00:00:00Z');
const faza = (zi) => { const s = Math.floor((Date.parse(zi + 'T12:00:00Z') - ANCORA) / (7 * 864e5)); return (((s % 2) + 2) % 2) === 0 ? 'A' : 'B'; };
const grupa = (zi, sc) => (faza(zi) === 'A') === (sc === 's1') ? 'D' : 'EZ';
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
await t.connect();
const { rows: dv } = await t.query(`SELECT id,"CarName","RegNo" FROM devices`);
const canon = (s) => { const p = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const m = p.match(/^([A-Z]{3})(\d{3})$/); return m ? m[2] + m[1] : p; };
const Q = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);
const hh = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(11, 16);
const out = [];
for (const o of obs.filter((o) => o.ruta === 'R3' && o.linie === 'Nihoreni' && o.schimb && o.zi >= '2026-09-01')) {
  const ids = dv.filter((d) => canon(d.CarName) === o.m || canon(d.RegNo) === o.m).map((d) => d.id); if (!ids.length) continue;
  const t0 = Date.parse(o.t0), t1 = Date.parse(o.t1);
  const { rows } = await t.query('SELECT w_date, x, y, speed FROM track WHERE id = ANY($1) AND w_date >= $2 AND w_date < $3 ORDER BY w_date', [ids, Q(t0 - 40 * 60e3), Q(t1 + 40 * 60e3)]);
  const P = rows.map((r) => ({ t: r.w_date.getTime(), lat: nmea(+r.x), lon: nmea(+r.y), v: +r.speed * 1.852 })).filter((p) => p.lat > 45 && p.lat < 49);
  const r0 = { m: o.m, zi: o.zi, sens: o.sens, schimb: o.schimb, grupa: grupa(o.zi, o.schimb), obs: `${hh(t0)}-${hh(t1)}`, plin: o.plin, excl: !!o.exclusEtalon, pts: P.length };
  if (P.length < 10) { out.push(r0); continue; }
  const cum = []; let s = 0; P.forEach((p, i) => { if (i) { const d = hav(P[i - 1], p); if (d <= 5) s += d; } cum.push(s); });
  const gi = P.map(poarta);
  let a, b, gIdx = -1;
  if (o.sens === 'tur') { gIdx = P.findIndex((p, i) => gi[i] && p.t >= t0 - 5 * 60e3); if (gIdx < 0) { out.push({ ...r0, nota: 'fără poartă' }); continue; } let x = gIdx; while (x > 0 && !gi[x - 1]) x--; a = x; b = gIdx; }
  else { for (let i = P.length - 1; i >= 0; i--) if (gi[i] && P[i].t <= t1 + 5 * 60e3) { gIdx = i; break; } if (gIdx < 0) { out.push({ ...r0, nota: 'fără poartă' }); continue; } let x = gIdx; while (x < P.length - 1 && !gi[x + 1]) x++; a = gIdx; b = x; }
  const opr = []; let st = null;
  const push = () => { if (st) { const dur = (st.u.t - st.t) / 1e3; if (dur >= 20) opr.push({ i: st.i, j: st.j, t: st.t, dur, dCap: hav(st, cap), lat: st.lat }); } st = null; };
  for (let i = a; i <= b; i++) { const p = P[i]; if (hav(p, cap) <= 4.5 && p.v < 8) { if (!st) st = { ...p, i }; st.u = p; st.j = i; } else push(); }
  push();
  const inZ = []; for (let i = a; i <= b; i++) if (hav(P[i], cap) <= 4.5) inZ.push(i);
  const nord = inZ.some((i) => P[i].lat > 47.962);
  const minCap = inZ.length ? Math.min(...inZ.map((i) => hav(P[i], cap))) : null;
  const scurte = opr.filter((x) => x.dur <= 300), lungi = opr.filter((x) => x.dur > 300 && x.dur <= 2400);
  let kmScurt = null, kmAsteptare = null, kmTot = null;
  if (o.sens === 'tur') {
    if (scurte.length) kmScurt = cum[b] - cum[scurte[0].j];
    const ultL = lungi.at(-1); if (ultL) kmAsteptare = cum[b] - cum[ultL.j];
    if (inZ.length) kmTot = cum[b] - cum[inZ[0]];
  } else {
    if (scurte.length) kmScurt = cum[scurte.at(-1).i] - cum[a];
    if (inZ.length) kmTot = cum[inZ.at(-1)] - cum[a];
  }
  const f = (v) => (v == null ? null : +v.toFixed(1));
  out.push({ ...r0, poarta: gi[gIdx].n, acop: `${hh(P[a].t)}-${hh(P[b].t)}`, inZona: inZ.length, minCap: f(minCap), nord, nScurte: scurte.length, maxDCap: f(Math.max(0, ...scurte.map((x) => x.dCap))),
    asteptari: lungi.map((x) => `${hh(x.t)} ${Math.round(x.dur / 60)}' ${x.dCap.toFixed(1)}`).join(', '), kmScurt: f(kmScurt), kmAsteptare: f(kmAsteptare), kmZona: f(kmTot) });
}
await t.end();
const med = (a) => { const q = a.filter((x) => x != null).sort((x, y) => x - y); if (!q.length) return null; const n = q.length; return +(n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2).toFixed(1); };
for (const r of out.sort((x, y) => (x.grupa + x.sens + x.zi).localeCompare(y.grupa + y.sens + y.zi))) console.log(JSON.stringify(r));
console.log('\n== SUMAR ==');
for (const g of ['D', 'EZ']) for (const sens of ['tur', 'retur']) {
  const q = out.filter((x) => x.grupa === g && x.sens === sens); const z = q.filter((x) => x.inZona > 0);
  const ok = (k) => z.map((x) => x[k]).filter((v) => v != null && v < 70);
  console.log(g, sens, 'picioare', q.length, 'cu urmă în zonă', z.length, 'nord', z.filter((x) => x.nord).length,
    '| km de la prima oprire scurtă', med(ok('kmScurt')), `(n ${ok('kmScurt').length})`, '| de la ultima așteptare', med(ok('kmAsteptare')), `(n ${ok('kmAsteptare').length})`,
    '| zona întreagă (intrare/ieșire)', med(ok('kmZona')), `(n ${ok('kmZona').length})`, '| maxDCap opriri med', med(z.map((x) => x.maxDCap)), '| plin lanț med', med(q.map((x) => x.plin)), '| porți', JSON.stringify(z.reduce((m, x) => ((m[x.poarta] = (m[x.poarta] || 0) + 1), m), {})));
}
