// Pasul 5: alegerea zilei și IDEALUL fiecărei linii (ION-71), după floresti/cod/alege.mjs.
// Sursa se hotărăște O SINGURĂ DATĂ aici, cu lista de sate a aceleiași surse:
//  (1) sept: zile bune = candidate cu urmă din septembrie, tur/retur pe urmă ≤18 %, turul prin toate satele regulate[sept][tur],
//      returul prin regulate[sept][retur]; ≥3 → sursa sept;
//  (2) altfel, cât timp mai sunt candidate neîncercate sub plafon → deCompletat (pasul 4 desenează lotul următor);
//  (3) la plafon / epuizare: la fel cu «toate»; sursa toate DOAR cu ≥3 zile bune;
//  (4) etalon = mediana km-ilor PE URMĂ (tururi + retururi) ale zilelor bune; (5) ziua = dintre cele în ±5 % de etalon, cu cele mai
//      multe opriri reale în satele din act, apoi tur ≈ retur; altfel cea mai apropiată (departeDeEtalon);
//  (6) asim: fără 3 zile bune nicăieri, dar cu candidate care trec satele regulate → ziua cu diferența minimă; km = turul desenat.
// Idealul = turul zilei alese; returul = același drum; ture/zi = tureZi[sursa] (→ toate → act, cu steag); kmZi = 2 × km × ture/zi.
// Linia «*» (mașina din grafic fără start KW24) intră în total doar dacă ruta ei n-are nicio linie din act cu ideal.
import { writeFileSync as __wfs, renameSync as __rn } from 'node:fs';
const scrieAtomic = (f, x) => { __wfs(f + '.tmp', x); __rn(f + '.tmp', f); };   // F3 v5 (R3-1): fără rescriere pe loc
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const E = JSON.parse(readFileSync('../../date/ideal-v4.1/etalon-ideal.json', 'utf8'));
const SC = existsSync('../../date/ideal-v4.1/schelet-cand.json') ? JSON.parse(readFileSync('../../date/ideal-v4.1/schelet-cand.json', 'utf8')) : { cand: {}, incercate: {} };
const RG = JSON.parse(readFileSync('../../date/ideal-v4.1/regulate-ideal.json', 'utf8'));
const O = JSON.parse(readFileSync('../../date/ideal-v4.1/obs-ideal.json', 'utf8'));
const D = JSON.parse(readFileSync('../../date/ideal-v4.1/curse-ideal.json', 'utf8'));
const N = JSON.parse(readFileSync('../../date/ideal-v4.1/nomenclator.json', 'utf8'));
const OUT = '../../date/ideal-v4.1/schelet-ideal.json', DC = '../../date/ideal-v4.1/de-completat.json';
const SEPT = "2026-09-01", PLAFON = 24, DIF = 0.18, R_SAT = 1.2, R_TRECE = 1.5, R_OPR = 0.8, APROAPE = 0.05;
const cur = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const ALIAS = { mihaileniivechi: 'mihaileni', dobrujaveche: 'dobrogeaveche', satmarculesti: 'marculesti', zorojeni: 'zarojeni',
  grigoreuca: 'grigorauca', ustea: 'ustia', iezarenivechi: 'iezareniivechi', garacatranic: 'catranic', funduriivechi: 'fundurivechi', fundurivechi: 'funduriivechi' };
