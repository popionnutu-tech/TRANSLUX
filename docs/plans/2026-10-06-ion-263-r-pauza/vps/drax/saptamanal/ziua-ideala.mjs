// ION-123 — «ziua ideală» Drăxlmaier (verdictul dezbaterii Claude + Codex, r3 10/10, 28.09.2026; sursa docs/plans/2026-09-28-drax-ziua-ideala/r3/ziua-ideala-v3.mjs).
// r3 — după runda-3.md (Codex r2: C4 aliasurile dispozitivelor, C5 unirea cauzelor). Pornește din r2/ziua-ideala-v2.mjs.
//  C4  dispozitiv → mașină (ALIAS_M din categorii.mjs) ÎNAINTE de căutarea curselor și a casei; fișierele se citesc după dispozitiv; fără _ciorna/.
//  C5  «acasă între curse» = ocolul + drumul mai lung în intervalele cu ocol (doar pozitive); reziduurile negative doar în «drum mai scurt».
// (antetul r2:)
// Pornește din r1/ziua-ideala.mjs. Săptămâna 14–20.09.2026 (rândul după ION-119/ION-120).
// Rulare pe VPS, Valhalla pe COPIA cache-ului:  ECON_D=/tmp/ion123r3 OUT=/tmp/ion123r3/ziua-ideala-v3.json node ziua-ideala-v3.mjs
// DOAR CITIRE: <SAPT_D>/{economie-zile,economie,analiza}.json, economie-urme/ (urma GPS brută) ale săptămânii și ale dosarelor
// din cele 4 săptămâni dinainte (saptamanal/ și saptamanal/_ciorna/). Nimic în bază; codul /root/lde-worker doar importat (comun.mjs).
//
// Contractul (runda-2.md):
//  C1  deplasările OBLIGATORII ale zilei, în ordine: cursele cu oameni; între uzine (§5.11, ancorate pe porțile din «EST → VEST»);
//      service; deplasare (§5.6); golul tur → retur (golTure); «lângă uzină» (parc + golul fără ocol al intervalului cu ambele capete
//      la uzină). Intră în ideal la km GPS CA ATARE. Legătura ideală doar între sfârșitul unei obligatorii și începutul următoarei,
//      dacă locurile diferă > 1,5 km; intervalul fără km neobligatorii nu primește legătură.
//  C2  eșantionul = al regulii B / al celor 3 reguli: L–V din economie.json, fără «exclus» (§8.6), fără «de lămurit» (§11.8);
//      jumătatea de noapte intră doar dacă ziua ei e în eșantion; weekendul (noaptea care atinge sâmbăta/duminica, vineri → luni),
//      Bălți (§7.4, locul nopții ≤ 3 km de uzină/parc) și pauza > 1 zi = SEPARAT; 386PKP și 293QVT pe listă separată;
//      extrapolarea cu factorul B (zileLV / esantion din economie.json).
//  C3  GPS_zi = Σ bucăți (s.km, fără golImpus); IDEAL_zi = Σ obligatorii + Σ legături + noaptea ideală; GPS − IDEAL =
//      economie eligibilă + separat (weekend, Bălți, pauză); cauze ≥ 0 pe bucată, reziduul negativ = «drum mai scurt» (steag).
//  Q2  legătura = mediana GPS a drumurilor directe (fără oprire ≥ 20 min, fără casă, în afara curselor cu oameni) ale oricărei
//      mașini pe aceeași pereche (≤ 1,5 km la ambele capete, ambele sensuri), ≥ 3 observații; altfel Valhalla × 1,05 cu steag.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
const C = await import('/root/lde-worker/drax/cod/economie/comun.mjs');
const { kmDrum, hav, PORTI, PARC, salveazaCache, NULE, poarta } = C;
const BAZA = '/root/lde-worker/drax/date/saptamanal';
// ION-123 (în lanț): dosarul săptămânii e argumentul (ECON_D al lui saptamanal.sh); ieșirea <dosar>/ziua-ideala.json
const W = process.argv[2];
if (!W || !existsSync(`${W}/analiza.json`)) { console.error('ziua-ideala.mjs <dosarul săptămânii> (lipsește analiza.json)'); process.exit(2); }
const OUT = `${W}/ziua-ideala.json`;
const J = (f) => JSON.parse(readFileSync(f, 'utf8'));
const Z = J(`${W}/economie-zile.json`), A = J(`${W}/analiza.json`), EC = J(`${W}/economie.json`);
const r1 = (x) => Math.round(x * 10) / 10;
const P = (a) => (a ? (Array.isArray(a) ? { lat: a[0], lon: a[1] } : { lat: a.lat, lon: a.lon }) : null);
const med = (a) => { const q = [...a].sort((x, y) => x - y); const n = q.length; return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : null; };
const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) ?? 0), 0);
const ziua = (z, k) => { const x = new Date(z + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
const zileDif = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);

const LOC_KM = 1.5, UZ_R = 1.0, ZONA = 3, STOP_MIN = 20, STOP_R = 0.25, CASA_R = 0.4, OBS_MIN = 3, VAL_F = 1.05, NEG_ZI = -5, PRAG = 100, ZILE_MIN = 3;
const SEP = new Set(['386PKP', '293QVT']);
const OBL = new Set(['intreUzine', 'parc', 'golTure', 'deplasare', 'service']);
const PLIN = new Set(['golTure', 'deplasare', 'service']);          // intervalul întreg e deplasare obligatorie (fără legătură)
const NEOBL = new Set(['livrare', 'golRuta', 'legatura', 'necunoscut']);
const GATE = Object.fromEntries(PORTI.map((g) => [g.n, { lat: g.lat, lon: g.lon, n: g.n }]));
const ZONE_PTS = [...PORTI.map((g) => ({ lat: g.lat, lon: g.lon, n: g.n })), { lat: PARC.lat, lon: PARC.lon, n: 'PARC' }];
const laUzina = (p) => PORTI.some((g) => hav(p, g) <= g.r + UZ_R) || hav(p, PARC) <= UZ_R;
const departeUz = (p) => Math.min(hav(p, PARC), ...PORTI.map((q) => hav(p, q)));

// ---------- eșantionul (identic cu patru-reguli.mjs:41-46, categoria «livrare») ----------
const eZi = new Map(EC.zile.map((x) => [`${x.m}|${x.z}`, x]));
const DL = A.deLamurit ?? [];
const deLamurit = (d, cat) => DL.some((x) => x.m === d.m && (x.economie?.cat ?? []).includes(cat) && ((x.economie?.dow ?? []).includes(d.dow) || (x.economie?.zile ?? []).includes(d.z)));
const inEsant = (d) => d.dow <= 5 && eZi.has(`${d.m}|${d.z}`) && !eZi.get(`${d.m}|${d.z}`).exclus && !deLamurit(d, 'livrare');
const motivAfara = (d) => (d.dow > 5 ? 'weekend' : !eZi.has(`${d.m}|${d.z}`) ? 'fără rând în economie.json' : eZi.get(`${d.m}|${d.z}`).exclus ? `§8.6: ${eZi.get(`${d.m}|${d.z}`).exclus}` : deLamurit(d, 'livrare') ? 'de lămurit §11.8' : null);
const F = EC.flota.toate.zileLV / EC.flota.toate.esantion;

// ---------- Q2: observațiile GPS ale drumurilor directe (r3/C4: dispozitiv → mașină ÎNAINTE de curse și casă) ----------
// Aliasurile se citesc din codul producător (categorii.mjs:32, identic în alternative/control/etichete); fișierele rămân pe dispozitiv.
const CAT_SRC = readFileSync('/root/lde-worker/drax/cod/economie/categorii.mjs', 'utf8');
const ALIAS_M = JSON.parse(CAT_SRC.match(/const ALIAS_M = (\{[^}]*\})/)[1].replace(/'/g, '"'));
const ALIAS_ASTEPTAT = { '0357544371228442': '880RNK', '350KAJ#2284': '350KAJ' };
if (JSON.stringify(ALIAS_M) !== JSON.stringify(ALIAS_ASTEPTAT)) throw new Error('ALIAS_M din categorii.mjs s-a schimbat: ' + JSON.stringify(ALIAS_M));
const numeM = (m) => ALIAS_M[m] ?? m;
// r3: FĂRĂ ciornă — doar săptămâna și dosarele validate (saptamanal/AAAA-LL-ZZ) din cele 4 săptămâni dinainte; _ciorna/ nu se citește
const dosareObs = [W];
const t0W = new Date(W.slice(-10) + 'T12:00:00Z');
for (const n of (existsSync(BAZA) ? readdirSync(BAZA) : [])) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n)) continue; const dd = (t0W - new Date(n + 'T12:00:00Z')) / 864e5;
  const p = `${BAZA}/${n}`; if (dd >= 7 && dd <= 28 && existsSync(`${p}/economie-urme`) && existsSync(`${p}/economie-zile.json`)) dosareObs.push(p);
}
const TRACK = new Map(), CASA_W = new Map();   // ION-132: urma săptămânii pe mașină (pentru plimbatul pe loc) și casa
const RUNS = []; const obsStat = { dosare: dosareObs, puncte: 0, curse: 0, runde: 0, dispozitive: [], fisiereDubluOmise: 0 };
const probaAlias = {};      // pe fiecare alias: ce ar fi scăpat v2 (căutare după dispozitiv) față de v3 (după mașină)
const CURSE_GLOBAL = new Map();   // `${dos}|${mașină}` → cursele cu oameni, pentru proba observațiilor
for (const dos of dosareObs) {
  const ZZ = J(`${dos}/economie-zile.json`), EE = existsSync(`${dos}/economie.json`) ? J(`${dos}/economie.json`) : { masini: [] };
  const casa = new Map(EE.masini.map((x) => [x.m, x.casa ? P(x.casa) : null]));
  const cursa = new Map(); for (const d of ZZ.zile) for (const s of d.seg) if (s.cat === 'cuOameni') (cursa.get(d.m) ?? cursa.set(d.m, []).get(d.m)).push([s.t0, s.t1]);
  for (const [m, L] of cursa) CURSE_GLOBAL.set(`${dos}|${m}`, L.sort((a, b) => a[0] - b[0]));
  // mașina → { ziua → fișierul dispozitivului cu cele mai multe puncte } (ca puncte() din categorii.mjs)
  const peMasinaZi = new Map();
  for (const dev of readdirSync(`${dos}/economie-urme`)) {
    const m = numeM(dev); obsStat.dispozitive.push(dev === m ? dev : `${dev}→${m}`);
    for (const f of readdirSync(`${dos}/economie-urme/${dev}`)) { if (!f.endsWith('.json')) continue; const u = J(`${dos}/economie-urme/${dev}/${f}`);
      const Mz = peMasinaZi.get(m) ?? peMasinaZi.set(m, new Map()).get(m); const prev = Mz.get(f);
      const n = u.n ?? (u.pts ?? []).length;
      if (prev) { obsStat.fisiereDubluOmise++; if (n <= prev.n) continue; }
      Mz.set(f, { dev, n, u }); }
  }
  for (const [m, Mz] of peMasinaZi) {
    const pts = [], mute = [], devs = new Set();
    for (const { dev, u } of Mz.values()) { devs.add(dev); for (const p of u.pts ?? []) { if (p.mut) mute.push([p.t0, p.t1]); else if (p.lat != null) {
      // ION-130: punctul de staționare (stat) are ora în t0/t1, nu în t — fără ea sortarea amesteca punctele și «drumul direct» sărea peste hartă
      if (p.t == null && p.t0 != null) { pts.push({ lat: p.lat, lon: p.lon, t: p.t0, v: 0, st: 1, t1: p.t1 }); if (p.t1 > p.t0) pts.push({ lat: p.lat, lon: p.lon, t: p.t1, v: 0, st: 2 }); }
      else if (p.t != null) pts.push(p); } } }
    pts.sort((a, b) => a.t - b.t); const Q = pts.filter((p, i) => i === 0 || p.t !== pts[i - 1].t); obsStat.puncte += Q.length;
    const CU = (cursa.get(m) ?? []).sort((a, b) => a[0] - b[0]); obsStat.curse += CU.length;
    const inCursa = (t) => CU.some(([a, b]) => t > a && t < b);
    const muteLung = mute.filter(([a, b]) => b - a >= STOP_MIN * 60e3);
    const cs = casa.get(m);
    if (dos === W) { TRACK.set(m, Q); CASA_W.set(m, cs); }
    for (const dev of devs) if (ALIAS_M[dev]) {
      const CUdev = cursa.get(dev) ?? [], csDev = casa.get(dev);
      probaAlias[`${dos.split('/').pop()}|${dev}`] = { masina: m, puncte: Q.length, curseDupaDispozitiv: CUdev.length, curseDupaMasina: CU.length,
        casaDupaDispozitiv: !!csDev, casaDupaMasina: !!cs, puncteInCurseScapateInV2: Q.filter((p) => inCursa(p.t)).length,
        puncteLaCasaScapateInV2: cs ? Q.filter((p) => hav(p, cs) <= CASA_R).length : 0 };
    }
    let run = [];
    const inchide = () => { if (run.length >= 2) RUNS.push({ m, devs: [...devs], dos, pts: run }); run = []; };
    let i = 0;
    while (i < Q.length) {
      const p = Q[i];
      if (inCursa(p.t) || (cs && hav(p, cs) <= CASA_R)) { inchide(); i++; continue; }
      if (run.length) { const q = run[run.length - 1];
        if (p.t - q.t >= STOP_MIN * 60e3 || muteLung.some(([a, b]) => a >= q.t && b <= p.t)) inchide(); }
      // oprire ≥ 20 min: punctele rămân în 250 m de p cel puțin 20 min
      let j = i; while (j + 1 < Q.length && hav(Q[j + 1], p) <= STOP_R) j++;
      if (Q[j].t - p.t >= STOP_MIN * 60e3) { run.push(p); inchide(); i = j; run = []; if (i === Q.length - 1) break; continue; }
      run.push(p); i++;
    }
    inchide();
  }
}
for (const r of RUNS) { let c = 0; r.pts[0].c = 0; let la0 = 90, la1 = -90, lo0 = 90, lo1 = -90;
  for (let k = 0; k < r.pts.length; k++) { const p = r.pts[k]; if (k) { c += hav(r.pts[k - 1], p); p.c = c; } la0 = Math.min(la0, p.lat); la1 = Math.max(la1, p.lat); lo0 = Math.min(lo0, p.lon); lo1 = Math.max(lo1, p.lon); }
  r.bb = [la0 - 0.014, la1 + 0.014, lo0 - 0.021, lo1 + 0.021]; }
