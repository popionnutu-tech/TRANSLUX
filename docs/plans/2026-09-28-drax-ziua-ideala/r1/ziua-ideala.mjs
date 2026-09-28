// ION-123 runda 1 — «ziua ideală» a mașinii Drăxlmaier, măsurată pe toată flota, săptămâna 14–20.09.2026.
// Rulare pe VPS, pe COPIA cache-ului Valhalla:  ECON_D=/tmp/zi-ideal node ziua-ideala.mjs
// Citește (nu scrie): <SAPT_D>/economie-zile.json, analiza.json. Scrie: $OUT (implicit /tmp/zi-ideal/ziua-ideala.json).
// Nu atinge baza, nici codul din /root/lde-worker (comun.mjs e doar importat pentru kmDrum/hav/PORTI/PARC).
import { readFileSync, writeFileSync } from 'node:fs';
const C = await import('/root/lde-worker/drax/cod/economie/comun.mjs');
const { kmDrum, hav, PORTI, PARC, salveazaCache, NULE } = C;
const W = process.env.SAPT_D || '/root/lde-worker/drax/date/saptamanal/2026-09-14';
const OUT = process.env.OUT || '/tmp/zi-ideal/ziua-ideala.json';
const Z = JSON.parse(readFileSync(W + '/economie-zile.json', 'utf8'));
const A = JSON.parse(readFileSync(W + '/analiza.json', 'utf8'));
const r1 = (x) => Math.round(x * 10) / 10;
const P = (a) => ({ lat: a[0], lon: a[1] });
const GOL = new Set(['livrare', 'golRuta', 'golTure', 'legatura', 'parc', 'necunoscut']);
const MUNCA = new Set(['intreUzine', 'deplasare', 'service']);
const UZ_R = 1.0, CAP_R = 2.5;
const laUzina = (p) => PORTI.some((g) => hav(p, g) <= g.r + UZ_R) || hav(p, PARC) <= UZ_R;
const langaCapat = (p, lin) => { const c = Z.linii[lin]?.capatC; return !!c && hav(p, c) <= CAP_R; };
const etal = (lin, sch) => { const e = Z.linii[lin]?.E; if (!e) return null; return e[sch] ?? e.s1 ?? e.s2 ?? null; };
const deLam = new Set(); for (const x of A.deLamurit || []) for (const dw of x.economie?.dow || []) deLam.add(x.m + "|" + dw);
const excl = new Map(); for (const m of A.masini) for (const d of m.detalii) excl.set(m.m + '|' + d.z, d.exclus);
const zileDif = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
const cnt = { etalonCursaLipsa: 0, etalonLegLipsa: 0, legEtalon: 0, legValhalla: 0 };

// ---- structura zilei: intervale (seg cu același t0–t1), curse, dimineața / seara / între curse
function structura(zi) {
  const iv = [], idx = new Map();
  for (const s of zi.seg) { const k = s.t0 + '-' + s.t1; if (!idx.has(k)) { idx.set(k, iv.length); iv.push({ t0: s.t0, t1: s.t1, ora: s.ora, seg: [] }); } iv[idx.get(k)].seg.push(s); }
  iv.sort((a, b) => a.t0 - b.t0);
  for (const v of iv) {
    v.cursa = v.seg.find((s) => s.cat === 'cuOameni') || null;
    const sum = (f) => v.seg.filter(f).reduce((a, s) => a + s.km, 0);
    v.gol = sum((s) => GOL.has(s.cat)); v.munca = sum((s) => MUNCA.has(s.cat));
    v.acasa = sum((s) => s.cat === 'livrare' && s.ocol); v.parc = sum((s) => s.cat === 'parc'); v.golTure = sum((s) => s.cat === 'golTure');
    v.balti = v.seg.some((s) => s.noapteZona) || v.seg.some((s) => s.noapteTip === 'parc');
    v.de = P(v.seg[0].de); v.pana = P(v.seg[0].pana);
  }
  const ci = iv.map((v, i) => (v.cursa ? i : -1)).filter((i) => i >= 0);
  const first = ci[0], last = ci[ci.length - 1];
  for (let i = 0; i < iv.length; i++) {
    const v = iv[i]; if (v.cursa) { v.tip = 'cursa'; continue; }
    if (i < first) v.tip = 'dim'; else if (i > last) v.tip = 'seara';
    else { v.tip = 'intre'; v.prev = [...iv.slice(0, i)].reverse().find((x) => x.cursa); v.next = iv.slice(i + 1).find((x) => x.cursa); }
  }
  return { iv, S: iv[first].de, E: iv[last].pana, cF: iv[first].cursa, cL: iv[last].cursa,
    dimGol: iv.filter((v) => v.tip === 'dim').reduce((a, v) => a + v.gol, 0), searaGol: iv.filter((v) => v.tip === 'seara').reduce((a, v) => a + v.gol, 0),
    baltiDim: iv.some((v) => v.tip === 'dim' && v.balti), baltiSeara: iv.some((v) => v.tip === 'seara' && v.balti) };
}

