// ION-147 (Ion, 30.09.2026): «creează-le hărțile la toate direcțiile cu punctele optimale de dormit cum ai făcut la Drăxlmaier și LEAR».
// Parcarea propusă P1 / P2 pentru SEBN Orhei + Strășeni, din urma GPS a săptămânii — metoda LEAR ION-143 (lear-parcare.mjs, aceeași
// alegere a locurilor: ../lear-parcare/lear-parcare-alege.mjs) cu ce diferă la SEBN. Planul: docs/plans/2026-09-30-sebn-parcare/README.md;
// variantele alese (Ion, 01.10: «adaugă toate direcțiile»): docs/plans/2026-09-30-sebn-parcare/raspunsuri.md.
// Regulile SEBN: lde_uzine.reguli_livrare SEBN_ORHEI / SEBN_STRASENI (reguli_livrare_la 2026-09-26 14:35:58 UTC), §8 R1: «Livrarea: șofer din
// satul de start sau mașina așteaptă la capăt între ture, nu acasă».
//
// Intrarea: dump-ul lui sebn-dump.mjs (--dump). Ieșirea: <ieșire.json> (citit de sebn-harta.mjs). Nu scrie în bază.
//   node sebn-parcare.mjs <dump.json> <ieșire.json>
//
// Metoda (ca LEAR):
//  1. Urma se taie în curse la poartă, la staționări > 25 min și la golurile de semnal > 30 min.
//  2. Munca = tur / retur / cursa în plus / cursa fără poartă cu ≥ 2 opriri (§4.8), plus §11.12 SEBN: cursa pe ruta ei, fără poartă = muncă.
//  3. Golurile ≥ 60 min dintre bucățile de muncă = drumuri de parcare. Nu intră: < 60 min, > 12 h, la poartă (nu iese la > 2 km), Parcul Bălți
//     (§11.4, 0,5 km la ruta R23 cu capătul lângă parc), poarta altei uzine (§11.5) și — SEBN — BUCLA LA PREDAREA TUREI: golul poartă → poartă care
//     nu iese la > 5 km (lasă schimbul care intră, ocolul prin Slobozia Doamnei, așteaptă la Bucuria schimbul care iese). Bucla NU e drum de
//     parcare și nu intră în km de tăiat; pe hartă e o categorie separată (răspunsul 2). Se scrie în `bucle` pe mașină.
//  4. Real = km GPS ai golului, fără «timp liber» / brambura. Propus prin P = (V(E,P) + V(P,S)) × 1,05, V = Valhalla bus.
//  5. Candidați: casa și satele / orașele ≤ 15 km de un capăt de drum (orașul Orhei rămâne candidat — răspunsul 3). POARTA NU E CANDIDAT
//     (§2.3 «Mașina NU poate sta la uzină între ture», §8.1). Tăietura pe capăt ≤ 1,5 km (§4.3).
//  5b. Pe drum: locul cel mai ieftin din cele alese sau «rămâne cum e» (aceeași funcție ca LEAR).
//  6. Rutele mașinii: din schelet; când mașina nu trece pe capătul rutelor ei din schelet în ≥ 3 zile, rutele ale căror capete le trece în ≥ 3 zile
//     (§1.1; răspunsul 5), cu steag `ruteGps`.
//  7. Fără propunere, cu motivul: rută ADM (doar harta — răspunsul 6), controlul §10, un singur schimb măsurat, rute neverificate (> 50 % din
//     tururi / retururi fără trecere pe la capăt — 522BRAT, 893BRAX, răspunsul 5), niciun gol, propunerea nu scade km.
//  8. Locul departe de casa șoferului poartă nota «șoferul locuiește în …»: drumul șoferului spre casă nu se socotește (ca la Drăxlmaier
//     §8.9; răspunsul 4, 552BRAO Vatici / Chiperceni).
//  9. Doar zilele de lucru ÎNCHEIATE (03:00 a zilei următoare a trecut) — săptămâna curentă se poate rula parțial, luni se rescrie întreagă.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { local, ziLucru, offsetLocal } from '../ora-locala.mjs';
import { alegeLocuri } from '../lear-parcare/lear-parcare-alege.mjs';

