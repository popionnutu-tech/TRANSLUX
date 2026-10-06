// ION-143 (Ion, 29.09.2026): «aplică pe pagina hartă și LEAR cu punctele optimale» — parcarea propusă (1–2 locuri, ca la Drăxlmaier ION-136)
// pentru LEAR Ungheni și LEAR Florești, din urma GPS a săptămânii. Regulile: lde_uzine.reguli_livrare LEAR_UNGHENI / LEAR_FLORESTI.
//
// Intrarea: dump-ul lui lear-analiza.mjs (--dump): urma fiecărei mașini a uzinei, rutele ei din săptămână și din listă (§1.4, capetele
// fixate §4.5 / ION-63), casa, poarta, ferestrele, porțile altor uzine, cursele «timp liber» / brambura (§11).
//   node lear-parcare.mjs <dump.json> <ieșire.json>
//
// Metoda (runda 2, după revizia Claude r1):
//  1. Urma se taie în curse la poartă (punctele din raza porții, lipite cât timp nu iese din rază — §3.8), la staționări > 25 min și la
//     golurile de semnal > 30 min.
//  2. Munca = cursele cu oameni, după OPRIRILE în sate (§4.8: sub 8 km/h în raza de 0,8 km a satului și ≥ 20 s sub 15 km/h; fără satele de
//     lângă poartă ≤ 2 km, lângă casă ≤ 1,5 km și primul / ultimul km al cursei — parcarea nu e oprire):
//     - spre poartă cu opriri (sau fără, dar cu trecere pe la capăt și sosire în fereastra de tur) = TUR; începe la PRIMA apropiere ≤ 1 km de capătul unei rute a mașinii (§4.4),
//       altfel la prima oprire;
//     - de la poartă cu opriri (sau fără, dar cu trecere pe la capăt și plecare în fereastra de retur) = RETUR; se termină la ULTIMA apropiere de capăt, altfel la ultima oprire;
//     - poartă → poartă cu opriri = cursă în plus (schimbul 3, §2.1), toată muncă; fără poartă, cu ≥ 2 opriri = cursă cu oameni neterminată
//       (rută întreruptă / predată), toată muncă. Fără opriri = drum gol.
//  3. Golurile dintre două bucăți de muncă ≥ 60 min sunt drumuri de parcare, de la capătul E la începutul S. Nu intră: < 60 min (rămân
//     cum sunt), > 12 h (zi incompletă — o tură lipsă), cele în care mașina nu iese la > 2 km de poartă (așteaptă la uzină), cele cu oprire
//     la depozitul din Bălți (§11.4, 0,5 km) sau la poarta altei uzine (§11.5).
//  4. Real = km GPS ai golului, fără km «timp liber» și brambura (§11.9 le numără separat). Propus prin P = (V(E,P) + V(P,S)) × 1,05,
//     V = Valhalla bus.
//  5. Candidați: poarta (regula 1), casa, satele / orașele ≤ 15 km de un E / S (fără depozitul Bălți). Unul sau două locuri ca ION-136.
//  5b. Pe fiecare drum: prin locul cel mai ieftin din cele alese sau «rămâne cum e» (loc 0) — când acum face mai puțin, când locul e la ≤ 4 km
//      de unde mașina deja stă în golul acela (nu e o mutare) sau când câștigul e sub max(2 km, 5 %).
//  6. Fără propunere: un singur schimb măsurat (§8.3), niciun drum de parcare, propunerea nu scade km.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { local, ziLucru } from '/root/lde-worker/ora-locala.mjs';
import { alegeLocuri } from './lear-parcare-alege.mjs';

