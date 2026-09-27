// Proba pct. 2 (regimul): (a) v3 (faza A/B) = v2 (impare/pare) pe fereastra actuală, linie cu linie; (b) trecerea 52 → 53 → 1 → 2:
// faza de la ancoră alternează, paritatea ISO nu; (c) o linie sintetică cu rotație strictă peste Anul Nou, clasificată cu regula
// schimburi.mjs (majoritate ≥ 0,8) pe fază și pe paritate.
import { readFileSync } from 'node:fs';
import { fazaSapt, luniSapt } from '/root/lde-worker/drax/cod/ideal-v3/timp.mjs';
const D = '/root/lde-worker/drax/date/ideal-v3/';
const A = JSON.parse(readFileSync(D + 'proba/v2/schimburi-ideal.json', 'utf8')), B = JSON.parse(readFileSync(D + 'schimburi-ideal.json', 'utf8'));
const CA = JSON.parse(readFileSync(D + 'proba/v2/care-schimb-ideal.json', 'utf8')), CB = JSON.parse(readFileSync(D + 'care-schimb-ideal.json', 'utf8'));
const mapF = { impare: 'A', pare: 'B' };
let n = 0, dif = [];
for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) { n++; const a = A[k], b = B[k]; if (!a || !b) { dif.push(k + ' lipsă'); continue; }
  const ga = a.gps.tip === 'rotatie' ? { tip: 'rotatie', A: a.gps.impare, B: a.gps.pare } : a.gps;
  const ia = a.ideal?.tip === 'rotatie' ? { tip: 'rotatie', A: a.ideal.impare, B: a.ideal.pare } : a.ideal;
  const same = a.regim === b.regim && (a.par ? mapF[a.par] : null) === b.faza && JSON.stringify(ga) === JSON.stringify(b.gps) && JSON.stringify(ia) === JSON.stringify(b.ideal)
    && a.dupaAct === b.dupaAct && JSON.stringify(a.cnt) === JSON.stringify(b.cnt) && JSON.stringify(a.ore) === JSON.stringify(b.ore)
    && a.sapt.every((w, i) => w.iso === b.sapt[i].iso && w.tip === b.sapt[i].tip && (w.iso % 2 ? 'A' : 'B') === b.sapt[i].faza);
  if (!same) dif.push(k); }
const lst = (o, w, s) => JSON.stringify(o[w][s].map(x => x.ruta + '|' + x.linie + (x.doar ? '·doar' : '')));
const csOk = ['s1', 's2'].every(s => lst(CA, 'impare', s) === lst(CB, 'A', s) && lst(CA, 'pare', s) === lst(CB, 'B', s)) && JSON.stringify(CA.neclar) === JSON.stringify(CB.neclar);
console.log(`(a) schimburi: ${n} linii, diferite după maparea impare→A, pare→B: ${dif.length}${dif.length ? ' ' + dif.join(', ') : ''} · care-schimb identic după mapare: ${csOk} · chei impare/pare rămase: ${!!(CB.impare || CB.pare)}`);
const isoW = z => { const d = new Date(z + 'T12:00:00Z'); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); const y = d.getUTCFullYear(); const j4 = new Date(Date.UTC(y, 0, 4)); return 1 + Math.round(((d - j4) / 86400000 - 3 + ((j4.getUTCDay() + 6) % 7)) / 7); };
const zi = (z, k) => { const x = new Date(z + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
const W = []; for (let k = -2; k <= 4; k++) W.push(zi('2026-12-14', 7 * k));
console.log('(b) luni · ISO · paritate · faza: ' + W.map(l => `${l} ${isoW(l)} ${isoW(l) % 2 ? 'impară' : 'pară'} ${fazaSapt(l)}`).join(' | '));
// (c) linie D sintetică: s1 în săptămânile fazei A (ca 21–27.09), s2 în B, 10 săptămâni 23.11.2026 → 25.01.2027
const S = []; for (let k = 0; k < 10; k++) { const l = zi('2026-11-23', 7 * k); S.push({ lu: l, iso: isoW(l), tip: fazaSapt(l) === 'A' ? 's1' : 's2' }); }
const cons = f => { const s1 = S.filter(w => w.tip === 's1').map(f), s2 = S.filter(w => w.tip === 's2').map(f);
  const p0 = s1.filter(x => x === 0).length + s2.filter(x => x === 1).length, p1 = s1.filter(x => x === 1).length + s2.filter(x => x === 0).length; return Math.max(p0, p1) / (p0 + p1); };
const cF = cons(w => fazaSapt(w.lu) === 'B' ? 0 : 1), cI = cons(w => w.iso % 2);
console.log(`(c) linie sintetică ${S.map(w => w.iso + w.tip.slice(1)).join(' ')}: consistența pe fază ${cF.toFixed(2)} → ${cF >= 0.8 ? 'rotatie' : 'rotatie-neregulata'} · pe paritatea ISO ${cI.toFixed(2)} → ${cI >= 0.8 ? 'rotatie' : 'rotatie-neregulata'}`);