const [IN, OUT] = process.argv.slice(2);
if (!IN || !OUT || !existsSync(IN)) { console.error('sebn-parcare.mjs <dump.json> <ieșire.json>'); process.exit(2); }
const D = JSON.parse(readFileSync(IN, 'utf8'));
if (D.uzina !== 'SEBN' || !D.masini?.every((m) => Array.isArray(m.lista))) { console.error('dump fără lista rută-pe-mașină sau nu e SEBN — rulează sebn-dump.mjs --dump'); process.exit(2); }
// 9. doar zilele de lucru încheiate: ziua z se încheie la 03:00 locală a zilei z + 1
const ACUM = Date.now(), t03 = (z) => { const u = Date.parse(`${z}T03:00:00Z`); return u - offsetLocal(u - 3 * 3600e3); };
for (const M of D.masini) M.zile = (M.zile ?? []).filter((z) => t03(z) + 24 * 3600e3 <= ACUM);
const PARTIAL = D.masini.every((M) => !M.zile.includes(D.pana_la));
const DOAR = process.env.PARCARE_DOAR ? new Set(process.env.PARCARE_DOAR.split(',')) : null, DEBUG = process.env.DEBUG_M ?? null;
let R_POARTA = 0.7; const R_CAPAT = Number(process.env.R_CAPAT ?? 1.5), PAUZA_CURSA_MIN = 25, GOL_SEMNAL_MIN = 30, OPRIRE_LUNGA_MIN = 60, R_STAT = 0.3, SALT_KM = 5;
const V_OPRIRE = 8 / 1.852, V_LENT = 15 / 1.852, R_SAT = 0.8, SEC_LENT = 20, R_SAT_POARTA = 2, R_SAT_CASA = 1.5, MARGINE_KM = 1;
const GOL_MAX_H = 12, IESIRE_POARTA_KM = 2, R_DEPOZIT = 0.5, DEPOZIT_MIN = 2, CAPETE_TAIATE_PE_OPRIRI_MAX = Number(process.env.OPRIRI_MAX ?? 0.5), BUCLA_POARTA_KM = Number(process.env.BUCLA_POARTA_KM ?? 5);
const RAZA_CAND = 15, PRAG_AL_DOILEA = 20, MIN_DRUMURI = 3, TOLERANTA = 20, VAL_F = 1.05;
const PARAM = { R_POARTA, R_CAPAT, PAUZA_CURSA_MIN, OPRIRE_LUNGA_MIN, V_OPRIRE_KMH: 8, V_LENT_KMH: 15, R_SAT, SEC_LENT, GOL_MAX_H, IESIRE_POARTA_KM,
  R_DEPOZIT, RAZA_CAND, PRAG_AL_DOILEA, MIN_DRUMURI, TOLERANTA, VAL_F };
const r1 = (x) => Math.round(x * 10) / 10, r5 = (x) => Math.round(x * 1e5) / 1e5;
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
let G = null; const PORTI_S = Object.values(D.porti).map((u) => ({ ...u.poarta, r: u.rPoarta, n: u.nume })); const PARC = D.parc, ALTE = (D.alteUzine ?? []).map((g) => ({ lat: g.lat, lon: g.lon, r: g.r ?? 0.5, n: g.nume }));
const minZi = (t) => { const d = local(t); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const inFer = (m, f) => (f.de_la_min <= f.pana_la_min ? m >= f.de_la_min && m <= f.pana_la_min : m >= f.de_la_min || m <= f.pana_la_min);
const FT = D.ferestre.filter((f) => f.sens === 'tur'), FR = D.ferestre.filter((f) => f.sens === 'retur');
const oraL = (t) => local(t).toISOString().slice(11, 16);

// localitățile (OSM): candidații, numele și satele pentru opriri (grilă de 0,02°)
const LOC = [], GRILA = new Map(), gk = (la, lo) => `${Math.floor(la / 0.02)}|${Math.floor(lo / 0.02)}`;
for (const l of readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) {
  if (!l.includes('"place"')) continue; let g; try { g = JSON.parse(l.replace(/^\x1e/, '')); } catch { continue; }
  const fel = g.properties?.place ?? ''; if (!/^(village|town|city|hamlet)$/.test(fel)) continue;
  const [lon, lat] = g.geometry.coordinates; if (!(lat > 45.3 && lat < 48.7 && lon > 26.4 && lon < 30.3)) continue;
  const x = { n: g.properties.name, lat, lon, fel }; if (fel !== 'hamlet') LOC.push(x);
  const k = gk(lat, lon); (GRILA.get(k) ?? GRILA.set(k, []).get(k)).push(x);
}
function satLa(p) { const a = Math.floor(p.lat / 0.02), b = Math.floor(p.lon / 0.02); let best = null, bd = R_SAT;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of GRILA.get(`${a + i}|${b + j}`) ?? []) { const d = hav(p, s); if (d <= bd) { bd = d; best = s; } } return best; }
const numeLoc = (p) => { { const g = PORTI_S.find((x) => hav(p, x) <= x.r + 0.3); if (g) return `poarta SEBN ${g.n}`; } if (hav(p, PARC) <= 1) return 'Parcul Bălți';
  let b = null, d = 1e9; for (const s of LOC) { const k = hav(p, s); if (k < d) { d = k; b = s.n; } } return d <= 2 ? b : `${b} (${r1(d)} km)`; };

