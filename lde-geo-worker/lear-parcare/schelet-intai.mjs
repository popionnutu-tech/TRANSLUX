// ION-268 «SCHELET ÎNTÂI» — modulul COMUN tuturor direcțiilor (Ion, 06.10.2026: «Scheletul e de bază, asupra scheletului se aplică GPS-ul,
// și după se calculează optimizările posibile» · «aplică această logică peste toate direcțiile»).
// Regula: lde_uzine.reguli_livrare, secțiunea SCHELET-ÎNTÂI (S.1–S.5), cu CU-OAMENI (O.1–O.4).
//
//   S.1 planul zilei = scheletul + rutele mașinii (+ rotația săptămânii): cursele pe care TREBUIA să le facă, cu fereastra, sensul, km din schelet;
//   S.2 GPS-ul doar CONFIRMĂ fiecare cursă din plan, pe ORICE rută din schelet (tur și retur ale schimbului pe aceeași rută) → făcută / neconfirmată (capăt + sens, 0 urcări) / lipsă;
//   S.3 restul urmei = GOL (pe el lucrează regulile de economie, în afara modulului);
//   S.4 «cursă în plus» = în afara planului, doar cu ≥ 3 urcări pe o rută din schelet, separat;
//   S.5 GPS-ul nu inventează curse: o bucată care nu se potrivește cu planul e gol sau «cursă în plus».
//
// Modulul e pur: nu citește fișiere, nu scrie nimic. Adaptorul direcției (adaptor-lear.mjs; SEBN / Drăxlmaier / Briceni / mejgorod
// după aceeași formă) îi dă:
//   poarta {lat, lon} (sau porti [..]), ferestre [{sens, schimb, de_la_min, pana_la_min}], rute Map id → {id, tura, capat {n,lat,lon},
//   km (etalonul din schelet), coridor [[lat,lon],…][] (drumul cu oameni din schelet, tur + retur)}, rutele mașinii pe tură {A: [id,…], B: [...]},
//   zilele de plan, urma P [{t, lat, lon, v (noduri)}], casa, ora locală.
import { local, offsetLocal, ziLucru } from '/root/lde-worker/ora-locala.mjs';

export const PARAM_SI = {
  R_POARTA: 0.7,          // §1.2 raza porții
  R_CAPAT: 1,             // §4.4 apropierea de capăt
  R_COR: 0.4,             // urcarea e «pe rută» dacă oprirea e la ≤ 0,4 km de drumul cu oameni al rutei din schelet
  R_EXCL_POARTA: 1.2,     // opririle de lângă poartă nu-s urcări (trafic, intrarea în uzină)
  R_EXCL_CASA: 1.5,       // nici cele de lângă casă (parcarea)
  PAUZA_CURSA_MIN: 25,    // §3.8 cursa se termină la o staționare > 25 min
  GOL_SEMNAL_MIN: 30,
  R_STAT: 0.3,
  V_OPRIRE_KN: 8 / 1.852, // O.2 sub 8 km/h
  URC_MIN_S: 10, URC_MAX_S: 300,   // O.2 urcare 10 s – 5 min
  URC_PLUS: 3,            // S.4 / O.3
  TOL_RUTA: 1.05,         // O.1 toleranța lungimii rutei
  SALT_KM: 5,
  INTOARCERE_MIN: 10,     // urcările de după punctul de întoarcere (bucla rutei) se mai iau 10 min
  DIAG_MIN: 45,
  // Ion, 06.10 («cursa neconfirmată, dar care merge pe schelet»): capăt + fereastră + sens fără urcări ≥ 10 s e FĂCUTĂ dacă urma acoperă drumul cu oameni
  // al rutei din schelet: ≥ ACOPERIRE din punctele lui la ≤ R_ACOPERIRE de urmă (tracker-ele care încetinesc doar 2–5 s nu mai pierd cursa)
  CAPAT_DRUM_KM: 3,      // cursa «pe drumul rutei» fără apropiere ≤ 1 km de capăt: capătul la apropierea cea mai mică, cel mult 3 km
  ACOPERIRE: process.env.SI_ACOPERIRE ? +process.env.SI_ACOPERIRE : 0.8, R_ACOPERIRE: 0.3,   // SI_ACOPERIRE doar pentru probă (2 = regula oprită)           // pentru «lipsă»: o sosire / plecare la ≤ 45 min de fereastră se spune în motiv
};
const P0 = PARAM_SI;

