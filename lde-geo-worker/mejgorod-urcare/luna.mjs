// ION-198 — punctele de urcare pe o lună, toate mașinile din graficul interurban, toate localitățile cu coordonate.
// Regulile din docs/plans/2026-10-03-puncte-urcare-interurban.md (pas 2–4), fără scriere în bază.
//   cd /root/lde-worker/mejgorod/cod && nohup node --env-file=../../.env opr-luna.mjs 2026-09-01 2026-10-01 > ../luna.log 2>&1 &
import pg from 'pg';
import { readFileSync, writeFileSync, createReadStream } from 'node:fs';
import readline from 'node:readline';
import { hav, nmea, normPlate, inMd, STATII, norm } from './geo.mjs';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));

const [FROM, TO] = [process.argv[2] || '2026-09-01', process.argv[3] || '2026-10-01'];
const N = JSON.parse(readFileSync('../date/nomenclator-urcare.json', 'utf8'));
const toate = JSON.parse(readFileSync('../date/curse-urcare.json', 'utf8')).curse.filter((c) => c.km && c.z >= FROM && c.z <= TO);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// returul dat la două mașini în aceeași zi (nomenclator.mjs:79-80): rămâne cursa cu acoperirea cea mai bună
const best = new Map();
for (const c of toate) { const k = `${c.z}|${c.r}|${c.s}`; const b = best.get(k); if (!b || c.cover > b.cover) best.set(k, c); }
const curse = [...best.values()].filter((c) => c.cover >= 0.5);
log(`curse ${toate.length} → fără dubluri ${best.size} → cover ≥ 0,5: ${curse.length}`);

// localitățile = opririle rutelor cu coordonate; opririle cu aceleași coordonate sunt o singură localitate
const rute = new Map(N.rute.map((r) => [r.id, r]));
const locs = new Map();   // cheie lat,lon → {nume[], lat, lon, gara}
const locDe = (o) => `${o.lat.toFixed(4)},${o.lon.toFixed(4)}`;
for (const r of N.rute) for (const o of r.opriri) {
  if (o.lat == null) continue; const k = locDe(o);
  if (!locs.has(k)) locs.set(k, { k, nume: [], lat: o.lat, lon: o.lon, gara: o.gara || null, rute: new Set() });
  const L = locs.get(k); if (!L.nume.includes(o.n)) L.nume.push(o.n); L.rute.add(r.id); if (o.gara) L.gara = o.gara;
}
const capete = new Map(N.rute.map((r) => { const op = r.opriri.filter((o) => o.lat != null); return [r.id, { tur: locDe(op[op.length - 1]), retur: locDe(op[0]) }]; }));

// OSM: obstacole, benzinării, stații
const osm = { obst: [], fuel: [], stop: [] };
for (const line of readFileSync('../date/osm-urcare.geojsonseq', 'utf8').split('\n')) {
  const s = line.replace(/^\x1e/, '').trim(); if (!s) continue;
  const f = JSON.parse(s); const t = f.properties || {}; let c = f.geometry.coordinates;
  if (f.geometry.type !== 'Point') { const ring = f.geometry.type === 'Polygon' ? c[0] : c; c = [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length]; }
  const p = { lat: c[1], lon: c[0], name: t.name || null, nameRu: t['name:ru'] || null };
  if (t.amenity === 'fuel') osm.fuel.push({ ...p, tip: 'benzinărie' });
  else if (t.railway === 'level_crossing') osm.obst.push({ ...p, tip: 'trecere cale ferată' });
  else if (t.highway === 'traffic_signals' || t.crossing === 'traffic_signals') osm.obst.push({ ...p, tip: 'semafor' });
  else if (t.highway === 'stop') osm.obst.push({ ...p, tip: 'semn STOP' });
  else if (t.highway === 'give_way') osm.obst.push({ ...p, tip: 'cedează trecerea' });
  else if (t.traffic_calming) osm.obst.push({ ...p, tip: 'denivelare' });
  else if (t.highway === 'bus_stop' || t.public_transport === 'platform') osm.stop.push(p);
}
const near = (list, p, m) => { let b = null, bd = Infinity; for (const q of list) { if (Math.abs(q.lat - p.lat) > 0.01 || Math.abs(q.lon - p.lon) > 0.015) continue; const d = hav(p, q) * 1000; if (d < bd) { bd = d; b = q; } } return bd <= m ? { ...b, d: Math.round(bd) } : null; };

