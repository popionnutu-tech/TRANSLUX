// Drăxlmaier F2 — pasul 2: cursele din economie-curse.json primesc rută, linie, sens și schimb cu ACEEAȘI logică ca
// scheletul ideal (copie a drax/cod/ideal/etalon.mjs: RUTE, capetele liniilor, alege(), FER) — capetele liniilor se
// învață din curse-ideal.json (fereastra ION-71), nu din fereastra F2, ca liniile să fie exact cele din schelet.
// În plus față de obs-ideal: tCap (ora la capăt), aliasurile dispozitivelor duble, controlul față de obs-ideal.json
// pe 01–25.09 (aceeași cursă → aceeași linie și același schimb).
//   node etichete.mjs  →  date/economie-obs.json
import { readFileSync, existsSync } from 'node:fs';
import { D, PANA, hav, inFer, FER, ziLucru, oraLoc, scrieAtomic } from './comun.mjs';

const N = JSON.parse(readFileSync(`${D}/nomenclator.json`, 'utf8'));
const CI = JSON.parse(readFileSync(`${D}/curse-ideal.json`, 'utf8'));
const E = JSON.parse(readFileSync(`${D}/economie-curse.json`, 'utf8'));
// ION-110 (§4.1, migr. 412): capătul liniei din GPS când instantaneul săptămânii are capete-gps.json (idealul ≥ v4); altfel din act, ca înainte
const CAPETE_GPS = existsSync(`${D}/capete-gps.json`) ? JSON.parse(readFileSync(`${D}/capete-gps.json`, 'utf8')).linii : {};
const cur = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const canon = (s) => { const p = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const m = p.match(/^([A-Z]{3})(\d{3})$/); return m ? m[2] + m[1] : p; };
const ALIAS = { mihaileniivechi: 'mihaileni', dobrujaveche: 'dobrogeaveche', satmarculesti: 'marculesti', zorojeni: 'zarojeni',
  grigoreuca: 'grigorauca', ustea: 'ustia', iezarenivechi: 'iezareniivechi', garacatranic: 'catranic', funduriivechi: 'fundurivechi', fundurivechi: 'funduriivechi' };
const kk = (s) => { const k = cur(s); return [k, ALIAS[k]].filter(Boolean); };
const PORTI = N.porti;
// dispozitivele aceluiași autobuz (drax-schelet-rute, fix-350/fix-dubluri): numele autobuzului
export const ALIAS_M = { '0357544371228442': '880RNK', '350KAJ#2284': '350KAJ' };
const numeM = (m) => ALIAS_M[m] ?? m;