export const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
export const r1 = (x) => Math.round(x * 10) / 10;
export const oraL = (t) => local(t).toISOString().slice(11, 16);
const minZi = (t) => { const d = local(t); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
/** miezul nopții local al zilei z (ms UTC) */
export const miezulNoptii = (z) => { const u = Date.parse(`${z}T00:00:00Z`); return u - offsetLocal(u - 3 * 3600e3); };
/** fereastra absolută a zilei z: [start, sfârșit] în ms; trece de miezul nopții când de_la > pana_la */
export const fereastraAbs = (z, f) => { const m = miezulNoptii(z); return [m + f.de_la_min * 60e3, m + ((f.de_la_min <= f.pana_la_min ? 0 : 1440) + f.pana_la_min) * 60e3]; };

// ─── coridorul rutei: drumul cu oameni din schelet, într-o grilă (~1 km), cu punctele îndesite la ≤ 150 m ───
const CEL_G = 0.01;
export function coridor(linii) {
  const g = new Map(), k = (la, lo) => `${Math.floor(la / CEL_G)}|${Math.floor(lo / CEL_G)}`;
  for (const L of linii) for (let i = 0; i < L.length; i++) {
    const a = { lat: L[i][0], lon: L[i][1] }, pts = [a];
    if (i + 1 < L.length) { const b = { lat: L[i + 1][0], lon: L[i + 1][1] }, d = hav(a, b);
      if (d > 0.15 && d < 5) for (let s = 1; s < Math.ceil(d / 0.15); s++) { const f = s / Math.ceil(d / 0.15); pts.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f }); } }
    for (const p of pts) { const kk = k(p.lat, p.lon); (g.get(kk) ?? g.set(kk, []).get(kk)).push(p); } }
  return { dist(p) { const a = Math.floor(p.lat / CEL_G), b = Math.floor(p.lon / CEL_G); let d = 1e9;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const q of g.get(`${a + i}|${b + j}`) ?? []) { const x = hav(p, q); if (x < d) d = x; } return d; } };
}

// ─── urma: km, poziția, opririle ───
export function kmIntre(P, t0, t1) { let s = 0; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i]; if (b.t <= t0 || a.t >= t1) continue;
  const d = hav(a, b); if (d < P0.SALT_KM && !(a.v <= 1 && b.v <= 1)) s += d; } return s; }
export const pozLa = (P, t) => { let lo = 0, hi = P.length - 1; if (t <= P[0].t) return P[0]; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (P[m].t <= t) lo = m; else hi = m - 1; } return P[lo]; };
const idxDe = (P, t) => { let lo = 0, hi = P.length; while (lo < hi) { const m = (lo + hi) >> 1; if (P[m].t < t) lo = m + 1; else hi = m; } return lo; };
export const intre = (P, t0, t1) => { const out = []; for (let i = idxDe(P, t0); i < P.length && P[i].t <= t1; i++) out.push(P[i]); return out; };

/** opririle (O.2): șiruri de puncte sub 8 km/h; durata = suma intervalelor până la fiecare punct lent (≤ 600 s fiecare) */
export function opririle(P, { infra = null, celOf = null } = {}) {
  const out = []; let st = null;
  for (let i = 1; i < P.length; i++) { const p = P[i];
    if (p.v < P0.V_OPRIRE_KN) { const dt = Math.min(600, (p.t - P[i - 1].t) / 1000); if (!st) st = { t0: P[i - 1].t, t1: p.t, d: 0, lat: p.lat, lon: p.lon, cel: celOf ? celOf(p) : null }; st.d += dt; st.t1 = p.t; }
    else if (st) { out.push(st); st = null; } }
  if (st) out.push(st);
  for (const s of out) s.urcare = s.d >= P0.URC_MIN_S && s.d <= P0.URC_MAX_S && !(s.d < 90 && infra && infra.has(s.cel));
  return out;
}

/** bornele: poarta (rază, lipită cât nu iese din rază), staționările > 25 min și golurile de semnal > 30 min; între ele, segmentele */
export function segmente(P, porti) {
  const laPoarta = (p) => porti.some((g) => hav(p, g) <= P0.R_POARTA);
  const ancore = [];
  { let cur = null; for (let i = 0; i < P.length; i++) { const p = P[i];
    if (laPoarta(p)) { if (cur && i > 0 && laPoarta(P[i - 1])) cur.t1 = p.t; else { cur = { t0: p.t, t1: p.t, poarta: true }; ancore.push(cur); } } else cur = null; } }
  { let a0 = 0; for (let i = 1; i <= P.length; i++) {
    const rupt = i === P.length || hav(P[a0], P[i]) > P0.R_STAT || P[i].t - P[i - 1].t > P0.GOL_SEMNAL_MIN * 60e3;
    if (rupt) { if (P[i - 1].t - P[a0].t >= P0.PAUZA_CURSA_MIN * 60e3 && !laPoarta(P[a0])) ancore.push({ t0: P[a0].t, t1: P[i - 1].t, poarta: false, lat: P[a0].lat, lon: P[a0].lon });
      if (i < P.length && P[i].t - P[i - 1].t > P0.GOL_SEMNAL_MIN * 60e3) ancore.push({ t0: P[i - 1].t, t1: P[i].t, poarta: false, semnal: true, peLoc: hav(P[i - 1], P[i]) <= 0.5, lat: P[i - 1].lat, lon: P[i - 1].lon });
      a0 = i; } } }
  ancore.sort((a, b) => a.t0 - b.t0);
  // lipirea bornelor care se suprapun — într-o singură trecere înainte (în lear-parcare.mjs bucla înapoi nu mai compara borna lărgită cu
  // următoarea: la 217RST 30.09 așteptarea la poartă 17:17–23:28 rămânea ruptă de golurile de semnal 22:08–23:18 și returul s2 «dispărea»)
  { const L = []; for (const b of ancore) { const a = L.at(-1);
      if (a && b.t0 <= a.t1 + 60e3) { a.t1 = Math.max(a.t1, b.t1); a.poarta = a.poarta || b.poarta; a.peLoc = (a.semnal ? !!a.peLoc : true) && (b.semnal ? !!b.peLoc : true); a.semnal = !!(a.semnal && b.semnal); }
      else L.push(b); }
    ancore.length = 0; ancore.push(...L); }
  const seg = [];
  for (let k = 0; k + 1 < ancore.length; k++) { const a = ancore[k], b = ancore[k + 1]; if (b.t0 <= a.t1) continue;
    seg.push({ t0: a.t1, t1: b.t0, dePoarta: a.poarta, laPoarta: b.poarta }); }
  return { ancore, seg };
}

