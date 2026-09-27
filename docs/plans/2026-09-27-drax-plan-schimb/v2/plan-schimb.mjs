// Drăxlmaier — pârghia «mașina așteaptă între curse» (b) + planul de schimb al liniilor după ea (a). ION-108 A, v2 (27.09.2026).
// Citește DOAR dosarele săptămânilor (instantaneele); nu scrie nimic acolo. Cache-ul Valhalla propriu se scrie doar cu --out și
// doar după ce toate controalele trec; ieșirea se scrie atomic tot atunci (altfel se șterge ieșirea veche și codul e 1).
//   node plan-schimb.mjs <ECON_D> [--rotatie <ECON_D al săptămânii precedente>] [--out <fișier.json>]
// (b) pe mașină: km goi de azi (obiceiul măsurat: merge acasă între curse) − km goi dacă mașina rămâne la uzină / la capătul cursei
//     următoare (șoferul merge acasă altfel; naveta lui nu se numără — Drăxlmaier §5.10, §12.1). Model (Valhalla) + GPS (R1b + R3 din rând).
// (a) după (b): programele (cursele reale ale unei mașini pe un schimb, pe datele lor) se mută între mașini; ungar pe schimb +
//     schimb pe un schimb + schimb de program întreg; lanț = componentă de mutări; verificat pe săptămâna cu schimburile inversate.
import { readFileSync, existsSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { kmSapt, kmZiDet, goluri, zileDin, ungar, componente, ordoneaza, conflict, amprenta } from './model.mjs';
import { loadPlaces, buildPlacesIndex } from '/root/lde-worker/places-index.mjs';

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const DIR = process.argv[2], DIR_R = arg('--rotatie'), OUT = arg('--out');
for (const x of [DIR, DIR_R].filter(Boolean)) if (!existsSync(`${x}/economie.json`) || !existsSync(`${x}/economie-zile.json`)) {
  console.error(`lipsește economie.json / economie-zile.json în ${x}\nfolosire: plan-schimb.mjs <ECON_D> [--rotatie <ECON_D>] [--out f.json]`); process.exit(2); }
const PRAG_LANT = 20, PENAL = 0.5, MIN_ZILE = 2, DEPARTE_KM = 15, MIN_ZILE_GPS = 3;
const PORTI = { EST: { lat: 47.78513, lon: 27.94307 }, VEST: { lat: 47.77408, lon: 27.91593 } };   // drax/cod/economie/comun.mjs:9
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const r1 = (x) => Math.round(x * 10) / 10;
const pt = (c) => (Array.isArray(c) ? { lat: c[0], lon: c[1] } : { lat: c.lat, lon: c.lon });
const idx = buildPlacesIndex(loadPlaces('/root/lde-worker/places.geojsonseq'));
const loc = (p) => idx.nearestWithin({ lat: p.lat, lon: p.lon }, 3.8)?.name ?? `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
const luniDe = (z) => { const x = new Date(z + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const isoSapt = (z) => { const d = new Date(z + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); const f = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7); };

// ---- Valhalla (km pe șosea, costing bus), aceeași cheie ca drax/cod/economie/comun.mjs:kmDrum
const CACHE_F = '/root/lde-worker/drax/date/plan-schimb/valhalla-cache.json';
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
const esec = (motiv, cod = 1) => { console.error(motiv); if (OUT) rmSync(OUT, { force: true }); process.exit(cod); };

// ---- o săptămână: mașinile, programele (calendar exact), cursele fixe, obiceiul «merge acasă»
function incarca(dir) {
  const A = JSON.parse(readFileSync(`${dir}/economie.json`, 'utf8')), Z = JSON.parse(readFileSync(`${dir}/economie-zile.json`, 'utf8'));
  const LIN = Z.linii;
  const sapt = luniDe(Z.zile.map((x) => x.z).sort()[0]);
  const locuri = (l) => LIN[l]?.locuri ?? 0;
  const numeLin = (l) => `${LIN[l]?.capat ?? l.split('|')[1]} (${l.split('|')[0]})`;
  const vot = new Map();
  for (const x of Z.zile) for (const s of x.seg) if (s.cat === 'cuOameni' && s.lin && s.schimb) {
    const g = hav(pt(s.sens === 'tur' ? s.pana : s.de), PORTI.EST) <= hav(pt(s.sens === 'tur' ? s.pana : s.de), PORTI.VEST) ? 'EST' : 'VEST';
    const k = `${s.lin}|${s.sens}|${s.schimb}`; const v = vot.get(k) ?? vot.set(k, {}).get(k); v[g] = (v[g] ?? 0) + 1; }
  const poarta = (lin, sens, schimb) => { const v = vot.get(`${lin}|${sens}|${schimb}`); return PORTI[v ? Object.entries(v).sort((a, b) => b[1] - a[1])[0][0] : 'EST']; };
  const capat = (l) => pt(LIN[l].capatC);
  const masini = [];
  for (const m of A.masini) {
    const zile = Z.zile.filter((x) => x.m === m.m);
    const jum = [], obs = [];
    for (const x of zile) {
      // cursa principală a fiecărui loc al zilei (ts1/ts2/rs1/rs2) = cea mai lungă; bucățile unui retur rupt nu devin altă cursă
      const princ = new Map();
      for (const s of x.seg) if (s.cat === 'cuOameni' && s.lin && s.schimb && LIN[s.lin]?.capatC) { const k = (s.sens === 'tur' ? 't' : 'r') + s.schimb;
        if (!princ.has(k) || princ.get(k).km < s.km) princ.set(k, s); }
      for (const [k, s] of princ) jum.push({ z: x.z, k, lin: s.lin, a: k[0] === 't' ? capat(s.lin) : poarta(s.lin, 'retur', s.schimb), b: k[0] === 't' ? poarta(s.lin, 'tur', s.schimb) : capat(s.lin), s });
      const ord = ['ts1', 'ts2', 'rs1', 'rs2'].filter((k) => princ.has(k)).map((k) => ({ k, s: princ.get(k) }));
      for (let i = 1; i < ord.length; i++) {
        const p = ord[i - 1], n = ord[i];
        const f = p.k === 'ts2' && n.k === 'rs1' ? null : p.k === 'ts1' && n.k === 'ts2' ? 'dim' : p.k === 'rs1' && n.k === 'rs2' ? 'seara' : p.k.slice(1) === n.k.slice(1) ? 'zi' : 'alt';
        if (!f) continue;
        const gol = x.seg.filter((q) => q.cat !== 'cuOameni' && q.t0 >= p.s.t1 && q.t1 <= n.s.t0);
        obs.push({ f, km: gol.reduce((a, q) => a + q.km + (q.golImpus || 0), 0), ocol: gol.some((q) => q.ocol),
          a: jum.find((h) => h.z === x.z && h.k === p.k).b, b: jum.find((h) => h.z === x.z && h.k === n.k).a });
      }
    }
    // programul mobil pe schimb = cursele pe linia obișnuită a fiecărui loc (ts/rs) în ≥ MIN_ZILE zile; restul = curse fixe ale mașinii
    const rec = { m: m.m, casa: m.casa ? pt(m.casa) : null, leiKm: m.leiKm ?? null, prog: {}, fixe: { jum: [] }, obs, acasa: {}, acasaVot: {},
      R1b: m.R1b ?? null, R3: m.R3 ?? null, zileIncluse: m.zileIncluse ?? 0, zileRand: m.zile ?? 0 };
    for (const s of ['s1', 's2']) {
      const obisnuita = {};
      for (const k of ['t' + s, 'r' + s]) { const c = new Map(); for (const h of jum) if (h.k === k) c.set(h.lin, (c.get(h.lin) ?? 0) + 1);
        const best = [...c.entries()].sort((a, b) => b[1] - a[1])[0]; if (best && best[1] >= MIN_ZILE) obisnuita[k] = best[0]; }
      const reg = jum.filter((h) => h.k.slice(1) === s && obisnuita[h.k] === h.lin);
      if (reg.length) {
        const P = { id: `${sapt}|${m.m}|${s}`, azi: m.m, schimb: s, jum: reg, tur: obisnuita['t' + s] ?? null, ret: obisnuita['r' + s] ?? null };
        P.clasa = Math.max(...[P.tur, P.ret].filter(Boolean).map(locuri));
        P.forma = `${P.tur ? 'T' : '-'}${P.ret ? 'R' : '-'}`;
        P.nume = P.tur && P.ret && P.tur !== P.ret ? `${numeLin(P.tur)} dimineața/după-amiaza și ${numeLin(P.ret)} la întoarcere` : `${numeLin(P.tur ?? P.ret)}${P.tur && P.ret ? '' : P.tur ? ' (doar aducerea)' : ' (doar întoarcerea)'}`;
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

// ---- km pe șosea: fiecare casă ↔ fiecare punct al curselor; punct ↔ punct (golurile directe)
const perechi = [];
for (const S of [W, WR].filter(Boolean)) {
  const puncte = [...new Map(S.masini.flatMap((m) => [...Object.values(m.prog), m.fixe].flatMap((P) => P.jum.flatMap((h) => [h.a, h.b]))).map((p) => [cheie(p, p), p])).values()];
  for (const m of S.masini) if (m.casa) for (const p of puncte) perechi.push([m.casa, p], [p, m.casa]);
  for (const a of puncte) for (const b of puncte) perechi.push([a, b]);
}
for (let i = 0; i < perechi.length; i += 8) await Promise.all(perechi.slice(i, i + 8).map(([a, b]) => valhalla(a, b)));
if (nule.length) esec(`Valhalla a întors null de ${nule.length} ori (ex. ${nule[0]}) — nimic scris`, 3);
for (const S of [W, WR].filter(Boolean)) for (const m of S.masini) {
  if (!m.casa) continue; const v = {};
  for (const o of m.obs) { const acasa = o.ocol || o.km >= 0.8 * (d(o.a, m.casa) + d(m.casa, o.b)); (v[o.f] ??= [0, 0])[acasa ? 0 : 1]++; }
  m.acasaVot = v; m.acasa = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x[0] >= x[1]]));
}

// ---- costul: programele date + cursele fixe ale mașinii; conflict = imposibil
const programe = (m, asg) => [asg.s1, asg.s2, m.fixe];
const cost = (m, asg, mod) => (m.casa ? (conflict(programe(m, asg)) ? Infinity : kmSapt(m, programe(m, asg), d, mod)) : 0);
const aziDe = (S) => new Map(S.masini.map((m) => [m.m, { s1: m.prog.s1 ?? null, s2: m.prog.s2 ?? null }]));
const zileLucru = (m, asg) => zileDin(programe(m, asg)).length;

// ================= (b) mașina rămâne la uzină / la capătul cursei următoare =================
function asteptare(S) {
  const azi = aziDe(S);
  return S.masini.filter((m) => m.casa).map((m) => {
    const a = azi.get(m.m), pr = programe(m, a);
    const kmObicei = cost(m, a, 'obicei'), kmAsteapta = cost(m, a, 'asteapta'), km = kmObicei - kmAsteapta, zile = zileLucru(m, a);
    // unde așteaptă: pe golurile în care azi merge acasă — la uzină sau la capătul cursei (cel mai aproape de casă, km mașinii sunt aceiași)
    const locuri = new Map();
    for (const z of zileDin(pr)) for (const g of goluri(m, pr, z, d, 'obicei')) if (g.acasa && g.prinCasa - g.direct > 0.5) {
      const opt = g.f === 'dim' ? [['uzină', g.p.b], [`capătul ${S.numeLin(g.n.lin)}`, g.n.a]]
        : g.f === 'seara' ? [[`capătul ${S.numeLin(g.p.lin)}`, g.p.b], ['uzină', g.n.a]] : [['uzină', g.p.b]];
      const [nume, p] = opt.map(([n, q]) => [n, q, d(q, m.casa)]).sort((x, y) => x[2] - y[2])[0];
      const cheieL = `${g.f}|${nume}`; const L = locuri.get(cheieL) ?? locuri.set(cheieL, { gol: g.f, unde: nume, departeDeCasaKm: r1(d(p, m.casa)), zile: 0, km: 0 }).get(cheieL);
      L.zile++; L.km += g.prinCasa - g.direct;
    }
    const und = [...locuri.values()].filter((L) => L.zile >= MIN_ZILE).map((L) => ({ ...L, km: r1(L.km) })).sort((x, y) => y.km - x.km);
    const gps = m.zileIncluse >= MIN_ZILE_GPS && m.R1b != null ? r1(((m.R1b ?? 0) + (m.R3 ?? 0)) / m.zileIncluse * m.zileRand) : null;
    return { m: m.m, casa: loc(m.casa), zile, kmSapt: r1(km), kmZi: zile ? r1(km / zile) : 0, gpsKmSapt: gps, zileGps: `${m.zileIncluse}/${m.zileRand}`,
      leiKm: m.leiKm, leiSapt: m.leiKm != null ? Math.round(km * m.leiKm) : null,
      undeAsteapta: und.map((L) => `${{ dim: 'dimineața', seara: 'seara', zi: 'între aducere și întoarcere', alt: 'între curse' }[L.gol]} la ${L.unde} (${L.departeDeCasaKm} km de casă)`).join('; ') || null,
      departeDeCasaKm: und.length ? Math.max(...und.map((L) => L.departeDeCasaKm)) : null, locuri: und,
      kmGoiSaptObicei: r1(kmObicei), kmGoiSaptAsteapta: r1(kmAsteapta) };
  }).sort((x, y) => y.kmSapt - x.kmSapt);
}

// ================= (a) schimbul de linii, DUPĂ (b) =================
function voieIn(S, azi) {
  return (m, P) => {
    if (P.azi === m.m) return true;
    if (!m.casa || !S.M.get(P.azi).casa) return false;
    const own = azi.get(m.m)[P.schimb]; if (!own || own.forma !== P.forma) return false;
    return m.clasa === P.clasa || m.clasa === S.M.get(P.azi).clasa;
  };
}
function optimizeaza(S) {
  const azi = aziDe(S), voie = voieIn(S, azi), MOD = 'asteapta';
  const plan = new Map([...azi].map(([k, v]) => [k, { ...v }]));
  const ob = (m, asg) => cost(m, asg, MOD) + PENAL * ['s1', 's2'].filter((s) => asg[s] && asg[s].azi !== m.m).length;
  const total = () => S.masini.reduce((a, m) => a + ob(m, plan.get(m.m)), 0);
  let t0 = Infinity;
  for (let runda = 0; runda < 30; runda++) {
    for (const s of ['s1', 's2']) {
      const rows = S.masini.filter((m) => plan.get(m.m)[s]); const cols = rows.map((m) => plan.get(m.m)[s]);
      const C = rows.map((m) => cols.map((P) => { if (!voie(m, P)) return 1e9; const c = ob(m, { ...plan.get(m.m), [s]: P }); return Number.isFinite(c) ? c : 1e9; }));
      const p = ungar(C); const nou = rows.map((m, i) => cols[p[i]]);
      const vechi = rows.map((m) => plan.get(m.m)[s]); const tv = total();
      rows.forEach((m, i) => { plan.get(m.m)[s] = nou[i]; });
      if (total() > tv + 1e-6) rows.forEach((m, i) => { plan.get(m.m)[s] = vechi[i]; });   // ungarul cu celălalt schimb fixat nu strică niciodată
    }
    // căutare locală: schimb pe un schimb + schimb de program întreg (ambele schimburi deodată), până nu mai scade
    for (let bun = true; bun;) { bun = false;
      for (let i = 0; i < S.masini.length; i++) for (let j = i + 1; j < S.masini.length; j++) {
        const a = S.masini[i], b = S.masini[j], Pa = plan.get(a.m), Pb = plan.get(b.m);
        const cand = [];
        for (const s of ['s1', 's2']) if (Pa[s] && Pb[s]) cand.push([{ ...Pa, [s]: Pb[s] }, { ...Pb, [s]: Pa[s] }]);
        if (!!Pa.s1 === !!Pb.s1 && !!Pa.s2 === !!Pb.s2 && Pa.s1 && Pa.s2) cand.push([{ ...Pb }, { ...Pa }]);
        for (const [na, nb] of cand) {
          if (!['s1', 's2'].every((s) => (!na[s] || voie(a, na[s])) && (!nb[s] || voie(b, nb[s])))) continue;
          if (ob(a, na) + ob(b, nb) < ob(a, plan.get(a.m)) + ob(b, plan.get(b.m)) - 1e-6) { plan.set(a.m, na); plan.set(b.m, nb); bun = true; break; }
        } } }
    const t = total(); if (t > t0 - 1e-6) break; t0 = t;
  }
  const costOptimizator = S.masini.reduce((a, m) => a + cost(m, plan.get(m.m), MOD), 0);
  // normalizarea (C2/S1): programele cu aceleași linii pe același schimb; mașina își ia înapoi programul propriu DOAR dacă suma nu crește
  let normalizate = 0;
  for (let ok = true; ok;) { ok = false;
    for (const m of S.masini) for (const s of ['s1', 's2']) { const P = plan.get(m.m)[s], own = azi.get(m.m)[s];
      if (!P || P === own || P.cheie !== own.cheie) continue;
      const x = S.masini.find((q) => plan.get(q.m)[s] === own); if (!x || !voie(x, P)) continue;
      const Pm = plan.get(m.m), Px = plan.get(x.m);
      if (cost(m, { ...Pm, [s]: own }, MOD) + cost(x, { ...Px, [s]: P }, MOD) <= cost(m, Pm, MOD) + cost(x, Px, MOD) + 1e-6) { Pm[s] = own; Px[s] = P; normalizate++; ok = true; } } }
  const costNormalizat = S.masini.reduce((a, m) => a + cost(m, plan.get(m.m), MOD), 0);
  return { azi, plan, voie, costOptimizator, costNormalizat, normalizate };
}

// lanțurile = componente de mutări; economia unei componente e independentă de celelalte (mașinile ei schimbă doar între ele)
function lanturiDin(S, O) {
  const mutari = [];
  for (const m of S.masini) for (const s of ['s1', 's2']) { const P = O.plan.get(m.m)[s]; if (P && P.azi !== m.m) mutari.push({ P, dela: P.azi, la: m.m, schimb: s }); }
  return componente(mutari).map((comp) => {
    const mut = ordoneaza(mutari.filter((q) => comp.includes(q.la)));
    const pe = comp.map((x) => ({ m: x, inainte: cost(S.M.get(x), O.azi.get(x), 'asteapta'), dupa: cost(S.M.get(x), O.plan.get(x), 'asteapta') }));
    return { comp, mut, pe, ec: pe.reduce((a, q) => a + q.inainte - q.dupa, 0) };
  });
}
// verificarea pe săptămâna cu schimburile inversate: aceleași mutări, după LINII (programul mașinii «dela» cu aceleași linii, pe orice schimb)
function peRotatie(L) {
  if (!WR) return { verificat: false, motiv: 'fără săptămâna precedentă' };
  const azi = aziDe(WR), voie = voieIn(WR, azi), plan = new Map([...azi].map(([k, v]) => [k, { ...v }]));
  for (const q of L.mut) {
    const src = WR.M.get(q.dela); const P = src && Object.values(src.prog).find((x) => x.cheie === q.P.cheie);
    if (!P || !WR.M.get(q.la)) return { verificat: false, motiv: `${q.dela} nu face ${W.numeLin(q.P.tur ?? q.P.ret)} în săptămâna ${WR.sapt}` };
    plan.get(q.la)[P.schimb] = P;
  }
  const folosite = new Map();
  for (const m of WR.masini) for (const s of ['s1', 's2']) { const P = plan.get(m.m)[s]; if (!P) continue;
    if (P.schimb !== s) return { verificat: false, motiv: 'schimbul nu se potrivește' };
    folosite.set(P.id, (folosite.get(P.id) ?? 0) + 1); if (!voie(m, P)) return { verificat: false, motiv: `${m.m}: clasă / formă` }; }
  if ([...folosite.values()].some((n) => n !== 1) || folosite.size !== WR.masini.reduce((a, m) => a + Object.keys(m.prog).length, 0))
    return { verificat: false, motiv: 'pe săptămâna cealaltă un program ar rămâne fără mașină sau cu două' };
  const xs = [...new Set(L.mut.flatMap((q) => [q.dela, q.la]))];
  const ec = xs.reduce((a, x) => { const m = WR.M.get(x); return a + cost(m, azi.get(x), 'asteapta') - cost(m, plan.get(x), 'asteapta'); }, 0);
  return Number.isFinite(ec) ? { verificat: true, ecKmSapt: r1(ec) } : { verificat: false, motiv: 'curse suprapuse pe săptămâna cealaltă' };
}

// ================= calculul =================
const B = asteptare(W), BR = WR ? asteptare(WR) : null;
const O = optimizeaza(W);
const cand = lanturiDin(W, O).map((L) => ({ ...L, rot: peRotatie(L) }))
  .map((L) => ({ ...L, ecPlan: L.rot.verificat ? Math.min(L.ec, L.rot.ecKmSapt) : L.ec }));
const pastrat = (L) => L.ec >= PRAG_LANT && (!WR || (L.rot.verificat && L.rot.ecKmSapt >= PRAG_LANT));
const plan = new Map([...O.azi].map(([k, v]) => [k, { ...v }]));
for (const L of cand.filter(pastrat)) for (const x of L.comp) plan.set(x, { ...O.plan.get(x) });
const casaDe = (x) => loc(W.M.get(x).casa);
const lanturi = cand.filter(pastrat).sort((a, b) => b.ecPlan - a.ecPlan).map((L) => {
  const spus = new Set();
  const text = L.mut.map((q) => { const t = `${q.dela} lasă ${q.P.nume} lui ${q.la}${spus.has(q.la) ? '' : `, care stă la ${casaDe(q.la)}`}`; spus.add(q.la); return t; }).join('; ') + '.';
  const lei = L.pe.every((q) => W.M.get(q.m).leiKm != null) ? Math.round(L.pe.reduce((a, q) => a + (q.inainte - q.dupa) * W.M.get(q.m).leiKm, 0)) : null;
  return { economieKmSapt: r1(L.ecPlan), economieSaptCurenta: r1(L.ec), economieRotatie: L.rot.verificat ? L.rot.ecKmSapt : null, leiSapt: lei,
    faraNorma: L.pe.filter((q) => W.M.get(q.m).leiKm == null).map((q) => q.m),
    peMasina: L.pe.map((q) => ({ m: q.m, kmSapt: r1(q.dupa - q.inainte) })),
    mutari: L.mut.map((q) => ({ linie: q.P.cheie, tur: q.P.tur, retur: q.P.ret, nume: q.P.nume, dela: q.dela, la: q.la, zile: new Set(q.P.jum.map((h) => h.z)).size, schimbInSaptamana: q.schimb })),
    text };
});
const deoparte = cand.filter((L) => !pastrat(L)).map((L) => ({ economieKmSapt: r1(L.ec), rotatie: L.rot, masini: L.comp,
  motiv: L.ec < PRAG_LANT ? `sub ${PRAG_LANT} km/săpt.` : !L.rot.verificat ? `nu se verifică pe săptămâna cu schimburile inversate: ${L.rot.motiv}` : `pe săptămâna cu schimburile inversate doar ${L.rot.ecKmSapt} km` }));

// ---- sumele
const sumB = r1(B.reduce((a, x) => a + x.kmSapt, 0));
const leiB = B.filter((x) => x.leiSapt != null).reduce((a, x) => a + x.leiSapt, 0);
const sumA = r1(lanturi.reduce((a, L) => a + L.economieKmSapt, 0));
const sumAcurent = W.masini.reduce((a, m) => a + cost(m, O.azi.get(m.m), 'asteapta') - cost(m, plan.get(m.m), 'asteapta'), 0);
const leiA = lanturi.reduce((a, L) => a + (L.leiSapt ?? 0), 0);
const totObicei = W.masini.reduce((a, m) => a + cost(m, O.azi.get(m.m), 'obicei'), 0);
const totAsteapta = W.masini.reduce((a, m) => a + cost(m, O.azi.get(m.m), 'asteapta'), 0);
const totPlan = W.masini.reduce((a, m) => a + cost(m, plan.get(m.m), 'asteapta'), 0);

// ---- controalele
const C = {};
const toatePlan = W.masini.flatMap((m) => programe(m, plan.get(m.m))), toateAzi = W.masini.flatMap((m) => programe(m, O.azi.get(m.m)));
C.conservare = { trece: amprenta(toatePlan) === amprenta(toateAzi), curse: toateAzi.reduce((a, P) => a + (P?.jum.length ?? 0), 0) };
C.farăSuprapuneri = { trece: W.masini.every((m) => !conflict(programe(m, plan.get(m.m)))) };
const ids = W.masini.flatMap((m) => ['s1', 's2'].map((s) => plan.get(m.m)[s]).filter(Boolean).map((P) => P.id));
const nProg = W.masini.reduce((a, m) => a + Object.keys(m.prog).length, 0);
C.fiecareProgramOData = { trece: ids.length === nProg && new Set(ids).size === nProg, programe: nProg };
C.capacitateSiForma = { trece: W.masini.every((m) => ['s1', 's2'].every((s) => !plan.get(m.m)[s] || O.voie(m, plan.get(m.m)[s]))) };
C.schimbPastrat = { trece: W.masini.every((m) => ['s1', 's2'].every((s) => !!plan.get(m.m)[s] === !!O.azi.get(m.m)[s] && (!plan.get(m.m)[s] || plan.get(m.m)[s].schimb === s))) };
C.economieA = { trece: Math.abs(sumAcurent - lanturi.reduce((a, L) => a + L.economieSaptCurenta, 0)) < 0.5 && totPlan <= totAsteapta + 1e-6,
  inainteDupaB: r1(totAsteapta), dupaA: r1(totPlan), diferenta: r1(sumAcurent), sumaLanturiSaptCurenta: r1(lanturi.reduce((a, L) => a + L.economieSaptCurenta, 0)) };
C.economieB = { trece: Math.abs((totObicei - totAsteapta) - sumB) < 0.5 && B.every((x) => x.kmSapt >= -0.05), azi: r1(totObicei), cuAsteptare: r1(totAsteapta), diferenta: r1(totObicei - totAsteapta) };
C.normalizareaNuStrica = { trece: O.costNormalizat <= O.costOptimizator + 1e-6, optimizator: r1(O.costOptimizator), dupaNormalizare: r1(O.costNormalizat), normalizate: O.normalizate };
// (b) model ↔ GPS pe ocol (B8): pe mașinile cu ≥ MIN_ZILE_GPS zile măsurate; ±10 % pe flotă (și pe mașinile peste 20 km/zi, informativ)
const cuGps = B.filter((x) => x.gpsKmSapt != null);
const sm = cuGps.reduce((a, x) => a + x.kmSapt, 0), sg = cuGps.reduce((a, x) => a + x.gpsKmSapt, 0);
const mari = cuGps.filter((x) => x.kmZi >= 20), smM = mari.reduce((a, x) => a + x.kmSapt, 0), sgM = mari.reduce((a, x) => a + x.gpsKmSapt, 0);
C.asteptareModelVsGps = { trece: sgM > 0 && Math.abs(smM - sgM) / sgM <= 0.10, pe: "mașinile cu ≥ 20 km/zi și ≥ 3 zile GPS (ocolul lor = R1b + R3); pe toată flota informativ: la mașinile cu casa pe culoarul liniei R1b numără tot ocolul, modelul doar surplusul față de drumul direct", masini: cuGps.length, model: r1(sm), gps: r1(sg), abatere: r1((sm - sg) / sg * 100),
  peste20: { masini: mari.length, model: r1(smM), gps: r1(sgM), abatere: sgM ? r1((smM - sgM) / sgM * 100) : null },
  nemasurate: B.filter((x) => x.gpsKmSapt == null && x.kmSapt > 0).map((x) => `${x.m} (${x.zileGps} zile)`) };

// ---- ieșirea
const departe = B.filter((x) => x.kmSapt > 0 && x.departeDeCasaKm != null && x.departeDeCasaKm > DEPARTE_KM);
const masiniOut = W.masini.map((m) => { const a = O.azi.get(m.m), p = plan.get(m.m), b = B.find((x) => x.m === m.m); const z = zileLucru(m, a);
  const ki = cost(m, a, 'obicei'), kb = cost(m, a, 'asteapta'), kp = cost(m, p, 'asteapta');
  return { m: m.m, casa: m.casa ? loc(m.casa) : null, clasa: m.clasa, schimburi: m.doua ? 2 : 1, leiKm: m.leiKm, acasa: m.acasa,
    azi: { s1: a.s1?.nume ?? null, s2: a.s2?.nume ?? null, zile: z, kmGoiZi: z ? r1(ki / z) : 0 },
    cuAsteptare: { kmGoiZi: z ? r1(kb / z) : 0 },
    cuSchimb: { s1: p.s1?.nume ?? null, s2: p.s2?.nume ?? null, kmGoiZi: zileLucru(m, p) ? r1(kp / zileLucru(m, p)) : 0, mutat: ['s1', 's2'].some((s) => p[s] !== a[s]) },
    asteptareKmZi: b?.kmZi ?? 0 }; });
const out = {
  sapt: W.sapt, pana: W.Z.zile.map((x) => x.z).sort().at(-1), versiune: 'plan-schimb v2 (ION-108 A)',
  rotatie: { saptIso: isoSapt(W.sapt), verificatPe: WR?.sapt ?? null,
    regula: WR ? `lanțul se păstrează doar dacă taie ≥ ${PRAG_LANT} km/săpt. și pe ${WR.sapt} (schimburile inversate); cifra = cea mai mică dintre cele două` : 'neverificat: lipsește săptămâna precedentă' },
  estimare: 'km pe drumul cel mai scurt (Valhalla, costing bus); pentru (b) cifra GPS e alături (R1b + R3 din rând)',
  asteptare: { kmSapt: sumB, leiSapt: Math.round(leiB), faraNorma: B.filter((x) => x.leiKm == null && x.kmSapt > 0).map((x) => x.m),
    gpsKmSapt: r1(sg), gpsMasini: cuGps.length,
    rotatie: BR ? { sapt: WR.sapt, kmSapt: r1(BR.reduce((a, x) => a + x.kmSapt, 0)) } : null,
    masini: B.filter((x) => x.kmSapt > 0).map(({ locuri, ...x }) => x),
    departeDeCasa: departe.map((x) => ({ m: x.m, casa: x.casa, departeDeCasaKm: x.departeDeCasaKm, undeAsteapta: x.undeAsteapta, kmZi: x.kmZi })) },
  schimb: { dupa: 'asteptare', kmSapt: sumA, leiSapt: lanturi.some((L) => L.leiSapt != null) ? Math.round(leiA) : null, lanturiFaraLei: lanturi.filter((L) => L.leiSapt == null).length,
    faraNorma: [...new Set(lanturi.flatMap((L) => L.faraNorma))], lanturi, deoparte,
    optim: { optimizator: r1(O.costOptimizator), dupaNormalizare: r1(O.costNormalizat), normalizate: O.normalizate, cuToateLanturile: r1(totAsteapta - O.costNormalizat) } },
  masini: masiniOut, control: C,
  cursefixe: W.masini.filter((m) => m.fixe.jum.length).map((m) => ({ m: m.m, curse: m.fixe.jum.map((h) => `${h.z.slice(5)} ${h.k} ${W.numeLin(h.lin)}`) })),
  valhalla: { noi, inCache: cache.size } };
console.log(`${out.sapt} (ISO ${out.rotatie.saptIso}; rotație ${WR?.sapt ?? '—'}): ${W.masini.length} mașini, ${nProg} programe, ${C.conservare.curse} curse`);
console.log(`  (b) așteptare: −${sumB} km/săpt. model (GPS pe ${cuGps.length} mașini: ${r1(sg)}; model pe aceleași: ${r1(sm)}) ≈ ${Math.round(leiB)} lei pe mașinile cu normă; departe de casă > ${DEPARTE_KM} km: ${departe.map((x) => `${x.m} ${x.departeDeCasaKm}`).join(', ') || '—'}`);
if (BR) console.log(`  (b) pe ${WR.sapt}: −${out.asteptare.rotatie.kmSapt} km/săpt.`);
console.log(`  (a) schimb după (b): −${sumA} km/săpt. (min cu rotația; pe săptămâna curentă −${r1(sumAcurent)}) ≈ ${Math.round(leiA)} lei pe lanțurile cu normă; optimizator ${r1(O.costOptimizator)} → normalizat ${r1(O.costNormalizat)} (${O.normalizate}); toate lanțurile −${out.schimb.optim.cuToateLanturile}`);
for (const [k, v] of Object.entries(C)) console.log(`  control ${k}: ${v.trece ? 'TRECE' : 'PICĂ'} ${JSON.stringify(v)}`);
for (const L of lanturi) console.log(`  lanț ${L.economieKmSapt} (curent ${L.economieSaptCurenta}, rotație ${L.economieRotatie}) · ${L.text}`);
for (const L of deoparte) console.log(`  (deoparte) ${L.economieKmSapt} · ${L.masini.join(' ')} · ${L.motiv}`);
for (const x of B.filter((q) => q.kmSapt > 0)) console.log(`  b ${x.m} ${x.kmZi}/zi ${x.kmSapt}/săpt. GPS ${x.gpsKmSapt ?? '—'} (${x.zileGps}) lei ${x.leiSapt ?? '—'} · ${x.undeAsteapta}`);
const picate = Object.entries(C).filter(([, v]) => !v.trece).map(([k]) => k);
if (picate.length) esec(`controale picate: ${picate.join(', ')} — nimic scris`);
if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT + '.tmp', JSON.stringify(out, null, 1)); renameSync(OUT + '.tmp', OUT);
  writeFileSync(CACHE_F + '.tmp', JSON.stringify(Object.fromEntries(cache))); renameSync(CACHE_F + '.tmp', CACHE_F);
  console.log(`scris ${OUT} (+ cache Valhalla, ${noi} noi)`);
} else console.log('(fără --out: nimic scris, nici cache-ul)');