// Valhalla: matricea bus, cu cache pe disc
const CACHE_F = process.env.SEBN_PARCARE_CACHE || new URL('./drum-cache.json', import.meta.url).pathname;
const cache = existsSync(CACHE_F) ? new Map(Object.entries(JSON.parse(readFileSync(CACHE_F, 'utf8')))) : new Map();
const kc = (a, b) => `${a.lat.toFixed(4)},${a.lon.toFixed(4)}|${b.lat.toFixed(4)},${b.lon.toFixed(4)}`;
async function matrice(src, dst) {
  const lipsa = []; for (const a of src) for (const b of dst) if (hav(a, b) >= 0.3 && !cache.has(kc(a, b))) lipsa.push([a, b]);
  const S = [...new Map(lipsa.map(([a]) => [kc(a, a), a])).values()], T = [...new Map(lipsa.map(([, b]) => [kc(b, b), b])).values()];
  for (let i = 0; i < S.length; i += 40) for (let j = 0; j < T.length; j += 60) {
    const s = S.slice(i, i + 40), t = T.slice(j, j + 60);
    const r = await fetch('http://localhost:8002/sources_to_targets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000),
      body: JSON.stringify({ sources: s.map((p) => ({ lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6) })), targets: t.map((p) => ({ lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6) })), costing: 'bus', units: 'kilometers' }) });
    const j2 = await r.json();
    (j2.sources_to_targets ?? []).forEach((row, a) => row.forEach((c, b) => { if (c?.distance != null) cache.set(kc(s[a], t[b]), c.distance); }));
  }
}
let faraValhalla = 0; const lipsaV = [];
const V = (a, b) => { if (hav(a, b) < 0.3) return hav(a, b); const d = cache.get(kc(a, b)); if (d == null) { faraValhalla++; if (lipsaV.length < 5) lipsaV.push(kc(a, b)); } return (d ?? hav(a, b) * 1.4) * VAL_F; };

// km-ii urmei între două momente (ca în lear-timp-liber: saltul și deriva mașinii oprite nu se numără)
function kmIntre(P, t0, t1) { let s = 0; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i]; if (b.t <= t0 || a.t >= t1) continue;
  const d = hav(a, b); if (d < SALT_KM && !(a.v <= 1 && b.v <= 1)) s += d; } return s; }
const pozLa = (P, t) => { let b = P[0]; for (const p of P) { if (p.t > t) break; b = p; } return b; };

// Intersecțiile (revizia Claude r2): o încetinire scurtă (sub 8 km/h, ≤ 90 s) în același loc (celulă ~150 m) la ≥ 5 mașini și în ≥ 4 ore diferite
// e infrastructură — semafor, trecere, intersecție — nu punct de urcare; punctele lente de acolo nu fac «oprire» (§4.8).
const CEL = (p) => `${Math.floor(p.lat / 0.00135)}|${Math.floor(p.lon / 0.002)}`, INFRA = new Set();
{ const cel = new Map();
  for (const M of D.masini) { const P = M.pts; let i = 0;
    while (i < P.length) { if (!(P[i][3] < V_OPRIRE)) { i++; continue; } let j = i; while (j + 1 < P.length && P[j + 1][3] < V_OPRIRE) j++;
      const p = { lat: P[i][1], lon: P[i][2] };
      if (P[j][0] - P[i][0] <= 90e3 && PORTI_S.every((g) => hav(p, g) > R_SAT_POARTA)) { const k = CEL(p); const x = cel.get(k) ?? cel.set(k, { m: new Set(), h: new Set() }).get(k); x.m.add(M.m); x.h.add(local(P[i][0]).getUTCHours()); }
      i = j + 1; } }
  for (const [k, x] of cel) if (x.m.size >= 5 && x.h.size >= 4) { const [a, b] = k.split('|').map(Number); INFRA.add(k); } }