// ---- RUTE: copie etalon.mjs, numărătorile din curse-ideal (fereastra ION-71)
const cnt = new Map();
for (const c of CI.curse) for (const a of c.apr) cnt.set(c.m + '|' + a.id, (cnt.get(c.m + '|' + a.id) || 0) + 1);
const RUTE = N.rute.map((r) => {
  const sate = [...new Set([...r.sateNume, ...r.sate, ...r.sateDb].flatMap(kk))];
  const masini = new Set(Object.values(r.masini || {}).flat().map(canon));
  const linii = [];
  for (const l of r.linii) {
    const ks = kk(CAPETE_GPS[r.id + '|' + l.start] ?? l.start); const cand = CI.tinte.filter((g) => ks.includes(g.k));
    let best = null, bn = -1;
    const urm = r.sateNume[1] ? CI.tinte.filter((g) => kk(r.sateNume[1]).includes(g.k)) : [];
    for (const g of cand) { let n = 0; for (const m of masini) n += cnt.get(m + '|' + g.id) || 0;
      const dUrm = urm.length ? Math.min(...urm.map((u) => hav(g, u))) : null;
      const scor = n > 0 ? n : dUrm !== null ? -dUrm / 1000 : -1 - Math.abs(2 * hav(g, PORTI[0]) - l.km) / 1000;
      if (scor > bn) { bn = scor; best = g; } }
    // ION-110 (r2, M-a): ca în ideal-v4.1/etalon.mjs — la linia cu capăt din GPS se ține și startul din act
    const startAct = CAPETE_GPS[r.id + '|' + l.start] ? (CI.tinte.filter((g) => kk(l.start).includes(g.k)).sort((x, y) => (urm.length ? Math.min(...urm.map((u) => hav(x, u))) - Math.min(...urm.map((u) => hav(y, u))) : 0))[0] ?? null) : null;
    if (!linii.some((x) => x.capat && best && x.capat.id === best.id)) linii.push({ start: l.start, km: l.km, locuri: l.locuri, autobuze: l.autobuze, capat: best, n: bn, startAct });
  }
  linii.sort((a, b) => (b.capat ? hav(b.capat, PORTI[0]) : 0) - (a.capat ? hav(a.capat, PORTI[0]) : 0));
  return { ...r, k: sate, M: masini, LN: linii };
});
const R_CAPAT_CURSA = 2.5;
const atinse = (c) => new Set(c.apr.map((a) => a.k));
function alege(c, sens) {
  const at = atinse(c), ids = new Set(c.apr.map((a) => a.id)), p = sens === 'tur' ? c.a : c.b, pc = { lat: p[0], lon: p[1] }; let best = null;
  const laCapat = (g) => ids.has(g.id) || hav(g, pc) <= R_CAPAT_CURSA;
  const m = numeM(c.m);
  for (const r of RUTE) {
    const grafic = r.M.has(m);
    let lin = r.LN.find((l) => l.capat && laCapat(l.capat));
    // cursa care atinge doar startul din act rămâne pe linia ei (cursă scurtă, ca în v3.1), nu devine linie «*» și nu rămâne neetichetată
    if (!lin) { const x = r.LN.find((l) => l.startAct && laCapat(l.startAct)); if (x) lin = { ...x, capat: x.startAct, scurta: true }; }
    if (!lin && grafic) {
      const satele = CI.tinte.filter((g) => r.k.includes(g.k) && laCapat(g)).sort((x, y) => hav(y, PORTI[0]) - hav(x, PORTI[0]));
      if (satele.length) lin = { start: satele[0].n + '*', capat: satele[0], gps: true };
    }
    if (!lin) continue;
    const acop = r.k.filter((k) => at.has(k)).length / Math.max(1, r.k.length);
    const ap = c.apr.filter((a) => a.id === lin.capat.id);
    const kmCap = ap.length ? (sens === 'tur' ? ap[0].km : ap.at(-1).km) : (sens === 'tur' ? 0 : c.km);
    const plin = sens === 'tur' ? c.km - kmCap : kmCap, gol = c.km - plin;
    // ION-109 (Ion 27.09: «dacă au opriri și rutele sunt în schelet»): mașina din afara graficului nu mai e «tranzit» când cursa are
    // cel puțin 2 opriri de urcare/coborâre (20 s – 5 min, §4.5) în satele rutei — și în același sat, din mai multe puncte
    // (804MUM → R22, 144BRAZ → R38, 744ARF → R13: 4–5 opriri în Hăsnășenii Noi)
    // opririle scurte succesive din același sat pot veni unite într-una (744ARF: 5–13 min în Hăsnășenii Noi, capătul liniei R13)
    const oprRuta = (c.opr ?? []).filter((o) => o.sl >= 20 && o.sl <= 900 && kk(o.n).some((k) => r.k.includes(k)));
    const laCapatulLiniei = oprRuta.some((o) => o.sl >= 60 && hav(o, lin.capat) <= R_CAPAT_CURSA);
    if (!grafic && !(c.dinP && c.spreP) && gol > plin && oprRuta.length < 2 && !laCapatulLiniei) continue;
    const scor = acop + (grafic ? 0.5 : 0) + hav(lin.capat, PORTI[0]) / 1000;
    if (!best || scor > best.scor) best = { r, lin, scor, acop };
  }
  return best;
}

