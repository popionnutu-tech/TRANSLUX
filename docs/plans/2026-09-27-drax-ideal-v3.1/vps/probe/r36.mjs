// ION-99: candidatele cache ale R36 Bocancea Schit — unde stau acum picioarele lor (doar citire)
import { readFileSync } from 'node:fs';
const D = '/root/lde-worker/drax/date/ideal-v3.1';
const SC = JSON.parse(readFileSync(`${D}/schelet-cand.json`, 'utf8')), O = JSON.parse(readFileSync(`${D}/obs-ideal.json`, 'utf8')), O1 = JSON.parse(readFileSync(`${D}/proba/r1/obs-ideal.json`, 'utf8'));
const idx = X => { const m = new Map(); for (const c of X.curse) if (c.schimb) m.set(`${c.m}|${c.t0}|${c.sens}`, c); return m; };
const I = idx(O), I1 = idx(O1);
for (const c of Object.values(SC.cand).filter(c => c.ruta === 'R36' && c.linie === 'Bocancea Schit' && c.zi >= '2026-09-01'))
  for (const s of ['tur', 'retur']) { const k = `${c.m}|${c[s].t0}|${s}`, o = I.get(k), o1 = I1.get(k);
    console.log(c.zi, c.schimb, c.m, s, 'km urmă', c[s].km, '| r1:', o1 ? `${o1.ruta}|${o1.linie} plin ${o1.plin} cârpit ${o1.plinCarpit ?? 0}` : '—', '| acum:', o ? `${o.ruta}|${o.linie} plin ${o.plin} cârpit ${o.plinCarpit ?? 0}${o.exclusEtalon ? ' EXCLUS ' + o.exclusEtalon : ''}` : '— (fără observație cu schimb)'); }