// ─── S.2 potrivirea ───
/** dovada unei rute într-o bucată de urmă: apropierea de capăt (tur: prima, retur: ultima) și urcările pe coridor */
function dovada(ctx, R, ids, sens, a, b, tRef) {
  const { P, opr, casa, porti } = ctx;
  const cor = ids.map((id) => ctx.rute.get(id)).filter(Boolean);
  const [e0, e1] = sens === 'tur' ? [Math.max(a, tRef - P0.INTOARCERE_MIN * 60e3), b] : [a, Math.min(b, tRef + P0.INTOARCERE_MIN * 60e3)];
  // urcările: în fereastra dovezii, pe coridorul rutei (sau al rutelor comasate), departe de poartă și de casă
  const U = opr.filter((s) => s.urcare && s.t0 >= e0 && s.t1 <= e1 && !porti.some((g) => hav(s, g) <= P0.R_EXCL_POARTA) && !(casa && hav(s, casa) <= P0.R_EXCL_CASA));
  const peR = U.filter((s) => cor.some((r) => r.cor.dist(s) <= P0.R_COR));
  const peComasat = new Map(); for (const id of ids.slice(1)) { const r = ctx.rute.get(id); if (!r) continue;
    const n = peR.filter((s) => r.cor.dist(s) <= P0.R_COR && R.cor.dist(s) > P0.R_COR).length; if (n) peComasat.set(id, n); }
  // apropierea de capăt în fereastra dovezii: tur = prima trecere (≤ 1 km), retur = ultima; punctul cel mai apropiat al trecerii
  let cap = null;
  if (R.capat) { const Q = intre(P, e0, e1), runs = []; let run = null;
    for (const p of Q) { if (hav(p, R.capat) <= P0.R_CAPAT) { if (!run) { run = []; runs.push(run); } run.push(p); } else run = null; }
    const x = sens === 'tur' ? runs[0] : runs.at(-1); if (x) cap = x.reduce((m, p) => (hav(p, R.capat) < hav(m, R.capat) ? p : m)); }
  // urcările în satele din nomenclatorul rutei (actul) — dovada fără capăt și cursele în plus nu se sprijină pe trunchiul comun de lângă poartă
  const nAct = peR.filter((s) => ids.some((id) => ctx.inAct?.(s, id))).length;
  return { U: peR, n: peR.length, nAct, cap, peComasat };
}

/** punctul de întoarcere al unei bucăți poartă → … → poartă: cel mai departe de poartă */
function intoarcere(P, a, b, porti) { let best = null, bd = -1; for (const p of intre(P, a, b)) { const d = Math.min(...porti.map((g) => hav(p, g))); if (d > bd) { bd = d; best = p; } } return best?.t ?? a; }

/** O.1: tăierea la lungimea rutei; tur păstrează sfârșitul (dinspre poartă), retur începutul */
function taie(P, t0, t1, cap, pastreazaSfarsit) {
  const tot = kmIntre(P, t0, t1); if (!(cap > 0) || tot <= cap * P0.TOL_RUTA) return { t0, t1, km: tot, taiat: 0 };
  const Q = intre(P, t0, t1); let s = 0;
  if (pastreazaSfarsit) { for (let i = Q.length - 1; i > 0; i--) { s += kmIntre(P, Q[i - 1].t, Q[i].t); if (s > cap * P0.TOL_RUTA) return { t0: Q[i].t, t1, km: kmIntre(P, Q[i].t, t1), taiat: tot - kmIntre(P, Q[i].t, t1) }; } }
  else { for (let i = 1; i < Q.length; i++) { s += kmIntre(P, Q[i - 1].t, Q[i].t); if (s > cap * P0.TOL_RUTA) return { t0, t1: Q[i - 1].t, km: kmIntre(P, t0, Q[i - 1].t), taiat: tot - kmIntre(P, t0, Q[i - 1].t) }; } }
  return { t0, t1, km: tot, taiat: 0 };
}