const [IN, OUT] = process.argv.slice(2);
if (!IN || !OUT || !existsSync(IN)) { console.error('lear-parcare.mjs <dump.json> <ieșire.json>'); process.exit(2); }
const D = JSON.parse(readFileSync(IN, 'utf8'));
if (!D.masini?.every((m) => Array.isArray(m.lista))) { console.error('dump fără lista rută-pe-mașină — rulează lear-analiza.mjs cu ION-143 dump v2'); process.exit(2); }
const DOAR = process.env.PARCARE_DOAR ? new Set(process.env.PARCARE_DOAR.split(',')) : null, DEBUG = process.env.DEBUG_M ?? null;
const R_POARTA = 0.7, R_CAPAT = 1, PAUZA_CURSA_MIN = 25, GOL_SEMNAL_MIN = 30, OPRIRE_LUNGA_MIN = 60, R_STAT = 0.3, SALT_KM = 5;
const V_OPRIRE = 8 / 1.852, V_LENT = 15 / 1.852, R_SAT = 0.8, SEC_LENT = 20, R_SAT_POARTA = 2, R_SAT_CASA = 1.5, MARGINE_KM = 1;
const GOL_MAX_H = 12, IESIRE_POARTA_KM = 2, R_DEPOZIT = 0.5, DEPOZIT_MIN = 2, CAPETE_TAIATE_PE_OPRIRI_MAX = 0.5;
const RAZA_CAND = 15, PRAG_AL_DOILEA = 20, MIN_DRUMURI = 3, TOLERANTA = 20, VAL_F = 1.05;
// R-PAUZĂ (ION-263, Ion 06.10.2026; §R-PAUZĂ din lde_uzine.reguli_livrare LEAR_UNGHENI / LEAR_FLORESTI): pauza dintre DOUĂ CURSE CU
// OAMENI consecutive (bucățile de muncă de mai jos: tur, retur, cursa în plus / schimbul 3, rute legate într-o cursă — nu un program fix)
// se poate face ACASĂ dacă (sfârșitul cursei dinainte → casă → începutul cursei de după) − (sfârșit → poartă → început) ≤ PRAG_PAUZA_KM
// pe Valhalla bus. Sub prag pauza acasă nu e risipă: iese din alegerea locurilor (rămâne cum e) și nu intră în regula 3. Peste prag pauza
// e la poartă: se judecă ca până acum, iar surplusul GPS peste drumul prin poartă intră în regula 3 (r3).
// Nopțile (golul peste miezul nopții sau început înainte de 04:00) nu sunt pauze între ture și nu se judecă aici.
// O pauză e «acasă» când mașina stă în ea la ≤ R_PAUZA_ACASA km de casă (staționarea cea mai lungă, sau ≥ PAUZA_ACASA_MIN minute în total).
const PRAG_PAUZA_KM = 15, R_PAUZA_ACASA = 2, PAUZA_ACASA_MIN = 20;
// lear-parcare sărea complet mașinile cu un singur schimb măsurat (§8.3) — harta arăta «0 km de tăiat» fără calcul. Cu LEAR_UN_SCHIMB=1
// se calculează pe bucățile măsurate, cu semnul «un singur schimb» (propunere ION-263; §8.3 din reguli trebuie schimbat întâi).
const UN_SCHIMB = process.env.LEAR_UN_SCHIMB === '1';
// CU-OAMENI (ION-265, Ion 06.10.2026: «scheletul cunoaște»; schimbul 3 «nu e sistematic, haotic»; §CU-OAMENI din lde_uzine.reguli_livrare):
//  O.1 km cu oameni ai unui tur / retur = cel mult lungimea rutei din schelet (× TOL_RUTA, aceeași rezervă ca VAL_F); restul e gol;
//  O.2 urcare = oprire de URC_MIN_S – URC_MAX_S sub 8 km/h (10 s – 5 min, Ion 06.10) DOAR într-un sat de pe drumul unei rute din schelet; peste 5 min e așteptare;
//  opririle dintr-un gol fac muncă doar cu ≥ URC_O3 urcări reale pe o rută; toleranța O.1 = 5 % (Ion a aprobat ambele, 06.10);
//  O.3 cursa în afara ferestrelor (și schimbul 3) e cu oameni doar pe o rută din schelet cu ≥ URC_O3 urcări reale; atingerea porții nu e dovadă;
//  O.4 două rute legate într-o cursă = cu oameni doar dacă ambele au urcări reale; km = suma lungimilor din schelet.
const URC_MIN_S = 10, URC_MAX_S = 300, URC_O3 = 3, TOL_RUTA = 1.05;
const CALE_SCH = process.env.LEAR_SCHELET_F || (D.uzina === 'LEAR_FLORESTI' ? '/root/lde-worker/floresti-schelet.json' : '/root/lde-worker/lear-schelet.json');
const SCH = JSON.parse(readFileSync(CALE_SCH, 'utf8'));
// satele de pe drumul plin al fiecărei rute (tur + retur) și satele ei din act (r.sate), cu lungimea rutei (etalon)
const RUTE_S = new Map(SCH.rute.map((r) => [r.id, { id: r.id, etalon: r.etalon ?? null, act: new Set(r.sate ?? []),
  sate: [...(r.g?.tur?.sate ?? []), ...(r.g?.retur?.sate ?? [])].map((x) => ({ n: x.n, lat: x.c[0], lon: x.c[1] })) }]));