// Bălți (revizia Claude r2): nicio mașină LEAR n-are treabă la Bălți — oprirea ≥ 2 min la ≤ 4 km de depozit e service (§5.4 / §11.4)
const R_BALTI_LEAR = 4;
const SCHELET = JSON.parse(readFileSync(process.env.SEBN_SCHELET || '/root/lde-worker/sebn-schelet.json', 'utf8'));
const masini = [];
for (const M of D.masini) {
  if (DOAR && !DOAR.has(M.m)) continue;
  G = M.poarta; R_POARTA = M.rPoarta ?? 0.7;
  // ruta ADM Bălți (R23) are capătul la ~1 km de Parcul Bălți: acolo raza «service» rămâne cea din §11.4 (0,5 km), nu 4 km
  const R_BALTI = M.lista.some((r) => r.capatC && hav({ lat: r.capatC[0], lon: r.capatC[1] }, PARC) <= 4) ? R_DEPOZIT : R_BALTI_LEAR;
  const P = M.pts.map(([t, lat, lon, v]) => ({ t, lat, lon, v })).sort((a, b) => a.t - b.t);
  const zileM = new Set(M.zile), casa = M.casaC ? { lat: M.casaC[0], lon: M.casaC[1] } : null;
  // 6. rutele din GPS (răspunsul 5): mașina fără rută în schelet (sau cu ruta din schelet netrecută ≥ 3 zile) ia rutele ale căror capete le trece
  // în ≥ 3 zile (§1.1: cine face ruta se vede din GPS). Lista din schelet se ține pentru regula ADM (răspunsul 6).
  const listaSchelet = M.lista;
  {
    const SK = SCHELET.rute.filter((r) => r.c);
    const zileCap = (r) => new Set(M.pts.filter(([t, la, lo]) => zileM.has(ziLucru(t)) && hav({ lat: la, lon: lo }, { lat: r.c[0], lon: r.c[1] }) <= R_CAPAT).map(([t]) => ziLucru(t))).size;
    const vii = M.lista.filter((r) => r.capatC && zileCap({ c: r.capatC }) >= 3);
    if (!vii.length) { const gps = SK.filter((r) => zileCap(r) >= 3).map((r) => ({ id: `${r.id}·GPS`, capat: r.capat, capatC: r.c }));
      if (gps.length) { M.lista = gps; M.ruteGps = true; } } }
  const capete = [...M.lista, ...M.rute, ...M.comasate].filter((r) => r.capatC).map((r) => ({ n: r.capat, id: r.id, lat: r.capatC[0], lon: r.capatC[1] }))
    .filter((c, i, a) => a.findIndex((x) => hav(x, c) < 0.3) === i);
  const adm = listaSchelet.length > 0 && listaSchelet.every((r) => r.adm);
  const baza = { m: M.m, casa: M.casa, rute: [...new Set([...M.rute, ...M.lista].map((r) => `${r.id} ${r.capat}`))], linii: [...new Set(M.lista.map((r) => String(r.id).replace('·GPS', '')))],
    ruteGps: !!M.ruteGps, adm, poarta: PORTI_S.find((g) => hav(g, M.poarta) < 0.5)?.n ?? null, locuri: [], legi: [], zile: [], bucati: [], bucle: [] };
  if (P.length < 100) { masini.push({ ...baza, motivFara: 'urmă prea scurtă' }); continue; }

  // 1. cursele: tăiate la poartă (lipit cât timp nu iese din rază), la staționări > 25 min și la golurile de semnal > 30 min
  const ancore = [];   // {t0, t1, poarta}
  { let cur = null;
    for (let i = 0; i < P.length; i++) { const p = P[i];
      if (hav(p, G) <= R_POARTA) { if (cur?.poarta && (i === 0 || hav(P[i - 1], G) <= R_POARTA)) cur.t1 = p.t; else { cur = { t0: p.t, t1: p.t, poarta: true }; ancore.push(cur); } }
      else cur = null; } }
  { let a0 = 0;
    for (let i = 1; i <= P.length; i++) {
      const rupt = i === P.length || hav(P[a0], P[i]) > R_STAT || P[i].t - P[i - 1].t > GOL_SEMNAL_MIN * 60e3;
      if (rupt) { if (P[i - 1].t - P[a0].t >= PAUZA_CURSA_MIN * 60e3 && hav(P[a0], G) > R_POARTA) ancore.push({ t0: P[a0].t, t1: P[i - 1].t, poarta: false, lat: P[a0].lat, lon: P[a0].lon });
        if (i < P.length && P[i].t - P[i - 1].t > GOL_SEMNAL_MIN * 60e3) ancore.push({ t0: P[i - 1].t, t1: P[i].t, poarta: false, semnal: true, peLoc: hav(P[i - 1], P[i]) <= 0.5, lat: P[i - 1].lat, lon: P[i - 1].lon });
        a0 = i; } } }
  ancore.sort((a, b) => a.t0 - b.t0);
  // ancorele care se suprapun (semnal rar cât mașina stă la poartă: un punct pe oră) se lipesc; cea care atinge poarta e poartă
  for (let k = ancore.length - 1; k > 0; k--) { const a = ancore[k - 1], b = ancore[k];
    if (b.t0 <= a.t1 + 60e3) { a.t1 = Math.max(a.t1, b.t1); a.poarta = a.poarta || b.poarta; a.peLoc = (a.semnal ? !!a.peLoc : true) && (b.semnal ? !!b.peLoc : true); a.semnal = !!(a.semnal && b.semnal); ancore.splice(k, 1); } }
  const curse = [];
  for (let k = 0; k + 1 < ancore.length; k++) { const a = ancore[k], b = ancore[k + 1]; if (b.t0 <= a.t1) continue;
    const Q = P.filter((p) => p.t >= a.t1 && p.t <= b.t0); if (Q.length < 2) continue;
    curse.push({ t0: a.t1, t1: b.t0, dePoarta: a.poarta, laPoarta: b.poarta, Q }); }
  // opririle în sate (§4.8), fără satele de lângă poartă / casă și fără primul / ultimul km al cursei
  function opresteLaQ(Q, c, r) { let t = null; for (const p of Q) { if (hav(p, c) <= r && p.v <= 1) { t ??= p.t; if (p.t - t >= DEPOZIT_MIN * 60e3) return true; } else t = null; } return false; }
  function opriri(c) { const out = []; const Q = c.Q, s0 = Q[0], s1 = Q.at(-1); let run = null;
    const inchide = () => { if (run && run.lent && run.sec >= SEC_LENT) out.push({ n: run.sat.n, t: run.t, t1: run.t1, lat: run.sat.lat, lon: run.sat.lon }); run = null; };
    for (let i = 1; i < Q.length; i++) { const p = Q[i], sat = satLa(p);
      const ok = sat && hav(sat, G) > R_SAT_POARTA && !(casa && hav(sat, casa) <= R_SAT_CASA) && hav(p, s0) > MARGINE_KM && hav(p, s1) > MARGINE_KM;
      if (!ok || (run && run.sat !== sat)) inchide(); if (!ok) continue;
      run ??= { sat, t: p.t, t1: p.t, sec: 0, oprit: 0, lent: false }; run.t1 = p.t;
      if (p.v <= 1) run.oprit += Math.min(60, (p.t - Q[i - 1].t) / 1000);
      if (p.v < V_LENT) run.sec += Math.min(60, (p.t - Q[i - 1].t) / 1000);
      if (p.v < V_OPRIRE && (!INFRA.has(CEL(p)) || run.oprit >= SEC_LENT)) run.lent = true; }
    inchide(); return out.filter((o, i, a) => i === 0 || a[i - 1].n !== o.n || o.t - a[i - 1].t > 10 * 60e3); }
  // apropierea de capăt (≤ 1 km): pe tur prima, pe retur ultima — punctul cel mai apropiat din acea trecere
  function apropiere(Q, ultima) { const runs = []; let r = null;
    for (const p of Q) { const c = capete.find((x) => hav(p, x) <= R_CAPAT); if (c && r && r.c === c) r.pts.push(p); else if (c) { r = { c, pts: [p] }; runs.push(r); } else r = null; }
    const x = ultima ? runs.at(-1) : runs[0]; if (!x) return null;
    return x.pts.reduce((b, p) => (hav(p, x.c) < hav(b, x.c) ? p : b)); }
  const munca = [];
  for (const c of curse) {
    const op = opriri(c), n = op.length;
    if (c.laPoarta && !c.dePoarta) { const ap = apropiere(c.Q, false); if (!(ap ? n >= 1 || FT.some((f) => inFer(minZi(c.t1), f)) : n >= 2)) continue;
      const t0 = ap ? ap.t : op[0].t; munca.push({ fel: 'tur', t0, t1: c.t1, de: pozLa(P, t0), pana: G, taiat: ap ? 'capat' : 'opriri', opriri: n }); }
    else if (c.dePoarta && !c.laPoarta) { const ap = apropiere(c.Q, true); if (!(ap ? n >= 1 || FR.some((f) => inFer(minZi(c.t0), f)) : n >= 2)) continue;
      const t1 = ap ? ap.t : op.at(-1).t; munca.push({ fel: 'retur', t0: c.t0, t1, de: G, pana: pozLa(P, t1), taiat: ap ? 'capat' : 'opriri', opriri: n }); }
    else if (c.dePoarta && c.laPoarta) { if (n) munca.push({ fel: 'plus', t0: c.t0, t1: c.t1, de: G, pana: G, taiat: apropiere(c.Q, false) ? 'capat' : 'opriri', opriri: n }); }
    else if (n >= 2 && !opresteLaQ(c.Q, PARC, R_BALTI) && hav(c.Q.at(-1), PARC) > R_BALTI) munca.push({ fel: 'fara-poarta', t0: op[0].t, t1: op.at(-1).t, de: pozLa(P, op[0].t), pana: pozLa(P, op.at(-1).t), taiat: apropiere(c.Q, false) ? 'capat' : 'opriri', opriri: n });
  }
  // §11.12 SEBN: cursa pe ruta ei, fără poartă (≥ 80 % pe drumul mașinii) = muncă
  for (const x of M.peRuta ?? []) munca.push({ fel: 'pe-ruta', t0: x.t0, t1: x.t1, de: pozLa(P, x.t0), pana: pozLa(P, x.t1), taiat: 'r11.12', opriri: 0 });
  munca.sort((a, b) => a.t0 - b.t0);
  if (DEBUG === M.m) for (const w of munca) console.error(`  ${w.fel} ${oraL(w.t0)}–${oraL(w.t1)} ${ziLucru(w.t0)} ${numeLoc(w.de)} → ${numeLoc(w.pana)} taiat=${w.taiat} opriri=${w.opriri}`);
  // schimburile măsurate (§8.3): o fereastră de tur / retur a schimbului atinsă în ≥ 2 zile
  const zileSchimb = new Map();
  // sosirea cu oameni (tur, sau cursa «în plus» care vine la poartă) în fereastra de tur și plecarea cu oameni în fereastra de retur
  const puneSchimb = (f, t) => { if (f && zileM.has(ziLucru(t))) (zileSchimb.get(f.shift_number) ?? zileSchimb.set(f.shift_number, new Set()).get(f.shift_number)).add(ziLucru(t)); };
  for (const w of munca) {
    if (w.fel === 'tur' || w.fel === 'plus') puneSchimb(FT.find((x) => inFer(minZi(w.t1), x)), w.t1);
    if (w.fel === 'retur' || w.fel === 'plus') puneSchimb(FR.find((x) => inFer(minZi(w.t0), x)), w.t0); }
  const schimburi = [...zileSchimb.values()].filter((s) => s.size >= 2).length;
  const tr = munca.filter((w) => w.fel === 'tur' || w.fel === 'retur'), peOpriri = tr.filter((w) => w.taiat === 'opriri').length;
  const stat = { tur: munca.filter((w) => w.fel === 'tur').length, retur: munca.filter((w) => w.fel === 'retur').length, plus: munca.filter((w) => w.fel === 'plus').length,
    faraPoarta: munca.filter((w) => w.fel === 'fara-poarta').length, taiatePeOpriri: peOpriri, schimburi, scurte: 0, lungi: 0, laPoarta: 0, depozit: 0, altaUzina: 0, kmLiberScos: 0, goluriCuOpriri: 0, goluriTaiate: 0 };
  // bucățile care se suprapun se lipesc
  const lant = []; for (const w of munca) { const u = lant.at(-1); if (u && w.t0 <= u.t1) { if (w.t1 > u.t1) { u.t1 = w.t1; u.pana = w.pana; u.fel += `+${w.fel}`; } } else lant.push({ ...w }); }
  // 3. golurile
  const legi = [];
  for (let i = 0; i + 1 < lant.length; i++) {
    const a = lant[i], b = lant[i + 1], ore = (b.t0 - a.t1) / 3600e3, z = ziLucru(a.t1);
    if (!zileM.has(z)) continue;
    if (ore * 60 < OPRIRE_LUNGA_MIN) { stat.scurte++; continue; }
    if (ore > GOL_MAX_H) { stat.lungi++; continue; }
    const Q = P.filter((p) => p.t >= a.t1 && p.t <= b.t0);
    if (!Q.some((p) => hav(p, G) > IESIRE_POARTA_KM)) { stat.laPoarta++; continue; }
    // SEBN: predarea la poartă — lasă schimbul care intră, face bucla prin Slobozia Doamnei (3,7 km) și așteaptă la Bucuria schimbul care iese;
    // nu e drum de parcare și nu intră în km de tăiat (răspunsul 2); harta o arată separat («buclă la predarea turei»)
    if (hav(a.pana, G) <= R_POARTA + 0.3 && hav(b.de, G) <= R_POARTA + 0.3 && !Q.some((p) => hav(p, G) > BUCLA_POARTA_KM)) {
      const kb = kmIntre(P, a.t1, b.t0); stat.buclaPoarta = (stat.buclaPoarta ?? 0) + 1; stat.kmBuclaPoarta = r1((stat.kmBuclaPoarta ?? 0) + kb);
      baza.bucle.push({ z, t0: a.t1, t1: b.t0, km: r1(kb) }); continue; }
    const opresteLa = (c, r) => { let t = null; for (const p of Q) { if (hav(p, c) <= r && p.v <= 1) { t ??= p.t; if (p.t - t >= DEPOZIT_MIN * 60e3) return true; } else t = null; } return false; };
    if (opresteLa(PARC, R_BALTI)) { stat.depozit++; continue; }
    if (ALTE.some((g) => opresteLa(g, g.r))) { stat.altaUzina++; continue; }
    // unde stă acum: cea mai lungă staționare din gol (și la poartă)
    const st = ancore.filter((s) => (!s.semnal || s.peLoc) && s.t0 < b.t0 && s.t1 > a.t1).map((s) => ({ ...s, lat: s.poarta ? G.lat : s.lat, lon: s.poarta ? G.lon : s.lon, d: Math.min(s.t1, b.t0) - Math.max(s.t0, a.t1) }))
      .sort((x, y) => y.d - x.d)[0] ?? null;
    const sta = st && st.d >= OPRIRE_LUNGA_MIN * 60e3 ? st : null;
    // controlul (§10): un drum de parcare nu duce oameni. Opririle în sate din gol (în afara locului unde stă) sunt muncă: oamenii lăsați după
    // capăt se duc până la ultima oprire dinaintea staționării, cei luați înainte de capăt de la prima oprire de după ea — drumul de parcare
    // rămâne între ele. Fără staționare lungă, golul cu opriri nu e drum de parcare deloc.
    const op = opriri({ Q }).filter((o) => !(sta && hav(o, sta) <= 1.5));
    let tE = a.t1, tS = b.t0;
    if (op.length) {
      if (!sta) { stat.goluriCuOpriri++; continue; }
      const inainte = op.filter((o) => o.t <= Math.max(sta.t0, a.t1)), dupa = op.filter((o) => o.t >= Math.min(sta.t1, b.t0));
      if (inainte.length + dupa.length < op.length) { stat.goluriCuOpriri++; continue; }   // opriri în timpul staționării = altă cursă, nu parcare
      if (inainte.length) tE = inainte.at(-1).t1; if (dupa.length) tS = dupa[0].t;
      stat.goluriTaiate++;
      if (tE > a.t1) { a.t1 = tE; a.pana = pozLa(P, tE); a.fel += '+opriri'; }
      if (tS < b.t0) { b.t0 = tS; b.de = pozLa(P, tS); b.fel = `opriri+${b.fel}`; }
      if ((tS - tE) / 60e3 < OPRIRE_LUNGA_MIN) { stat.scurte++; continue; }
    }
    const E = pozLa(P, tE), S = pozLa(P, tS), brut = kmIntre(P, tE, tS);
    // «timp liber» și brambura (§11) se numără separat: liberul din gol se scade întreg, brambura pe partea din gol
    let liber = 0;
    for (const x of M.liber ?? []) { const t0 = Math.max(x.t0, tE), t1 = Math.min(x.t1, tS); if (t1 <= t0) continue;
      if (x.et === 'liber') liber += kmIntre(P, t0, t1); else liber += (x.kmB ?? 0) * Math.min(1, (t1 - t0) / Math.max(1, x.t1 - x.t0)); }
    liber = Math.min(liber, brut); stat.kmLiberScos += liber;
    legi.push({ opririMutate: op.map((o) => `${o.n} ${oraL(o.t)}`), z, t0: tE, t1: tS, ora: `${oraL(tE)}–${oraL(tS)}`, ore: r1((tS - tE) / 3600e3), dupa: a.fel, inainte: b.fel, E: { lat: E.lat, lon: E.lon }, S: { lat: S.lat, lon: S.lon },
      brut, liber, real: brut - liber, acum: sta ? { lat: sta.lat, lon: sta.lon, n: sta.poarta ? 'poarta SEBN' : numeLoc(sta), min: Math.round(sta.d / 60e3) } : null });
  }
  stat.kmLiberScos = r1(stat.kmLiberScos);
  for (const l of legi) { const Q2 = P.filter((p) => p.t >= l.t0 && p.t <= l.t1); const rest = opriri({ Q: Q2 }).filter((o) => !(l.acum && hav(o, l.acum) <= 1.5)); if (rest.length) (stat.control ??= []).push(`${l.ora} ${rest.map((o) => o.n).join(', ')}`); }

  const bucati = lant.map((w) => ({ fel: w.fel, t0: w.t0, t1: w.t1, de: [r5(w.de.lat), r5(w.de.lon)], pana: [r5(w.pana.lat), r5(w.pana.lon)], taiat: w.taiat }));
  const cuStat = { ...baza, stat, bucati };
  if (adm) { masini.push({ ...cuStat, motivFara: `rută ADM (${listaSchelet.map((r) => r.id).join(', ')}) — doar harta, fără parcare propusă (program de birou, §2.5)` }); continue; }
  if (stat.control?.length) { masini.push({ ...cuStat, motivFara: `controlul §10: opriri în drumul de parcare (${stat.control.slice(0, 3).join('; ')})` }); continue; }
  if (schimburi < 2) { masini.push({ ...cuStat, motivFara: 'un singur schimb măsurat în săptămână (§8.3)' }); continue; }
  if (tr.length && peOpriri / tr.length > CAPETE_TAIATE_PE_OPRIRI_MAX) { masini.push({ ...cuStat, motivFara: `rute neverificate: ${peOpriri} din ${tr.length} tururi și retururi nu trec pe la capătul rutelor ei` }); continue; }
  if (!legi.length) { masini.push({ ...cuStat, motivFara: 'niciun gol în care mașina să stea (≥ 60 min) în zilele de lucru' }); continue; }
  // 5. candidații
  const capL = legi.flatMap((l) => [l.E, l.S]);
  const cand = LOC.filter((L) => capL.some((p) => hav(p, L) <= RAZA_CAND) && hav(L, PARC) > 3).map((L) => ({ n: L.n, lat: L.lat, lon: L.lon, fel: L.fel }));
  // poarta NU e candidat (§2.3 / §8.1); nici satele din raza porții, unde mașina ar sta tot «la uzină»
  for (let q = cand.length - 1; q >= 0; q--) if (PORTI_S.some((g) => hav(cand[q], g) <= g.r)) cand.splice(q, 1);
  if (casa) cand.push({ n: `acasă (${M.casa})`, lat: casa.lat, lon: casa.lon, fel: 'casa' });
  const opr = legi.map((l) => l.acum).filter(Boolean);
  for (const c of cand) c.pref = new Set(legi.filter((l) => l.acum && hav(l.acum, c) <= 1).map((l) => l.z)).size >= 2 ? 2 : (c.fel === 'town' || c.fel === 'city') ? 1 : 0;
  await matrice(legi.map((l) => l.E), cand); await matrice(cand, legi.map((l) => l.S));
  // locul la care Valhalla nu găsește drum (nici bus) nu e candidat — fără estimări pe linie dreaptă (§8.2)
  // proba Codex r2 C5: LEAR_PARCARE_FARA_DRUM=<mașină> simulează Valhalla fără niciun drum pentru mașina aceea
  const faraDrumProba = process.env.LEAR_PARCARE_FARA_DRUM === M.m;
  const areDrum = (a, b) => !faraDrumProba && (hav(a, b) < 0.3 || cache.has(kc(a, b)));
  for (let q = cand.length - 1; q >= 0; q--) if (!legi.every((l) => areDrum(l.E, cand[q]) && areDrum(cand[q], l.S))) { stat.candFaraDrum = (stat.candFaraDrum ?? 0) + 1; cand.splice(q, 1); }
  const cost = legi.map((l) => cand.map((c) => V(l.E, c) + V(c, l.S)));
  if (!cand.length) { masini.push({ ...cuStat, motivFara: 'niciun loc cu drum pe șosea (Valhalla) spre capetele drumurilor ei' }); continue; }
  const { ales, b1, b2, alege, costAles, folosit } = alegeLocuri({ legi, cand, cost, hav, P: { PRAG_AL_DOILEA, MIN_DRUMURI, TOLERANTA } });
  const real = legi.reduce((s, l) => s + l.real, 0), propus = ales.t;
  let motivFara = null;
  if (real - propus < 0.5) motivFara = 'propunerea nu scade km — rămâne cum e';
  const areLoc = !motivFara;
  const locuri = areLoc ? ales.idx.map((j, n) => ({ nr: n + 1, n: cand[j].n, fel: cand[j].fel, pref: cand[j].pref, c: [r5(cand[j].lat), r5(cand[j].lon)], drumuri: folosit(ales.idx, j),
    // 8. răspunsul 4: locul departe de casa șoferului — șoferul locuiește în altă parte, drumul lui spre casă nu se socotește (ca la Drăxlmaier §8.9)
    ...(casa && cand[j].fel !== 'casa' && hav(cand[j], casa) > 4 && M.casa ? { nota: `șoferul locuiește în ${M.casa}; drumul lui spre casă nu se socotește` } : {}) })) : [];
  const zile = [...zileM].sort().map((z) => { const L = legi.map((l, i) => [l, i]).filter(([l]) => l.z === z);
    const re = L.reduce((s, [l]) => s + l.real, 0), pr = L.reduce((s, [, i]) => s + costAles(ales.idx, i), 0);
    return { z, drumuri: L.length, real: r1(re), propus: r1(pr), economie: r1(re - pr) }; });
  // real, propus și economia se rotunjesc o dată, ca economie = real − propus pe rând
  const R = r1(real), Pp = r1(propus);
  masini.push({ ...cuStat, locuri, motivFara,
    castigAlDoilea: locuri.length === 2 ? r1(b1.t - ales.t) : null, unLoc: { n: cand[b1.idx[0]].n, kmSapt: r1(b1.t) },
    doiLocuri: b2 ? { n: b2.idx.map((j) => cand[j].n), kmSapt: r1(b2.t), castig: r1(b1.t - b2.t) } : null,
    real: R, propus: Pp, economieSapt: areLoc ? r1(R - Pp) : 0, zile,
    legi: legi.map((l, i) => { const j = alege(ales.idx, i); return { z: l.z, t0: l.t0, t1: l.t1, ora: l.ora, ore: l.ore, dupa: l.dupa, inainte: l.inainte,
      a: [r5(l.E.lat), r5(l.E.lon)], b: [r5(l.S.lat), r5(l.S.lon)], aN: numeLoc(l.E), bN: numeLoc(l.S), acum: l.acum, brut: r1(l.brut), liber: r1(l.liber), real: r1(l.real), opririMutate: l.opririMutate,
      loc: areLoc ? (j < 0 ? 0 : ales.idx.indexOf(j) + 1) : null, km: r1(costAles(ales.idx, i)) }; }) });
}
masini.sort((a, b) => (b.economieSapt ?? 0) - (a.economieSapt ?? 0) || a.m.localeCompare(b.m));
const flota = { masini: masini.length, economieSapt: r1(masini.reduce((s, x) => s + (x.economieSapt ?? 0), 0)), doiLocuri: masini.filter((x) => x.locuri.length === 2).length,
  faraPropunere: masini.filter((x) => !x.locuri.length).map((x) => `${x.m}: ${x.motivFara}`), faraValhalla };