/** cât din drumul cu oameni al rutei (sensul cursei) e la ≤ R_ACOPERIRE de urmă între t0 și t1 */
export function acoperire(P, linie, t0, t1) {
  if (!linie?.length) return 0;
  const g = new Map(), k = (la, lo) => `${Math.floor(la / 0.005)}|${Math.floor(lo / 0.007)}`;
  for (const p of intre(P, t0, t1)) { const kk = k(p.lat, p.lon); (g.get(kk) ?? g.set(kk, []).get(kk)).push(p); }
  let ok = 0;
  for (const [la, lo] of linie) { const q = { lat: la, lon: lo }, a = Math.floor(la / 0.005), b = Math.floor(lo / 0.007); let gas = false;
    for (let i = -1; i <= 1 && !gas; i++) for (let j = -1; j <= 1 && !gas; j++) for (const p of g.get(`${a + i}|${b + j}`) ?? []) if (hav(p, q) <= P0.R_ACOPERIRE) { gas = true; break; }
    if (gas) ok++; }
  return ok / linie.length;
}

/** încearcă ruta (cu comasatele ei) pe un segment candidat; întoarce cursa cu oameni sau null */
function incearca(ctx, sg, sens, ids) {
  const R = ctx.rute.get(ids[0]); if (!R) return null;
  const { P, porti } = ctx;
  // tur: bucata se termină la poartă; dacă a plecat tot de la poartă, dovada începe la punctul de întoarcere. retur: invers.
  const tRef = sens === 'tur' ? (sg.dePoarta ? intoarcere(P, sg.t0, sg.t1, porti) : sg.t0) : (sg.laPoarta ? intoarcere(P, sg.t0, sg.t1, porti) : sg.t1);
  const d = dovada(ctx, R, ids, sens, sg.t0, sg.t1, tRef);
  let statut;
  let acop = null;
  if (d.cap && d.n >= 1) statut = 'facuta'; else if (!d.cap && d.nAct >= 2) statut = 'facuta';
  // «pe drumul rutei» doar pe rutele pe care mașina are dovadă cu urcări în săptămână (sau din listă): un drum gol acasă pe drumul altei rute nu e cursă
  else if (d.cap && d.n === 0 && !(ctx.peDrumPermis?.has(R.id))) statut = 'neconfirmata';
  else if (d.cap && d.n === 0) { acop = acoperire(P, R.linii?.[sens], sens === 'tur' ? d.cap.t : sg.t0, sens === 'tur' ? sg.t1 : d.cap.t); statut = acop >= P0.ACOPERIRE ? 'facuta' : 'neconfirmata'; }
  // ION-268 (07.10, 283BRAT 06.10 tur s2 B4): drumul rutei acoperit ≥ ACOPERIRE în sensul cursei e cursă FĂCUTĂ și când urma nu trece la ≤ 1 km de
  // punctul capătului (Coșeni la 1,3 km) și urcările nu-s în satele din act — capătul se ia atunci la apropierea cea mai mică (≤ CAPAT_DRUM_KM)
  else if (!d.cap && ctx.peDrumPermis?.has(R.id) && R.capat) {
    const [a0, a1] = sens === 'tur' ? [tRef, sg.t1] : [sg.t0, tRef];
    let best = null; for (const p of intre(P, a0, a1)) { const dd = hav(p, R.capat); if (dd <= P0.CAPAT_DRUM_KM && (!best || dd < best.d)) best = { p, d: dd }; }
    if (!best) return { statut: 'nimic', n: d.n };
    acop = acoperire(P, R.linii?.[sens], sens === 'tur' ? best.p.t : sg.t0, sens === 'tur' ? sg.t1 : best.p.t);
    if (acop < P0.ACOPERIRE) return { statut: 'nimic', n: d.n };
    statut = 'facuta'; d.cap = best.p; d.capAprox = r1(best.d); }
  else return { statut: 'nimic', n: d.n };
  let t0, t1;
  if (sens === 'tur') { t0 = Math.min(d.cap?.t ?? Infinity, d.U[0]?.t0 ?? Infinity); t1 = sg.t1; }
  else { t0 = sg.t0; t1 = Math.max(d.cap?.t ?? -Infinity, d.U.at(-1)?.t1 ?? -Infinity); }
  const capKm = R.km + [...d.peComasat.keys()].reduce((s, id) => s + (ctx.rute.get(id)?.km ?? 0), 0);
  const x = taie(P, t0, t1, capKm, sens === 'tur');
  return { statut, ruta: R.id, comasate: [...d.peComasat.keys()], t0: x.t0, t1: x.t1, kmGps: r1(kmIntre(P, t0, t1)), km: r1(x.km), kmTaiat: r1(x.taiat), urcari: d.n, urcariAct: d.nAct, acoperire: acop == null ? undefined : r1(acop * 100), peDrum: acop != null && acop >= P0.ACOPERIRE ? true : undefined, kmRuta: R.km, capatAprox: d.capAprox,
    sate: [...new Set(d.U.map((s) => ctx.numeSat?.(s) ?? '?'))], capat: !!d.cap, taiat: d.cap ? 'capat' : 'urcari', sg, sgT0: sg.t0 };
}

