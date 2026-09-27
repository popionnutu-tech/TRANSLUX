// Drăxlmaier — drumul acasă între curse (costul de azi pe GPS + pârghia «stă parcată», model) și planul de schimb al liniilor după
// ea. ION-108 A, v3 (27.09.2026). Citește DOAR dosarele săptămânilor (instantaneele); nu scrie nimic acolo.
//   node plan-schimb.mjs <ECON_D> [--rotatie <ECON_D al săptămânii precedente>] [--out <fișier.json>]
// Ieșirea: la pornire se șterg <out> și <out>.motiv; <out> se scrie atomic DOAR cu toți invarianții trecuți; altfel <out>.motiv =
// { cod, motiv } (1 invariant picat, 2 argumente, 3 Valhalla, 4 eroare în calcul). Cache-ul Valhalla propriu se scrie doar cu --out.
// Fără --rotatie, lanțurile de schimb NU se publică (schimb.stare = "neverificat", schimb.lanturi = []).
// Funcțiile pure: model.mjs (ziua, golurile), plan.mjs (optimizarea, lanțurile, rotația, invarianții); probele în test.mjs.
import { readFileSync, existsSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { kmSapt, kmZiDet, goluri, zileDin, conflict, amprenta } from './model.mjs';
import { optimizeaza, lanturiDin, peRotatie, inversata, picate, INVARIANTI } from './plan.mjs';
import { loadPlaces, buildPlacesIndex } from '/root/lde-worker/places-index.mjs';

const VERSIUNE = 'plan-schimb v3.2 (ION-108 A, mașina mică)';
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const DIR = process.argv[2], DIR_R = arg('--rotatie'), OUT = arg('--out');
if (OUT) { rmSync(OUT, { force: true }); rmSync(OUT + '.motiv', { force: true }); }
const esec = (motiv, cod = 1) => {
  console.error(motiv);
  if (OUT) { rmSync(OUT, { force: true }); mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT + '.motiv', JSON.stringify({ cod, motiv, cand: new Date().toISOString() })); }
  process.exit(cod);
};
for (const x of [DIR, DIR_R].filter(Boolean)) if (!existsSync(`${x}/economie.json`) || !existsSync(`${x}/economie-zile.json`))
  esec(`lipsește economie.json / economie-zile.json în ${x} (folosire: plan-schimb.mjs <ECON_D> [--rotatie <ECON_D>] [--out f.json])`, 2);