flota.kmBucle = r1(masini.reduce((s, x) => s + x.bucle.reduce((t, b) => t + b.km, 0), 0)); flota.bucle = masini.reduce((s, x) => s + x.bucle.length, 0);
flota.partial = PARTIAL;
writeFileSync(OUT, JSON.stringify({ uzina: D.uzina, nume: D.nume, saptamina: D.saptamina, rulat: new Date().toISOString(), parametri: PARAM, flota, masini }));
writeFileSync(CACHE_F, JSON.stringify(Object.fromEntries(cache)));
console.log(`${D.nume} ${D.saptamina}: ${flota.masini} mașini · de tăiat ${flota.economieSapt} km/săpt. · două locuri ${flota.doiLocuri} · perechi fără Valhalla ${faraValhalla}${lipsaV.length ? ` (${lipsaV.join('; ')})` : ''}`);
for (const x of masini) console.log(`  ${x.m.padEnd(8)} ${String(x.economieSapt ?? 0).padStart(6)} (real ${x.real ?? '—'} → ${x.propus ?? '—'}) · ${x.locuri.length ? x.locuri.map((l) => `P${l.nr} ${l.n}${['', '·oraș', '·deja'][l.pref]} (${l.drumuri})`).join(' + ') : x.motivFara} · casa ${x.casa} · ${JSON.stringify(x.stat ?? {})}`);