// ---- legătura dintre două puncte: Valhalla direct, sau etalonul liniei pe tronsonul uzină ↔ capăt
async function leg(a, b, linA, schA, linB, schB, mod) {
  if (mod === 'etalon') {
    const ua = laUzina(a), ub = laUzina(b);
    if (ua && !ub && linB && langaCapat(b, linB)) { const e = etal(linB, schB); if (e != null) { cnt.legEtalon++; return e; } cnt.etalonLegLipsa++; }
    if (ub && !ua && linA && langaCapat(a, linA)) { const e = etal(linA, schA); if (e != null) { cnt.legEtalon++; return e; } cnt.etalonLegLipsa++; }
    if (!ua && !ub && linA && linA === linB && langaCapat(a, linA) && langaCapat(b, linB)) return 0;
  }
  cnt.legValhalla++;
  const k = await kmDrum(a, b); return k ?? NaN;
}
const U = PORTI.map((g) => ({ lat: g.lat, lon: g.lon, n: g.n }));
async function noapte(E, Sx, cL, cF, mod, loc) {
  const cap = await leg(E, Sx, cL.lin, cL.schimb, cF.lin, cF.schimb, mod);
  let uz = Infinity; for (const u of U) uz = Math.min(uz, (await leg(E, u, cL.lin, cL.schimb, null, null, mod)) + (await leg(u, Sx, null, null, cF.lin, cF.schimb, mod)));
  return { cap, uz, val: loc === 'capat' ? cap : loc === 'uzina' ? uz : Math.min(cap, uz) };
}

// ---- pregătirea: zilele fiecărei mașini, perechile de nopți
const zile = Z.zile.map((z) => ({ z, st: structura(z), exclus: excl.get(z.m + '|' + z.z) ?? null }));
const peMasina = new Map(); for (const d of zile) { if (!peMasina.has(d.z.m)) peMasina.set(d.z.m, []); peMasina.get(d.z.m).push(d); }
for (const L of peMasina.values()) {
  L.sort((a, b) => (a.z.z < b.z.z ? -1 : 1));
  for (let i = 0; i < L.length; i++) {
    const d = L[i], n = L[(i + 1) % L.length], circ = i === L.length - 1;
    const wk = circ || zileDif(d.z.z, n.z.z) > 1;
    const noapteObj = { de: d, la: n, weekend: wk, balti: d.st.baltiSeara || n.st.baltiDim, real: d.st.searaGol + n.st.dimGol };
    d.noapteSeara = noapteObj; n.noapteDim = noapteObj;
  }
}

