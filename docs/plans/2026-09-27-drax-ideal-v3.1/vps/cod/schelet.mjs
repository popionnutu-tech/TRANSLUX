// Pasul 4: urmele candidatelor, pe loturi (ION-71). Copie a cod/schelet.mjs (ION-45) cu:
//  · intrarea = etalon-ideal.json (linii rută×linie cu TOATE candidatele, sept. întâi); lotul --lot=N ia următoarele 8
//    candidate NEÎNCERCATE ale liniei (loturile 0 și 1 din septembrie, lotul 2 rezervat pentru mai–iulie);
//  · doar `plin` (fără gol), tăiat la capăt pe urma brută apoi Valhalla; ancorat la POARTA CURSEI (tur → pOut, retur ← pIn);
//  · schelet-cand.json = { cand: {cheie: …}, incercate: {cheie: motiv} }, cheia ruta|linie|zi|schimb|m, scris prin ÎMBINARE;
//  · --doar=R27|Danu,R9|Cobani desenează doar liniile date (și tot îmbină). Plafon: 24 de candidate încercate pe linie.
import { writeFileSync as __wfs, renameSync as __rn } from 'node:fs';
const scrieAtomic = (f, x) => { __wfs(f + '.tmp', x); __rn(f + '.tmp', f); };   // F3 v5 (R3-1): fără rescriere pe loc
import pg from 'pg';
import { loadPlaces, buildPlacesIndex } from '/root/lde-worker/places-index.mjs';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
const VALHALLA = 'http://localhost:8002/trace_route', RUTA = 'http://localhost:8002/route';
const R_CAP = 1.5, R_SAT = 0.8, MAR = 8, PLAFON = 24, SEPT = '2026-09-01';
const LOT = Number((process.argv.find(a => a.startsWith('--lot=')) || '--lot=0').slice(6));
const DOAR_ARG = process.argv.find(a => a.startsWith('--doar=')); const DOAR = DOAR_ARG ? new Set(DOAR_ARG.slice(7).split(',')) : null; const DEBUG = process.argv.includes('--debug');
const IN = '../../date/ideal-v3.1/etalon-ideal.json', CAND = '../../date/ideal-v3.1/schelet-cand.json', NOM = '../../date/ideal-v3.1/nomenclator.json';
const BBOX = { la0: 45, la1: 49, lo0: 26, lo1: 31 };
const inBox = c => c[0] > BBOX.la0 && c[0] < BBOX.la1 && c[1] > BBOX.lo0 && c[1] < BBOX.lo1;
const nmea = v => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s)); };
const hc = (a, b) => hav({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
function decode(str, prec = 6) {
  let i = 0, lat = 0, lon = 0; const out = []; const f = Math.pow(10, prec);
  while (i < str.length) { let b, sh = 0, res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
    lat += ((res & 1) ? ~(res >> 1) : (res >> 1)); sh = 0; res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
    lon += ((res & 1) ? ~(res >> 1) : (res >> 1));
    out.push([+(lat / f).toFixed(5), +(lon / f).toFixed(5)]); }
  return out;
}
async function snap(pts) {
  const rar = []; let last = null;
  for (const p of pts) { if (!last || hav(last, p) > 0.09) { rar.push(p); last = p; } }
  if (rar.length < 3) return null;
  const tot = [];
  for (let i = 0; i < rar.length; i += 200) {
    const b = rar.slice(Math.max(0, i - 5), i + 200); let sh = [];
    try { const r = await fetch(VALHALLA, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shape: b.map(p => ({ lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6) })), costing: 'bus', shape_match: 'map_snap' }), signal: AbortSignal.timeout(60000) });
      const j = await r.json(); const legs = j?.trip?.legs;
      if (Array.isArray(legs)) for (const l of legs) if (l.shape) sh.push(...decode(l.shape));
    } catch { sh = []; }
    const lb = b.reduce((k, p, j) => j ? k + hav(b[j - 1], p) : 0, 0);
    const ls = sh.reduce((k, p, j) => j ? k + hc(sh[j - 1], p) : 0, 0);
    if (sh.length < 2 || ls < 0.85 * lb) sh = b.map(p => [p.lat, p.lon]);
    if (tot.length) { const c = tot[tot.length - 1]; while (sh.length && hc(sh[0], c) < 0.05) sh.shift(); }
    tot.push(...sh);
  }
  const curat = tot.filter(inBox); if (curat.length < 3) return null;
  const plin = [curat[0]];
  for (let i = 1; i < curat.length; i++) { const a = curat[i - 1], b = curat[i], dk = hc(a, b);
    if (dk > 1.2 && dk < 120) { for (const c of await drum(a, b)) plin.push(c); }
    plin.push(b); }
  const out = []; let lp = null;
  for (const c of plin) { if (!lp || hc(lp, c) > 0.04) { out.push([+c[0].toFixed(5), +c[1].toFixed(5)]); lp = c; } }
  return out.length > 2 ? out : null;
}
async function drum(a, b) {
  try { const r = await fetch(RUTA, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: [{ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }], costing: 'bus', units: 'kilometers' }), signal: AbortSignal.timeout(30000) });
    const j = await r.json(); const legs = j?.trip?.legs; const out = [];
    if (Array.isArray(legs)) for (const l of legs) if (l.shape) for (const c of decode(l.shape)) if (inBox(c)) out.push(c);
    return out; } catch { return []; }
}
const N = JSON.parse(readFileSync(NOM, 'utf8'));
const GATE = Object.fromEntries(N.porti.map(g => [g.nume, [g.lat, g.lon]]));
const E = JSON.parse(readFileSync(IN, 'utf8')).filter(e => e.cand.length && (!DOAR || DOAR.has(e.ruta + '|' + e.linie)));
const SC = existsSync(CAND) ? JSON.parse(readFileSync(CAND, 'utf8')) : { cand: {}, incercate: {} };
const dimInainte = existsSync(CAND) ? statSync(CAND).size : 0;
const idx = buildPlacesIndex(loadPlaces('/root/lde-worker/places.geojsonseq'));
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432),
  user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
