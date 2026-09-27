// ION-112 r7 (uzina-analist): R3 Nihoreni, septembrie, fiecare picior obs ideal-v4.3 (D și EZ).
// Urma brută tracker pg: x=lat, y=lon NMEA, speed noduri × 1,852, w_date UTC.
// Pe picior: opririle de urcare/coborâre (< 8 km/h real, 20 s – 5 min) în zona Nihoreni + Rîșcani (≤ 4,5 km de capăt),
// clasate pe loc (Nominatim zoom 16: sat/oraș + stradă); km cu oameni: tur = prima oprire → prima atingere de poartă (și → EST);
// retur = ultima atingere de poartă → ultima oprire. Plus: km între prima și ultima oprire din zonă (bucla), distanța minimă la centrul Rîșcani.
import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));
const D = '/root/lde-worker/drax/date/ideal-v4.3';
const O = JSON.parse(readFileSync(`${D}/obs-ideal.json`, 'utf8')); const obs = O.curse ?? O;
const SK = JSON.parse(readFileSync(`${D}/schelet-ideal.json`, 'utf8'));
const L = SK.find((e) => e.ruta === 'R3' && e.linie === 'Nihoreni'); const cap = { lat: L.capatC[0], lon: L.capatC[1] };
const nmea = (v) => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const EST = { n: 'EST', lat: 47.78513, lon: 27.94307, r: 0.6 }, VEST = { n: 'VEST', lat: 47.77408, lon: 27.91593, r: 0.5 };
const poarta = (p) => [EST, VEST].find((g) => hav(p, g) <= g.r + 0.1);
const ANCORA = Date.parse('2026-09-21T00:00:00Z');
const faza = (zi) => { const s = Math.floor((Date.parse(zi + 'T12:00:00Z') - ANCORA) / (7 * 864e5)); return (((s % 2) + 2) % 2) === 0 ? 'A' : 'B'; };
const grupa = (zi, sc) => (faza(zi) === 'A') === (sc === 's1') ? 'D' : 'EZ';
const UA = { headers: { 'User-Agent': 'translux-lde/1.0' } };
const cache = new Map();
const unde = async (p) => { const k = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`; if (!cache.has(k)) {
  try { const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${p.lat}&lon=${p.lon}&format=json&zoom=16`, UA); const j = await r.json(); const a = j.address ?? {};
    cache.set(k, { loc: a.village || a.town || a.city || a.hamlet || '?', strada: a.road || '' }); } catch { cache.set(k, { loc: '?', strada: '' }); }
  await new Promise((s) => setTimeout(s, 1100)); } return cache.get(k); };