const PARAM = { R_POARTA, R_CAPAT, PAUZA_CURSA_MIN, OPRIRE_LUNGA_MIN, V_OPRIRE_KMH: 8, V_LENT_KMH: 15, R_SAT, SEC_LENT, GOL_MAX_H, IESIRE_POARTA_KM,
  R_DEPOZIT, RAZA_CAND, PRAG_AL_DOILEA, MIN_DRUMURI, TOLERANTA, VAL_F, PRAG_PAUZA_KM, R_PAUZA_ACASA, PAUZA_ACASA_MIN, UN_SCHIMB, URC_MIN_S, URC_MAX_S, URC_O3, TOL_RUTA };
const r1 = (x) => Math.round(x * 10) / 10, r5 = (x) => Math.round(x * 1e5) / 1e5;
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const G = D.poarta, PARC = D.parc, ALTE = (D.alteUzine ?? []).map((g) => ({ lat: g.lat, lon: g.lon, r: g.r ?? 0.5, n: g.nume }));
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
const numeLoc = (p) => { if (hav(p, G) <= R_POARTA + 0.3) return 'poarta LEAR'; if (hav(p, PARC) <= 1) return 'Parcul Bălți';
  let b = null, d = 1e9; for (const s of LOC) { const k = hav(p, s); if (k < d) { d = k; b = s.n; } } return d <= 2 ? b : `${b} (${r1(d)} km)`; };

// Valhalla: matricea bus, cu cache pe disc
const CACHE_F = process.env.LEAR_PARCARE_CACHE || '/root/lde-worker/lear-parcare/drum-cache.json';
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
      if (P[j][0] - P[i][0] <= 90e3 && hav(p, G) > R_SAT_POARTA) { const k = CEL(p); const x = cel.get(k) ?? cel.set(k, { m: new Set(), h: new Set() }).get(k); x.m.add(M.m); x.h.add(local(P[i][0]).getUTCHours()); }
      i = j + 1; } }
  for (const [k, x] of cel) if (x.m.size >= 5 && x.h.size >= 4) { const [a, b] = k.split('|').map(Number); INFRA.add(k); } }