// ION-107 (decizia sesiunii 27.09): ruta și linia fiecărei curse se iau IMPLICIT din obs-ideal.json-ul instantaneului (scheletul
// activ la prima rulare a săptămânii, ex. ideal-v3.1 cu mutările «sate în ordine»: R3|Recea* → R6|Mihailenii Vechi), acolo unde are
// pereche (aceeași mașină, sens, |Δt0| ≤ 2 min); kmCap / plin / gol vin tot de acolo. Fără pereche rămâne alegerea F2 (alege()).
// ETICHETE_F2=1 = comportamentul vechi (doar alege()), numai pentru diagnostic; nu se folosește în rularea de luni.
const DIN_IDEAL = process.env.ETICHETE_F2 !== '1' && existsSync(`${D}/obs-ideal.json`);
const idealDe = new Map();
if (DIN_IDEAL) for (const q of JSON.parse(readFileSync(`${D}/obs-ideal.json`, 'utf8')).curse) {
  const k = `${q.m}|${q.sens}`; (idealDe.get(k) ?? idealDe.set(k, []).get(k)).push(q); }
const perecheIdeal = (m, sens, t0) => (idealDe.get(`${m}|${sens}`) ?? []).find((q) => Math.abs(Date.parse(q.t0) - t0) <= 120e3) ?? null;
const tLaKm = (c, km) => { const a = [...c.apr].sort((x, y) => Math.abs(x.km - km) - Math.abs(y.km - km))[0];
  if (a && Math.abs(a.km - km) <= 0.5) return typeof a.t === 'string' ? Date.parse(a.t) : a.t;
  return Math.round(c.t0 + (c.t1 - c.t0) * Math.min(1, Math.max(0, km / Math.max(c.km, 0.01)))); };