/** candidații din fereastră: tur = sosire la poartă în fereastră, retur = plecare de la poartă în fereastră */
const candidati = (seg, sens, [w0, w1], tol = 0) => seg.filter((s) => (sens === 'tur' ? s.laPoarta && s.t1 >= w0 - tol && s.t1 <= w1 + tol : s.dePoarta && s.t0 >= w0 - tol && s.t0 <= w1 + tol));

// ─── S.1 + S.2: planul zilei și potrivirea (Ion, 06.10: «Scheletul e universal indiferent de mașină, noi aplicăm scheletul la orice rută») ───
// Planul pe mașină și zi = 4 sloturi (s1 tur / retur, s2 tur / retur) pentru orice mașină care a atins poarta în ziua aceea. Ruta fiecărei curse =
// ruta din schelet (ORICE rută a uzinei) pe care urma o confirmă cel mai bine în fereastra și sensul slotului. Turul și returul aceluiași schimb
// sunt pe ACEEAȘI rută, strict (Ion, 06.10: «tur = retur să fie egal, ca în schelet»): ruta schimbului = cea care explică cel mai bine AMBELE
// curse (scor comun: capăt + drumul rutei + urcări, pe tur și pe retur); cursa care nu se confirmă pe ea e neconfirmată sau lipsă PE RUTA
// SCHIMBULUI, cu motivul «urma arată ruta X» — niciodată făcută pe altă rută.
// Lista rută-pe-mașină e doar indiciu la egalitate (și pentru «neconfirmată»), nu constrângere.

/** scorul dovezii: capătul atins, urcările pe drumul rutei (și cele din satele ei din nomenclator), minus urcările din bucată pe care ruta nu le explică */
const scor = (x, ctx) => !x ? 0 : x.statut !== 'facuta' ? 0
  : 1000 + (x.capat ? 300 : 0) - (x.peDrum ? 200 : 0) + (x.peDrum ? 0.5 * (x.kmRuta ?? 0) : 0) + 20 * x.urcari + 10 * (x.urcariAct ?? 0) - 20 * (x.neexplicate ?? 0) + (ctx.ruteLista?.has(x.ruta) ? 1 : 0);

/** sloturile zilei (fără ruta: ruta o alege potrivirea) */
export function planZi(z, { ferestre }) {
  const out = [];
  for (const schimb of [1, 2]) for (const sens of ['tur', 'retur']) { const f = ferestre.find((x) => x.sens === sens && x.schimb === schimb); if (f) out.push({ zi: z, schimb, sens, fereastra: fereastraAbs(z, f) }); }
  return out;
}

/** cea mai bună cursă a rutei id în slot (pe candidații liberi), cu urcările neexplicate numărate */
function celMaiBun(ctx, slot, id, C, ocupat) {
  let best = null, nec = null;
  for (const sg of C) { const x = incearca(ctx, sg, slot.sens, ctx.comasari(id));
    if (!x || x.statut === 'nimic' || ocupat(x.t0, x.t1)) continue;
    if (x.statut === 'facuta') { const toate = ctx.opr.filter((s) => s.urcare && s.t0 >= x.t0 && s.t1 <= x.t1 && !ctx.porti.some((g) => hav(s, g) <= P0.R_EXCL_POARTA) && !(ctx.casa && hav(s, ctx.casa) <= P0.R_EXCL_CASA));
      x.neexplicate = Math.max(0, toate.length - x.urcari); if (!best || scor(x, ctx) > scor(best, ctx)) best = x; }
    else if (x.statut === 'neconfirmata' && !nec && x.kmGps >= 0.6 * (ctx.rute.get(id)?.km ?? Infinity)) nec = x; }
  return { best, nec };
}