// Bălți (revizia Claude r2): nicio mașină LEAR n-are treabă la Bălți — oprirea ≥ 2 min la ≤ 4 km de depozit e service (§5.4 / §11.4)
const R_BALTI = 4;
const masini = [];
for (const M of D.masini) {
  if (DOAR && !DOAR.has(M.m)) continue;
  const P = M.pts.map(([t, lat, lon, v]) => ({ t, lat, lon, v })).sort((a, b) => a.t - b.t);
  const zileM = new Set(M.zile), casa = M.casaC ? { lat: M.casaC[0], lon: M.casaC[1] } : null;
  const capete = [...M.lista, ...M.rute, ...M.comasate].filter((r) => r.capatC).map((r) => ({ n: r.capat, id: r.id, lat: r.capatC[0], lon: r.capatC[1] }))
    .filter((c, i, a) => a.findIndex((x) => hav(x, c) < 0.3) === i);
  const baza = { m: M.m, casa: M.casa, rute: [...new Set([...M.rute, ...M.lista].map((r) => `${r.id} ${r.capat}`))], locuri: [], legi: [], zile: [], bucati: [] };
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
  // O.2 (ION-265): în fiecare trecere printr-un sat DE PE O RUTĂ DIN SCHELET, opririle continue sub 8 km/h; urcare = 10 s – 5 min (sub 90 s nu în celulele de intersecție);
  // peste 5 min = așteptare. Satul intră în listă doar cu ≥ 1 urcare; `rute` = rutele din schelet pe drumul cărora stă satul.
  function opriri(c) { const out = []; const Q = c.Q, s0 = Q[0], s1 = Q.at(-1); let run = null, st = null;
    const inchideSt = () => { if (st && run) { if (st.d >= URC_MIN_S && st.d <= URC_MAX_S && !(st.d < 90 && INFRA.has(st.cel))) run.u++; else if (st.d > URC_MAX_S) run.astept++; } st = null; };
    const inchide = () => { inchideSt(); if (run && run.u && ruteSat(run.sat).length) out.push({ n: run.sat.n, t: run.t, t1: run.t1, lat: run.sat.lat, lon: run.sat.lon, u: run.u, rute: ruteSat(run.sat) }); run = null; };
    for (let i = 1; i < Q.length; i++) { const p = Q[i], sat = satLa(p);
      const ok = sat && hav(sat, G) > R_SAT_POARTA && !(casa && hav(sat, casa) <= R_SAT_CASA) && hav(p, s0) > MARGINE_KM && hav(p, s1) > MARGINE_KM;
      if (!ok || (run && run.sat !== sat)) inchide(); if (!ok) continue;
      run ??= { sat, t: p.t, t1: p.t, u: 0, astept: 0 }; run.t1 = p.t;
      const dt = Math.min(600, (p.t - Q[i - 1].t) / 1000);
      if (p.v < V_OPRIRE) { st ??= { d: 0, cel: CEL(p) }; st.d += dt; } else inchideSt(); }
    inchide(); return out.filter((o, i, a) => i === 0 || a[i - 1].n !== o.n || o.t - a[i - 1].t > 10 * 60e3); }
  const ruteSatC = new Map();
  function ruteSat(sat) { const k = `${sat.lat},${sat.lon}`; if (!ruteSatC.has(k)) ruteSatC.set(k, [...RUTE_S.values()].filter((r) => r.sate.some((x) => hav(x, sat) <= R_SAT)).map((r) => r.id)); return ruteSatC.get(k); }
  // urcările pe rută: id → număr de urcări în satele de pe drumul ei
  const urcPeRuta = (op) => { const m = new Map(); for (const o of op) for (const id of o.rute) m.set(id, (m.get(id) ?? 0) + o.u); return m; };
  const ruteMasina = new Set([...M.lista, ...M.rute, ...M.comasate].map((r) => r.id));
  // O.4: altă rută a mașinii «legată» în aceeași cursă = are urcări într-un sat DIN ACTUL ei care nu e pe drumul rutei principale
  const legate = (op, id) => [...ruteMasina].filter((x) => x !== id && RUTE_S.has(x) && op.some((o) => RUTE_S.get(x).act.has(o.n) && !(RUTE_S.get(id)?.sate ?? []).some((y) => hav(y, o) <= R_SAT)));
  // O.1: tăierea la lungimea rutei — dinspre poartă (tur: păstrează sfârșitul; retur: păstrează începutul)
  function taie(t0, t1, cap, pastreazaSfarsit) {
    if (!(cap > 0)) return { t0, t1, taiat: 0 };
    const tot = kmIntre(P, t0, t1); if (tot <= cap * TOL_RUTA) return { t0, t1, taiat: 0 };
    const Qx = P.filter((p) => p.t >= t0 && p.t <= t1); let s = 0;
    if (pastreazaSfarsit) { for (let i = Qx.length - 1; i > 0; i--) { s += kmIntre(P, Qx[i - 1].t, Qx[i].t); if (s > cap * TOL_RUTA) return { t0: Qx[i].t, t1, taiat: tot - kmIntre(P, Qx[i].t, t1) }; } }
    else { for (let i = 1; i < Qx.length; i++) { s += kmIntre(P, Qx[i - 1].t, Qx[i].t); if (s > cap * TOL_RUTA) return { t0, t1: Qx[i - 1].t, taiat: tot - kmIntre(P, t0, Qx[i - 1].t) }; } }
    return { t0, t1, taiat: 0 };
  }
  const o3 = { respinse: 0, kmTaiatO1: 0, lista: [] };
  // apropierea de capăt (≤ 1 km): pe tur prima, pe retur ultima — punctul cel mai apropiat din acea trecere
  function apropiere(Q, ultima) { const runs = []; let r = null;
    for (const p of Q) { const c = capete.find((x) => hav(p, x) <= R_CAPAT); if (c && r && r.c === c) r.pts.push(p); else if (c) { r = { c, pts: [p] }; runs.push(r); } else r = null; }
    const x = ultima ? runs.at(-1) : runs[0]; if (!x) return null;
    return x.pts.reduce((b, p) => (hav(p, x.c) < hav(b, x.c) ? p : b)); }
  const munca = [];
  for (const c of curse) {
    const op = opriri(c), n = op.reduce((x, o) => x + o.u, 0), U = urcPeRuta(op);
    // ruta cursei: a capătului atins; altfel ruta mașinii cu cele mai multe urcări; altfel orice rută din schelet cu cele mai multe urcări
    const celeMai = (filtru) => [...U].filter(([id]) => filtru(id)).sort((a, b) => b[1] - a[1])[0] ?? null;
    const alegeRuta = (ap) => (ap?.c?.id && RUTE_S.has(ap.c.id) ? ap.c.id : (celeMai((id) => ruteMasina.has(id)) ?? celeMai(() => true))?.[0] ?? null);
    const o3ok = () => (celeMai(() => true)?.[1] ?? 0) >= URC_O3;   // O.3: ≥ 3 urcări reale pe o rută din schelet
    const capDe = (id) => { if (!id) return null; const L = RUTE_S.get(id)?.etalon; if (!L) return null; return L + legate(op, id).reduce((x, y) => x + (RUTE_S.get(y)?.etalon ?? 0), 0); };
    const respinge = (fel, motiv) => { o3.respinse++; if (o3.lista.length < 40) o3.lista.push(`${ziLucru(c.t0)} ${oraL(c.t0)}–${oraL(c.t1)} ${fel}: ${motiv}`); };
    if (DEBUG === M.m) console.error(`  cursa ${oraL(c.t0)}–${oraL(c.t1)} ${ziLucru(c.t0)} ${c.dePoarta ? 'P' : '·'}→${c.laPoarta ? 'P' : '·'} ${r1(kmIntre(P, c.t0, c.t1))} km · urcări ${op.map((o) => `${o.n}×${o.u}[${o.rute.join(',')}]`).join(' ') || '—'}`);
    if (c.laPoarta && !c.dePoarta) { const ap = apropiere(c.Q, false), inF = FT.some((f) => inFer(minZi(c.t1), f));
      if (!(inF ? (ap ? true : n >= 2) : o3ok())) { if (ap || n) respinge('tur', inF ? `fără capăt și ${n} urcări` : `în afara ferestrelor, ${celeMai(() => true)?.[1] ?? 0} urcări pe rută (O.3)`); continue; }
      const id = alegeRuta(ap), t00 = ap ? ap.t : (op[0]?.t ?? c.t0), x = taie(t00, c.t1, capDe(id), true); o3.kmTaiatO1 += x.taiat;
      munca.push({ fel: 'tur', t0: x.t0, t1: c.t1, de: pozLa(P, x.t0), pana: G, taiat: ap ? 'capat' : 'opriri', opriri: n, ruta: id }); }
    else if (c.dePoarta && !c.laPoarta) { const ap = apropiere(c.Q, true), inF = FR.some((f) => inFer(minZi(c.t0), f));
      if (!(inF ? (ap ? true : n >= 2) : o3ok())) { if (ap || n) respinge('retur', inF ? `fără capăt și ${n} urcări` : `în afara ferestrelor, ${celeMai(() => true)?.[1] ?? 0} urcări pe rută (O.3)`); continue; }
      const id = alegeRuta(ap), t11 = ap ? ap.t : (op.at(-1)?.t ?? c.t1), x = taie(c.t0, t11, capDe(id), false); o3.kmTaiatO1 += x.taiat;
      munca.push({ fel: 'retur', t0: c.t0, t1: x.t1, de: G, pana: pozLa(P, x.t1), taiat: ap ? 'capat' : 'opriri', opriri: n, ruta: id }); }
    else if (c.dePoarta && c.laPoarta) { if (!n) continue;
      // poartă → poartă: în fereastră (tur la sosire / retur la plecare) e un retur + tur — cel mult de două ori ruta; în afara lor O.3, o singură rută
      const inF = FT.some((f) => inFer(minZi(c.t1), f)) || FR.some((f) => inFer(minZi(c.t0), f));
      if (!(inF ? n >= 1 && U.size > 0 : o3ok())) { respinge('plus', inF ? 'urcări în afara rutelor din schelet' : `în afara ferestrelor, ${celeMai(() => true)?.[1] ?? 0} urcări pe rută (O.3)`); continue; }
      const id = alegeRuta(null), cap = capDe(id), x = taie(c.t0, c.t1, cap == null ? null : (inF ? 2 : 1) * cap, true); o3.kmTaiatO1 += x.taiat;
      munca.push({ fel: 'plus', t0: x.t0, t1: c.t1, de: pozLa(P, x.t0), pana: G, taiat: apropiere(c.Q, false) ? 'capat' : 'opriri', opriri: n, ruta: id }); }
    else if (n >= 2 && !opresteLaQ(c.Q, PARC, R_BALTI) && hav(c.Q.at(-1), PARC) > R_BALTI) {
      if (!o3ok()) { respinge('fără poartă', `${celeMai(() => true)?.[1] ?? 0} urcări pe rută (O.3)`); continue; }
      const id = alegeRuta(null), x = taie(op[0].t, op.at(-1).t, capDe(id), true); o3.kmTaiatO1 += x.taiat;
      munca.push({ fel: 'fara-poarta', t0: x.t0, t1: x.t1, de: pozLa(P, x.t0), pana: pozLa(P, x.t1), taiat: apropiere(c.Q, false) ? 'capat' : 'opriri', opriri: n, ruta: id }); }
  }
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
    faraPoarta: munca.filter((w) => w.fel === 'fara-poarta').length, taiatePeOpriri: peOpriri, schimburi,
    respinseO3: o3.respinse, kmTaiatO1: r1(o3.kmTaiatO1), kmCuOameni: r1(munca.reduce((x, w) => x + kmIntre(P, w.t0, w.t1), 0)), respinse: o3.lista, scurte: 0, lungi: 0, laPoarta: 0, depozit: 0, altaUzina: 0, kmLiberScos: 0, goluriCuOpriri: 0, goluriTaiate: 0 };
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
    // O.3 (ION-265): opririle din gol fac muncă doar dacă sunt ≥ URC_O3 urcări reale pe o rută din schelet; altfel golul rămâne gol
    const op0 = opriri({ Q }).filter((o) => !(sta && hav(o, sta) <= 1.5)), op = Math.max(0, ...urcPeRuta(op0).values()) >= URC_O3 ? op0 : [];
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
      brut, liber, real: brut - liber, acum: sta ? { lat: sta.lat, lon: sta.lon, n: sta.poarta ? 'poarta LEAR' : numeLoc(sta), min: Math.round(sta.d / 60e3) } : null });
  }
  stat.kmLiberScos = r1(stat.kmLiberScos);
  for (const l of legi) { const Q2 = P.filter((p) => p.t >= l.t0 && p.t <= l.t1); const rest0 = opriri({ Q: Q2 }).filter((o) => !(l.acum && hav(o, l.acum) <= 1.5)), rest = Math.max(0, ...urcPeRuta(rest0).values()) >= URC_O3 ? rest0 : []; if (rest.length) (stat.control ??= []).push(`${l.ora} ${rest.map((o) => o.n).join(', ')}`); }

  // R-PAUZĂ: pe fiecare drum de parcare (gol între două curse cu oameni) — e acasă? cât costă acasă față de poartă?
  const pauze = { prag: PRAG_PAUZA_KM, acasa: 0, permise: 0, peste: 0, kmPermisSapt: 0, r3Sapt: 0, r3ModelSapt: 0, zile: zileM.size, lista: [] };
  if (casa && hav(casa, G) > 3 && legi.length) {
    const Gp = { lat: G.lat, lon: G.lon };
    await matrice(legi.map((l) => l.E), [casa, Gp]); await matrice([casa, Gp], legi.map((l) => l.S));
    const Vr = (a, b) => (hav(a, b) < 0.3 ? hav(a, b) : V(a, b) / VAL_F);   // Valhalla curat, fără rezerva × 1,05
    for (const l of legi) {
      // noaptea nu e pauză între ture (R1 / parcarea o judecă separat): golul care trece peste miezul nopții sau începe înainte de 04:00
      if (minZi(l.t0) > minZi(l.t1) || minZi(l.t0) < 240) { pauze.nopti = (pauze.nopti ?? 0) + 1; continue; }
      let acasa = !!(l.acum && hav(l.acum, casa) <= R_PAUZA_ACASA);
      if (!acasa) { let min = 0, prev = null; for (const p of P) { if (p.t < l.t0) continue; if (p.t > l.t1) break;
        if (prev && hav(p, casa) <= R_PAUZA_ACASA) min += Math.min(30, (p.t - prev.t) / 60e3); prev = p; } acasa = min >= PAUZA_ACASA_MIN; }
      if (!acasa) continue;
      const prinPoarta = Vr(l.E, Gp) + Vr(Gp, l.S), cost = r1(Vr(l.E, casa) + Vr(casa, l.S) - prinPoarta), permis = cost <= PRAG_PAUZA_KM;
      // peste prag: economia = km GPS ai pauzei (fără timp liber / brambura) − drumul prin poartă (× 1,05, ca restul parcării)
      const eco = permis ? 0 : r1(Math.max(0, l.real - (V(l.E, Gp) + V(Gp, l.S))));
      l.pauza = { cost, permis, alternativa: 'poarta', prinPoarta: r1(prinPoarta), eco, ecoModel: permis ? 0 : cost };
      pauze.acasa++; if (permis) { pauze.permise++; pauze.kmPermisSapt += l.real; } else { pauze.peste++; pauze.r3Sapt += eco; pauze.r3ModelSapt += cost; }
      pauze.lista.push({ z: l.z, ora: l.ora, de: numeLoc(l.E), spre: numeLoc(l.S), dupa: l.dupa, inainte: l.inainte, real: r1(l.real), cost, permis, eco });
    }
    for (const k of ['kmPermisSapt', 'r3Sapt', 'r3ModelSapt']) pauze[k] = r1(pauze[k]);
  } else pauze.motiv = !casa ? 'fără casă' : hav(casa, G) <= 3 ? 'casa e la poartă' : 'niciun drum de parcare';
  pauze.r3Zi = r1(pauze.r3Sapt / Math.max(1, zileM.size)); pauze.r3ModelZi = r1(pauze.r3ModelSapt / Math.max(1, zileM.size));
  const legiAlege = legi.filter((l) => !l.pauza?.permis), ix = new Map(legiAlege.map((l, i) => [l, i]));
  const bucati = lant.map((w) => ({ fel: w.fel, t0: w.t0, t1: w.t1, de: [r5(w.de.lat), r5(w.de.lon)], pana: [r5(w.pana.lat), r5(w.pana.lon)], taiat: w.taiat }));
  const cuStat = { ...baza, stat, bucati, pauze };
  if (stat.control?.length) { masini.push({ ...cuStat, motivFara: `controlul §10: opriri în drumul de parcare (${stat.control.slice(0, 3).join('; ')})` }); continue; }
  if (schimburi < 2 && !UN_SCHIMB) { masini.push({ ...cuStat, motivFara: 'un singur schimb măsurat în săptămână (§8.3)' }); continue; }
  if (schimburi < 2) cuStat.unSchimb = true;
  if (tr.length && peOpriri / tr.length > CAPETE_TAIATE_PE_OPRIRI_MAX) { masini.push({ ...cuStat, motivFara: `rute neverificate: ${peOpriri} din ${tr.length} tururi și retururi nu trec pe la capătul rutelor ei` }); continue; }
  if (!legi.length) { masini.push({ ...cuStat, motivFara: 'niciun gol în care mașina să stea (≥ 60 min) în zilele de lucru' }); continue; }
  if (!legiAlege.length) { const R0 = r1(legi.reduce((s, l) => s + l.real, 0));
    masini.push({ ...cuStat, motivFara: `toate pauzele sunt acasă, cu ocol ≤ ${PRAG_PAUZA_KM} km față de poartă (R-PAUZĂ) — rămân cum sunt`, real: R0, propus: R0, economieSapt: 0, locuri: [] }); continue; }
  // 5. candidații (doar drumurile care nu-s pauze acasă permise)
  const capL = legiAlege.flatMap((l) => [l.E, l.S]);
  const cand = LOC.filter((L) => capL.some((p) => hav(p, L) <= RAZA_CAND) && hav(L, PARC) > 3).map((L) => ({ n: L.n, lat: L.lat, lon: L.lon, fel: L.fel }));
  cand.push({ n: 'la uzină (poarta LEAR)', lat: G.lat, lon: G.lon, fel: 'uzina' });
  if (casa) cand.push({ n: `acasă (${M.casa})`, lat: casa.lat, lon: casa.lon, fel: 'casa' });
  const opr = legi.map((l) => l.acum).filter(Boolean);
  for (const c of cand) c.pref = new Set(legiAlege.filter((l) => l.acum && hav(l.acum, c) <= 1).map((l) => l.z)).size >= 2 ? 2 : (c.fel === 'town' || c.fel === 'city') ? 1 : 0;
  await matrice(legiAlege.map((l) => l.E), cand); await matrice(cand, legiAlege.map((l) => l.S));
  // locul la care Valhalla nu găsește drum (nici bus) nu e candidat — fără estimări pe linie dreaptă (§8.2)
  // proba Codex r2 C5: LEAR_PARCARE_FARA_DRUM=<mașină> simulează Valhalla fără niciun drum pentru mașina aceea
  const faraDrumProba = process.env.LEAR_PARCARE_FARA_DRUM === M.m;
  const areDrum = (a, b) => !faraDrumProba && (hav(a, b) < 0.3 || cache.has(kc(a, b)));
  for (let q = cand.length - 1; q >= 0; q--) if (!legiAlege.every((l) => areDrum(l.E, cand[q]) && areDrum(cand[q], l.S))) { stat.candFaraDrum = (stat.candFaraDrum ?? 0) + 1; cand.splice(q, 1); }
  const cost = legiAlege.map((l) => cand.map((c) => V(l.E, c) + V(c, l.S)));
  if (!cand.length) { masini.push({ ...cuStat, motivFara: 'niciun loc cu drum pe șosea (Valhalla) spre capetele drumurilor ei' }); continue; }
  const { ales, b1, b2, alege, costAles, folosit } = alegeLocuri({ legi: legiAlege, cand, cost, hav, P: { PRAG_AL_DOILEA, MIN_DRUMURI, TOLERANTA } });
  // pauzele acasă permise intră cu km de acum și în real, și în propus (economie 0 pe ele)
  const costLeg = (l) => (ix.has(l) ? costAles(ales.idx, ix.get(l)) : l.real), alegeLeg = (l) => (ix.has(l) ? alege(ales.idx, ix.get(l)) : -1);
  const real = legi.reduce((s, l) => s + l.real, 0), propus = ales.t + legi.filter((l) => !ix.has(l)).reduce((s, l) => s + l.real, 0);
  let motivFara = null;
  if (real - propus < 0.5) motivFara = 'propunerea nu scade km — rămâne cum e';
  const areLoc = !motivFara;
  const locuri = areLoc ? ales.idx.map((j, n) => ({ nr: n + 1, n: cand[j].n, fel: cand[j].fel, pref: cand[j].pref, c: [r5(cand[j].lat), r5(cand[j].lon)], drumuri: folosit(ales.idx, j) })) : [];
  const zile = [...zileM].sort().map((z) => { const L = legi.filter((l) => l.z === z);
    const re = L.reduce((s, l) => s + l.real, 0), pr = L.reduce((s, l) => s + costLeg(l), 0);
    return { z, drumuri: L.length, real: r1(re), propus: r1(pr), economie: r1(re - pr) }; });
  // real, propus și economia se rotunjesc o dată, ca economie = real − propus pe rând
  const R = r1(real), Pp = r1(propus);
  masini.push({ ...cuStat, locuri, motivFara,
    castigAlDoilea: locuri.length === 2 ? r1(b1.t - ales.t) : null, unLoc: { n: cand[b1.idx[0]].n, kmSapt: r1(b1.t) },
    doiLocuri: b2 ? { n: b2.idx.map((j) => cand[j].n), kmSapt: r1(b2.t), castig: r1(b1.t - b2.t) } : null,
    real: R, propus: Pp, economieSapt: areLoc ? r1(R - Pp) : 0, zile,
    legi: legi.map((l) => { const j = alegeLeg(l); return { z: l.z, t0: l.t0, t1: l.t1, ora: l.ora, ore: l.ore, dupa: l.dupa, inainte: l.inainte,
      a: [r5(l.E.lat), r5(l.E.lon)], b: [r5(l.S.lat), r5(l.S.lon)], aN: numeLoc(l.E), bN: numeLoc(l.S), acum: l.acum, brut: r1(l.brut), liber: r1(l.liber), real: r1(l.real), opririMutate: l.opririMutate,
      loc: areLoc ? (j < 0 ? 0 : ales.idx.indexOf(j) + 1) : null, km: r1(costLeg(l)), pauza: l.pauza ?? null }; }) });
}
masini.sort((a, b) => (b.economieSapt ?? 0) - (a.economieSapt ?? 0) || a.m.localeCompare(b.m));
const flota = { masini: masini.length, economieSapt: r1(masini.reduce((s, x) => s + (x.economieSapt ?? 0), 0)), doiLocuri: masini.filter((x) => x.locuri.length === 2).length,
  faraPropunere: masini.filter((x) => !x.locuri.length).map((x) => `${x.m}: ${x.motivFara}`), faraValhalla,
  pauze: { prag: PRAG_PAUZA_KM, acasa: masini.reduce((s, x) => s + (x.pauze?.acasa ?? 0), 0), permise: masini.reduce((s, x) => s + (x.pauze?.permise ?? 0), 0),
    peste: masini.reduce((s, x) => s + (x.pauze?.peste ?? 0), 0), r3Sapt: r1(masini.reduce((s, x) => s + (x.pauze?.r3Sapt ?? 0), 0)),
    r3ModelSapt: r1(masini.reduce((s, x) => s + (x.pauze?.r3ModelSapt ?? 0), 0)) } };