// ---- o variantă
async function varianta(v) {
  const rows = [];
  for (const d of zile) {
    if ((v.X === "faraExcluse" || v.X === "faraExcluseDeLamurit") && d.exclus) continue;
    if (v.X === "faraExcluseDeLamurit" && deLam.has(d.z.m + "|" + d.z.dow)) continue;
    const { z, st } = d;
    let cuoI = 0, cuoG = 0; const cauze = { noapte: 0, noapteWeekend: 0, noapteBalti: 0, acasa: 0, laUzina: 0, drumLung: 0, golTure: 0, cursaVsEtalon: 0 };
    let links = 0, munca = 0, gol = 0, sep = { weekend: 0, balti: 0 }; const imposibile = [], intervale = [];
    for (const it of st.iv) {
      munca += it.munca;
      if (it.tip === 'cursa') {
        const g = it.cursa.km; cuoG += g;
        if (v.Q1 === 'etalon') { const e = etal(it.cursa.lin, it.cursa.schimb); if (e == null) { cnt.etalonCursaLipsa++; cuoI += g; } else { cuoI += e; cauze.cursaVsEtalon += g - e; } } else cuoI += g;
        continue;
      }
      if (it.tip !== 'intre') continue;
      gol += it.gol;
      const L = await leg(it.prev.pana, it.next.de, it.prev.cursa.lin, it.prev.cursa.schimb, it.next.cursa.lin, it.next.cursa.schimb, v.Q2);
      links += L;
      const rest = it.gol - it.acasa - it.parc - it.golTure;
      cauze.acasa += it.acasa; cauze.laUzina += it.parc; cauze.golTure += it.golTure;
      const bothUz = laUzina(it.prev.pana) && laUzina(it.next.de);
      let tolK = 0; if (v.T && !(L === 0 || bothUz)) { tolK = Math.min(Math.max(rest - L, 0), 0.05 * L + 1); links += tolK; }
      if (L === 0 || bothUz) cauze.laUzina += rest - L; else cauze.drumLung += rest - L - tolK;
      intervale.push({ ora: it.ora, prev: it.prev.cursa.lin + " " + it.prev.cursa.sens + " " + it.prev.cursa.schimb, next: it.next.cursa.lin + " " + it.next.cursa.sens + " " + it.next.cursa.schimb, gol: r1(it.gol), munca: r1(it.munca), acasa: r1(it.acasa), parc: r1(it.parc), golTure: r1(it.golTure), leg: r1(L), rest: r1(rest), laUz: L === 0 || bothUz });
      const minute = (it.t1 - it.t0) / 60e3;
      if (L > it.gol + it.munca + 1 && L > 1.05 * (it.gol + it.munca)) imposibile.push({ ora: it.ora, real: r1(it.gol + it.munca), leg: r1(L), motiv: 'legătura > drumul real' });
      if (L > 0 && minute < (L / 70) * 60) imposibile.push({ ora: it.ora, min: Math.round(minute), leg: r1(L), motiv: 'timp prea scurt pentru legătură' });
    }
    // nopțile: jumătatea de seară și cea de dimineață; idealul nopții împărțit proporțional cu km reali
    for (const [part, N] of [['dim', d.noapteDim], ['seara', d.noapteSeara]]) {
      const real = part === 'dim' ? st.dimGol : st.searaGol;
      const ctx = N; const E = ctx.de.st.E, Sx = ctx.la.st.S;
      const locB = ctx.balti && v.B === 'uzina' ? 'uzina' : v.N;
      const nn = await noapte(E, Sx, ctx.de.st.cL, ctx.la.st.cF, v.Q2, locB);
      const share = ctx.real > 0 ? nn.val * real / ctx.real : nn.val / 2;
      if ((ctx.weekend && v.W === 'separat')) { sep.weekend += real - share; continue; }
      if (ctx.balti && v.B === 'separat') { sep.balti += real - share; continue; }
      gol += real; links += share;
      const c = real - share;
      if (ctx.balti) cauze.noapteBalti += c; else if (ctx.weekend) cauze.noapteWeekend += c; else cauze.noapte += c;
    }
    const totalReal = cuoG + munca + gol;
    const ideal = cuoI + munca + links;
    const econ = totalReal - ideal;
    const sumC = Object.values(cauze).reduce((a, b) => a + b, 0);
    rows.push({ m: z.m, z: z.z, dow: z.dow, total: z.total, totalCons: r1(totalReal), cuOameni: r1(cuoG), cuOameniIdeal: r1(cuoI), munca: r1(munca), gol: r1(gol),
      ideal: r1(ideal), economie: r1(econ), cauze: Object.fromEntries(Object.entries(cauze).map(([k, x]) => [k, r1(x)])), sumCauze: r1(sumC), separat: { weekend: r1(sep.weekend), balti: r1(sep.balti) },
      exclus: d.exclus, imposibile, intervale, noapteDim: { weekend: d.noapteDim.weekend, balti: d.noapteDim.balti }, noapteSeara: { weekend: d.noapteSeara.weekend, balti: d.noapteSeara.balti }, tipar: z.tipar });
  }
  return rows;
}
const sumRows = (rows) => {
  const s = { zile: rows.length, total: 0, cuOameni: 0, ideal: 0, gol: 0, economie: 0, cauze: {}, separat: { weekend: 0, balti: 0 } };
  for (const r of rows) { for (const k of ['total', 'cuOameni', 'ideal', 'gol', 'economie']) s[k] += r[k === 'total' ? 'totalCons' : k]; for (const [k, x] of Object.entries(r.cauze)) s.cauze[k] = (s.cauze[k] || 0) + x; s.separat.weekend += r.separat.weekend; s.separat.balti += r.separat.balti; }
  for (const k of ['total', 'cuOameni', 'ideal', 'gol', 'economie']) s[k] = r1(s[k]); for (const k in s.cauze) s.cauze[k] = r1(s.cauze[k]); s.separat.weekend = r1(s.separat.weekend); s.separat.balti = r1(s.separat.balti);
  return s;
};
const probe = (rows) => ({
  economiePesteGol: rows.filter((r) => r.economie > r.gol + 0.5).map((r) => ({ m: r.m, z: r.z, economie: r.economie, gol: r.gol })),
  idealSubCuOameni: rows.filter((r) => r.ideal < r.cuOameni - 0.5).map((r) => ({ m: r.m, z: r.z, ideal: r.ideal, cuOameni: r.cuOameni })),
  sumaCauzeDif: rows.filter((r) => Math.abs(r.sumCauze - r.economie) > 0.3).map((r) => ({ m: r.m, z: r.z, e: r.economie, s: r.sumCauze })),
  bilantTotal: rows.filter((r) => Math.abs(r.totalCons - r.total) > 0.3).map((r) => ({ m: r.m, z: r.z, total: r.total, cons: r.totalCons })),
  economieNegativa: rows.filter((r) => r.economie < -0.5).map((r) => ({ m: r.m, z: r.z, economie: r.economie })),
  imposibile: rows.filter((r) => r.imposibile.length).map((r) => ({ m: r.m, z: r.z, x: r.imposibile })),
  drumLungNegativ: rows.filter((r) => r.cauze.drumLung < -2).map((r) => ({ m: r.m, z: r.z, drumLung: r.cauze.drumLung })),
});
const peMasinaSum = (rows) => { const g = {}; for (const r of rows) (g[r.m] ??= []).push(r); return Object.fromEntries(Object.entries(g).map(([m, L]) => { const s = sumRows(L); return [m, { ...s, peZi: r1(s.economie / L.length) }]; })); };