const kk = s => { const k = cur(s); return [k, ALIAS[k]].filter(Boolean); };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const hc = (p, t) => hav({ lat: p[0], lon: p[1] }, t);
const med = a => { const q = [...a].sort((x, y) => x - y); const n = q.length; return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : 0; };
const modul = a => { const c = new Map(); for (const x of a) if (x) c.set(x, (c.get(x) || 0) + 1); return [...c].sort((p, q) => q[1] - p[1])[0]?.[0] || null; };
const byK = new Map(); for (const t of D.tinte) { if (!byK.has(t.k)) byK.set(t.k, []); byK.get(t.k).push(t); }
const tinteSat = nume => kk(nume).flatMap(k => byK.get(k) || []);
// satul e «trecut» de drum dacă drumul ajunge la ≤1,2 km de o țintă cu numele lui; sat fără loc în index nu blochează
const trece = (plin, nume, cap) => { const T = tinteSat(nume); if (!T.length) return true; if (cap && T.some(t => hav(t, cap) < 0.05)) return true; return T.some(t => plin.some(p => hc(p, t) <= R_TRECE)); };
// v3 (ION-97) pct. 4: cheia observației = mașină | dispozitiv | t0 | SENS. În v2 (`m|t0`) cursa poartă → sat → poartă (rt) poate da DOUĂ
// observații cu același t0 (tur și retur) și returul ar suprascrie turul. Măsurat pe fereastra de azi: 0 coliziuni (la rt doar un picior
// cade în ferestrele FER, celălalt n-are schimb), deci corecția e preventivă, fără efect pe rezultat.
// Candidatele desenate de v2 (schelet-cand.json) n-au `dev`: se caută pe m|t0|sens și se iau doar dacă cheia e unică (altfel se numără).
const obsK = new Map(), obsMTS = new Map();
for (const c of O.curse) if (c.schimb) { obsK.set(`${c.m}|${c.dev ?? ''}|${c.t0}|${c.sens}`, c); const k = `${c.m}|${c.t0}|${c.sens}`; (obsMTS.get(k) ?? obsMTS.set(k, []).get(k)).push(c); }
let ambigue = 0, candMutate = 0;
const obsDe = (m, o, sens) => { if (!o) return undefined; if (o.dev != null) { const x = obsK.get(`${m}|${o.dev}|${o.t0}|${sens}`); if (x) return x; }
  const l = obsMTS.get(`${m}|${o.t0}|${sens}`) || []; if (l.length > 1) { ambigue++; return undefined; } return l[0]; };
