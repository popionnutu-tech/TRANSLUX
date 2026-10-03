// ION-198 proba: 30 de mașini × 3 curse, opririle scurte din GPS-ul brut, grupate pe localități.
import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
import { hav, nmea, normPlate, inMd, STATII } from './geo.mjs';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));
const C = JSON.parse(readFileSync('../date/curse-urcare.json', 'utf8')).curse.filter((c) => c.km && c.cover >= 0.8);
const N = JSON.parse(readFileSync('../date/nomenclator-urcare.json', 'utf8'));
const MASINI = +(process.env.MASINI || 30), PE_MASINA = +(process.env.PE_MASINA || 3);
// OSM
const osm = { obst: [], fuel: [], stop: [] };
for (const line of readFileSync('../date/osm-urcare.geojsonseq', 'utf8').split('\n')) {
  const s = line.replace(/^\x1e/, '').trim(); if (!s) continue;
  const f = JSON.parse(s); const t = f.properties || {}; let c = f.geometry.coordinates;
  if (f.geometry.type !== 'Point') { const r = f.geometry.type === 'Polygon' ? c[0] : c; c = [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length]; }
  const p = { lat: c[1], lon: c[0], name: t.name || null, tip: null };
  if (t.amenity === 'fuel') osm.fuel.push({ ...p, tip: 'fuel' });
  else if (['traffic_signals', 'stop', 'give_way'].includes(t.highway) || t.railway === 'level_crossing' || t.traffic_calming || t.crossing === 'traffic_signals') osm.obst.push({ ...p, tip: t.railway === 'level_crossing' ? 'cale ferată' : t.highway || (t.traffic_calming ? 'denivelare' : 'semafor') });
  else if (t.highway === 'bus_stop' || t.public_transport === 'platform') osm.stop.push(p);
}
const near = (list, p, m) => { let b = null, bd = Infinity; for (const q of list) { if (Math.abs(q.lat - p.lat) > 0.01 || Math.abs(q.lon - p.lon) > 0.015) continue; const d = hav(p, q) * 1000; if (d < bd) { bd = d; b = q; } } return bd <= m ? { ...b, d: Math.round(bd) } : null; };
// alegerea: 30 de mașini cu cele mai multe curse, din fiecare 3 curse cât mai răspândite (rute/sensuri/zile diferite)
const byM = new Map(); for (const c of C) { if (!byM.has(c.m)) byM.set(c.m, []); byM.get(c.m).push(c); }
const masini = [...byM.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, MASINI);
const alese = [];
for (const [, cs] of masini) {
  cs.sort((a, b) => a.z.localeCompare(b.z)); const pick = []; const seen = new Set();
  for (let k = 0; k < cs.length && pick.length < PE_MASINA; k++) { const c = cs[Math.floor((k * 7919) % cs.length)]; const key = `${c.r}|${c.s}|${c.z}`; if (seen.has(key)) continue; seen.add(key); pick.push(c); }
  alese.push(...pick);
}
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: +(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB });
await t.connect();
const { rows: devs } = await t.query(`SELECT id, "CarName", "RegNo" FROM devices`);
const ids = (m) => devs.filter((d) => normPlate(d.CarName) === normPlate(m) || normPlate(d.RegNo) === normPlate(m)).map((d) => +d.id);
const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
const rute = new Map(N.rute.map((r) => [r.id, r]));
const ev = [], urme = [];
for (const c of alese) {
  const r = (await t.query(`SELECT w_date, x, y, speed FROM track WHERE id = ANY($1) AND w_date BETWEEN $2 AND $3 AND x < 9000 ORDER BY w_date`, [ids(c.m), iso(c.t0 - 3e5), iso(c.t1 + 3e5)])).rows
    .map((p) => ({ lat: nmea(+p.x), lon: nmea(+p.y), at: p.w_date.getTime(), v: p.speed == null ? null : +p.speed })).filter(inMd);
  const ui = urme.length; urme.push({ c, pts: r });
  const opriri = (rute.get(c.r)?.opriri || []).filter((o) => o.lat != null);
  for (let i = 0; i < r.length;) {
    if (!(r[i].v != null && r[i].v <= 3)) { i++; continue; }
    let j = i; while (j + 1 < r.length && r[j + 1].v != null && r[j + 1].v <= 3) j++;
    const n = j - i + 1, zero = r.slice(i, j + 1).some((p) => p.v === 0);
    const gap = i > 0 ? (r[i].at - r[i - 1].at) : 20000; const dur = (r[j].at - r[i].at + Math.min(gap, 20000)) / 1000;
    if ((n >= 2 || zero) && dur >= 15) {
      let best = r[i]; for (let k = i; k <= j; k++) if (r[k].v < best.v) best = r[k];
      let o = null, od = Infinity; for (const s of opriri) { const d = hav(best, s); if (d < od) { od = d; o = s; } }
      const raza = ['chisinau', 'balti'].includes(o?.gara) ? 8 : o?.gara ? 4 : 2;
      ev.push({ u: ui, r: c.r, s: c.s, z: c.z, m: c.m, lat: best.lat, lon: best.lon, dur, loc: od <= raza ? o.n : null, gara: od <= raza ? o.gara : null });
    }
    i = j + 1;
  }
}
await t.end();
// grupare pe localitate (DBSCAN eps 40 m, minPts 3 pe proba mică)
const segDist = (p, a, b) => { const kx = Math.cos(p.lat * Math.PI / 180) * 111320, ky = 110540; const ax = (a.lon - p.lon) * kx, ay = (a.lat - p.lat) * ky, bx = (b.lon - p.lon) * kx, by = (b.lat - p.lat) * ky; const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let tt = L ? -(ax * dx + ay * dy) / L : 0; tt = Math.max(0, Math.min(1, tt)); return Math.hypot(ax + tt * dx, ay + tt * dy); };
const trece = (u, p, m) => { const pts = urme[u].pts; for (let i = 1; i < pts.length; i++) { if (Math.abs(pts[i].lat - p.lat) > 0.003 && Math.abs(pts[i - 1].lat - p.lat) > 0.003) continue; if (segDist(p, pts[i - 1], pts[i]) <= m) return true; } return false; };
const out = [];
const locs = new Map(); for (const e of ev) if (e.loc && e.dur <= 480 || (e.loc && e.gara)) { if (!locs.has(e.loc)) locs.set(e.loc, []); locs.get(e.loc).push(e); }
for (const [loc, es] of locs) {
  const lab = new Array(es.length).fill(-1); let k = 0;
  const vec = (i) => es.map((e, j) => j).filter((j) => hav(es[i], es[j]) * 1000 <= 40);
  for (let i = 0; i < es.length; i++) { if (lab[i] !== -1) continue; const nb = vec(i); if (nb.length < 3) continue; lab[i] = k; const q = [...nb]; while (q.length) { const j = q.pop(); if (lab[j] === -1) { lab[j] = k; const nb2 = vec(j); if (nb2.length >= 3) q.push(...nb2); } } k++; }
  for (let g = 0; g < k; g++) {
    const m = es.filter((_, i) => lab[i] === g);
    let med = m[0], bs = Infinity; for (const a of m) { const s = m.reduce((x, b) => x + hav(a, b), 0); if (s < bs) { bs = s; med = a; } }
    const intindere = Math.round(Math.max(...m.map((a) => hav(a, med) * 1000)) * 2);
    const oprite = new Set(m.map((e) => e.u)); const trecute = new Set(oprite);
    urme.forEach((u, ui) => { if (trece(ui, med, 60)) trecute.add(ui); });
    const durs = m.map((e) => e.dur).sort((a, b) => a - b);
    const ob = near(osm.obst, med, 30), fu = near(osm.fuel, med, 40), bs2 = near(osm.stop, med, 60);
    const garaPt = m[0].gara ? STATII.get(m[0].gara) : null;
    out.push({ loc, lat: +med.lat.toFixed(5), lon: +med.lon.toFixed(5), masini: new Set(m.map((e) => e.m)).size, curse: oprite.size, trecute: trecute.size,
      pondere: +(oprite.size / trecute.size).toFixed(2), durMed: durs[Math.floor(durs.length / 2)], intindere, rute: [...new Set(m.map((e) => `${e.r}${e.s === 'tur' ? 'T' : 'R'}`))].join(' '),
      gara: garaPt && hav(med, garaPt) * 1000 <= 150, obstacol: ob ? `${ob.tip} ${ob.d}m` : null, benzinarie: fu ? `${fu.d}m` : null, statieOSM: bs2 ? `${bs2.name || '(fără nume)'} ${bs2.d}m` : null });
  }
}
out.sort((a, b) => a.loc.localeCompare(b.loc) || b.masini - a.masini);
writeFileSync('../date/proba30.json', JSON.stringify({ masini: masini.length, curse: alese.length, evenimente: ev.length, grupuri: out }, null, 1));
console.log(`mașini ${masini.length} · curse ${alese.length} · evenimente ${ev.length} (în localități ${ev.filter((e) => e.loc).length}) · grupuri ${out.length} · localități cu grupuri ${new Set(out.map((g) => g.loc)).size}`);