const motivLipsa = (ctx, s) => { const C = candidati(ctx.seg, s.sens, s.fereastra);
  if (C.length) return `${s.sens === 'tur' ? 'sosire' : 'plecare'} ${C.map((g) => oraL(s.sens === 'tur' ? g.t1 : g.t0)).join(', ')} fără urcări pe nicio rută din schelet`;
  const A = candidati(ctx.seg, s.sens, s.fereastra, P0.DIAG_MIN * 60e3);
  return A.length ? `${s.sens === 'tur' ? 'sosire' : 'plecare'} la poartă la ${A.map((g) => oraL(s.sens === 'tur' ? g.t1 : g.t0)).join(', ')} — în afara ferestrei ${oraL(s.fereastra[0])}–${oraL(s.fereastra[1])}`
    : `nicio ${s.sens === 'tur' ? 'sosire la' : 'plecare de la'} poartă în fereastra ${oraL(s.fereastra[0])}–${oraL(s.fereastra[1])}`; };

/** S.2 pe o zi: pe fiecare schimb, perechea tur + retur pe aceeași rută din schelet → făcută / neconfirmată / lipsă */
export function potrivesteZi(ctx, plan, folosit) {
  const ocupat = (t0, t1) => folosit.some((u) => t0 < u.t1 && t1 > u.t0);
  const rez = [], ids = [...ctx.rute.keys()];
  for (const schimb of [1, 2]) {
    const T = plan.find((s) => s.schimb === schimb && s.sens === 'tur'), R = plan.find((s) => s.schimb === schimb && s.sens === 'retur');
    const sl = [T, R].filter(Boolean); if (!sl.length) continue;
    const C = new Map(sl.map((s) => [s, candidati(ctx.seg, s.sens, s.fereastra)]));
    const ev = new Map(sl.map((s) => [s, new Map(ids.map((id) => [id, celMaiBun(ctx, s, id, C.get(s), ocupat)]))]));
    const sc = (s, id) => (s ? scor(ev.get(s).get(id).best, ctx) : 0), fac = (s, id) => (s && ev.get(s).get(id).best ? 1 : 0);
    // perechea pe aceeași rută și alegerea separată a fiecărei curse
    const pereche = ids.reduce((b, id) => (sc(T, id) + sc(R, id) > (b ? sc(T, b) + sc(R, b) : -1) ? id : b), null);
    const singur = (s) => (s ? ids.reduce((b, id) => (sc(s, id) > (b ? sc(s, b) : 0) ? id : b), null) : null);
    const sT = singur(T), sR = singur(R);
    const alegere = new Map(sl.map((s) => [s, pereche])), singurL = new Map([[T, sT], [R, sR]]);
    for (const s of sl) {
      const id = alegere.get(s), x = id ? ev.get(s).get(id).best : null;
      const alt = sl.find((q) => q !== s), idAlt = alt ? alegere.get(alt) : null, xAlt = alt && idAlt ? ev.get(alt).get(idAlt).best : null;
      if (x) { folosit.push({ t0: x.t0, t1: x.t1 }); // T.1–T.3 (TUR = RETUR, toate uzinele): km cursei făcute = km din schelet ai rutei (+ comasatele), identici la tur și la retur; GPS-ul rămâne informativ
      const kmS = r1(ctx.rute.get(id).km + (x.comasate ?? []).reduce((q, c) => q + (ctx.rute.get(c)?.km ?? 0), 0));
      rez.push({ ...s, ...x, km: kmS, kmGpsTaiat: x.km, statut: 'facuta', kmSchelet: ctx.rute.get(id).km, capatN: ctx.rute.get(id).capat?.n ?? null, tura: ctx.rute.get(id).tura, sg: undefined }); continue; }
      // cursa confirmată pe ALTĂ rută decât a schimbului: neconfirmată pe ruta schimbului (muncă, nu gol), cu motivul — niciodată făcută pe altă rută
      const idX = singurL.get(s), xX = idX && idX !== id ? ev.get(s).get(idX).best : null;
      if (id && xX) { folosit.push({ t0: xX.t0, t1: xX.t1 });
        rez.push({ ...s, t0: xX.t0, t1: xX.t1, km: xX.km, kmGps: xX.kmGps, urcari: 0, sate: [], capat: false, ruta: id, rutaUrma: idX, urma: { urcari: xX.urcari, sate: xX.sate, capat: xX.capat, kmGpsTaiat: xX.km, comasate: xX.comasate ?? [] }, statut: 'neconfirmata', kmSchelet: ctx.rute.get(id).km, capatN: ctx.rute.get(id).capat?.n ?? null, tura: ctx.rute.get(id).tura,
          motiv: `urma arată ruta ${idX} (${xX.urcari} urcări: ${xX.sate.join(', ')}), nu ruta schimbului ${id}` }); continue; }
      // neconfirmată: capătul rutei celeilalte curse a schimbului (sau al unei rute din listă) atins în fereastră și în sens, fără urcări (O.2)
      const cand = [...new Set([xAlt ? idAlt : null, ...(ctx.ruteLista ?? [])].filter(Boolean))];
      const nec = cand.map((r) => ({ r, n: celMaiBun(ctx, s, r, C.get(s), ocupat).nec })).find((q) => q.n);
      if (nec) { folosit.push({ t0: nec.n.t0, t1: nec.n.t1 });
        rez.push({ ...s, ...nec.n, ruta: nec.r, statut: 'neconfirmata', kmSchelet: ctx.rute.get(nec.r).km, capatN: ctx.rute.get(nec.r).capat?.n ?? null, tura: ctx.rute.get(nec.r).tura,
          motiv: `capătul ${ctx.rute.get(nec.r).capat?.n ?? nec.r} atins, în fereastră și în sens, dar 0 urcări 10 s–5 min (O.2)`, sg: undefined }); continue; }
      rez.push({ ...s, ruta: xAlt ? idAlt : null, statut: 'lipsa', kmSchelet: xAlt ? ctx.rute.get(idAlt).km : null, capatN: xAlt ? ctx.rute.get(idAlt).capat?.n ?? null : null, motiv: motivLipsa(ctx, s) });
    }
    // T.1: un schimb = o rută = aceiași km la tur și la retur — rutele comasate găsite pe oricare sens se pun pe amândouă (O.4)
    const F = rez.filter((c) => c.schimb === schimb && c.statut === 'facuta');
    if (F.length) { const comU = [...new Set(F.flatMap((c) => c.comasate ?? []))], id0 = F[0].ruta;
      const kmS = r1(ctx.rute.get(id0).km + comU.reduce((q, c) => q + (ctx.rute.get(c)?.km ?? 0), 0));
      for (const c of F) { c.comasate = comU; c.km = kmS; } } }
  return rez;
}