const baza = { Q1: 'gps', Q2: 'valhalla', N: 'capat', W: 'inclus', B: 'ca_orice', X: 'toate' };
const grila = [];
for (const Q1 of ['gps', 'etalon']) for (const Q2 of ['valhalla', 'etalon']) for (const N of ['capat', 'uzina', 'min']) for (const Wk of ['inclus', 'separat']) for (const B of ['ca_orice', 'uzina', 'separat']) for (const X of ['toate', 'faraExcluse']) grila.push({ Q1, Q2, N, W: Wk, B, X });
const cheie = (v) => `${v.Q1}/${v.Q2}/${v.N}/${v.W}/${v.B}/${v.X}`;
const rez = {};
for (const v of grila) { const rows = await varianta(v); rez[cheie(v)] = { v, flota: sumRows(rows), probe: Object.fromEntries(Object.entries(probe(rows)).map(([k, L]) => [k, L.length])), _rows: rows }; }
const extra = [{ ...baza, N: "min", W: "separat", B: "uzina", X: "faraExcluseDeLamurit", T: 0 }, { ...baza, N: "min", W: "separat", B: "uzina", X: "faraExcluseDeLamurit", T: 1 }, { ...baza, T: 1 }];
for (const v of extra) { const rows = await varianta(v); rez[cheie(v) + (v.T ? "/tol" : "") + (v.X === "faraExcluseDeLamurit" ? "" : "")] = { v, flota: sumRows(rows), probe: Object.fromEntries(Object.entries(probe(rows)).map(([k, L]) => [k, L.length])), _rows: rows }; }
const RECOM = cheie(extra[1]) + "/tol";
salveazaCache();
if (NULE.length) console.error('Valhalla null', NULE.length);