await t.connect();
const { rows: devs } = await t.query(`SELECT id,"CarName","RegNo" FROM devices WHERE active=true`);
const canonP = s => { const p = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const m = p.match(/^([A-Z]{3})(\d{3})$/); return m ? m[2] + m[1] : p; };
const ePlaca = p => /^\d{3}[A-Z]{2,4}$/.test(p) || /^[A-Z]{1,3}\d{3,4}$/.test(p);
const placaDev = d => { const a = canonP(d.CarName), b = canonP(d.RegNo); return ePlaca(a) ? a : (ePlaca(b) ? b : (a || b)); };
const idDupa = new Map(); for (const d of devs) { const p = placaDev(d); if (!idDupa.has(p)) idDupa.set(p, []); idDupa.get(p).push(d.id); }
// mașina unită de fix-dubluri (IMEI → placă): urma se citește de pe TOATE dispozitivele plăcii + ale IMEI-ului unit
const DUBL = existsSync('../../date/ideal-v3.1/dubluri-ideal.json') ? JSON.parse(readFileSync('../../date/ideal-v3.1/dubluri-ideal.json', 'utf8')) : {};
const idsMasina = m => m.includes('#') ? [m.split('#')[1]] : [...(idDupa.get(m) || []), ...((DUBL[m] || []).flatMap(x => idDupa.get(x) || []))];
const utc = t => new Date(t).toISOString().replace('Z', '');
async function forma(masina, t0, t1) {
  const { rows } = await t.query(`SELECT w_date,x,y FROM track WHERE id = ANY($1) AND w_date>=$2 AND w_date<=$3 ORDER BY w_date`, [idsMasina(masina), utc(t0), utc(t1)]);
  return rows.length < 8 ? null : rows.map(r => [nmea(Number(r.x)), nmea(Number(r.y))]);
}
const lungime = s => { let k = 0; for (let i = 1; i < s.length; i++) k += hc(s[i - 1], s[i]); return k; };
const pePosea = async b => { if (b.length < 3) return b.map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]);
  const s = await snap(b.map(p => ({ lat: p[0], lon: p[1] }))); return s || b.map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]); };