const PRAG_LANT = 20, MIN_ZILE = 2, DEPARTE_KM = 15, MIN_ZILE_GPS = 3, ACASA_KM = 3;
const PORTI = { EST: { lat: 47.78513, lon: 27.94307 }, VEST: { lat: 47.77408, lon: 27.91593 } };   // drax/cod/economie/comun.mjs:9
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const r1 = (x) => Math.round(x * 10) / 10;
const med = (a) => { const q = [...a].sort((x, y) => x - y); const n = q.length; return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : null; };
const pt = (c) => (Array.isArray(c) ? { lat: c[0], lon: c[1] } : { lat: c.lat, lon: c.lon });
const md5 = (...f) => { const h = createHash('md5'); for (const x of f) h.update(readFileSync(x)); return h.digest('hex'); };
const FMT = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });
const minLoc = (ms) => { const [h, m] = FMT.format(new Date(ms)).split(':').map(Number); return h * 60 + m; };
const hhmm = (min) => (min == null ? null : `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`);
const luniDe = (z) => { const x = new Date(z + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const isoSapt = (z) => { const d = new Date(z + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); const f = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7); };
const dow = (z) => { const x = new Date(z + 'T12:00:00Z').getUTCDay(); return x === 0 ? 7 : x; };

try {
const idx = buildPlacesIndex(loadPlaces('/root/lde-worker/places.geojsonseq'));
const loc = (p) => idx.nearestWithin({ lat: p.lat, lon: p.lon }, 3.8)?.name ?? `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
const DL_F = '/root/lde-worker/drax/cod/saptamanal/de-lamurit.json';
const DL = existsSync(DL_F) ? JSON.parse(readFileSync(DL_F, 'utf8')) : [];

// ---- Valhalla (km pe șosea, costing bus), aceeași cheie ca drax/cod/economie/comun.mjs:kmDrum
const CACHE_F = process.env.PLAN_SCHIMB_CACHE || '/root/lde-worker/drax/date/plan-schimb/valhalla-cache.json';   // variabila doar pentru proba de durată
const cheie = (a, b) => `${a.lat.toFixed(4)},${a.lon.toFixed(4)}|${b.lat.toFixed(4)},${b.lon.toFixed(4)}`;
const cache = new Map();
for (const f of [DIR, DIR_R].filter(Boolean).map((x) => `${x}/economie-valhalla-cache.json`).concat(CACHE_F)) if (existsSync(f))
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(f, 'utf8')))) if (v != null) cache.set(k, v);
let noi = 0; const nule = [];
async function valhalla(a, b) {
  const k = cheie(a, b); if (cache.has(k)) return;
  let v = null;
  if (hav(a, b) < 0.05) v = 0;
  else try {
    const r = await fetch('http://localhost:8002/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ locations: [{ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }], costing: 'bus', units: 'kilometers' }) });
    v = (await r.json())?.trip?.summary?.length ?? null;
  } catch { v = null; }
  if (v == null) { nule.push(k); return; }
  cache.set(k, +v.toFixed(2)); noi++;
}
const d = (a, b) => { const v = cache.get(cheie(a, b)); if (v == null) throw new Error(`km lipsă ${cheie(a, b)}`); return v; };

// ---- o săptămână: mașinile, programele (calendar exact), cursele fixe, obiceiul, orele golurilor, golul GPS pe bucăți
function incarca(dir) {
  const A = JSON.parse(readFileSync(`${dir}/economie.json`, 'utf8')), Z = JSON.parse(readFileSync(`${dir}/economie-zile.json`, 'utf8'));
  const LIN = Z.linii, sapt = luniDe(Z.zile.map((x) => x.z).sort()[0]);
  const locuri = (l) => LIN[l]?.locuri ?? 0;
  const numeLin = (l) => `${LIN[l]?.capat ?? l.split('|')[1]} (${l.split('|')[0]})`;
  const vot = new Map();
  for (const x of Z.zile) for (const s of x.seg) if (s.cat === 'cuOameni' && s.lin && s.schimb) {
    const p = pt(s.sens === 'tur' ? s.pana : s.de), g = hav(p, PORTI.EST) <= hav(p, PORTI.VEST) ? 'EST' : 'VEST';
    const k = `${s.lin}|${s.sens}|${s.schimb}`; const v = vot.get(k) ?? vot.set(k, {}).get(k); v[g] = (v[g] ?? 0) + 1; }
  const poarta = (lin, sens, schimb) => { const v = vot.get(`${lin}|${sens}|${schimb}`); return PORTI[v ? Object.entries(v).sort((a, b) => b[1] - a[1])[0][0] : 'EST']; };
  const capat = (l) => pt(LIN[l].capatC);
  const zileA = new Map(A.zile.map((x) => [`${x.m}|${x.z}`, x]));
  const masini = [];
  for (const m of A.masini) {
    const zile = Z.zile.filter((x) => x.m === m.m);
    const jum = [], obs = [], ore = { ts1: [], ts2: [], rs1: [], rs2: [] };
    const gps = { dimineata: 0, seara: 0, intreCurse: 0, alt: 0 }, zileGps = [], seriGps = [];
    for (const x of zile) {
      const princ = new Map();
      for (const s of x.seg) if (s.cat === 'cuOameni' && s.lin && s.schimb && LIN[s.lin]?.capatC) { const k = (s.sens === 'tur' ? 't' : 'r') + s.schimb;
        if (!princ.has(k) || princ.get(k).km < s.km) princ.set(k, s); }
      for (const [k, s] of princ) {
        jum.push({ z: x.z, k, lin: s.lin, a: k[0] === 't' ? capat(s.lin) : poarta(s.lin, 'retur', s.schimb), b: k[0] === 't' ? poarta(s.lin, 'tur', s.schimb) : capat(s.lin) });
        ore[k].push(k === 'ts1' || k === 'rs1' ? minLoc(s.t1) : minLoc(s.t0) < 180 ? minLoc(s.t0) + 1440 : minLoc(s.t0));
      }
      const ord = ['ts1', 'ts2', 'rs1', 'rs2'].filter((k) => princ.has(k)).map((k) => ({ k, s: princ.get(k) }));
      for (let i = 1; i < ord.length; i++) {
        const p = ord[i - 1], n = ord[i];
        const f = p.k === 'ts2' && n.k === 'rs1' ? null : p.k === 'ts1' && n.k === 'ts2' ? 'dim' : p.k === 'rs1' && n.k === 'rs2' ? 'seara' : p.k.slice(1) === n.k.slice(1) ? 'zi' : 'alt';
        if (!f) continue;
        const gol = x.seg.filter((q) => q.cat !== 'cuOameni' && q.t0 >= p.s.t1 && q.t1 <= n.s.t0);
        obs.push({ f, km: gol.reduce((a, q) => a + q.km + (q.golImpus || 0), 0), ocol: gol.some((q) => q.ocol),
          a: jum.find((h) => h.z === x.z && h.k === p.k).b, b: jum.find((h) => h.z === x.z && h.k === n.k).a });
      }
      // golul GPS de azi, pe bucăți, exact ca rândul: R1b = bucățile «livrare» cu ocol pe acasă, R3 = golTure reținut (r3Lista);
      // zilele excluse și componentele «de lămurit» ies (scrie-analiza.mjs:dlEcon)
      const xa = zileA.get(`${m.m}|${x.z}`);
      if (xa && !xa.exclus) {
        const e = DL.find((q) => q.m === m.m)?.economie, dl = e && ((e.zile ?? []).includes(x.z) || (e.dow ?? []).includes(dow(x.z)));
        const cat = dl ? new Set(e.cat ?? ['livrare', 'golTure']) : new Set();
        zileGps.push(x.z);
        if (!cat.has('livrare')) for (const s of x.seg) if (s.cat === 'livrare' && s.ocol) {
          const h = minLoc(s.t0) / 60, p = h >= 3 && h < 12 ? 'dimineata' : h >= 15 || h < 3 ? 'seara' : 'alt'; gps[p] += s.km;
          if (p === 'seara' && s.km > 0 && seriGps.at(-1) !== x.z) seriGps.push(x.z); }
        if (!cat.has('golTure')) gps.intreCurse += (xa.r3Lista ?? []).reduce((a, q) => a + q.km, 0);
      }
    }
    const rec = { m: m.m, casa: m.casa ? pt(m.casa) : null, leiKm: m.leiKm ?? null, prog: {}, fixe: { jum: [] }, obs, acasa: {}, acasaVot: {},
      zileIncluse: m.zileIncluse ?? 0, zileRand: m.zile ?? 0, zileRandLista: A.zile.filter((q) => q.m === m.m).map((q) => q.z), gpsMasurat: gps, zileGps, seriGps, R1b: m.R1b ?? 0, R3: m.R3 ?? 0,
      ore: { dimineata: { de: hhmm(med(ore.ts1)), pana: hhmm(med(ore.ts2)) }, seara: { de: hhmm(med(ore.rs1)), pana: hhmm(med(ore.rs2)) } } };
    for (const s of ['s1', 's2']) {
      const obisnuita = {};
      for (const k of ['t' + s, 'r' + s]) { const c = new Map(); for (const h of jum) if (h.k === k) c.set(h.lin, (c.get(h.lin) ?? 0) + 1);
        const best = [...c.entries()].sort((a, b) => b[1] - a[1])[0]; if (best && best[1] >= MIN_ZILE) obisnuita[k] = best[0]; }
      const reg = jum.filter((h) => h.k.slice(1) === s && obisnuita[h.k] === h.lin);
      if (reg.length) {
        const P = { id: `${sapt}|${m.m}|${s}`, azi: m.m, schimb: s, jum: reg, tur: obisnuita['t' + s] ?? null, ret: obisnuita['r' + s] ?? null };
        P.clasa = Math.max(...[P.tur, P.ret].filter(Boolean).map(locuri));
        P.forma = `${P.tur ? 'T' : '-'}${P.ret ? 'R' : '-'}`;
        P.nume = P.tur && P.ret && P.tur !== P.ret ? `${numeLin(P.tur)} dus și ${numeLin(P.ret)} întors` : `${numeLin(P.tur ?? P.ret)}${P.tur && P.ret ? '' : P.tur ? ' (doar dus)' : ' (doar întors)'}`;
        P.cheie = `${P.tur ?? ''}>${P.ret ?? ''}`;
        rec.prog[s] = P;
      }
    }
    rec.fixe.jum = jum.filter((h) => !Object.values(rec.prog).some((P) => P.jum.includes(h)));
    rec.doua = !!(rec.prog.s1 && rec.prog.s2);
    rec.clasa = Math.max(0, ...Object.values(rec.prog).map((P) => P.clasa), ...rec.fixe.jum.map((h) => locuri(h.lin)));
    masini.push(rec);
  }
  return { dir, A, Z, LIN, sapt, masini, M: new Map(masini.map((m) => [m.m, m])), numeLin };
}
const W = incarca(DIR), WR = DIR_R ? incarca(DIR_R) : null;

// ---- km pe șosea: fiecare casă ↔ fiecare punct al curselor; punct ↔ punct
const perechi = [];
for (const S of [W, WR].filter(Boolean)) {
  const puncte = [...new Map(S.masini.flatMap((m) => [...Object.values(m.prog), m.fixe].flatMap((P) => P.jum.flatMap((h) => [h.a, h.b]))).map((p) => [cheie(p, p), p])).values()];
  for (const m of S.masini) if (m.casa) for (const p of puncte) perechi.push([m.casa, p], [p, m.casa]);
  for (const a of puncte) for (const b of puncte) perechi.push([a, b]);
}
for (let i = 0; i < perechi.length; i += 8) await Promise.all(perechi.slice(i, i + 8).map(([a, b]) => valhalla(a, b)));
if (nule.length) esec(`drumurile nu s-au putut calcula: Valhalla a întors null de ${nule.length} ori (ex. ${nule[0]})`, 3);
for (const S of [W, WR].filter(Boolean)) for (const m of S.masini) {
  if (!m.casa) continue; const v = {};
  for (const o of m.obs) { const acasa = o.ocol || o.km >= 0.8 * (d(o.a, m.casa) + d(m.casa, o.b)); (v[o.f] ??= [0, 0])[acasa ? 0 : 1]++; }
  m.acasaVot = v; m.acasa = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x[0] >= x[1]]));
}

// ---- costul
const programe = (m, asg) => [asg.s1, asg.s2, m.fixe];
const cost = (m, asg, mod) => (m.casa ? (conflict(programe(m, asg)) ? Infinity : kmSapt(m, programe(m, asg), d, mod)) : 0);
const costA = (m, asg) => cost(m, asg, 'asteapta');
const aziDe = (S) => new Map(S.masini.map((m) => [m.m, { s1: m.prog.s1 ?? null, s2: m.prog.s2 ?? null }]));
const zileLucru = (m, asg) => zileDin(programe(m, asg)).length;
const voieIn = (S, azi) => (m, P) => {
  if (P.azi === m.m) return true;
  if (!m.casa || !S.M.get(P.azi).casa) return false;
  const own = azi.get(m.m)[P.schimb]; if (!own || own.forma !== P.forma) return false;
  return m.clasa === P.clasa || m.clasa === S.M.get(P.azi).clasa;
};
const BUC = { dim: 'dimineata', seara: 'seara', zi: 'intreCurse', alt: 'alt' };

// ================= drumul acasă între curse: cât costă azi (GPS) și cât se poate tăia (model), pe mașină =================
function asteptarePe(S, m, asg, zileFiltru = null) {
  const pr = programe(m, asg), zs = zileDin(pr).filter((z) => !zileFiltru || zileFiltru.includes(z));
  const model = { dimineata: 0, seara: 0, intreCurse: 0, alt: 0 };
  const cand = { dim: new Map(), seara: new Map(), zi: new Map(), alt: new Map() };
  for (const z of zs) {
    const o = kmZiDet(m, pr, z, d, 'obicei'), a = kmZiDet(m, pr, z, d, 'asteapta');
    for (const f of ['dim', 'seara', 'zi', 'alt']) model[BUC[f]] += o[f] - a[f];
    for (const g of goluri(m, pr, z, d, 'obicei')) if (g.acasa && g.prinCasa - g.direct > 0.5) {
      // unde stă parcată: dintre uzină și capătul cursei vecine, locul cel mai aproape de casă (km mașinii sunt aceiași oriunde)
      const opt = g.f === 'dim' ? [['uzină', g.p.b], [`capătul ${S.numeLin(g.n.lin)}`, g.n.a]]
        : g.f === 'seara' ? [[`capătul ${S.numeLin(g.p.lin)}`, g.p.b], ['uzină', g.n.a]] : [['uzină', g.p.b]];
      const [nume, p, dist] = opt.map(([n, q]) => [n, q, d(q, m.casa)]).sort((x, y) => x[2] - y[2])[0];
      const c = cand[g.f].get(nume) ?? cand[g.f].set(nume, { unde: nume, p, departeDeCasaKm: r1(dist), zile: 0, km: 0 }).get(nume);
      c.zile++; c.km += g.prinCasa - g.direct;
    }
  }
  // UN loc pe gol (cel mai des; la egalitate cel cu mai mulți km); aceeași sursă pentru nume și distanță
  const unic = (f) => { const L = [...cand[f].values()].filter((c) => c.zile >= MIN_ZILE).sort((a, b) => b.zile - a.zile || b.km - a.km)[0]; if (!L) return null;
    return { unde: L.unde, departeDeCasaKm: L.departeDeCasaKm, acasaEChiarLocul: L.departeDeCasaKm <= ACASA_KM || loc(L.p) === loc(m.casa), zile: L.zile }; };
  const asteapta = { dimineata: unic('dim'), seara: unic('seara'), intreCurse: unic('zi') };
  for (const k of Object.keys(model)) model[k] = r1(model[k]);
  return { model: { ...model, total: r1(Object.values(model).reduce((a, x) => a + x, 0)) }, asteapta, zile: zs.length };
}
function asteptare(S, asgMap, plafon = true) {
  return S.masini.filter((m) => m.casa).map((m) => {
    const a = asgMap.get(m.m), x = asteptarePe(S, m, a);
    const f = m.zileIncluse >= MIN_ZILE_GPS ? m.zileRand / m.zileIncluse : null;
    const gps = f == null ? null : Object.fromEntries(Object.entries(m.gpsMasurat).map(([k, v]) => [k, r1(v * f)]));
    if (gps) gps.total = r1(Object.values(gps).reduce((q, v) => q + v, 0));
    // pe ACELAȘI calendar (C3): modelul doar pe zilele măsurate GPS, față de GPS măsurat (neextrapolat)
    const pe = asteptarePe(S, m, a, m.zileGps);
    // v3.1 (F3 / R3-3): ESTIMAREA = dimineața + seara ale modelului, pe calendarul rândului (fără zilele pe care rândul nu le are,
    // de ex. sâmbăta), fără bucata «între aducere și întoarcere» (zilele cu un singur schimb, nemăsurate pe GPS), plafonată pe fiecare
    // parte la costul GPS al mașinii (nu se taie mai mult decât costă azi); la mașinile nemăsurate rămâne modelul pe calendarul rândului
    const xr = asteptarePe(S, m, a, m.zileRandLista);
    const cap = (k) => (plafon && gps ? Math.min(xr.model[k], gps[k]) : xr.model[k]);
    const est = { dimineata: r1(cap('dimineata')), seara: r1(cap('seara')) };
    est.total = r1(est.dimineata + est.seara);
    est.plafonata = !!(plafon && gps && (xr.model.dimineata > gps.dimineata + 0.05 || xr.model.seara > gps.seara + 0.05));
    est.baza = !plafon ? 'model pe calendarul rândului, după lanț' : gps ? 'min(model, GPS) pe dimineață și pe seară, calendarul rândului' : 'model pe calendarul rândului (GPS nemăsurat)';
    const departe = Math.max(0, ...Object.values(x.asteapta).filter((q) => q && !q.acasaEChiarLocul).map((q) => q.departeDeCasaKm));
    // casa e chiar în drum (F1): planul nu propune loc, iar ocolul din model e sub 1 km pe zi
    const zr = xr.zile || 1;
    const casaInDrum = { dimineata: !x.asteapta.dimineata && xr.model.dimineata / zr < 1, seara: !x.asteapta.seara && xr.model.seara / zr < 1 };
    return { m: m.m, casa: loc(m.casa), zile: x.zile, zileRand: xr.zile, zileGps: `${m.zileIncluse}/${m.zileRand}`,
      gps, estimare: est, kmSapt: est.total, kmZi: xr.zile ? r1(est.total / xr.zile) : 0,
      model: x.model, modelCalendarRand: xr.model, modelPeZileleGps: pe.model.total, gpsMasuratTotal: r1(Object.values(m.gpsMasurat).reduce((q, v) => q + v, 0)),
      ore: m.ore, asteapta: x.asteapta, casaInDrum, departeDeCasaKm: departe || null,
      leiKm: m.leiKm, leiSapt: m.leiKm != null ? Math.round(est.total * m.leiKm) : null,
      // seri pe săptămână cu drum acasă (GPS, extrapolat pe zilele rândului); nemăsurata = toate zilele rândului
      seriSapt: m.zileIncluse >= MIN_ZILE_GPS ? r1(m.seriGps.length * m.zileRand / m.zileIncluse) : xr.zile,
      kmGoiSaptObicei: r1(cost(m, a, 'obicei')), kmGoiSaptAsteapta: r1(cost(m, a, 'asteapta')) };
  }).sort((x, y) => (y.gps?.total ?? y.kmSapt) - (x.gps?.total ?? x.kmSapt));
}

// ================= schimbul de linii, DUPĂ «stă parcată» =================
const aziW = aziDe(W), voieW = voieIn(W, aziW);
const O = optimizeaza(W.masini, aziW, voieW, costA);
const Rctx = WR ? (() => { const az = aziDe(WR); return { masini: WR.masini, M: WR.M, azi: az, voie: voieIn(WR, az), cost: costA, inv: inversata(W.masini, WR.M) }; })() : null;
const cand = lanturiDin(W.masini, aziW, O.plan, costA, W.M).map((L) => ({ ...L, rot: peRotatie(L, Rctx) }));
const pastrat = (L) => !!WR && L.ec >= PRAG_LANT && L.rot.verificat && L.rot.ecKmSapt >= PRAG_LANT;
const plan = new Map([...aziW].map(([k, v]) => [k, { ...v }]));
for (const L of cand.filter(pastrat)) for (const x of L.comp) plan.set(x, { ...O.plan.get(x) });
const casaDe = (x) => loc(W.M.get(x).casa);
const lanturi = cand.filter(pastrat).map((L) => ({ ...L, ecPlan: Math.min(L.ec, L.rot.ecKmSapt) })).sort((a, b) => b.ecPlan - a.ecPlan).map((L) => {
  const spus = new Set();
  const text = L.mut.map((q) => { const t = `${q.dela} lasă ${q.P.nume} lui ${q.la}${spus.has(q.la) ? '' : `, care stă la ${casaDe(q.la)}`}`; spus.add(q.la); return t; }).join('; ') + '.';
  const lei = L.pe.every((q) => W.M.get(q.m).leiKm != null) ? Math.round(L.pe.reduce((a, q) => a + (q.inainte - q.dupa) * W.M.get(q.m).leiKm, 0)) : null;
  return { economieKmSapt: r1(L.ecPlan), economieSaptCurenta: r1(L.ec), economieRotatie: L.rot.ecKmSapt, leiSapt: lei,
    faraNorma: L.pe.filter((q) => W.M.get(q.m).leiKm == null).map((q) => q.m),
    peMasina: L.pe.map((q) => ({ m: q.m, kmSapt: r1(q.dupa - q.inainte) })),
    mutari: L.mut.map((q) => ({ linie: q.P.cheie, tur: q.P.tur, retur: q.P.ret, nume: q.P.nume, dela: q.dela, la: q.la, zile: new Set(q.P.jum.map((h) => h.z)).size, schimbInSaptamana: q.schimb })),
    text };
});
const deoparte = cand.filter((L) => !pastrat(L)).map((L) => ({ economieKmSapt: r1(L.ec), rotatie: L.rot, masini: L.comp,
  motiv: L.ec < PRAG_LANT ? `sub ${PRAG_LANT} km/săpt.` : !WR ? 'neverificat: lipsește săptămâna precedentă' : !L.rot.verificat ? `nu se verifică pe săptămâna precedentă: ${L.rot.motiv}` : `pe săptămâna precedentă doar ${L.rot.ecKmSapt} km` }));

// ---- drumul acasă: azi (toată flota) și, pentru mașinile din lanțuri, pe calendarul DUPĂ lanț (C2)
const B = asteptare(W, aziW);
const inLant = new Set(lanturi.flatMap((L) => L.peMasina.map((q) => q.m)));
if (inLant.size) { const Bp = asteptare(W, plan, false); for (const x of B) if (inLant.has(x.m)) { const y = Bp.find((q) => q.m === x.m);
  x.dupaLant = { kmSapt: y.kmSapt, kmZi: y.kmZi, estimare: y.estimare, model: y.model, asteapta: y.asteapta, casaInDrum: y.casaInDrum, departeDeCasaKm: y.departeDeCasaKm }; } }
const BR = WR ? asteptare(WR, aziDe(WR)) : null;
const sumaPe = (xs, f) => r1(xs.reduce((a, x) => a + (f(x) ?? 0), 0));
const cuGps = B.filter((x) => x.gps);
const gpsFlota = Object.fromEntries(['dimineata', 'seara', 'intreCurse', 'alt', 'total'].map((k) => [k, sumaPe(cuGps, (x) => x.gps[k])]));
const modelFlota = Object.fromEntries(['dimineata', 'seara', 'intreCurse', 'alt', 'total'].map((k) => [k, sumaPe(B, (x) => x.model[k])]));
const oreSeara = B.filter((x) => x.model.seara > 0 || (x.gps?.seara ?? 0) > 0).map((x) => x.ore.seara.pana).filter(Boolean).sort();
// v3.1: estimarea pe flotă (dimineața + seara, plafonată la GPS pe mașină) și întrebarea de seară (F4): mașinile care seara rămân
// parcate la capătul liniei sau la uzină (nu în satul casei, nu cu casa în drum), din lista paginii (GPS ≥ 20 km pe zi lucrată;
// nemăsuratele cu estimarea ≥ 20 km/zi), cu golul de seară și distanța loc → casă din aceeași sursă (asteapta.seara)
const estFlota = { dimineata: sumaPe(B, (x) => x.estimare.dimineata), seara: sumaPe(B, (x) => x.estimare.seara) }; estFlota.total = r1(estFlota.dimineata + estFlota.seara);
const leiEst = Math.round(B.filter((x) => x.leiSapt != null).reduce((a, x) => a + x.leiSapt, 0));
const inLista = (x) => (x.gps ? x.gps.total / Math.max(1, W.M.get(x.m).zileRand) >= 20 : x.kmZi >= 20);
const intrebareSeara = B.filter((x) => x.asteapta.seara && !x.asteapta.seara.acasaEChiarLocul && inLista(x) && x.estimare.seara > 0)
  .map((x) => ({ m: x.m, unde: x.asteapta.seara.unde, departeDeCasaKm: x.asteapta.seara.departeDeCasaKm, gpsSeara: x.gps?.seara ?? null, estimareSeara: x.estimare.seara,
    de: x.ore.seara.de, pana: x.ore.seara.pana, masurat: !!x.gps })).sort((a, b) => b.departeDeCasaKm - a.departeDeCasaKm);
// v3.2 — răspunsul lui Ion (27.09): seara șoferul merge acasă cu o MAȘINĂ MICĂ, autobuzul stă parcat. Codex r3b: km-ii mașinii mici
// = seri × 2 × loc→casă (tot drumul, nu ocolul scutit autobuzului); salariul NU intră (șoferul e plătit la fel), autobuzul = leiKm − 1.
// Costul fix al mașinii mici nu se presupune: soldul = cât rămâne pe lună să-l acopere.
const MM = { litri: 6, uzura: 0.5, saptLuna: 4.33 };
const pretMM = (() => { const p = (W.A.rulare?.preturi ?? []).filter((q) => !W.A.pana || q.valid_from <= W.A.pana).sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1))[0]; return p ? +p.price_lei : null; })();
const leiMM = pretMM != null ? r1((MM.litri * pretMM / 100 + MM.uzura) * 100) / 100 : null;
const masinaMica = (x) => {
  const b = B.find((q) => q.m === x.m), leiBus = b?.leiKm != null ? b.leiKm - 1 : null;
  const seri = b?.seriSapt ?? 0, km = r1(seri * 2 * x.departeDeCasaKm);
  if (leiBus == null || leiMM == null) return { seri, kmSapt: km, leiKmAutobuz: null, soldLuna: null };
  return { seri, kmSapt: km, leiKmAutobuz: Math.round(leiBus * 100) / 100, soldLuna: Math.round((x.estimareSeara * leiBus - km * leiMM) * MM.saptLuna) };
};
for (const q of intrebareSeara) q.masinaMica = masinaMica(q);
const intrebare = { masinaMica: { litri: MM.litri, uzura: MM.uzura, pret: pretMM, leiKm: leiMM, saptLuna: MM.saptLuna,
    soldPozitivLuna: intrebareSeara.reduce((a, q) => a + Math.max(0, q.masinaMica.soldLuna ?? 0), 0) },
  masini: intrebareSeara, gpsKmSapt: r1(intrebareSeara.reduce((a, q) => a + (q.gpsSeara ?? 0), 0)), estimareKmSapt: r1(intrebareSeara.reduce((a, q) => a + q.estimareSeara, 0)),
  nemasurate: intrebareSeara.filter((q) => !q.masurat).map((q) => q.m),
  regula: 'seara mașina rămâne parcată la capătul liniei (sau la uzină); șoferul trebuie să ajungă de acolo acasă pe la 16:30 și înapoi la mașină înainte de cursa de noapte' };

// ---- sumele (a)
const totObicei = W.masini.reduce((a, m) => a + cost(m, aziW.get(m.m), 'obicei'), 0);
const totAsteapta = W.masini.reduce((a, m) => a + costA(m, aziW.get(m.m)), 0);
const totPlan = W.masini.reduce((a, m) => a + costA(m, plan.get(m.m)), 0);
const sumAcurent = totAsteapta - totPlan;
const sumA = r1(lanturi.reduce((a, L) => a + L.economieKmSapt, 0));
const leiA = lanturi.reduce((a, L) => a + (L.leiSapt ?? 0), 0);

// ---- controalele: invarianții (blochează) + concordanțele (informative)
const C = {};
const toatePlan = W.masini.flatMap((m) => programe(m, plan.get(m.m))), toateAzi = W.masini.flatMap((m) => programe(m, aziW.get(m.m)));
C.conservare = { trece: amprenta(toatePlan) === amprenta(toateAzi), curse: toateAzi.reduce((a, P) => a + (P?.jum.length ?? 0), 0) };
C.faraSuprapuneri = { trece: W.masini.every((m) => !conflict(programe(m, plan.get(m.m)))) };
const ids = W.masini.flatMap((m) => ['s1', 's2'].map((s) => plan.get(m.m)[s]).filter(Boolean).map((P) => P.id));
const nProg = W.masini.reduce((a, m) => a + Object.keys(m.prog).length, 0);
C.fiecareProgramOData = { trece: ids.length === nProg && new Set(ids).size === nProg, programe: nProg };
C.capacitateSiForma = { trece: W.masini.every((m) => ['s1', 's2'].every((s) => { const P = plan.get(m.m)[s]; if (!P || P.azi === m.m) return true;
  const own = aziW.get(m.m)[s]; return !!own && own.forma === P.forma && (m.clasa === P.clasa || m.clasa === W.M.get(P.azi).clasa); })) };
C.schimbPastrat = { trece: W.masini.every((m) => ['s1', 's2'].every((s) => !!plan.get(m.m)[s] === !!aziW.get(m.m)[s] && (!plan.get(m.m)[s] || plan.get(m.m)[s].schimb === s))) };
C.economieA = { trece: Math.abs(sumAcurent - lanturi.reduce((a, L) => a + (L.economieSaptCurenta), 0)) < 0.05 * Math.max(1, lanturi.length) + 1e-6 && totPlan <= totAsteapta + 1e-6,
  inainteDupaStaParcata: r1(totAsteapta), dupaSchimb: r1(totPlan), diferenta: r1(sumAcurent) };
C.economieB = { trece: Math.abs((totObicei - totAsteapta) - B.reduce((a, x) => a + x.model.total, 0)) < 0.05 * B.length + 1e-6 && B.every((x) => x.model.total >= -0.05),
  azi: r1(totObicei), staParcata: r1(totAsteapta), diferenta: r1(totObicei - totAsteapta) };
C.normalizareaNuStrica = { trece: O.costNormalizat <= O.costOptimizator + 1e-6, optimizator: r1(O.costOptimizator), dupaNormalizare: r1(O.costNormalizat), normalizate: O.normalizate };
// informativ: modelul pe zilele măsurate GPS ↔ GPS măsurat (același calendar), pe mașinile cu ≥ 3 zile
const smM = cuGps.reduce((a, x) => a + x.modelPeZileleGps, 0), sgM = cuGps.reduce((a, x) => a + x.gpsMasuratTotal, 0);
C.asteptareModelVsGps = { informativ: true, trece: sgM > 0 && Math.abs(smM - sgM) / sgM <= 0.10, masini: cuGps.length, model: r1(smM), gps: r1(sgM), abatere: sgM ? r1((smM - sgM) / sgM * 100) : null,
  explicatie: 'GPS = drumul făcut azi pe lângă casă între curse (ocolul + umblatul prin sat/oraș); modelul = doar surplusul drumului prin casă față de drumul direct' };
// informativ: bucățile GPS explică R1b + R3 măsurate ale rândului
const dRand = cuGps.reduce((a, x) => { const m = W.M.get(x.m); return a + Math.abs(x.gpsMasuratTotal - (m.R1b + m.R3)); }, 0);
C.gpsBucatiVsRand = { informativ: true, trece: dRand < 1 + 0.5 * cuGps.length, abatereKm: r1(dRand), nota: 'fără zilele / componentele «de lămurit»' };
C.estimarePlafonata = { informativ: true, trece: B.every((x) => !x.gps || (x.estimare.dimineata <= x.gps.dimineata + 0.05 && x.estimare.seara <= x.gps.seara + 0.05)),
  plafonate: B.filter((x) => x.estimare.plafonata).map((x) => x.m), taiatDePlafon: r1(B.reduce((a, x) => a + x.modelCalendarRand.dimineata + x.modelCalendarRand.seara - x.estimare.total, 0)),
  scoasIntreCurse: r1(B.reduce((a, x) => a + x.model.intreCurse, 0)), scoasZileInAfaraRandului: r1(B.reduce((a, x) => a + x.model.dimineata + x.model.seara - x.modelCalendarRand.dimineata - x.modelCalendarRand.seara, 0)) };

// ---- ieșirea
const intrare = { economie: md5(`${DIR}/economie.json`), economieZile: md5(`${DIR}/economie-zile.json`),
  rotatie: WR ? md5(`${DIR_R}/economie.json`, `${DIR_R}/economie-zile.json`) : null,
  cod: md5(new URL('./plan-schimb.mjs', import.meta.url), new URL('./model.mjs', import.meta.url), new URL('./plan.mjs', import.meta.url)) };
const departe = B.filter((x) => x.kmSapt > 0 && x.departeDeCasaKm != null && x.departeDeCasaKm > DEPARTE_KM);
const masiniOut = W.masini.map((m) => { const a = aziW.get(m.m), p = plan.get(m.m); const z = zileLucru(m, a);
  const ki = cost(m, a, 'obicei'), kb = costA(m, a), kp = costA(m, p);
  return { m: m.m, casa: m.casa ? loc(m.casa) : null, clasa: m.clasa, schimburi: m.doua ? 2 : 1, leiKm: m.leiKm, acasa: m.acasa,
    azi: { s1: a.s1?.nume ?? null, s2: a.s2?.nume ?? null, zile: z, kmGoiZi: z ? r1(ki / z) : 0 },
    staParcata: { kmGoiZi: z ? r1(kb / z) : 0 },
    cuSchimb: { s1: p.s1?.nume ?? null, s2: p.s2?.nume ?? null, kmGoiZi: zileLucru(m, p) ? r1(kp / zileLucru(m, p)) : 0, mutat: ['s1', 's2'].some((s) => p[s] !== a[s]) } }; });
const out = {
  sapt: W.sapt, pana: W.Z.zile.map((x) => x.z).sort().at(-1), versiune: VERSIUNE, intrare,
  rotatie: { saptIso: isoSapt(W.sapt), verificatPe: WR?.sapt ?? null, inversata: Rctx?.inv ?? null,
    regula: `lanțul se publică doar dacă taie ≥ ${PRAG_LANT} km/săpt. și pe săptămâna precedentă (schimburile inversate), cu aceleași mutări pe schimbul corespondent; cifra = cea mai mică` },
  estimare: 'gps = costul de azi (R1b + R3 din rând, extrapolat); model = cât se taie dacă mașina stă parcată (drumul cel mai scurt, Valhalla) — estimare',
  asteptare: {
    gps: { ...gpsFlota, masini: cuGps.length }, model: modelFlota,
    dimineata: { gps: gpsFlota.dimineata, estimare: estFlota.dimineata },
    seara: { gps: gpsFlota.seara, estimare: estFlota.seara, cursaDeNoapte: oreSeara.length ? `${oreSeara[0]}–${oreSeara.at(-1)}` : null, intrebare },
    kmSapt: estFlota.total, leiSapt: leiEst,
    bazaEstimare: 'dimineața + seara ale modelului pe calendarul rândului, plafonate pe mașină la costul GPS; fără «între aducere și întoarcere» (zilele cu un singur schimb, nemăsurate pe GPS); lei = aceeași bază × norma mașinii',
    faraNorma: B.filter((x) => x.leiKm == null && x.kmSapt > 0).map((x) => x.m),
    oreSeara: { cursaDeNoapte: oreSeara.length ? `${oreSeara[0]}–${oreSeara.at(-1)}` : null },
    rotatie: BR ? { sapt: WR.sapt, estimare: r1(BR.reduce((a, x) => a + x.estimare.total, 0)), model: r1(BR.reduce((a, x) => a + x.model.total, 0)), gps: r1(BR.filter((x) => x.gps).reduce((a, x) => a + x.gps.total, 0)) } : null,
    masini: B.filter((x) => x.kmSapt > 0 || (x.gps?.total ?? 0) > 0),
    nemasurate: B.filter((x) => !x.gps && x.kmSapt > 0).map((x) => ({ m: x.m, zileGps: x.zileGps, kmSapt: x.kmSapt })),
    departeDeCasa: departe.map((x) => ({ m: x.m, casa: x.casa, departeDeCasaKm: x.departeDeCasaKm, asteapta: x.asteapta, kmZi: x.kmZi })) },
  schimb: { dupa: 'staParcata', stare: WR ? 'verificat' : 'neverificat', kmSapt: sumA,
    leiSapt: lanturi.some((L) => L.leiSapt != null) ? Math.round(leiA) : null, lanturiFaraLei: lanturi.filter((L) => L.leiSapt == null).length,
    faraNorma: [...new Set(lanturi.flatMap((L) => L.faraNorma))], lanturi, deoparte,
    neconfirmateKmSapt: r1(deoparte.filter((L) => L.economieKmSapt >= PRAG_LANT).reduce((a, L) => a + L.economieKmSapt, 0)),
    optim: { optimizator: r1(O.costOptimizator), dupaNormalizare: r1(O.costNormalizat), normalizate: O.normalizate, cuToateLanturile: r1(totAsteapta - O.costNormalizat) } },
  masini: masiniOut, control: C, invarianti: INVARIANTI,
  cursefixe: W.masini.filter((m) => m.fixe.jum.length).map((m) => ({ m: m.m, curse: m.fixe.jum.map((h) => `${h.z.slice(5)} ${h.k} ${W.numeLin(h.lin)}`) })),
  valhalla: { noi, inCache: cache.size } };

console.log(`${out.sapt} (ISO ${out.rotatie.saptIso}; rotație ${WR?.sapt ?? '—'}${WR ? `, inversată ${Rctx.inv}` : ''}): ${W.masini.length} mașini, ${nProg} programe, ${C.conservare.curse} curse`);
console.log(`  azi (GPS, ${cuGps.length} mașini): dimineața ${gpsFlota.dimineata} · seara ${gpsFlota.seara} · între curse (un schimb) ${gpsFlota.intreCurse} · alt ${gpsFlota.alt} · total ${gpsFlota.total} km/săpt.`);
console.log(`  stă parcată (model, toată flota): dimineața ${modelFlota.dimineata} · seara ${modelFlota.seara} · între curse ${modelFlota.intreCurse} · alt ${modelFlota.alt} · total ${modelFlota.total} km/săpt. (${out.asteptare.leiSapt} lei cu normă); cursa de noapte ${out.asteptare.oreSeara.cursaDeNoapte}`);
if (BR) console.log(`  pe ${WR.sapt}: model ${out.asteptare.rotatie.model}, GPS ${out.asteptare.rotatie.gps}`);
console.log(`  ESTIMARE v3.1 (dim + seara, calendarul rândului, plafon GPS): dimineața ${estFlota.dimineata} · seara ${estFlota.seara} · total ${estFlota.total} km/săpt. ≈ ${leiEst} lei cu normă`);
console.log(`  întrebarea de seară: ${intrebare.masini.length} mașini, GPS ${intrebare.gpsKmSapt} (estimare ${intrebare.estimareKmSapt}) km/săpt.: ${intrebare.masini.map((q) => `${q.m} ${q.unde} ${q.departeDeCasaKm}`).join(', ')}`);
console.log(`  departe de casă > ${DEPARTE_KM} km: ${departe.map((x) => `${x.m} ${x.departeDeCasaKm}`).join(', ') || '—'}`);
console.log(`  schimb (${out.schimb.stare}): −${sumA} km/săpt. publicat; toate −${out.schimb.optim.cuToateLanturile}; neconfirmate ${out.schimb.neconfirmateKmSapt}; optimizator ${r1(O.costOptimizator)} = normalizat ${r1(O.costNormalizat)}`);
for (const [k, v] of Object.entries(C)) console.log(`  control ${k}${v.informativ ? ' (informativ)' : ''}: ${v.trece ? 'TRECE' : 'PICĂ'} ${JSON.stringify({ ...v, explicatie: undefined })}`);
for (const L of lanturi) console.log(`  lanț ${L.economieKmSapt} (săpt. ${L.economieSaptCurenta}, precedenta ${L.economieRotatie}) · ${L.text}`);
for (const L of deoparte) console.log(`  (deoparte) ${L.economieKmSapt} · ${L.masini.join(' ')} · ${L.motiv}`);
for (const x of B.slice(0, 40)) console.log(`  m ${x.m} GPS ${x.gps ? `${x.gps.dimineata}/${x.gps.seara}/${x.gps.intreCurse}` : '—'} model ${x.model.dimineata}/${x.model.seara}/${x.model.intreCurse} · dim ${x.asteapta.dimineata ? `${x.asteapta.dimineata.unde} ${x.asteapta.dimineata.departeDeCasaKm}${x.asteapta.dimineata.acasaEChiarLocul ? ' (acasă)' : ''}` : '—'} · seara ${x.asteapta.seara ? `${x.asteapta.seara.unde} ${x.asteapta.seara.departeDeCasaKm}${x.asteapta.seara.acasaEChiarLocul ? ' (acasă)' : ''}` : '—'} ${x.ore.seara.de}→${x.ore.seara.pana}${x.dupaLant ? ` · DUPĂ LANȚ ${x.dupaLant.kmSapt}: dim ${x.dupaLant.asteapta.dimineata?.unde ?? '—'}, seara ${x.dupaLant.asteapta.seara?.unde ?? '—'}` : ''}`);
const p = picate(C);
if (p.length) esec(`un control a picat: ${p.join(', ')}`, 1);
if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(`${OUT}.${process.pid}.tmp`, JSON.stringify(out, null, 1)); renameSync(`${OUT}.${process.pid}.tmp`, OUT);
  writeFileSync(`${CACHE_F}.${process.pid}.tmp`, JSON.stringify(Object.fromEntries(cache))); renameSync(`${CACHE_F}.${process.pid}.tmp`, CACHE_F);
  console.log(`scris ${OUT} (+ cache Valhalla, ${noi} noi)`);
} else console.log('(fără --out: nimic scris, nici cache-ul)');
console.log(`rezumat: GPS azi ${gpsFlota.dimineata} dim + ${gpsFlota.seara} seara = ${gpsFlota.total} km/săpt. · estimare −${estFlota.total} (dim ${estFlota.dimineata} + seara ${estFlota.seara}) · întrebarea de seară ${intrebare.masini.length} mașini / GPS ${intrebare.gpsKmSapt} km · schimb ${out.schimb.stare} −${sumA}`);
} catch (e) { esec(`eroare în calcul: ${e?.stack?.split('\n').slice(0, 3).join(' | ') ?? e}`, 4); }
