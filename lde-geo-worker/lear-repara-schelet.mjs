// Repară formele rupte din scheletul LEAR Ungheni (ION-48).
//
// Ion, 24.09.2026: «fă amândouă» — A8 Horești are turul cu 4 puncte de geometrie la un etalon de
// 41,2 km, iar B13 n-are nimic: nici capăt, nici etalon, nici formă. Restul de 27 de rute stau
// între 0,99 și 1,02 din etalon, deci nu se atinge nimic la ele.
//
// Metoda e a scheletului, nu alta: o zi bună din urma GPS, tăiată la capătul rutei, pusă pe șosea
// cu Valhalla (trace_route, map_snap). Ziua bună = cea a cărei lungime e cel mai aproape de
// mediana zilelor măsurate, dintre cele care ating și capătul, și poarta.
//
// Se scrie NUMAI la rutele cerute. Scheletul e fix prin decizia lui Ion din 23.09; asta e o
// reparație a două găuri, nu o refacere.
//
// Rulare:  node --env-file=.env lear-repara-schelet.mjs A8 B13 [--write]
import pg from 'pg';
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { loadPlaces } from './places-index.mjs';

const CALE = process.env.LEAR_SCHELET || '/root/lde-worker/lear-schelet.json';
const RUTE = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const WRITE = process.argv.includes('--write');
const DE_LA = process.env.REPARA_DE_LA || '2026-07-01';
const PANA = process.env.REPARA_PANA || '2026-09-24';
const POARTA = { lat: 47.2230, lon: 27.8016 };
const R_POARTA = 0.7, R_CAPAT = 1.0, SALT = 5;
const VALHALLA = 'http://localhost:8002';

const nmea = (v) => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s)); };
const local = (d) => new Date(new Date(d).getTime() + 6 * 3600 * 1000);
const ziLucru = (d) => new Date(local(d).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const n1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const lung = (f) => { let s = 0; for (let i = 1; i < f.length; i++)
  s += hav({ lat: f[i - 1][0], lon: f[i - 1][1] }, { lat: f[i][0], lon: f[i][1] }); return s; };
const mediana = (a) => { const q = [...a].sort((x, y) => x - y); const n = q.length;
  return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : 0; };

function decode(str, prec = 6) {
  let i = 0, lat = 0, lon = 0; const out = [], f = 10 ** prec;
  while (i < str.length) { let b, sh = 0, res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
    lat += (res & 1) ? ~(res >> 1) : (res >> 1); sh = 0; res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
    lon += (res & 1) ? ~(res >> 1) : (res >> 1);
    out.push([+(lat / f).toFixed(5), +(lon / f).toFixed(5)]); }
  return out;
}

// Urma pusă pe șosea. Când Valhalla nu potrivește o bucată răspunde 400 cu un JSON de eroare:
// `json()` reușește, dar `trip` lipsește. Bucata nepotrivită se păstrează brută, nu se aruncă —
// altfel ies linii rupte la mijloc, defectul reparat deja o dată în schelet.mjs.
async function peSosea(pts) {
  const rar = []; let ult = null;
  for (const p of pts) { if (!ult || hav(ult, p) >= 0.09) { rar.push(p); ult = p; } }
  const out = [];
  for (let i = 0; i < rar.length; i += 300) {
    const bucata = rar.slice(i, i + 300 + 1);
    if (bucata.length < 2) continue;
    try {
      const res = await fetch(`${VALHALLA}/trace_route`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shape: bucata.map((p) => ({ lat: p.lat, lon: p.lon })),
          costing: 'bus', shape_match: 'map_snap',
          directions_options: { units: 'kilometers' } }) });
      const j = res.ok ? await res.json() : null;
      const forma = (j?.trip?.legs || []).flatMap((l) => (l.shape ? decode(l.shape) : []));
      if (forma.length) { out.push(...forma); continue; }
    } catch { /* cade pe brut */ }
    out.push(...bucata.map((p) => [+p.lat.toFixed(5), +p.lon.toFixed(5)]));
  }
  // rărire la ~30 m, ca în schelet
  const fin = []; let u = null;
  for (const c of out) { if (!u || hav({ lat: u[0], lon: u[1] }, { lat: c[0], lon: c[1] }) >= 0.03) { fin.push(c); u = c; } }
  return fin;
}

const S = JSON.parse(readFileSync(CALE, 'utf8'));
const locuri = loadPlaces(process.env.PLACES_FILE);
const satC = (n) => { let b = null;
  for (const l of locuri) { if (l.name !== n) continue; const d = hav(l, POARTA); if (!b || d < b.d) b = { c: [l.lat, l.lon], d }; }
  return b?.c ?? null; };

const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432),
  user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB });
await t.connect();
const { rows: devs } = await t.query(`SELECT id,"CarName" FROM devices WHERE active=true`);