// tracker: o cerere pe mașină × zi pentru toate cursele zilei
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: +(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB });
await t.connect();
const { rows: devs } = await t.query(`SELECT id, "CarName", "RegNo" FROM devices`);
const ids = (m) => devs.filter((d) => normPlate(d.CarName) === normPlate(m) || normPlate(d.RegNo) === normPlate(m)).map((d) => +d.id);
const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
const zile = new Map(); for (const c of curse) { const k = `${c.m}|${c.z}`; if (!zile.has(k)) zile.set(k, []); zile.get(k).push(c); }

const ev = [];          // evenimente de oprire
const urme = [];        // urma brută pe cursă: {c, lat: Float64Array, lon: Float64Array}
const grid = new Map(); // celulă 0.001° → [[u, i]]
const cell = (lat, lon) => `${Math.floor(lat * 1000)}:${Math.floor(lon * 1000)}`;
let nz = 0;
for (const [k, cs] of zile) {
  const m = cs[0].m; const t0 = Math.min(...cs.map((c) => c.t0)) - 3e5, t1 = Math.max(...cs.map((c) => c.t1)) + 3e5;
  const all = (await t.query(`SELECT w_date, x, y, speed FROM track WHERE id = ANY($1) AND w_date BETWEEN $2 AND $3 AND x < 9000 AND y < 9000 ORDER BY w_date`, [ids(m), iso(t0), iso(t1)])).rows
    .map((p) => ({ lat: nmea(+p.x), lon: nmea(+p.y), at: p.w_date.getTime(), v: p.speed == null ? null : +p.speed })).filter(inMd);
  for (const c of cs) {
    const r = all.filter((p) => p.at >= c.t0 - 3e5 && p.at <= c.t1 + 3e5); if (r.length < 30) continue;
    // urma brută: toate punctele, fără duplicate la < 5 m
    const keep = [r[0]]; for (const p of r) if (hav(p, keep[keep.length - 1]) * 1000 >= 5) keep.push(p);
    const u = urme.length; urme.push({ c, lat: Float64Array.from(keep, (p) => p.lat), lon: Float64Array.from(keep, (p) => p.lon) });
    keep.forEach((p, i) => { const ce = cell(p.lat, p.lon); if (!grid.has(ce)) grid.set(ce, []); grid.get(ce).push([u, i]); });
    const opr = [...locs.values()].filter((L) => L.rute.has(c.r));
    for (let i = 0; i < r.length;) {
      const stat = (p, q) => p.v != null ? p.v <= 3 : (q && hav(p, q) * 1000 / Math.max(1, (p.at - q.at) / 1000) < 1.5);
      if (!stat(r[i], r[i - 1])) { i++; continue; }
      let j = i; while (j + 1 < r.length && stat(r[j + 1], r[j])) j++;
      const seg = r.slice(i, j + 1); const n = seg.length, zero = seg.some((p) => p.v === 0);
      const raza15 = seg.every((p) => p.v != null || hav(p, seg[0]) * 1000 <= 15);
      const gap = i > 0 ? r[i].at - r[i - 1].at : 20000; const dur = (r[j].at - r[i].at + Math.min(gap, 20000)) / 1000;
      if ((n >= 2 || zero) && raza15 && dur >= 15) {
        let b = seg[0]; for (const p of seg) if ((p.v ?? 99) < (b.v ?? 99)) b = p;
        let L = null, ld = Infinity; for (const o of opr) { const d = hav(b, o); if (d < ld) { ld = d; L = o; } }
        const raza = ['chisinau', 'balti'].includes(L?.gara) ? 8 : L?.gara ? 4 : 2;
        if (L && ld <= raza) ev.push({ u, k: L.k, r: c.r, s: c.s, z: c.z, m, lat: b.lat, lon: b.lon, dur });
      }
      i = j + 1;
    }
  }
  if (++nz % 100 === 0) log(`${nz}/${zile.size} mașină×zi · ${urme.length} curse · ${ev.length} opriri`);
}
await t.end();
log(`tracker gata: ${urme.length} curse, ${ev.length} opriri în localități`);