writeFileSync(OUT, JSON.stringify({ uzina: D.uzina, nume: D.nume, saptamina: D.saptamina, rulat: new Date().toISOString(), parametri: PARAM, flota, masini }));
writeFileSync(CACHE_F, JSON.stringify(Object.fromEntries(cache)));
console.log(`${D.nume} ${D.saptamina}: ${flota.masini} mașini · de tăiat ${flota.economieSapt} km/săpt. · două locuri ${flota.doiLocuri} · perechi fără Valhalla ${faraValhalla}${lipsaV.length ? ` (${lipsaV.join('; ')})` : ''}`);
for (const x of masini) if (x.pauze?.acasa) console.log(`  R-PAUZĂ ${x.m.padEnd(8)} acasă ${x.pauze.acasa} · permise ${x.pauze.permise} · peste ${x.pauze.peste} · r3 ${x.pauze.r3Zi} km/zi GPS (${x.pauze.r3ModelZi} model) · ${x.pauze.lista.map((p) => `${p.z.slice(5)} ${p.ora} ${p.de}→${p.spre} ${p.cost}${p.permis ? '✓' : '✗'}`).join(' | ')}`);
for (const x of masini) console.log(`  ${x.m.padEnd(8)} ${String(x.economieSapt ?? 0).padStart(6)} (real ${x.real ?? '—'} → ${x.propus ?? '—'}) · ${x.locuri.length ? x.locuri.map((l) => `P${l.nr} ${l.n}${['', '·oraș', '·deja'][l.pref]} (${l.drumuri})`).join(' + ') : x.motivFara} · casa ${x.casa} · ${JSON.stringify(x.stat ?? {})}`);