/** ziua întreagă a unei mașini: planul, potrivirea, cursele în plus (cele din afara ferestrelor = «posibil cursă schimbul 3») și golul (restul, S.3) */
export function ziua(ctx, z) {
  const plan = planZi(z, { ferestre: ctx.ferestre });
  const folosit = [];
  const curse = potrivesteZi(ctx, plan, folosit);
  const t0z = miezulNoptii(z) + 3 * 3600e3, t1z = t0z + 24 * 3600e3;
  const plus = cursePlus(ctx, folosit, [t0z, t1z], curse.filter((c) => c.statut === 'facuta'));
  const inF = (sens, t) => ctx.ferestre.some((f) => f.sens === sens && (() => { const [a, b] = fereastraAbs(z, f); const [a2, b2] = fereastraAbs(ziLucru(t - 864e5), f); return (t >= a && t <= b) || (t >= a2 && t <= b2); })());
  for (const p of plus) p.s3 = p.sens === 'tur' ? !inF('tur', p.t1) : p.sens === 'retur' ? !inF('retur', p.t0) : false;
  return { z, plan: curse, plus };
}

/** S.4: cursele în plus — pe ce a rămas din segmente, ≥ 3 urcări pe o rută din schelet; altfel gol (S.5) */
export function cursePlus(ctx, folosit, [t0z, t1z], confirmate = []) {
  const out = [];
  for (const sg of ctx.seg) { if (sg.t1 <= t0z || sg.t0 >= t1z) continue;
    // părțile rămase libere din segment
    let libere = [[Math.max(sg.t0, t0z), Math.min(sg.t1, t1z)]];
    for (const u of folosit) libere = libere.flatMap(([a, b]) => (u.t1 <= a || u.t0 >= b ? [[a, b]] : [[a, Math.min(b, u.t0)], [Math.max(a, u.t1), b]].filter(([x, y]) => y - x > 60e3)));
    for (const [a, b] of libere) {
      const U = ctx.opr.filter((s) => s.urcare && s.t0 >= a && s.t1 <= b && !ctx.porti.some((g) => hav(s, g) <= P0.R_EXCL_POARTA) && !(ctx.casa && hav(s, ctx.casa) <= P0.R_EXCL_CASA));
      if (U.length < P0.URC_PLUS) continue;
      let best = null;
      for (const R of ctx.rute.values()) { const u = U.filter((s) => R.cor.dist(s) <= P0.R_COR && ctx.inAct?.(s, R.id)); if (u.length >= P0.URC_PLUS && (!best || u.length > best.u.length + (ctx.ruteLista?.has(best.R.id) ? 1 : 0))) best = { R, u }; }
      if (!best) continue;
      // O.3: cursa în plus «merge pe o rută»: cel puțin 30 % din lungimea ei (≥ 3 km) între prima și ultima urcare — manevrele într-un sat nu-s curse
      if (kmIntre(ctx.P, best.u[0].t0, best.u.at(-1).t1) < Math.max(3, 0.3 * (best.R.km ?? 0)) && !confirmate.some((c) => c.sgT0 === sg.t0 && c.ruta === best.R.id)) continue;
      // urcările rămase pe ruta unei curse confirmate din ACELAȘI segment = începutul / sfârșitul ei (bucla dinaintea întoarcerii), nu cursă în plus
      const lipita = confirmate.find((c) => c.sgT0 === sg.t0 && c.ruta === best.R.id && c.t0 != null);
      if (lipita) { const n0 = Math.min(lipita.t0, best.u[0].t0), n1 = Math.max(lipita.t1, best.u.at(-1).t1);
        const y = taie(ctx.P, n0, n1, best.R.km, lipita.sens === 'tur');
        const u = folosit.find((q) => q.t0 === lipita.t0 && q.t1 === lipita.t1); lipita.t0 = y.t0; lipita.t1 = y.t1; if (u) { u.t0 = y.t0; u.t1 = y.t1; }
        lipita.kmGpsTaiat = r1(y.km); lipita.kmGps = r1(kmIntre(ctx.P, n0, n1));   // km cursei rămân cei din schelet (T.1) lipita.kmTaiat = r1(y.taiat); lipita.urcari += best.u.length; lipita.lipit = (lipita.lipit ?? 0) + best.u.length;
        continue; }
      // de la prima la ultima urcare; lipit de poartă dacă bucata pleacă / ajunge la poartă
      let x0 = best.u[0].t0, x1 = best.u.at(-1).t1;
      const dePoarta = sg.dePoarta && a === sg.t0, laPoarta = sg.laPoarta && b === sg.t1;
      if (laPoarta) x1 = b; else if (dePoarta) x0 = a;
      const x = taie(ctx.P, x0, x1, best.R.km, laPoarta);
      out.push({ statut: 'plus', ruta: best.R.id, sens: laPoarta ? 'tur' : dePoarta ? 'retur' : null, t0: x.t0, t1: x.t1, km: r1(x.km), kmTaiat: r1(x.taiat), urcari: best.u.length,
        sate: [...new Set(best.u.map((s) => ctx.numeSat?.(s) ?? '?'))], zi: ziLucru(x.t0) });
      folosit.push({ t0: x.t0, t1: x.t1 });
    } }
  return out;
}