// distanța punct–segment, în metri
const segDist = (p, alat, alon, blat, blon) => { const kx = Math.cos(p.lat * Math.PI / 180) * 111320, ky = 110540; const ax = (alon - p.lon) * kx, ay = (alat - p.lat) * ky, bx = (blon - p.lon) * kx, by = (blat - p.lat) * ky; const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let tt = L ? -(ax * dx + ay * dy) / L : 0; tt = Math.max(0, Math.min(1, tt)); return Math.hypot(ax + tt * dx, ay + tt * dy); };
function trecute(p, m) {   // cursele a căror urmă trece la ≤ m metri de p
  const out = new Set(); const la = Math.floor(p.lat * 1000), lo = Math.floor(p.lon * 1000);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const [u, i] of grid.get(`${la + a}:${lo + b}`) || []) {
    if (out.has(u)) continue; const U = urme[u];
    if ((i > 0 && segDist(p, U.lat[i - 1], U.lon[i - 1], U.lat[i], U.lon[i]) <= m) || (i + 1 < U.lat.length && segDist(p, U.lat[i], U.lon[i], U.lat[i + 1], U.lon[i + 1]) <= m)) out.add(u);
  }
  return out;
}

const ORAS_MARE = new Set(['chisinau', 'balti']);
const rez = [];
for (const L of locs.values()) {
  const es = ev.filter((e) => e.k === L.k); const mare = ORAS_MARE.has(L.gara);
  const garaPt = L.gara ? STATII.get(L.gara) : null;
  // grupare prin vârfuri de densitate: eventul cu cei mai mulți vecini la ≤ 30 m dintre cei rămași, grupul = cei rămași
  // la ≤ 50 m de el; repetat cât vârful are ≥ 5 opriri. Grupurile ies compacte (≤ 100 m), fără lanțuri de-a lungul drumului.
  const g2 = new Map(); es.forEach((e, i) => { const c = `${Math.floor(e.lat * 2500)}:${Math.floor(e.lon * 1700)}`; if (!g2.has(c)) g2.set(c, []); g2.get(c).push(i); });
  const vec = (i, m) => { const e = es[i]; const la = Math.floor(e.lat * 2500), lo = Math.floor(e.lon * 1700); const o = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of g2.get(`${la + a}:${lo + b}`) || []) if (hav(e, es[j]) * 1000 <= m) o.push(j); return o; };
  const opriteLoc = new Set(es.filter((e) => e.dur <= 180).map((e) => e.u)); const masiniLoc = new Set(es.map((e) => e.m)).size;
  const lab = new Array(es.length).fill(-1); let K = 0;
  const dens = es.map((_, i) => vec(i, 30));
  while (true) {
    let bi = -1, bn = 0; for (let i = 0; i < es.length; i++) { if (lab[i] !== -1) continue; const n = dens[i].filter((j) => lab[j] === -1).length; if (n > bn) { bn = n; bi = i; } }
    if (bi < 0 || bn < 5) break;
    for (const j of vec(bi, 50)) if (lab[j] === -1) lab[j] = K;
    K++;
  }
  const grupuri = [];
  for (let gi = 0; gi < K; gi++) {
    const m = es.filter((_, i) => lab[i] === gi);
    const sample = m.length > 400 ? m.filter((_, i) => i % Math.ceil(m.length / 400) === 0) : m;
    let med = sample[0], bs = Infinity; for (const a of sample) { const s = sample.reduce((x, b) => x + hav(a, b), 0); if (s < bs) { bs = s; med = a; } }
    const intindere = Math.round(2 * Math.max(...m.map((a) => hav(a, med) * 1000)));
    const durs = m.map((e) => e.dur).sort((a, b) => a - b); const durMed = durs[Math.floor(durs.length / 2)];
    const masini = new Set(m.map((e) => e.m)), zileG = new Set(m.map((e) => e.z));
    const oprite = new Set(m.map((e) => e.u)); const trec = trecute(med, 60);
    const perechi = new Map();
    // oraș mare: numitorul = trecerile pe lângă punct (traficul face opriri peste tot); în rest: cursele care au oprit
    // undeva în localitate — întrebarea e UNDE oprește autobuzul când ia oameni de aici, nu CÂT de des
    const baza = mare ? new Set([...oprite, ...trec]) : opriteLoc;
    for (const u of baza) { const c = urme[u].c; const key = `${c.r}|${c.s}`; if (!perechi.has(key)) perechi.set(key, { r: c.r, s: c.s, trec: 0, opr: 0, zile: new Set(), masini: new Set() }); const P = perechi.get(key); P.trec++; if (oprite.has(u)) { P.opr++; P.zile.add(c.z); P.masini.add(c.m); } }
    const dGara = garaPt ? hav(med, garaPt) * 1000 : Infinity;
    rez.length; grupuri.push({ med, m, intindere, durMed, masini: masini.size, zile: zileG.size, opriri: m.length, dGara,
      perechi: [...perechi.values()].map((P) => ({ r: P.r, s: P.s, p: +(P.opr / P.trec).toFixed(2), opr: P.opr, trec: P.trec, zile: P.zile.size })).filter((P) => P.opr > 0),
      obst: near(osm.obst, med, 30), fuel: near(osm.fuel, med, 40), statie: near(osm.stop, med, 60) });
  }
  // grupul gării = cel mai apropiat de punctul din STATII, la ≤ 150 m
  const garaG = grupuri.filter((g) => g.dGara <= 150).sort((a, b) => a.dGara - b.dGara)[0] || null;
  for (const g of grupuri) {
    g.esteGara = g === garaG; const mot = [];
    if (!g.esteGara) {
      if (g.obst) mot.push(`${g.obst.tip} la ${g.obst.d} m`);
      if (g.fuel && g.durMed > 120) mot.push(`benzinărie la ${g.fuel.d} m, stă ${Math.round(g.durMed / 60)} min`);
      if (g.durMed > 180) mot.push(`pauză: stă ${Math.round(g.durMed / 60)} min`);
      if (mare && g.durMed < 30) mot.push('trafic: oprire sub 30 s în oraș mare');
    }
    if (!g.esteGara && g.intindere > 120) mot.push(`întins pe ${g.intindere} m`);
    if (g.masini < Math.min(3, masiniLoc)) mot.push(`doar ${g.masini} mașini`);
    for (const P of g.perechi) {
      const cap = capete.get(P.r)?.[P.s] === L.k; const prag = mare ? 0.25 : 0.20;
      P.pub = !cap && P.p >= prag && P.zile >= 5;
      P.de = cap ? 'capăt: aici se coboară' : P.p < prag ? (mare ? `oprește în ${Math.round(P.p * 100)} % din treceri (prag 25 %)` : `aici sunt ${Math.round(P.p * 100)} % din opririle rutei în localitate (prag 20 %)`) : P.zile < 5 ? `doar ${P.zile} zile` : null;
      if (g.esteGara && !cap && P.zile >= 5) { P.pub = true; P.de = null; }
    }
    if (!g.perechi.some((P) => P.pub)) mot.push(g.perechi.every((P) => P.de?.startsWith('capăt')) ? 'doar coborâre (capătul cursei)' : 'opririle de aici sunt rare față de celelalte locuri din localitate');
    g.motive = mot; g.ok = mot.length === 0;
    g.scor = g.zile * Math.sqrt(g.masini);
  }
  // alegerea: gara întâi, apoi scorul; ≥ 150 m între puncte; cel mult 3
  const cand = grupuri.filter((g) => g.ok).sort((a, b) => (b.esteGara - a.esteGara) || (b.scor - a.scor));
  const alese = [];
  for (const g of cand) { const lang = alese.find((a) => hav(a.med, g.med) * 1000 < 150); if (lang) { g.motive.push(`la ${Math.round(hav(lang.med, g.med) * 1000)} m de punctul ${alese.indexOf(lang) + 1}, unit cu el`); g.ok = false; continue; } if (alese.length >= 3) { g.motive.push('al 4-lea ca scor'); g.ok = false; continue; } alese.push(g); }
  const GENERIC = /^(statie|stație|staţie|oprire|остановка|bus ?stop|stație autobuz|statia|stația|автобусная остановка)( autobuz)?$/i;
  alese.forEach((g, i) => { g.rang = i + 1; if (g.esteGara) { g.med = { ...garaPt }; g.nume = 'Autogara'; } else g.nume = g.statie?.name && !GENERIC.test(g.statie.name.trim()) ? g.statie.name : null; });
  const trecL = new Set(); for (const g of grupuri) for (const u of trecute(g.med, 60)) trecL.add(u);
  rez.push({ k: L.k, nume: L.nume, lat: L.lat, lon: L.lon, gara: L.gara, rute: [...L.rute].sort((a, b) => a - b), opriri: es.length,
    masini: new Set(es.map((e) => e.m)).size, grupuri, alese });
}
log(`grupare gata: ${rez.length} localități, ${rez.reduce((a, L) => a + L.grupuri.length, 0)} grupuri, ${rez.reduce((a, L) => a + L.alese.length, 0)} puncte alese`);