for (const id of RUTE) {
  const r = S.rute.find((x) => x.id === id);
  if (!r) { console.log(`${id}: nu există în schelet`); continue; }
  // capătul e PRIMUL sat din nomenclator care are coordonate — regula fixată pe 23.09
  let capat = null, capatC = null;
  for (const n of r.sate) { const c = satC(n); if (c) { capat = n; capatC = c; break; } }
  if (!capatC) { console.log(`${id}: niciun sat din nomenclator n-are coordonate — nu se poate repara`); continue; }
  console.log(`\n${id} · capăt ${capat} (${n1(hav({ lat: capatC[0], lon: capatC[1] }, POARTA))} km de poartă)`);

  // Îngustarea: din 163 de unități, doar cele care chiar trec pe la capăt. Fără ea, scanarea
  // pe trei luni ține zeci de minute; cu ea, sub un minut. Căutarea se face server-side, pe
  // coordonatele NMEA brute, ca să nu aducem urma degeaba.
  const xC = Math.floor(capatC[0]) * 100 + (capatC[0] % 1) * 60;
  const yC = Math.floor(capatC[1]) * 100 + (capatC[1] % 1) * 60;
  const { rows: near } = await t.query(
    `SELECT DISTINCT id FROM track WHERE w_date>=$1 AND w_date<$2
       AND x BETWEEN $3 AND $4 AND y BETWEEN $5 AND $6`,
    [DE_LA, PANA, xC - 1.2, xC + 1.2, yC - 1.2, yC + 1.2]);
  const aproape = new Set(near.map((n) => String(n.id)));
  const candidate = devs.filter((d) => aproape.has(String(d.id)));
  console.log(`  ${candidate.length} unități trec pe la capăt`);

  const zile = [];
  for (const d of candidate) {
    const { rows } = await t.query(
      `SELECT w_date,x,y FROM track WHERE id=$1 AND w_date>=$2 AND w_date<$3 ORDER BY w_date`,
      [d.id, DE_LA, PANA]);
    if (rows.length < 200) continue;
    const peZi = new Map();
    for (const q of rows) { const p = { lat: nmea(+q.x), lon: nmea(+q.y), t: new Date(q.w_date) };
      if (!Number.isFinite(p.lat) || p.lat < 45 || p.lat > 49 || p.lon < 26 || p.lon > 31) continue;
      const z = ziLucru(p.t); if (!peZi.has(z)) peZi.set(z, []); peZi.get(z).push(p); }
    for (const [z, pts] of peZi) {
      // indicii: prima apropiere de capăt, atingerile porții
      const iC = []; const iP = [];
      pts.forEach((p, i) => { if (hav(p, { lat: capatC[0], lon: capatC[1] }) <= R_CAPAT) iC.push(i);
        if (hav(p, POARTA) <= R_POARTA) iP.push(i); });
      if (!iC.length || !iP.length) continue;
      // tur: de la prima apropiere de capăt până la prima atingere a porții de după ea
      const a0 = iC[0], p1 = iP.find((i) => i > a0);
      // retur: de la ultima atingere a porții dinainte de ultima apropiere, până la ea
      const aN = iC[iC.length - 1], p0 = [...iP].reverse().find((i) => i < aN);
      if (p1 == null || p0 == null || p1 - a0 < 10 || aN - p0 < 10) continue;
      const tur = pts.slice(a0, p1 + 1), ret = pts.slice(p0, aN + 1);
      const kmT = lung(tur.map((p) => [p.lat, p.lon])), kmR = lung(ret.map((p) => [p.lat, p.lon]));
      if (kmT < 3 || kmR < 3 || kmT > 150 || kmR > 150) continue;
      zile.push({ masina: d.CarName, zi: z, tur, ret, kmT, kmR });
    }
  }
  if (!zile.length) { console.log(`  nicio zi în care o mașină să atingă și capătul, și poarta`); continue; }

  const med = mediana(zile.map((x) => (x.kmT + x.kmR) / 2));
  zile.sort((a, b) => Math.abs((a.kmT + a.kmR) / 2 - med) - Math.abs((b.kmT + b.kmR) / 2 - med));
  const buna = zile[0];
  console.log(`  ${zile.length} zile măsurate · mediana ${n1(med)} km · ziua aleasă ${buna.zi} (${buna.masina}), tur ${n1(buna.kmT)} retur ${n1(buna.kmR)}`);

  const gTur = await peSosea(buna.tur), gRet = await peSosea(buna.ret);
  const sate = [];
  for (const c of [...gTur, ...gRet]) { let b = null;
    for (const l of locuri) { const d = hav(l, { lat: c[0], lon: c[1] }); if (!b || d < b.d) b = { n: l.name, d, c: [l.lat, l.lon] }; }
    if (b && b.d <= 0.8 && !sate.some((s) => s.n === b.n)) sate.push({ n: b.n, c: b.c }); }

  console.log(`  formă nouă: tur ${gTur.length} puncte / ${n1(lung(gTur))} km · retur ${gRet.length} / ${n1(lung(gRet))} km · ${sate.length} sate`);
  if (WRITE) {
    r.capat = capat;
    r.etalon = +med.toFixed(1);
    r.tur = +buna.kmT.toFixed(1); r.retur = +buna.kmR.toFixed(1);
    r.zile = zile.length;
    // `gol` rămâne gol dinadins: linia aia era drumul pe care a nimerit mașina în ziua aleasă,
    // nu al rutei, și tocmai de aceea a fost scoasă din socoteală (vezi lear-analiza.mjs).
    r.g = { tur: { plin: gTur, gol: [], sate }, retur: { plin: gRet, gol: [], sate } };
    r.reparat = new Date().toISOString().slice(0, 10);
  }
}
await t.end();

if (WRITE) {
  if (existsSync(CALE)) copyFileSync(CALE, `${CALE}.bak`);
  writeFileSync(CALE, JSON.stringify(S));
  console.log(`\nscris ${CALE} (copia veche în ${CALE}.bak)`);
} else {
  console.log('\n(fără --write, scheletul n-a fost atins)');
}