// ─── T.1 excepția: SCHIMBUL DE RUTĂ între două mașini (Ion, 06.10: «rar, verifici după oră») ───
// Perechea oglindă se acceptă ca făcută DOAR când ora o confirmă: în aceeași zi, același schimb și același sens, mașina A face sensul pe ruta
// schimbului lui B, iar B pe ruta schimbului lui A, cu sosirea (tur) / plecarea (retur) la poartă la cel mult OGLINDA_MIN minute una de alta.
// Atunci ambele curse sunt făcute, fiecare cu km din schelet ai rutei efectiv făcute, cu eticheta «schimb de rută cu <mașina>». Altfel rămân
// neconfirmate («urma arată ruta X»). Pentru orice altceva TUR = RETUR rămâne regula.
export const OGLINDA_MIN = 20;
/** masini: Map mașină → { zile: [{ z, plan: [curse] }] } (ieșirea adaptorului), rute: Map id → { km }; schimbă pe loc cursele acceptate */
export function aplicaSchimburiDeRuta(masini, rute) {
  const cand = [];
  for (const [m, X] of masini) for (const Z of X.zile ?? []) for (const c of Z.plan) if (c.statut === 'neconfirmata' && c.rutaUrma && c.urma) cand.push({ m, z: Z.z, c });
  const ora = (c) => (c.sens === 'tur' ? c.t1 : c.t0), acceptate = [];
  for (const a of cand) { if (a.c.schimbCu) continue;
    const b = cand.find((q) => q !== a && !q.c.schimbCu && q.m !== a.m && q.z === a.z && q.c.schimb === a.c.schimb && q.c.sens === a.c.sens
      && q.c.rutaUrma === a.c.ruta && a.c.rutaUrma === q.c.ruta && Math.abs(ora(q.c) - ora(a.c)) <= OGLINDA_MIN * 60e3);
    if (!b) continue;
    for (const [x, y] of [[a, b], [b, a]]) { const c = x.c, id = c.rutaUrma, com = c.urma.comasate ?? [];
      Object.assign(c, { statut: 'facuta', rutaPlan: c.ruta, ruta: id, schimbCu: y.m, km: r1(rute.get(id).km + com.reduce((q, k) => q + (rute.get(k)?.km ?? 0), 0)), kmSchelet: rute.get(id).km,
        capatN: rute.get(id).capat?.n ?? null, tura: rute.get(id).tura, urcari: c.urma.urcari, sate: c.urma.sate, capat: c.urma.capat, kmGpsTaiat: c.urma.kmGpsTaiat, comasate: com,
        motiv: `schimb de rută cu ${y.m}: ${c.sens} pe ${id} la ${oraL(ora(c))}, ${y.m} pe ${c.rutaPlan} la ${oraL(ora(y.c))}`, rutaUrma: undefined }); }
    acceptate.push(`${a.z} s${a.c.schimb} ${a.c.sens}: ${a.m} ${a.c.ruta} ↔ ${b.m} ${b.c.ruta}`); }
  return acceptate;
}