// harta: drumurile OSM din cadrul fiecărei localități + câteva urme reale
const cadru = (L) => { const pts = [{ lat: L.lat, lon: L.lon }, ...L.grupuri.map((g) => g.med)]; let la0 = Math.min(...pts.map((p) => p.lat)), la1 = Math.max(...pts.map((p) => p.lat)), lo0 = Math.min(...pts.map((p) => p.lon)), lo1 = Math.max(...pts.map((p) => p.lon));
  const cy = (la0 + la1) / 2, cx = (lo0 + lo1) / 2; const hy = Math.max((la1 - la0) / 2 + 0.003, 0.006), hx = Math.max((lo1 - lo0) / 2 + 0.0045, 0.009) ; const h = Math.max(hy, hx * 0.67); return [cy - h, cx - h / 0.67, cy + h, cx + h / 0.67]; };
for (const L of rez) { L.bbox = cadru(L); L.drumuri = []; }
const rl = readline.createInterface({ input: createReadStream('../date/osm-drumuri.geojsonseq') });
const MARI = new Set(['motorway', 'trunk', 'primary', 'secondary', 'trunk_link', 'primary_link', 'secondary_link']);
for await (const line of rl) {
  const s = line.replace(/^\x1e/, '').trim(); if (!s) continue; const f = JSON.parse(s); if (f.geometry.type !== 'LineString') continue;
  const c = f.geometry.coordinates; let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180; for (const [x, y] of c) { if (y < la0) la0 = y; if (y > la1) la1 = y; if (x < lo0) lo0 = x; if (x > lo1) lo1 = x; }
  for (const L of rez) { const b = L.bbox; if (la1 < b[0] || la0 > b[2] || lo1 < b[1] || lo0 > b[3]) continue;
    L.drumuri.push({ t: MARI.has(f.properties.highway) ? 1 : 0, n: f.properties.name || null, p: c.map(([x, y]) => [+y.toFixed(5), +x.toFixed(5)]) }); }
}
function strada(L, p) { let b = null, bd = 40; for (const d of L.drumuri) { if (!d.n) continue; for (let i = 1; i < d.p.length; i++) { const x = segDist(p, d.p[i - 1][0], d.p[i - 1][1], d.p[i][0], d.p[i][1]); if (x < bd) { bd = x; b = d.n; } } } return b; }
for (const L of rez) for (const g of L.grupuri) if (g.rang && !g.nume) { const st = strada(L, g.med); g.nume = st ? `${st}` : null; g.numeStrada = !!st; }
// ieșirea pentru pagină
const r5 = (x) => +x.toFixed(5);
const out = rez.map((L) => {
  const b = L.bbox; const inB = (la, lo) => la >= b[0] && la <= b[2] && lo >= b[1] && lo <= b[3];
  const us = [...new Set(ev.filter((e) => e.k === L.k).map((e) => e.u))].slice(0, 30);
  const urmeL = us.map((u) => { const U = urme[u]; const p = []; for (let i = 0; i < U.lat.length; i += 2) if (inB(U.lat[i], U.lon[i])) p.push([r5(U.lat[i]), r5(U.lon[i])]); return p; }).filter((p) => p.length > 3);
  const evL = ev.filter((e) => e.k === L.k && inB(e.lat, e.lon)); const pas = Math.max(1, Math.ceil(evL.length / 600));
  return { k: L.k, nume: L.nume, lat: L.lat, lon: L.lon, gara: L.gara, rute: L.rute, opriri: L.opriri, masini: L.masini, bbox: L.bbox.map(r5),
    puncte: L.grupuri.sort((a, b) => (a.rang || 9) - (b.rang || 9) || b.scor - a.scor).map((g) => ({ lat: r5(g.med.lat), lon: r5(g.med.lon), rang: g.rang || null, nume: g.nume || null,
      masini: g.masini, zile: g.zile, opriri: g.opriri, durMed: Math.round(g.durMed), intindere: g.intindere, gara: g.esteGara, motive: g.motive,
      statie: g.statie ? `${g.statie.name || 'stație fără nume'} (${g.statie.d} m)` : null, perechi: g.perechi.sort((a, b) => b.p - a.p) })),
    ev: evL.filter((_, i) => i % pas === 0).map((e) => [r5(e.lat), r5(e.lon)]), urme: urmeL, drumuri: L.drumuri };
});
writeFileSync('../date/puncte-luna.json', JSON.stringify({ FROM, TO, curse: urme.length, masini: new Set(urme.map((u) => u.c.m)).size, opriri: ev.length, localitati: out }));
log(`scris date/puncte-luna.json`);