let RC = null;
try { const r = await fetch('https://nominatim.openstreetmap.org/search?q=R%C3%AE%C8%99cani%2C%20Moldova&format=json&limit=1', UA); const j = await r.json(); RC = { lat: +j[0].lat, lon: +j[0].lon }; } catch {}
let NC = null;
try { await new Promise((s) => setTimeout(s, 1100)); const r = await fetch('https://nominatim.openstreetmap.org/search?q=Nihoreni%2C%20Moldova&format=json&limit=1', UA); const j = await r.json(); NC = { lat: +j[0].lat, lon: +j[0].lon }; } catch {}
console.log('capat', cap, 'Riscani centru (OSM)', RC, 'Nihoreni (OSM)', NC, 'capat↔Riscani', RC && hav(cap, RC).toFixed(2));
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
await t.connect();
const { rows: dv } = await t.query(`SELECT id,"CarName","RegNo" FROM devices`);
const canon = (s) => { const p = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const m = p.match(/^([A-Z]{3})(\d{3})$/); return m ? m[2] + m[1] : p; };
const Q = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);
const loc = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(11, 16);
const out = [];
for (const o of obs.filter((o) => o.ruta === 'R3' && o.linie === 'Nihoreni' && o.schimb && o.zi >= '2026-09-01')) {
  const ids = dv.filter((d) => canon(d.CarName) === o.m || canon(d.RegNo) === o.m).map((d) => d.id); if (!ids.length) continue;
  const { rows } = await t.query('SELECT w_date, x, y, speed FROM track WHERE id = ANY($1) AND w_date >= $2 AND w_date < $3 ORDER BY w_date', [ids, Q(Date.parse(o.t0) - 40 * 60e3), Q(Date.parse(o.t1) + 40 * 60e3)]);
  const P = rows.map((r) => ({ t: r.w_date.getTime(), lat: nmea(+r.x), lon: nmea(+r.y), v: +r.speed * 1.852 })).filter((p) => p.lat > 45 && p.lat < 49);
  if (P.length < 10) continue;
  const cum = []; let s = 0; P.forEach((p, i) => { if (i) { const d = hav(P[i - 1], p); if (d <= 5) s += d; } cum.push(s); });
  // porțiunea picioarelor: tur = până la prima poartă atinsă după t0-40'; retur = de la ultima poartă atinsă înainte de t1+40'
  const gi = P.map((p) => poarta(p));
  let a, b, gateIdx, gateN;
  const t0 = Date.parse(o.t0), t1 = Date.parse(o.t1);
  if (o.sens === 'tur') { gateIdx = P.findIndex((p, i) => gi[i] && p.t >= t0 - 5 * 60e3); if (gateIdx < 0) continue; gateN = gi[gateIdx].n;
    let st = gateIdx; while (st > 0 && !gi[st - 1]) st--; a = st; b = gateIdx; }
  else { gateIdx = -1; for (let i = P.length - 1; i >= 0; i--) if (gi[i] && P[i].t <= t1 + 5 * 60e3) { gateIdx = i; break; } if (gateIdx < 0) continue; gateN = gi[gateIdx].n;
    let en = gateIdx; while (en < P.length - 1 && !gi[en + 1]) en++; a = gateIdx; b = en; }
  // opririle din zonă, în porțiune
  const opr = []; let st = null;
  const push = () => { if (st) { const dur = (st.u.t - st.t) / 1e3; if (dur >= 20) opr.push({ i: st.i, j: st.j, t: st.t, dur, lat: st.lat, lon: st.lon }); } st = null; };
  for (let i = a; i <= b; i++) { const p = P[i]; const inZ = hav(p, cap) <= 4.5; if (inZ && p.v < 8) { if (!st) st = { ...p, i }; st.u = p; st.j = i; } else push(); }
  push();
  const scurte = opr.filter((x) => x.dur <= 300), lungi = opr.filter((x) => x.dur > 300);
  for (const x of opr) { x.u = await unde(x); x.dCap = hav(x, cap); }
  let km = null, kmEST = null, kmN = null, kmBucla = null;
  if (scurte.length) {
    if (o.sens === 'tur') { const f = scurte[0]; km = cum[b] - cum[f.j];
      const iE = P.findIndex((p, i) => i >= f.j && hav(p, EST) <= EST.r + 0.1); if (iE >= 0) kmEST = cum[iE] - cum[f.j];
      const fN = scurte.find((x) => x.dCap <= 0.8); if (fN) kmN = cum[b] - cum[fN.j];
      kmBucla = cum[scurte.at(-1).j] - cum[f.j]; }
    else { const f = scurte.at(-1); km = cum[f.i] - cum[a];
      let iE = -1; for (let i = f.i; i >= 0; i--) if (hav(P[i], EST) <= EST.r + 0.1) { iE = i; break; } if (iE >= 0) kmEST = cum[f.i] - cum[iE];
      const lN = [...scurte].reverse().find((x) => x.dCap <= 0.8); if (lN) kmN = cum[lN.i] - cum[a];
      kmBucla = cum[f.i] - cum[scurte[0].i]; }
  }
  let minRC = null; if (RC) for (let i = a; i <= b; i++) { const d = hav(P[i], RC); if (minRC == null || d < minRC) minRC = d; }
  const cls = (x) => (x.u.loc.includes('Nihoreni') ? 'N' : x.u.loc.match(/R[îi][șs]cani/i) ? 'R' : x.u.loc.slice(0, 6));
  out.push({ m: o.m, zi: o.zi, sens: o.sens, schimb: o.schimb, grupa: grupa(o.zi, o.schimb), poarta: gateN,
    km: km == null ? null : +km.toFixed(1), kmEST: kmEST == null ? null : +kmEST.toFixed(1), kmDeLaNihoreni: kmN == null ? null : +kmN.toFixed(1), kmBucla: kmBucla == null ? null : +kmBucla.toFixed(1),
    nN: scurte.filter((x) => cls(x) === 'N').length, nR: scurte.filter((x) => cls(x) === 'R').length, nAlt: scurte.filter((x) => !['N', 'R'].includes(cls(x))).length,
    sir: scurte.map((x) => `${loc(x.t)} ${cls(x)} ${x.dCap.toFixed(1)} ${x.u.strada}`.trim()).join(' | '), lungi: lungi.map((x) => `${loc(x.t)} ${cls(x)} ${Math.round(x.dur / 60)}' ${x.u.strada}`).join(' | '),
    minRiscaniCentru: minRC == null ? null : +minRC.toFixed(2) });
}
await t.end();
writeFileSync('/tmp/p112-r7-analist.json', JSON.stringify(out, null, 1));
const med = (a) => { const q = a.filter((x) => x != null).sort((x, y) => x - y); return q.length ? +(q.length % 2 ? q[(q.length - 1) / 2] : (q[q.length / 2 - 1] + q[q.length / 2]) / 2).toFixed(1) : null; };
for (const r of out.sort((x, y) => (x.grupa + x.sens + x.zi).localeCompare(y.grupa + y.sens + y.zi))) console.log([r.grupa, r.sens, r.m, r.zi, r.schimb, r.poarta, 'km', r.km, 'EST', r.kmEST, 'deLaN', r.kmDeLaNihoreni, 'bucla', r.kmBucla, `N${r.nN} R${r.nR} alt${r.nAlt}`, 'minRC', r.minRiscaniCentru].join(' '), '\n    ', r.sir, r.lungi ? '\n     lungi: ' + r.lungi : '');
console.log('\n== SUMAR (mediane) ==');
for (const g of ['D', 'EZ']) for (const sens of ['tur', 'retur']) { const q = out.filter((x) => x.grupa === g && x.sens === sens); const c = q.filter((x) => x.km != null);
  console.log(g, sens, 'picioare', q.length, 'cu opriri', c.length, 'km', med(c.map((x) => x.km)), 'km→/←EST', med(c.map((x) => x.kmEST)), 'de la Nihoreni', med(c.map((x) => x.kmDeLaNihoreni)), 'bucla', med(c.map((x) => x.kmBucla)),
    'opriri N', med(c.map((x) => x.nN)), 'R', med(c.map((x) => x.nR)), 'Σ N', c.reduce((s, x) => s + x.nN, 0), 'Σ R', c.reduce((s, x) => s + x.nR, 0),
    'porți', JSON.stringify(q.reduce((m, x) => ((m[x.poarta] = (m[x.poarta] || 0) + 1), m), {})), 'minRC med', med(q.map((x) => x.minRiscaniCentru)), 'minRC max', Math.max(...q.map((x) => x.minRiscaniCentru ?? 0)).toFixed(2), 'mașini', [...new Set(q.map((x) => x.m))].join(' ')); }