// tăietura la capăt pe urma brută (ca la ION-45), apoi doar partea cu oameni pe șosea, apoi ancorarea la poarta cursei
async function taie(f, cap, sens, rt, poarta) {
  const runs = []; let run = null;
  f.forEach((p, i) => { const d = hc(p, cap); if (d <= R_CAP) { if (!run || d < run.d) run = { d, i }; } else if (run) { runs.push(run); run = null; } });
  if (run) runs.push(run);
  if (!runs.length) return null;
  const a = rt ? (sens === 'retur' ? runs[0] : runs[runs.length - 1]) : (sens === 'tur' ? runs[0] : runs[runs.length - 1]);
  const pBrut = sens === 'tur' ? f.slice(a.i) : f.slice(0, a.i + 1);
  let plin = await pePosea(pBrut);
  const G = GATE[poarta] || GATE.EST; let ancorat = 0;
  const capG = sens === 'tur' ? plin[plin.length - 1] : plin[0]; const dG = hc(capG, G);
  if (dG > 0.15) { let leg = dG > 1.2 ? (sens === 'tur' ? await drum(capG, G) : await drum(G, capG)) : [];
    if (leg.length < 2) leg = sens === 'tur' ? [capG, G] : [G, capG];
    ancorat = lungime(leg); plin = sens === 'tur' ? [...plin, ...leg.slice(1)] : [...leg.slice(0, -1), ...plin]; }
  const sate = []; let ult = null;
  for (let i = 0; i < plin.length; i++) { const n = idx.nearestWithin({ lat: plin[i][0], lon: plin[i][1] }, R_SAT);
    if (!n) { ult = null; continue; } if (ult === n.name) continue; ult = n.name; sate.push({ n: n.name, c: plin[i] }); }
  return { plin, km: +lungime(plin).toFixed(1), brut: +lungime(pBrut).toFixed(1), ancorat: +ancorat.toFixed(2), poarta: poarta || null, sate };
}
let desenate = 0, esuate = 0, sarite = 0;
for (const e of E) {
  const key = z => `${e.ruta}|${e.linie}|${z.z}|${z.schimb}|${z.m}`;
  const tried = z => SC.cand[key(z)] || SC.incercate[key(z)];
  const nTried = e.cand.filter(tried).length;
  if (nTried >= PLAFON) { sarite++; continue; }
  const rest = e.cand.filter(z => !tried(z));
  const sept = rest.filter(z => z.z >= SEPT), vechi = rest.filter(z => z.z < SEPT);
  const lot = (LOT < 2 ? [...sept, ...vechi] : [...vechi, ...sept]).slice(0, Math.min(MAR, PLAFON - nTried));
  if (!lot.length) continue;
  const cap = { lat: e.capatC[0], lon: e.capatC[1] }; const capC = [e.capatC[0], e.capatC[1]];
  let ok = 0;
  for (const z of lot) {
    const k = key(z);
    const ft = await forma(z.m, z.tur.t0, z.tur.t1), fr = await forma(z.m, z.retur.t0, z.retur.t1);
    if (!ft || !fr) { SC.incercate[k] = 'faraUrma'; esuate++; if (DEBUG) console.log(`    ${k}: fără urmă`); continue; }
    const T = await taie(ft, capC, 'tur', z.tur.rt, z.tur.poarta), R = await taie(fr, capC, 'retur', z.retur.rt, z.retur.poarta);
    if (!T || !R) { SC.incercate[k] = 'nuAjunge'; esuate++; if (DEBUG) console.log(`    ${k}: nu ajunge la capăt (tur ${T ? 'ok' : 'NU'}, retur ${R ? 'ok' : 'NU'})`); continue; }
    SC.cand[k] = { ruta: e.ruta, linie: e.linie, zi: z.z, schimb: z.schimb, m: z.m,
      tur: { ...T, t0: z.tur.t0, t1: z.tur.t1, rt: z.tur.rt, dev: z.tur.dev ?? null }, retur: { ...R, t0: z.retur.t0, t1: z.retur.t1, rt: z.retur.rt, dev: z.retur.dev ?? null } };   // v3: + dev
    desenate++; ok++;
  }
  console.log(`  ${e.ruta.padEnd(4)} ${e.linie.padEnd(18)} lot ${LOT}: ${ok}/${lot.length} desenate (${lot.filter(z => z.z >= SEPT).length} din sept.) · încercate până acum ${nTried + lot.length}/${e.cand.length}`);
}
await t.end();
scrieAtomic(CAND, JSON.stringify(SC));
const dim = statSync(CAND).size;
console.log(`lot ${LOT}: desenate ${desenate} · eșuate ${esuate} · linii la plafon ${sarite} · schelet-cand.json ${(dim / 1e6).toFixed(1)} MB (Δ ${((dim - dimInainte) / 1e6).toFixed(1)} MB) · cand ${Object.keys(SC.cand).length} · încercate ${Object.keys(SC.incercate).length}`);
if (dim - dimInainte > 10e6 || dim > 30e6) console.log('ATENȚIE: pragul de mărime depășit (Δ >10 MB sau total >30 MB) — oprește și raportează');