obsStat.runde = RUNS.length;
const inBB = (bb, p) => p.lat >= bb[0] && p.lat <= bb[1] && p.lon >= bb[2] && p.lon <= bb[3];
function observa(a, b) {   // drumuri directe a → b (≤ 1,5 km la ambele capete), km pe urma GPS între punctele cele mai apropiate
  const o = [];
  for (const r of RUNS) {
    if (!inBB(r.bb, a) || !inBB(r.bb, b)) continue;
    let lastA = -1, bestA = Infinity, inA = false;
    const X = r.pts;
    for (let k = 0; k < X.length; k++) {
      const da = hav(X[k], a), db = hav(X[k], b);
      if (lastA >= 0 && db <= LOC_KM && db < da) {
        let kb = k, best = db; while (k + 1 < X.length && hav(X[k + 1], b) <= LOC_KM) { k++; const d2 = hav(X[k], b); if (d2 < best) { best = d2; kb = k; } }
        if (!(X[kb].t > X[lastA].t)) { lastA = -1; inA = false; continue; }   // ION-130: drumul merge înainte în timp
        o.push({ km: X[kb].c - X[lastA].c + hav(a, X[lastA]) + hav(X[kb], b), m: r.m, devs: r.devs, dosP: r.dos, t: X[lastA].t, t1: X[kb].t, dos: r.dos === W ? 'sapt' : r.dos.split('/').pop() });
        lastA = -1; inA = false; continue;
      }
      if (da <= LOC_KM) { if (!inA) { inA = true; bestA = Infinity; } if (da < bestA) { bestA = da; lastA = k; } } else inA = false;
    }
  }
  return o;
}
const cnt = { legZero: 0, legGps: 0, legValhalla: 0, legValhallaNull: 0, perechiGps: new Set(), perechiValhalla: new Set(), ancoreNepotrivite: 0, obs: 0, obsAlias: 0, obsInCursa: [] };
const legCache = new Map();
const kk = (p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
async function leg(a, b) {
  if (hav(a, b) <= LOC_KM) { cnt.legZero++; return { km: 0, src: '0' }; }
  const key = [kk(a), kk(b)].sort().join('|');
  let v = legCache.get(key);
  if (!v) {
    const o = [...observa(a, b), ...observa(b, a)];
    // proba C4: nicio observație nu se suprapune cu o cursă cu oameni a MAȘINII ei (după alias)
    for (const x of o) { cnt.obs++; if (x.devs.some((d) => ALIAS_M[d])) cnt.obsAlias++;
      if ((CURSE_GLOBAL.get(`${x.dosP}|${x.m}`) ?? []).some(([p, q]) => x.t < q && x.t1 > p)) cnt.obsInCursa.push({ m: x.m, devs: x.devs, t: x.t, t1: x.t1 }); }
    if (o.length >= OBS_MIN) { const kv = await kmDrum(a, b); v = { km: med(o.map((x) => x.km)), src: 'gps', n: o.length, masini: new Set(o.map((x) => x.m)).size, dinCiorna: o.filter((x) => x.dos !== 'sapt').length, valhallaDiag: kv, p25: o.map((x) => x.km).sort((p, q) => p - q)[Math.floor(o.length / 4)], a: kk(a), b: kk(b) }; }
    else { const k = await kmDrum(a, b); v = k == null ? { km: NaN, src: 'valhalla-null' } : { km: k * VAL_F, src: 'valhalla', n: o.length, valhalla: k, a: kk(a), b: kk(b) }; }
    legCache.set(key, v);
  }
  if (v.src === 'gps') { cnt.legGps++; cnt.perechiGps.add(key); } else if (v.src === 'valhalla') { cnt.legValhalla++; cnt.perechiValhalla.add(key); } else cnt.legValhallaNull++;
  return v;
}
const sumLeg = (...L) => ({ km: sum(L, (x) => x.km), src: L.map((x) => x.src).filter((s) => s !== '0').join('+') || '0' });

// ---------- structura zilei ----------
const portiDin = (s) => { const t = (s.porti ?? (s.motiv ?? '').replace(/^.*între uzine:\s*/, '')).split(/[,→]/).map((x) => x.trim()).filter((x) => GATE[x]); return t.length ? { from: GATE[t[0]], to: GATE[t.at(-1)] } : null; };
function structura(d) {
  const iv = [], idx = new Map();
  for (const s of d.seg) { const k = s.t0 + '-' + s.t1; if (!idx.has(k)) { idx.set(k, iv.length); iv.push({ t0: s.t0, t1: s.t1, ora: s.ora, seg: [] }); } iv[idx.get(k)].seg.push(s); }
  iv.sort((a, b) => a.t0 - b.t0);
  const ci = iv.map((v, i) => (v.seg.some((s) => s.cat === 'cuOameni') ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < iv.length; i++) {
    const v = iv[i]; const S = (f) => sum(v.seg.filter(f), (s) => s.km);
    v.de = P(v.seg[0].de); v.pana = P(v.seg[0].pana);
    v.km = S(() => true);
    if (v.seg.some((s) => s.cat === 'cuOameni')) { v.tip = 'cursa'; v.cursa = v.seg.find((s) => s.cat === 'cuOameni'); v.obl = v.km; v.neobl = 0; continue; }
    v.tip = i < ci[0] ? 'dim' : i > ci.at(-1) ? 'seara' : 'intre';
    v.ocol = S((s) => s.cat === 'livrare' && s.ocol);
    // ION-263 R-PAUZĂ: pauza acasă permisă (sub prag) e deplasare obligatorie — intră în ideal, nu în economie
    v.pauza = S((s) => !!s.pauzaAcasa);
    v.alt = S((s) => NEOBL.has(s.cat) && !(s.cat === 'livrare' && s.ocol) && !s.pauzaAcasa);
    v.oblK = S((s) => OBL.has(s.cat) || !!s.pauzaAcasa);
    v.parc = S((s) => s.cat === 'parc'); v.golTure = S((s) => s.cat === 'golTure'); v.munca = S((s) => ['intreUzine', 'deplasare', 'service'].includes(s.cat));
    v.golRuta = S((s) => s.cat === 'golRuta'); v.livrMargine = S((s) => s.cat === 'livrare' && !s.ocol && (v.tip === 'dim' ? !s.prev : v.tip === 'seara' ? !s.next : false));
    const iu = v.seg.filter((s) => s.cat === 'intreUzine').map(portiDin).filter(Boolean);
    v.iu = iu.length ? { from: iu[0].from, to: iu.at(-1).to } : null;
    v.plin = v.seg.some((s) => PLIN.has(s.cat));
    v.langa = v.tip === 'intre' && !v.plin && laUzina(v.de) && laUzina(v.pana);
    if (v.plin || v.langa) { v.obl = v.oblK + v.alt; v.neobl = v.ocol; v.langaKm = v.langa ? v.alt : 0; }
    else { v.obl = v.oblK; v.neobl = v.ocol + v.alt; v.langaKm = 0; }
    v.langaParc = v.parc;   // parcul e «lângă uzină» (Q5) oriunde
  }
  return { iv, ci };
}

// ---------- zilele, nopțile ----------
const ZILE = Z.zile.filter((d) => d.seg.some((s) => s.cat === 'cuOameni'));
const faraCurse = Z.zile.filter((d) => !d.seg.some((s) => s.cat === 'cuOameni')).map((d) => `${d.m} ${d.z}`);
const D = ZILE.map((d) => ({ d, ...structura(d), esant: inEsant(d), motiv: motivAfara(d) }));
// ancorele zilei: S = începutul primei obligatorii, E = sfârșitul ultimei; legăturile interne ale jumătăților
async function ancore(x) {
  const { iv, ci } = x; const f = iv[ci[0]], l = iv[ci.at(-1)];
  const dim = iv.filter((v) => v.tip === 'dim'), sea = iv.filter((v) => v.tip === 'seara');
  let S = f.cursa ? P(f.cursa.de) : f.de, E = l.cursa ? P(l.cursa.pana) : l.pana, intDim = 0, intSea = 0; const srcI = [];
  for (const v of [...dim].reverse()) if (v.oblK > 0) {
    let g; if (v.iu) g = { a: v.iu.from, b: v.iu.to }; else { const z = ZONE_PTS.reduce((b, q) => (hav(q, S) < hav(b, S) ? q : b)); g = { a: z, b: z }; }
    const L = v.neobl > 0 ? await leg(g.b, S) : { km: 0, src: '0' }; intDim += L.km; if (L.src !== '0') srcI.push(L.src); S = g.a; }
  for (const v of sea) if (v.oblK > 0) {
    let g; if (v.iu) g = { a: v.iu.from, b: v.iu.to }; else { const z = ZONE_PTS.reduce((b, q) => (hav(q, E) < hav(b, E) ? q : b)); g = { a: z, b: z }; }
    const L = v.neobl > 0 ? await leg(E, g.a) : { km: 0, src: '0' }; intSea += L.km; if (L.src !== '0') srcI.push(L.src); E = g.b; }
  x.S = S; x.E = E; x.intDim = intDim; x.intSea = intSea;
  x.realDim = sum(dim, (v) => v.neobl); x.realSea = sum(sea, (v) => v.neobl);
  x.oblDim = sum(dim, (v) => v.obl); x.oblSea = sum(sea, (v) => v.obl);
}
for (const x of D) await ancore(x);
const peMasina = new Map(); for (const x of D) (peMasina.get(x.d.m) ?? peMasina.set(x.d.m, []).get(x.d.m)).push(x);
const NOPTI = [];
for (const L of peMasina.values()) {
  L.sort((a, b) => a.d.z.localeCompare(b.d.z));
  for (let i = 0; i < L.length; i++) {
    const a = L[i], circ = i === L.length - 1, b = circ ? L[0] : L[i + 1];
    const gap = circ ? null : zileDif(a.d.z, b.d.z);
    const noapteLoc = a.d.noapteB ? P(a.d.noapteB) : null;
    const cat = circ || a.d.dow > 5 || b.d.dow > 5 || (a.d.dow === 5 && b.d.dow === 1) ? 'weekend' : gap > 1 ? 'pauza' : noapteLoc && departeUz(noapteLoc) <= ZONA ? 'balti' : 'normal';
    const N = { m: a.d.m, de: a, la: b, cat, circular: circ, noapte: `${a.d.z}→${circ ? '(circular) ' : ''}${b.d.z}` };
    N.link = L.length === 1 && circ ? await leg(a.E, b.S) : await leg(a.E, b.S);
    N.real = a.realSea + b.realDim;
    a.noapteSeara = N; b.noapteDim = N; NOPTI.push(N);
  }
}

// ---------- ecuațiile pe zi ----------
// ION-132 (Ion, 29.09.2026: «tot ce este plimbat prin Bălți și Florești în mare parte este lucrul»): km plimbați PE LOC la cele două
// capete ale golului dintre curse (în raza de 5 km de locul de unde pleacă și de locul unde ajunge — porți, autogară, capătul liniei)
// sunt muncă: intră în ideal, nu în economie. Pe loc = km din urma GPS în rază minus drumul pe șosea (Valhalla) de la capăt până la ieșirea
// din rază (runda 1, revizorul Claude: 1,3 × dreapta era sub ocolul real al drumurilor de ieșire, mediana 1,44 — se număra drum ca plimbat).
// Faza care se oprește la casă contează 0: drumul spre casă și de la casă rămâne economie (ocolul, 5.2). Plimbatul ≤ restul golului după ocol.
const PLIMB_R = 5;
const ZONA_PROD_KM = 3;
// Codex r4 C2: km-ii obligatorii se delimitează pe MUCHIILE urmei, cu regulile producătorului, apoi se intersectează cu drumul din mijloc.
// Între uzine (§5.11): perechile poartă A → poartă B ≠ A, «la poartă» = staționare ≥ 1 min în raza porții + 0,3 km sau capătul mișcării,
// ≤ 40 min, toate punctele în zona de 3 km → muchiile ia..ib; mișcarea toată în zonă și ≤ 11 km → toate muchiile. Parcul: bucățile dintre
// capetele mișcării și staționările ≥ 5 min la parc, toate în zonă. Muchiile > 5 km (salturi) nu se numără, ca la producător.
function muchiiObligatorii(Q, cuParc) {
  const obIU = new Uint8Array(Q.length), obP = new Uint8Array(Q.length);
  const dd = (k) => hav(Q[k - 1], Q[k]);
  let tot = 0; for (let k = 1; k < Q.length; k++) if (dd(k) <= 5) tot += dd(k);
  const viz = []; let perechi = 0;
  for (let k = 0; k < Q.length; k++) { const g = poarta(Q[k], 0.3), u = viz.at(-1);
    if (g && u && u.g === g && u.deschis) u.idx.push(k); else { if (u) u.deschis = false; if (g) viz.push({ g, idx: [k], deschis: true }); } }
  const statMs = (v) => { let ms = 0; for (let n = 1; n < v.idx.length; n++) { const p = Q[v.idx[n - 1]], q = Q[v.idx[n]], dt = q.t - p.t;
    if (dt > 0 && hav(p, q) / (dt / 3.6e6) < 8) ms += dt; } return ms; };
  const la = (v, n) => statMs(v) >= 60e3 || (n === 0 && v.idx[0] === 0) || (n === viz.length - 1 && v.idx.at(-1) === Q.length - 1);
  for (let n = 0; n + 1 < viz.length; n++) { const A = viz[n], B = viz[n + 1], ia = A.idx.at(-1), ib = B.idx[0];
    if (A.g === B.g || !la(A, n) || !la(B, n + 1) || Q[ib].t - Q[ia].t > 40 * 60e3) continue;
    let ok = true; for (let k = ia; k <= ib; k++) if (!inZonaProd(Q[k])) { ok = false; break; }
    if (ok) { perechi++; for (let k = ia + 1; k <= ib; k++) obIU[k] = 1; } }
  // categorii.mjs:431–436: întâi trebuie un drum poartă → poartă; abia atunci mișcarea toată în zonă și ≤ 11 km e toată cursă între uzine
  if (perechi && Q.every(inZonaProd) && tot <= 11) for (let k = 1; k < Q.length; k++) obIU[k] = 1;
  if (cuParc) {
    const parcSt = Q.filter((x) => x.st === 1 && hav(x, PARC) <= PARC.r && !poarta(x) && (x.t1 - x.t) >= 5 * 60e3);
    if (parcSt.length) { const tai = [Q[0].t, ...parcSt.flatMap((x) => [x.t, x.t1]), Q.at(-1).t];
      for (let n = 0; n + 1 < tai.length; n += 2) { const idx = []; for (let q = 0; q < Q.length; q++) if (Q[q].t >= tai[n] && Q[q].t <= tai[n + 1]) idx.push(q);
        if (idx.length < 2 || !idx.every((q) => inZonaProd(Q[q]))) continue;
        for (let r = 1; r < idx.length; r++) if (idx[r] === idx[r - 1] + 1) obP[idx[r]] = 1; } }
  }
  for (let q = 1; q < Q.length; q++) if (dd(q) > 5) { obIU[q] = 0; obP[q] = 0; }
  return { obIU, obP };
}   // = PR.ZONA_KM din categorii.mjs (producătorul lui intreUzine / parc)
const inZonaProd = (p) => hav(p, PARC) <= ZONA_PROD_KM || PORTI.some((q) => hav(p, q) <= ZONA_PROD_KM);
async function plimbat(m, t0, t1, cuParc = false) {
  const Q = (TRACK.get(m) ?? []).filter((p) => p.t >= t0 && p.t <= t1);
  if (Q.length < 3) return { km: 0, a: 0, b: 0, tot: false, insuf: true, mijloc: 0, iesiri: 0, mijlocUzina: 0 };   // C1 Codex r2
  const cs = CASA_W.get(m), acasa = (p) => !!cs && hav(p, cs) <= CASA_R;
  const km = (i, j) => { let x = 0; for (let k = i + 1; k <= j; k++) x += hav(Q[k - 1], Q[k]); return x; };
  const A = Q[0], B = Q[Q.length - 1];
  let i = 0; while (i + 1 < Q.length && hav(Q[i + 1], A) <= PLIMB_R && !acasa(Q[i + 1])) i++;
  let j = Q.length - 1; while (j - 1 >= 0 && hav(Q[j - 1], B) <= PLIMB_R && !acasa(Q[j - 1])) j--;
  const drum = async (p, q) => (hav(p, q) < 0.3 ? hav(p, q) : ((await kmDrum(p, q)) ?? hav(p, q) * 1.44));
  if (i >= j) return { km: 0, a: 0, b: 0, tot: true, mijloc: 0, iesiri: 0, mijlocUzina: 0 };
  const dA = await drum(A, Q[i]), dB = await drum(Q[j], B);
  const a = Math.max(0, km(0, i) - dA), b = Math.max(0, km(j, Q.length - 1) - dB);
  const { obIU, obP } = muchiiObligatorii(Q, cuParc); let mIU = 0, mP = 0;
  for (let k = i + 1; k <= j; k++) { if (obIU[k]) mIU += hav(Q[k - 1], Q[k]); else if (obP[k]) mP += hav(Q[k - 1], Q[k]); }   // obligatoriu ∩ mijloc, pe categorii
  return { km: a + b, a, b, tot: false, mijloc: km(i, j), iesiri: dA + dB, mijlocUzina: mIU + mP, mijlocIU: mIU, mijlocParc: mP };
}
const CAUZE = ['noapte', 'acasa', 'drumLung', 'drumMaiScurt'];   // r3/C5: «acasa» unită
const COMP = ['acasaOcol', 'acasaDrumLung'];                      // componentele lui «acasa» (diagnostic, NU se adună a doua oară)
// Ion, 28.09.2026 («count in total»): noaptea de weekend (vineri → luni) intră în total ca orice noapte; separat rămân Bălți (§7.4) și pauza > 1 zi
const SEPC = ['balti', 'pauza'];
async function legInterval(v) {
  let L = { km: 0, src: '0' }, calc = null;
  if (!v.plin && !v.langa) {
    if (v.iu) calc = sumLeg(await leg(v.de, v.iu.from), await leg(v.iu.to, v.pana));
    else if (v.parc > 0) { let best = null; for (const g of ZONE_PTS) { const s = sumLeg(await leg(v.de, g), await leg(g, v.pana)); if (!best || s.km < best.km) best = s; } calc = best; }
    else calc = await leg(v.de, v.pana);
    if (v.neobl > 0) L = calc;
  }
  return { L, calc };
}
// ION-133 runda 2: calibrarea săptămânii — pe golurile de control (mașina a mers cât idealul, |rest| ≤ 2 km) drumul din mijloc iese mai scurt decât
// legătura fără ieșiri cu CAL km (legătura GPS conține deja manevrele obișnuite din raze); CAL se adaugă înapoi la drumul din mijloc.
// C2 Codex r2: surplusul din mijloc se compară pe partea neobligatorie — din mijloc se scad km-ii prin zona uzinei, până la km-ii obligatorii
// Codex r5: fiecare categorie obligatorie se scade până la km-ii ei de la producător (între uzine ≤ v.munca, parc ≤ v.parc)
const surplusMijloc = (v, L, pl) => pl.mijloc - Math.min(v.munca, pl.mijlocIU ?? 0) - Math.min(v.parc, pl.mijlocParc ?? 0) - Math.max(0, L.km - pl.iesiri) - v.ocol - (v.pauza ?? 0);
const sursaLeg = (L) => { const t = L.src.split('+').filter((x) => x !== '0'); return t.length && t.every((x) => x === t[0]) ? t[0] : 'mixt'; };
const PL = new Map(); const devCtrl = []; const plStat = { insuficiente: 0, control: [] };
for (const x of D) for (const v of x.iv.filter((q) => q.tip === 'intre' && !q.plin && !q.langa && q.neobl > 0)) {
  const { L } = await legInterval(v); const pl = await plimbat(x.d.m, v.t0, v.t1, v.parc > 0); PL.set(`${x.d.m}|${v.t0}`, pl);
  const rest0 = v.neobl - L.km - v.ocol;
  if (pl.insuf) { plStat.insuficiente++; continue; }
  if (x.esant && Math.abs(rest0) <= 2 && !pl.tot) { devCtrl.push(surplusMijloc(v, L, pl)); plStat.control.push({ m: x.d.m, z: x.d.z, dev: surplusMijloc(v, L, pl), src: sursaLeg(L) }); }
}
const medCal = (a) => (a.length >= 20 ? Math.min(0, [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)]) : null);
const CAL = medCal(devCtrl) ?? 0;
// C3 Codex r2: validarea pe jumătăți a arătat abaterea pe sursa legăturii (GPS ≈ 0, Valhalla × 1,05 ≈ −3,7) → CAL pe sursă, cu ≥ 20 goluri; altfel global
const CAL_SRC = Object.fromEntries(['gps', 'valhalla'].map((k) => [k, medCal(plStat.control.filter((c) => c.src === k).map((c) => c.dev)) ?? CAL]));
// Codex r3 C3, validarea încrucișată pe 14.09 (CAL dintr-o jumătate aplicat pe cealaltă, eroare absolută mediană): global 2,5–2,9 față de 2,1 fără
// calibrare (strică); GPS 1,1–1,7 față de 1,4 (nu ajută); Valhalla 2,5–3,1 față de 4,3 (ajută). → calibrare DOAR pe legăturile Valhalla × 1,05.
// Codex r4: după delimitarea exactă a obligatoriilor (C2), validarea încrucișată nu mai arată câștig din calibrare nicăieri (14.09: global 2,2 / 2,9
// față de 2,3 fără; GPS 0,9 / 2,1 față de 1,5; Valhalla 2,9 / 2,1 față de 2,8) → fără calibrare. Validarea rămâne în rezultat, ca să se vadă
// săptămânal dacă o sursă începe să aibă abatere.
const calPentru = () => 0;
const ROWS = [];
for (const x of D) {
  const { d, iv } = x;
  const c = Object.fromEntries([...CAUZE, ...COMP, ...SEPC.map((k) => 'sep_' + k), ...SEPC.map((k) => 'sepMaiScurt_' + k)].map((k) => [k, 0]));
  let gps = 0, obl = 0, links = 0, noapteIdeal = 0, golElig = 0, plimbatZi = 0; const intervale = [], steaguri = [];
  for (const v of iv) { gps += v.km; obl += v.obl; }
  for (const v of iv.filter((q) => q.tip === 'intre')) {
    const { L, calc } = await legInterval(v);
    if (!v.plin && !v.langa && !(v.neobl > 0) && calc && calc.km > 0) cnt.ancoreNepotrivite++;
    // ION-132: plimbatul pe loc la capetele golului e muncă — intră în ideal (fără km-ii deja obligatorii ai intervalului: între uzine, parc)
    let plimb = 0, pl = null;
    // runda 2 (proba de control: legătura GPS conține deja manevrele obișnuite de la porți, deci plimbatul măsurat separat se număra de două ori):
    // economie rămâne ocolul pe acasă + km în plus pe DRUMUL din mijloc (între ieșirea din raza de plecare și intrarea în raza de sosire) față de
    // legătura fără ieșiri; restul (ce se face în cele două raze) e muncă. Golul întreg într-o rază → tot restul e muncă. Mașina care merge
    // cât idealul (rest ≈ 0) nu se schimbă.
    if (!v.plin && !v.langa && v.neobl > 0) {
      pl = PL.get(`${d.m}|${v.t0}`) ?? await plimbat(d.m, v.t0, v.t1, v.parc > 0); const rest0 = v.neobl - L.km - v.ocol;
      if (rest0 > 0 && !pl.insuf) { const pastrat = pl.tot ? 0 : Math.min(rest0, Math.max(0, surplusMijloc(v, L, pl) - calPentru(L))); plimb = rest0 - pastrat; }
      if (!Number.isFinite(plimb)) throw new Error(`plimbat nefinit ${d.m} ${d.z} ${v.ora}`);
    }
    plimbatZi += plimb;
    links += L.km + plimb; golElig += v.neobl;
    const e = v.neobl - L.km - plimb, rest = e - v.ocol;
    c.acasa += v.ocol; c.acasaOcol += v.ocol;
    let pauzaLung = 0;   // ION-263 R-PAUZĂ: restul pozitiv al unei pauze acasă permise e drumul real prin casă — ideal, nu economie
    if (rest >= 0 && !(v.ocol > 0) && (v.pauza ?? 0) > 0) { pauzaLung = rest; links += rest; cnt.pauzaLung = (cnt.pauzaLung ?? 0) + rest; }
    else if (rest >= 0) { if (v.ocol > 0) { c.acasa += rest; c.acasaDrumLung += rest; } else c.drumLung += rest; } else c.drumMaiScurt += rest;
    if (rest < -0.05) steaguri.push(`${v.ora} drum mai scurt decât idealul ${r1(rest)} (legătura ${r1(L.km)} ${L.src})`);
    intervale.push({ ora: v.ora, cats: [...new Set(v.seg.map((s) => s.cat + (s.ocol ? '*' : '')))].join('+'), km: r1(v.km), obl: r1(v.obl), neobl: r1(v.neobl), ocol: r1(v.ocol),
      intreUzine: v.iu ? `${v.iu.from.n}→${v.iu.to.n}` : null, plin: v.plin, langaUzina: r1(v.langaKm), parc: r1(v.parc), golTure: r1(v.golTure), munca: r1(v.munca),
      leg: r1(L.km), src: L.src, legR1: null, plimbat: r1(plimb), plimbatA: pl ? r1(pl.a) : 0, plimbatB: pl ? r1(pl.b) : 0, plimbatMijloc: pl && !pl.tot ? r1(pl.mijloc) : null, plimbatIesiri: pl && !pl.tot ? r1(pl.iesiri) : null, economie: r1(pauzaLung > 0 ? e - pauzaLung : e), pauzaAcasa: v.pauza > 0 ? r1(v.pauza) : undefined, pauzaLung: pauzaLung > 0 ? r1(pauzaLung) : undefined });
  }
  // jumătățile de noapte
  const jum = [];
  for (const [part, N] of [['dim', x.noapteDim], ['seara', x.noapteSeara]]) {
    const real = part === 'dim' ? x.realDim : x.realSea, intern = part === 'dim' ? x.intDim : x.intSea;
    const share = N.real > 0 ? N.link.km * real / N.real : N.link.km / 2;
    const e = real - intern - share;
    noapteIdeal += intern + share;
    const k = SEPC.includes(N.cat) ? N.cat : null;   // weekendul (Ion 28.09) ca noaptea obișnuită
    if (!k) { golElig += real; if (e >= 0) c.noapte += e; else { c.drumMaiScurt += e; steaguri.push(`noaptea ${part} ${N.noapte}: ideal peste real ${r1(e)}`); } }
    else if (e >= 0) c['sep_' + k] += e; else c['sepMaiScurt_' + k] += e;
    jum.push({ part, noapte: N.noapte, cat: N.cat, real: r1(real), golRuta: r1(sum(x.iv.filter((v) => v.tip === part), (v) => v.golRuta)), livrMargine: r1(sum(x.iv.filter((v) => v.tip === part), (v) => v.livrMargine)),
      legaturaInterna: r1(intern), partNoapte: r1(share), legNoapte: r1(N.link.km), src: N.link.src, economie: r1(e) });
  }
  const ideal = obl + links + noapteIdeal, econTot = gps - ideal;
  const econElig = sum(CAUZE, (k) => c[k]), sep = Object.fromEntries(SEPC.map((k) => [k, r1(c['sep_' + k] + c['sepMaiScurt_' + k])]));
  const sumSep = sum(SEPC, (k) => c['sep_' + k] + c['sepMaiScurt_' + k]);
  if (econElig < NEG_ZI) steaguri.push(`ziua cu economie ${r1(econElig)} < ${NEG_ZI}`);
  ROWS.push({ m: d.m, z: d.z, dow: d.dow, esant: x.esant, motiv: x.motiv, sep: SEP.has(d.m), gps: r1(gps), totalAnaliza: d.total, golImpus: r1(sum(d.seg, (s) => s.golImpus || 0)),
    obligatorii: r1(obl), cuOameni: r1(sum(iv.filter((v) => v.tip === 'cursa'), (v) => v.km)), legaturi: r1(links), noapteIdeala: r1(noapteIdeal), ideal: r1(ideal),
    economieTotala: r1(econTot), economie: r1(econElig), plimbat: r1(plimbatZi), _plimbat: plimbatZi, separat: sep, golEligibil: r1(golElig), cauze: Object.fromEntries(CAUZE.map((k) => [k, r1(c[k])])), componenteAcasa: Object.fromEntries(COMP.map((k) => [k, r1(c[k])])),
    _econTot: econTot, _econElig: econElig, _sumSep: sumSep, _c: c, _golElig: golElig, _ideal: ideal, _obl: obl, _gps: gps,
    // ION-136 (Codex r3 C2): ancorele nopții — S = începutul primei deplasări obligatorii, E = sfârșitul ultimei (legNoapte = leg(E, S următor))
    ancore: { S: x.S ? [x.S.lat, x.S.lon] : null, E: x.E ? [x.E.lat, x.E.lon] : null },
    intervale, jumatati: jum, steaguri, tipar: d.tipar });
}
salveazaCache();

// ---------- agregarea ----------
const IN = ROWS.filter((r) => r.esant && !r.sep), INSEP = ROWS.filter((r) => r.esant && r.sep);
const agreg = (rows) => {
  const o = { zile: rows.length, gps: r1(sum(rows, (r) => r._gps)), obligatorii: r1(sum(rows, (r) => r._obl)), ideal: r1(sum(rows, (r) => r._ideal)),
    economie: r1(sum(rows, (r) => r._econElig)), cauze: Object.fromEntries(CAUZE.map((k) => [k, r1(sum(rows, (r) => r._c[k]))])), componenteAcasa: Object.fromEntries(COMP.map((k) => [k, r1(sum(rows, (r) => r._c[k]))])),
    sumaCauze: r1(sum(rows, (r) => sum(CAUZE, (k) => r._c[k]))), plimbat: r1(sum(rows, (r) => r._plimbat)), bilantGps: r1(sum(rows, (r) => r._gps - r._ideal - r._sumSep)),
    separat: Object.fromEntries(SEPC.map((k) => [k, { economie: r1(sum(rows, (r) => r._c['sep_' + k])), maiScurt: r1(sum(rows, (r) => r._c['sepMaiScurt_' + k])) }])) };
  o.extrapolat = Math.round(o.economie * F); return o;
};
const flota = agreg(IN);
const zileLV = (m) => ROWS.filter((r) => r.m === m && r.dow <= 5).length;
const MAS = [...new Set(ROWS.map((r) => r.m))].sort();
const r4M = new Map((A.reguli4?.masini ?? []).map((x) => [x.m, x]));
const masini = MAS.map((m) => { const R = ROWS.filter((r) => r.m === m && r.esant), s = agreg(R), nZ = zileLV(m);
  const sapt = R.length ? r1(s.economie / R.length * nZ) : 0; const q = r4M.get(m);
  return { m, separat: SEP.has(m), zileLV: nZ, zileMasurate: R.length, economieMasurata: s.economie, kmSapt12_2: sapt, peZi: R.length ? r1(s.economie / R.length) : null,
    pestePrag: R.length >= ZILE_MIN && sapt >= PRAG && !SEP.has(m), cauze: s.cauze, separatKm: s.separat, reguli4: q ? { total: q.total, R1: q.R1?.propus ? q.R1.km : 0, R4: q.R4, balti: q.balti } : null }; })
  .sort((a, b) => b.kmSapt12_2 - a.kmSapt12_2);

// ---------- probele (toată flota, zilele din eșantion; și pe toate zilele pentru bilanț) ----------
const probe = {
  bilantGps: ROWS.filter((r) => Math.abs(r._econTot - (r._econElig + r._sumSep)) > 0.05).map((r) => ({ m: r.m, z: r.z, tot: r.economieTotala, elig: r.economie })),
  economiePesteGol: IN.filter((r) => r._econElig > r._golElig + 0.05).map((r) => ({ m: r.m, z: r.z, e: r.economie, gol: r.golEligibil })),
  idealSubObligatorii: ROWS.filter((r) => r._ideal < r._obl - 0.05).map((r) => ({ m: r.m, z: r.z })),
  cauzaNegativa: IN.filter((r) => ['noapte', 'acasa', 'drumLung', ...COMP].some((k) => r._c[k] < -0.05)).map((r) => ({ m: r.m, z: r.z })),
  ziSubMinus5: IN.filter((r) => r._econElig < NEG_ZI).map((r) => ({ m: r.m, z: r.z, e: r.economie, cauze: r.cauze })),
  totalAnalizaDifGps: ROWS.filter((r) => Math.abs(r.totalAnaliza - r.gps) > 0.3).map((r) => ({ m: r.m, z: r.z, total: r.totalAnaliza, gps: r.gps, golImpus: r.golImpus })),
  acasaNeUnita: ROWS.filter((r) => Math.abs(r._c.acasa - r._c.acasaOcol - r._c.acasaDrumLung) > 0.05).map((r) => ({ m: r.m, z: r.z })),
  cauzeDiferitDeEconomie: ROWS.filter((r) => Math.abs(sum(CAUZE, (k) => r._c[k]) - (r._econTot - r._sumSep)) > 0.05).map((r) => ({ m: r.m, z: r.z })),
  obsInCursa: cnt.obsInCursa,
  munca0: (() => { const L = []; for (const r of ROWS) for (const i of r.intervale) if (i.neobl === 0 && Math.abs(i.economie) > 0.05) L.push({ m: r.m, z: r.z, ora: i.ora, e: i.economie }); return L; })(),
  intervaleDoarObligatorii: sum(ROWS, (r) => r.intervale.filter((i) => i.neobl === 0).length),
};
const p925 = ROWS.find((r) => r.m === '925FTI' && r.z === '2026-09-14')?.intervale.find((i) => i.ora.startsWith('14:32'));
const p763 = ROWS.find((r) => r.m === '763LYY' && r.z === '2026-09-18');
// identitățile cu regulile 1 și 3 din date.reguli4 (analiza.json), pe aceleași nopți / bucăți
const idR1 = { nopti: 0, R1km: 0, livrMargine: 0, golRuta: 0, altNeobl: 0, idealNoapte: 0, noapteCauza: 0, maiScurt: 0, abateri: [] };
for (const q of A.reguli4?.masini ?? []) for (const n of q.R1?.detaliu ?? []) {
  const [z1, z2] = n.noapte.split('→'); const a = ROWS.find((r) => r.m === q.m && r.z === z1), b = ROWS.find((r) => r.m === q.m && r.z === z2);
  const hs = [a && n.seara > 0 ? a.jumatati.find((j) => j.part === 'seara') : null, b && n.dim > 0 ? b.jumatati.find((j) => j.part === 'dim') : null].filter(Boolean);
  idR1.nopti++; idR1.R1km += n.seara + n.dim;
  const lm = sum(hs, (h) => h.livrMargine), ec = sum(hs, (h) => h.economie);
  idR1.livrMargine += lm; idR1.golRuta += sum(hs, (h) => h.golRuta); idR1.altNeobl += sum(hs, (h) => h.real - h.livrMargine - h.golRuta); idR1.idealNoapte += sum(hs, (h) => h.legaturaInterna + h.partNoapte);
  if (ec >= 0) idR1.noapteCauza += ec; else idR1.maiScurt += ec;
  if (Math.abs(lm - (n.seara + n.dim)) > 0.15) idR1.abateri.push({ m: q.m, noapte: n.noapte, R1: r1(n.seara + n.dim), livrMargine: r1(lm), cat: hs.map((h) => h.cat).join('/') });
}
for (const k of ['R1km', 'livrMargine', 'golRuta', 'altNeobl', 'idealNoapte', 'noapteCauza', 'maiScurt']) idR1[k] = r1(idR1[k]);
const idR3 = (() => { const E = ROWS.filter((r) => r.esant);
  const acasa = sum(E, (r) => r._c.acasaOcol), R4 = sum(A.reguli4?.masini ?? [], (q) => q.R4 ?? 0);
  const iv = E.flatMap((r) => r.intervale.filter((i) => i.ocol > 0).map((i) => ({ m: r.m, z: r.z, ...i })));
  const acasaInterval = sum(iv, (i) => i.economie), sub = iv.filter((i) => i.economie < i.ocol - 0.05);
  return { acasaToateMasinile: r1(acasa), R4dinReguli4: r1(R4), dif: r1(acasa - R4), acasaIntervalCuOcol: r1(acasaInterval), drumLungPeAcelesiBucati: r1(acasaInterval - acasa),
    intervaleCuOcol: iv.length, intervaleSubOcol: sub.length, exempleSubOcol: sub.slice(0, 6).map((i) => `${i.m} ${i.z} ${i.ora} ocol ${i.ocol} ec ${i.economie} leg ${i.leg} ${i.src}`) }; })();

// ---------- ieșirea ----------
const rowOut = (r) => { const { _econTot, _econElig, _sumSep, _c, _golElig, _ideal, _obl, _gps, ...x } = r; return x; };
const exemple = Object.fromEntries(['710CWN', '925FTI', '763LYY'].map((m) => [m, ROWS.filter((r) => r.m === m).map(rowOut)]));
const legSurse = [...legCache.values()];
const out = {
  rulat: new Date().toISOString(), sursa: { W, economieZile: Z.rulat, analiza: A.reguli4?.rulat, economie: EC.rulat }, parametri: { LOC_KM, UZ_R, ZONA, STOP_MIN, STOP_R, CASA_R, OBS_MIN, VAL_F, NEG_ZI, PRAG, ZILE_MIN, factorB: +F.toFixed(4), zileLV: EC.flota.toate.zileLV, esantionB: EC.flota.toate.esantion },
  plimbatCalibrare: (() => {
    const med = (a) => { const q = [...a].sort((x, y) => x - y); return q.length ? r1(q[Math.floor((q.length - 1) / 2)]) : null; };
    const par = plStat.control.filter((c) => +c.z.slice(-2) % 2 === 0), imp = plStat.control.filter((c) => +c.z.slice(-2) % 2 === 1);
    return { CAL: r1(CAL), CAL_SRC: Object.fromEntries(Object.entries(CAL_SRC).map(([k, v]) => [k, r1(v)])), goluriControl: devCtrl.length, urmeInsuficiente: plStat.insuficiente,
      validare: { calPare: med(par.map((c) => c.dev)), calImpare: med(imp.map((c) => c.dev)), nPare: par.length, nImpare: imp.length,
        incrucisat: (() => {
          const cal = (a) => Math.min(0, med(a.map((c) => c.dev)) ?? 0), err = (a, k) => med(a.map((c) => Math.abs(c.dev - k)));
          const out = { imparePeCalPare: err(imp, cal(par)), parePeCalImpare: err(par, cal(imp)), fara: err(plStat.control, 0) };
          for (const k of ['gps', 'valhalla']) { const P = par.filter((c) => c.src === k), I = imp.filter((c) => c.src === k);
            out[k] = { imparePeCalPare: err(I, cal(P)), parePeCalImpare: err(P, cal(I)), fara: err([...P, ...I], 0), nP: P.length, nI: I.length }; }
          return out; })(),
        peSursa: Object.fromEntries(['gps', 'valhalla'].map((k) => { const x = plStat.control.filter((c) => c.src === k); return [k, { n: x.length, mediana: med(x.map((c) => c.dev)) }]; })) } };
  })(),
  observatii: { ...obsStat, perechi: legCache.size, perechiGps: legSurse.filter((v) => v.src === 'gps').length, perechiValhalla: legSurse.filter((v) => v.src === 'valhalla').length, perechiNull: legSurse.filter((v) => v.src === 'valhalla-null').length,
    obsMedianPerPerecheGps: med(legSurse.filter((v) => v.src === 'gps').map((v) => v.n)), perechiGpsCuCiorna: legSurse.filter((v) => v.src === 'gps' && v.dinCiorna > 0).length,
    apeluri: { zero: cnt.legZero, gps: cnt.legGps, valhalla: cnt.legValhalla, valhallaNull: cnt.legValhallaNull }, ancoreNepotrivite: cnt.ancoreNepotrivite, valhallaNule: NULE.length,
    aliasuri: ALIAS_M, probaAlias, observatiiTotal: cnt.obs, observatiiDinAlias: cnt.obsAlias, observatiiInCursa: cnt.obsInCursa.length },
  esantion: { zileCuCurse: ROWS.length, zileEsantion: ROWS.filter((r) => r.esant).length, zileEsantionFaraSep: IN.length, zileSep: INSEP.length, afara: Object.entries(ROWS.filter((r) => !r.esant).reduce((o, r) => ((o[r.motiv] = (o[r.motiv] ?? 0) + 1), o), {})), faraCurse },
  flota, separatMasini: { masini: [...SEP], ...agreg(INSEP) },
  nopti: { toate: NOPTI.length, peCategorie: NOPTI.reduce((o, n) => ((o[n.cat] = (o[n.cat] ?? 0) + 1), o), {}) },
  masini, pestePrag: masini.filter((x) => x.pestePrag).map((x) => ({ m: x.m, kmSapt: x.kmSapt12_2, zile: `${x.zileMasurate}/${x.zileLV}` })),
  probe: Object.fromEntries(Object.entries(probe).map(([k, v]) => [k, Array.isArray(v) ? { n: v.length, lista: v.slice(0, 20) } : v])),
  proba925FTI: p925 ?? null, proba763LYY: p763 ? { cauze: p763.cauze, intervale: p763.intervale, steaguri: p763.steaguri } : null,
  identitati: { R1: idR1, R3: idR3 }, reguli4Flota: A.reguli4?.flota, exemple,
  legaturi: [...legCache.values()],
  randuri: ROWS.map(rowOut),
};
writeFileSync(OUT, JSON.stringify(out));
console.log(JSON.stringify({ flota, sep: out.separatMasini, obs: out.observatii, esantion: { ...out.esantion, faraCurse: faraCurse.length }, nopti: out.nopti,
  probe: Object.fromEntries(Object.entries(out.probe).map(([k, v]) => [k, v?.n ?? v])), probaAlias, p925, idR1: { ...idR1, abateri: idR1.abateri.length }, idR3, pestePrag: out.pestePrag.length }, null, 1));