let mutateDinIdeal = 0;
const obs = [];
let fara = 0;
for (const c of E.curse) {
  if (!(c.dinP || c.spreP)) continue;
  const sensuri = []; if (c.spreP) sensuri.push('tur'); if (c.dinP) sensuri.push('retur');
  for (const sens of sensuri) {
    const tp = sens === 'tur' ? c.t1 : c.t0, h = oraLoc(tp);
    const b = alege(c, sens); if (!b) { fara++; continue; }
    const s = Object.entries(FER[sens]).filter(([, f]) => inFer(h, f)).map(([s]) => s)[0] || null;
    const ap = c.apr.filter((a) => a.id === b.lin.capat.id);
    let a;
    if (c.dinP && c.spreP) a = sens === 'retur' ? ap[0] : ap.at(-1);
    else a = sens === 'tur' ? ap[0] : ap.at(-1);
    const faraCap = !a;
    if (!a) a = { km: sens === 'tur' ? 0 : c.km, t: sens === 'tur' ? c.t0 : c.t1 };
    const plin = sens === 'tur' ? c.km - a.km : a.km;
    const gol = c.dinP && c.spreP ? 0 : c.km - plin;
    if (plin < 0.5) continue;
    obs.push({ m: numeM(c.m), dev: c.m, zi: ziLucru(tp), schimb: s, sens, ruta: b.r.id, linie: b.lin.start, t0: c.t0, t1: c.t1,
      tCap: typeof a.t === 'string' ? Date.parse(a.t) : a.t, faraCap, ora: +h.toFixed(2), kmCap: +a.km.toFixed(2), plin: +plin.toFixed(1),
      gol: +gol.toFixed(1), km: c.km, rt: c.dinP && c.spreP, poarta: sens === 'tur' ? c.pOut : c.pIn, grafic: b.r.M.has(numeM(c.m)),
      acop: +b.acop.toFixed(2), afara: !s, a: c.a, b: c.b, opr: c.opr });
    const q = DIN_IDEAL ? perecheIdeal(numeM(c.m), sens, c.t0) : null;
    if (q && (q.ruta !== b.r.id || q.linie !== b.lin.start)) {
      const o = obs.at(-1);
      Object.assign(o, { ruta: q.ruta, linie: q.linie, kmCap: q.kmCap, plin: q.plin, gol: q.gol, tCap: tLaKm(c, q.kmCap), faraCap: false,
        grafic: q.grafic, acop: q.acop, dinIdeal: `${b.r.id}|${b.lin.start}` });
      mutateDinIdeal++;
    }
  }
}
// dispozitivele duble: aceeași cursă (aceeași zi, |Δt0| ≤ 3 min, |Δkm| ≤ 1) de la două dispozitive → una (fix-dubluri.mjs)
const unice = [], dubluri = [];
for (const o of obs.sort((x, y) => x.t0 - y.t0)) {
  // același autobuz, două dispozitive: rămâne cursa mai lungă (dispozitivul vechi al lui 350KAJ are goluri de semnal, 07–10.09)
  const i = unice.findIndex((u) => u.m === o.m && u.dev !== o.dev && u.sens === o.sens && Math.abs(u.t0 - o.t0) <= 180e3);
  if (i < 0) unice.push(o);
  else { const u = unice[i]; dubluri.push({ m: o.m, zi: o.zi, pastrat: o.km > u.km ? o.dev : u.dev, scos: o.km > u.km ? u.dev : o.dev, dkm: +Math.abs(o.km - u.km).toFixed(1) }); if (o.km > u.km) unice[i] = o; }
}
// controlul față de obs-ideal (01–25.09): aceeași mașină, sens, |Δt0| ≤ 2 min → aceeași rută|linie|schimb?
// controlul față de obs-ideal (ION-71) pe intersecția ferestrelor: de la F2_CTRL_DE (implicit 01.09, începutul lui septembrie în ION-71)
// până la ziua ultimă a ferestrei F2, cel mult 25.09 (ultima zi din obs-ideal)
const CTRL_DE = process.env.F2_CTRL_DE || '2026-09-01', CTRL_PANA = PANA < '2026-09-25' ? PANA : '2026-09-25';
const OI = JSON.parse(readFileSync(`${D}/obs-ideal.json`, 'utf8')).curse.filter((o) => o.zi >= CTRL_DE);
const ix = new Map(); for (const o of OI) { const k = `${o.m}|${o.sens}`; (ix.get(k) ?? ix.set(k, []).get(k)).push(o); }
let potr = 0, dif = 0, lipsa = 0; const exDif = [];
for (const o of unice.filter((o) => o.zi >= CTRL_DE && o.zi <= CTRL_PANA)) {
  const q = (ix.get(`${o.m}|${o.sens}`) ?? []).find((x) => Math.abs(Date.parse(x.t0) - o.t0) <= 120e3);
  if (!q) { lipsa++; continue; }
  if (q.ruta === o.ruta && q.linie === o.linie && q.schimb === o.schimb) potr++; else { dif++; if (exDif.length < 8) exDif.push(`${o.m} ${o.zi} ${o.sens}: ideal ${q.ruta}|${q.linie}|${q.schimb} vs F2 ${o.ruta}|${o.linie}|${o.schimb}`); }
}
const inversLipsa = OI.filter((q) => q.zi <= CTRL_PANA && !unice.some((o) => o.m === q.m && o.sens === q.sens && Math.abs(Date.parse(q.t0) - o.t0) <= 120e3)).length;
console.log(`curse etichetate: ${unice.length} (cu schimb ${unice.filter((o) => o.schimb).length}, în afara ferestrelor ${unice.filter((o) => !o.schimb).length}) · fără rută: ${fara} · dubluri scoase: ${dubluri.length}`);
console.log(`control față de obs-ideal (01–25.09): aceeași linie și schimb ${potr} · diferă ${dif} · F2 fără pereche în ideal ${lipsa} · ideal fără pereche în F2 ${inversLipsa}`);
for (const x of exDif) console.log('   ' + x);
console.log(DIN_IDEAL ? `etichete din obs-ideal (ION-107): ${mutateDinIdeal} picioare cu altă rută|linie decât alegerea F2` : 'etichete: doar alegerea F2 (ETICHETE_F2=1 sau fără obs-ideal.json)');
scrieAtomic(`${D}/economie-obs.json`, { curse: unice, dubluri, control: { potr, dif, lipsa, inversLipsa, exDif } });
