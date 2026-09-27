// Ideal-v3.1 (ION-99) pasul 1e-a — PRAGUL GOLULUI DE SEMNAL, măsurat pe flotă, și golurile fiecărei curse. Pur: citește goluri-brute.json
// (extragerea doar-citire din tracker, goluri-scan.mjs: histograma pașilor dintre puncte + perechile dt > 60 s și d > 0,3 km pe fiecare
// dispozitiv din curse-ideal.json) și curse-ideal.json; scrie goluri-prag.json (pragul, cu derivarea) și goluri-curse.json.
// Definiția (regula lui Ion, 27.09: «fă cârpiri dacă sare GPS-ul»; brief ION-99): GOL = două puncte CONSECUTIVE ale aceluiași dispozitiv,
// în aceeași cursă, cu
//   · dt > T_DT: T_DT = cea mai mică margine de treaptă a histogramei «dt» (perechi în mișcare, d > 0,05 km) sub care stau ≥ 99,9 % din
//     perechi — pasul de raportare normal al trackerelor, cu coada lui;
//   · d > T_D: T_D = cea mai mică margine a histogramei «d60» (perechile cu pas normal, dt ≤ 60 s) sub care stau ≥ 99,9 % — cât poate
//     parcurge un autobuz între două raportări normale;
//   · viteza implicită pe dreaptă d / dt ≤ V_MAX 130 km/h (gardă: peste ea e salt de coordonate, nu gol; numărat separat, necârpit).
// Golul la marginea cursei (punctul dinainte e în poartă sau în altă cursă, inclusiv golurile > 2 h la care curse.mjs taie) nu se cârpește
// aici — se numără (cursa nu-l conține).
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
const DIR = '../../date/ideal-v4.1';
const scrie = (f, x) => { writeFileSync(f + '.tmp', x); renameSync(f + '.tmp', f); };
const G = JSON.parse(readFileSync(`${DIR}/proba/goluri-brute.json`, 'utf8'));
const D = JSON.parse(readFileSync(`${DIR}/curse-ideal.json`, 'utf8'));
const COTA = 0.999, V_MAX = 130;
const agr = k => { const m = new Map(); for (const d of Object.values(G.dispozitive)) for (const h of d.hist) if (h.k === k) { const x = m.get(h.b) || { n: 0, s: 0 }; x.n += h.n; x.s += h.s; m.set(h.b, x); } return [...m].sort((a, b) => a[0] - b[0]); };
const prag = k => { const H = agr(k), tot = H.reduce((s, [, x]) => s + x.n, 0); let c = 0; const cum = [];
  for (const [b, x] of H) { c += x.n; cum.push({ pana_la: b, n: x.n, km: +x.s.toFixed(1), cota: +(c / tot).toFixed(6) }); }
  return { prag: cum.find(r => r.cota >= COTA).pana_la, total: tot, trepte: cum }; };
const PDT = prag('dt'), PD = prag('d60');
// extragerea a adus doar perechile dt > 60 s și d > 0,3 km: pragul efectiv nu coboară sub ele (dacă măsurarea dă mai puțin, se spune)
const T_DT = Math.max(PDT.prag, 60), T_D = Math.max(PD.prag, 0.3);
// cursele pe dispozitiv, sortate; golul intră în cursa care conține AMBELE puncte
const peDev = new Map(); for (const c of D.curse) { const k = String(c.dev); (peDev.get(k) ?? peDev.set(k, []).get(k)).push(c); }
for (const a of peDev.values()) a.sort((x, y) => String(x.t0).localeCompare(String(y.t0)));
const iso = t => new Date(t).toISOString();
const cheie = c => `${c.m}|${c.dev}|${iso(c.t0)}`;
const perCursa = new Map(); const st = { candidate: 0, goluri: 0, salturiCoord: 0, margine: 0, margineKmDrept: 0, peste2h: 0, inAfaraCurselor: 0 };
for (const [dev, arr] of Object.entries(G.dispozitive)) {
  const cs = peDev.get(dev) || [];
  for (const g of arr.goluri) {
    st.candidate++;
    if (!(g.dt > T_DT && g.d > T_D)) continue;
    if (g.d / (g.dt / 3600) > V_MAX) { st.salturiCoord++; continue; }
    st.goluri++;
    const t0 = Date.parse(g.t0), t1 = Date.parse(g.t1);
    const c = cs.find(x => Date.parse(x.t0) <= t0 && t1 <= Date.parse(x.t1));
    if (c) { const k = cheie(c); (perCursa.get(k) ?? perCursa.set(k, { m: c.m, dev: c.dev, t0: iso(c.t0), t1: iso(c.t1), km: c.km, goluri: [] }).get(k)).goluri.push(g); continue; }
    const m = cs.find(x => Date.parse(x.t0) === t1 || Date.parse(x.t1) === t0);
    if (m) { st.margine++; st.margineKmDrept += g.d; if (g.dt > 7200) st.peste2h++; } else st.inAfaraCurselor++;
  }
}
st.margineKmDrept = +st.margineKmDrept.toFixed(1);
const out = { versiune: 'goluri-prag v1 (ION-99)', cota: COTA, V_MAX, T_DT, T_D, dt: PDT, d60: PD, statistica: st,
  curseCuGol: perCursa.size, goluriInCurse: [...perCursa.values()].reduce((s, x) => s + x.goluri.length, 0) };
scrie(`${DIR}/goluri-prag.json`, JSON.stringify(out, null, 1));
scrie(`${DIR}/goluri-curse.json`, JSON.stringify([...perCursa.values()]));
console.log(`prag dt: > ${T_DT} s (măsurat ${PDT.prag} s: ≥ ${100 * COTA} % din ${PDT.total} perechi în mișcare au dt ≤ ${PDT.prag} s) · prag d: > ${T_D} km (măsurat ${PD.prag} km: ≥ ${100 * COTA} % din ${PD.total} perechi cu pas normal) · V_MAX ${V_MAX} km/h`);
console.log('dt:  ' + PDT.trepte.map(r => `≤${r.pana_la}s ${r.n} (${(100 * r.cota).toFixed(3)}%)`).join(' · '));
console.log('d60: ' + PD.trepte.map(r => `≤${r.pana_la}km ${r.n} (${(100 * r.cota).toFixed(3)}%)`).join(' · '));
console.log(`candidate (dt > 60 s, d > 0,3 km): ${st.candidate} · goluri peste prag: ${st.goluri} · salturi de coordonate (> ${V_MAX} km/h): ${st.salturiCoord}`);
console.log(`în curse: ${out.goluriInCurse} goluri în ${out.curseCuGol} curse · la marginea cursei: ${st.margine} (${st.margineKmDrept} km pe dreaptă; > 2 h: ${st.peste2h}) · în afara curselor: ${st.inAfaraCurselor}`);