const oameni = (c, sens) => c ? c.opr.filter(o => sens === 'tur' ? o.km >= c.kmCap - R_OPR : o.km <= c.kmCap + R_OPR) : [];
const opresteIn = (opr, nume) => tinteSat(nume).some(t => opr.some(o => hav(o, t) <= R_SAT));
const sateAct = e => e.sate.filter(n => !/^dra\d?$/i.test(cur(n)));
const opriri = (cand, e) => { let n = 0; for (const sens of ['tur', 'retur']) { const c = obsDe(cand.m, cand[sens], sens); const op = oameni(c, sens); for (const s of sateAct(e)) if (opresteIn(op, s)) n++; } return n; };
const dif = c => Math.abs(c.tur.km - c.retur.km) / Math.max(c.tur.km, c.retur.km);
const OUTL = [], DCL = [], rap = [];
for (const e of E) {
  const key = e.ruta + '|' + e.linie;
  const base = { ruta: e.ruta, nr: e.nr, nume: e.nume, linie: e.linie, gps: e.gps, capat: e.capat, capatC: e.capatC, kmKW24: e.kmKW24, locuri: e.locuri, autobuze: e.autobuze,
    sate: e.sate, masini: e.masini, nCand: e.nCand, tureZiE: e.tureZi };
  if (!e.cand.length) { OUTL.push({ ...base, faraIdeal: true, motiv: 'nicio candidată (nicio zi cu tur și retur la capăt)' }); continue; }
  // v3.1 (ION-99): o candidată din cache (schelet-cand.json, desenată de v2) rămâne a liniei doar dacă turul și returul ei sunt încă observații
  // ale ACESTEI rute|linii (regula satelor în ordine poate muta picioare pe altă linie — ex. 345KAJ R3|Recea* → R6 după 14.09)
  const ramane = c => ['tur', 'retur'].every(s => { const o = obsDe(c.m, c[s], s); return !o || (o.ruta === e.ruta && o.linie === e.linie && !o.exclusEtalon); });   // fără observație: ca în v3 (păstrată); piciorul scos din etalon (dezbaterea 27.09 pct. 4) scoate candidata
  const candsCache = Object.values(SC.cand).filter(c => c.ruta === e.ruta && c.linie === e.linie);
  const cands = candsCache.filter(ramane); candMutate += candsCache.length - cands.length;
  const nInc = Object.keys(SC.incercate).filter(k => k.startsWith(key + '|')).length;
  const tried = cands.length + nInc, rest = e.cand.length - tried, plafon = tried >= PLAFON || rest <= 0;
  const reg = RG.linii[key]; const cap = e.capatC ? { lat: e.capatC[0], lon: e.capatC[1] } : null;
  const bune = sursa => cands.filter(c => (sursa === 'toate' || c.zi >= SEPT) && dif(c) <= DIF
    && reg[sursa].tur.regulate.every(v => trece(c.tur.plin, v, cap)) && reg[sursa].retur.regulate.every(v => trece(c.retur.plin, v, cap)));
  const bS = bune('sept'), bT = bune('toate');
  let sursa = null, B = bS, deCompletat = false;
  if (bS.length >= 3) sursa = 'sept';
  else if (!plafon) deCompletat = true;
  else if (bT.length >= 3) { sursa = 'toate'; B = bT; }
  if (deCompletat) { OUTL.push({ ...base, deCompletat: true, zileBune: { sept: bS.length, toate: bT.length }, incercate: tried }); DCL.push(key); continue; }
  let ales = null, asim = false, departe = false, km = null, etalon = null;
  if (sursa) {
    etalon = +med(B.flatMap(c => [c.tur.km, c.retur.km])).toFixed(1);
    const inA = B.filter(c => Math.abs(c.tur.km - etalon) / etalon <= APROAPE);
    if (inA.length) ales = inA.slice().sort((a, b) => opriri(b, e) - opriri(a, e) || dif(a) - dif(b))[0];
    else { ales = B.slice().sort((a, b) => Math.abs(a.tur.km - etalon) - Math.abs(b.tur.km - etalon))[0]; departe = true; }
    km = etalon;
  } else {
    const sA = e.nCand.sept >= e.nCand.toate - e.nCand.sept ? 'sept' : 'toate';
    const A = cands.filter(c => (sA === 'toate' || c.zi >= SEPT) && reg[sA].tur.regulate.every(v => trece(c.tur.plin, v, cap)) && reg[sA].retur.regulate.every(v => trece(c.retur.plin, v, cap)));
    if (A.length) { ales = A.slice().sort((a, b) => dif(a) - dif(b))[0]; asim = true; sursa = sA; km = ales.tur.km; B = [ales]; }
  }
  if (ales && e.gps && !(sursa && B.length >= 3 && !asim)) ales = null;   // linia * intră doar cu ≥3 zile bune
  if (!ales) { OUTL.push({ ...base, faraIdeal: true, incercate: tried, motiv: cands.length ? `nicio candidată nu trece satele regulate (${cands.length} cu urmă)` : `nicio urmă la capăt (${tried} încercate)` }); continue; }
  let tz = e.tureZi[sursa], tzFlag = null;
  if (tz == null) { tz = e.tureZi.toate; tzFlag = 'tureZiDinToate'; }
  if (tz == null) { tz = ((e.autobuze?.EZ || 0) + (e.autobuze?.D || 0)) || 1; tzFlag = 'tureZiDinAct'; }
  const turM = +med(B.map(c => c.tur.km)).toFixed(1), returM = +med(B.map(c => c.retur.km)).toFixed(1);
  const cT = obsDe(ales.m, ales.tur, 'tur'), cR = obsDe(ales.m, ales.retur, 'retur');
  const opT = oameni(cT, 'tur'), opR = oameni(cR, 'retur');
  const pr = new Map(reg[sursa].tur.procent.map(x => [x.n, x.p]));
  const sateZi = sateAct(e).map(n => ({ n, p: pr.get(n) ?? 0, st: opresteIn(opT, n) || opresteIn(opR, n) ? 'opreste' : (trece(ales.tur.plin, n) || trece(ales.retur.plin, n)) ? 'trece' : 'lipseste' }));
  const schimburi = {};
  for (const s of ["s1", "s2"]) {
    const inSrc = z => sursa === "toate" || z >= SEPT;
    const ob = O.curse.filter(c => c.schimb === s && c.ruta === e.ruta && c.linie === e.linie && inSrc(c.zi));
    if (!ob.length) continue;
    const cs = cands.filter(c => c.schimb === s && inSrc(c.zi));
    const mas = new Map(); for (const c of ob) { if (!mas.has(c.m)) mas.set(c.m, new Set()); mas.get(c.m).add(c.zi); }
    schimburi[s] = { zile: new Set(ob.map(c => c.zi)).size, masini: [...mas].map(([m, z]) => ({ m, zile: z.size, grafic: e.masini.find(x => x.m === m)?.grafic ?? false })).sort((a, b) => b.zile - a.zile),
      km: cs.length ? { tur: +med(cs.map(c => c.tur.km)).toFixed(1), retur: +med(cs.map(c => c.retur.km)).toFixed(1), zile: cs.length } : null,
      oraTur: +med(ob.filter(c => c.sens === "tur").map(c => c.ora)).toFixed(2), oraRetur: +med(ob.filter(c => c.sens === "retur").map(c => c.ora)).toFixed(2),
      poartaTur: modul(ob.filter(c => c.sens === "tur").map(c => c.poarta)), poartaRetur: modul(ob.filter(c => c.sens === "retur").map(c => c.poarta)) };
  }
  OUTL.push({ ...base, sursa, etalon, km, tureZi: tz, schimburi, tureZiFlag: tzFlag, kmZi: +(2 * km * tz).toFixed(1), zileBune: { sept: bS.length, toate: bT.length }, incercate: tried, cuUrma: cands.length,
    zi: ales.zi, schimbZi: ales.schimb, masinaZi: ales.m, asim, departeDeEtalon: departe, dif: Math.round(100 * dif(ales)), turZi: ales.tur.km, returZi: ales.retur.km,
    poarta: modul(B.map(c => c.tur.poarta)) || ales.tur.poarta, drum: ales.tur.plin, sateDrum: ales.tur.sate,
    real: { tur: turM, retur: returM, dif: Math.round(100 * Math.abs(turM - returM) / Math.max(turM, returM)), poartaTur: modul(B.map(c => c.tur.poarta)), poartaRetur: modul(B.map(c => c.retur.poarta)) },
    sateZi, inPlus: reg[sursa].tur.inPlus, panaInIulie: reg.panaInIulie.tur, regulate: reg[sursa].tur.regulate });
}
// «*» doar dacă ruta n-are linie din act cu ideal
for (const l of OUTL) if (l.gps && l.km) l.informativ = OUTL.some(x => x.ruta === l.ruta && !x.gps && x.km);
scrieAtomic(OUT, JSON.stringify(OUTL));
scrieAtomic(DC, JSON.stringify(DCL));
for (const l of OUTL) {
  const tag = l.deCompletat ? `DE COMPLETAT (bune sept ${l.zileBune.sept}, încercate ${l.incercate}/${l.nCand.toate})` : l.faraIdeal ? `FĂRĂ IDEAL — ${l.motiv}` :
    `${l.zi} ${l.schimbZi} ${l.masinaZi}  km ${l.km} (tur ${l.turZi}/retur ${l.returZi}, real ${l.real.tur}/${l.real.retur} ${l.real.dif}%)  ture/zi ${l.tureZi}${l.tureZiFlag ? '!' : ''}  km/zi ${l.kmZi}  sursa ${l.sursa} (bune ${l.zileBune.sept}/${l.zileBune.toate}, urmă ${l.cuUrma}/${l.incercate})${l.asim ? '  ASIM' : ''}${l.departeDeEtalon ? '  departe de etalon' : ''}${l.informativ ? '  (informativ, ruta are linie din act)' : ''}`;
  console.log(`${l.ruta.padEnd(4)} ${l.linie.padEnd(18)} ${tag}`);
}
const cu = OUTL.filter(l => l.km && !l.informativ), act = OUTL.filter(l => !l.gps);
console.log(`\nlinii cu ideal: ${cu.length} (din act ${cu.filter(l => !l.gps).length}/${act.length}) · de completat: ${DCL.length} · fără ideal: ${OUTL.filter(l => l.faraIdeal).length} · asim ${cu.filter(l => l.asim).length} · departe de etalon ${cu.filter(l => l.departeDeEtalon).length} · sursa sept ${cu.filter(l => l.sursa === 'sept').length}`);
console.log(`km/zi total: ${cu.reduce((s, l) => s + l.kmZi, 0).toFixed(0)}`);
console.log(`cheia observației m|dev|t0|sens: căutări ambigue (fără dev, cheie neunică) ${ambigue}`);
console.log(`candidate din cache scoase pentru că picioarele lor sunt acum pe altă linie (v3.1): ${candMutate}`);