// ---- reguli4 (cele 3 reguli de pe pagină) pe mașină
const r4 = Object.fromEntries(A.reguli4.masini.map((x) => [x.m, { total: x.total, R1: x.R1?.propus ? x.R1.km : 0, R1toate: x.R1?.km ?? 0, R4: x.R4, R2: x.R2, balti: x.balti }]));
const base = rez[cheie(baza)];
const pm = peMasinaSum(base._rows); const pmR = peMasinaSum(rez[RECOM]._rows);
const comparatie = Object.entries(pm).map(([m, s]) => ({ m, zile: s.zile, economie: s.economie, peZi: s.peZi, recomandat: pmR[m]?.economie ?? null, recomandatZile: pmR[m]?.zile ?? 0, noapte: r1((s.cauze.noapte || 0) + (s.cauze.noapteWeekend || 0) + (s.cauze.noapteBalti || 0)), acasa: s.cauze.acasa, laUzina: s.cauze.laUzina, drumLung: s.cauze.drumLung, golTure: s.cauze.golTure,
  r4total: r4[m]?.total ?? 0, r4R1: r4[m]?.R1 ?? 0, r4R1toate: r4[m]?.R1toate ?? 0, r4R4: r4[m]?.R4 ?? 0, r4balti: r4[m]?.balti ?? 0 })).sort((a, b) => b.economie - a.economie);

const exemple = {};
for (const m of ['710CWN', '925FTI']) {
  exemple[m] = {};
  for (const k of [cheie(baza), cheie({ ...baza, Q1: 'etalon', Q2: 'etalon' }), cheie({ ...baza, N: 'uzina' }), cheie({ ...baza, Q1: 'etalon', Q2: 'etalon', N: 'uzina' }), cheie({ ...baza, W: 'separat' })]) {
    const rr = rez[k]._rows.filter((r) => r.m === m); const s = sumRows(rr);
    exemple[m][k] = { ...s, peZi: r1(s.economie / rr.length), idealPeZi: r1(s.ideal / rr.length), zile: rr.map((r) => ({ z: r.z, total: r.total, ideal: r.ideal, economie: r.economie, cauze: r.cauze })) };
  }
}
const out = { rulat: new Date().toISOString(), sursa: W, parametri: { UZ_R, CAP_R, legaturaImposibila: 'L > 1,05 × real + 1 km sau timp < L / 70 km/h' }, contoare: cnt,
  baza: cheie(baza), recomandat: RECOM, probeDetaliiRecomandat: probe(rez[RECOM]._rows),
  variante: Object.fromEntries(Object.entries(rez).map(([k, x]) => [k, { flota: x.flota, probe: x.probe }])),
  probeDetaliiBaza: probe(base._rows),
  probeDetaliiEtalon: probe(rez[cheie({ ...baza, Q1: 'etalon', Q2: 'etalon' })]._rows),
  comparatieReguli4: comparatie, reguli4Flota: A.reguli4.flota, exemple,
  randuriBaza: base._rows };
writeFileSync(OUT, JSON.stringify(out));
console.log('ok', Object.keys(rez).length, 'variante; baza', JSON.stringify(base.flota), JSON.stringify(base.probe), JSON.stringify(cnt));
