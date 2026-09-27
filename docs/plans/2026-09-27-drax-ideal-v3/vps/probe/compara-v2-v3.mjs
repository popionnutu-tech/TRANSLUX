// Comparația v2 → v3 pe km GPS, linie cu linie (ION-97 faza 1 pct. 6). Folosește modulul COMUN al verificatorului (etalon-gps.mjs,
// import doar-citire) pe fiecare set, cu aceleași praguri ca card-gps.mjs; nu scrie nimic în afară de stdout.
//   node compara-v2-v3.mjs <dir v2> <dir v3>
import { readFileSync } from 'node:fs';
import { creeazaEtalon } from '/home/verif/verificator/cod/etalon-gps.mjs';
const PORTI = JSON.parse(readFileSync('/home/verif/verificator/date/porti-drax.json', 'utf8'));
const P = { DIF_TUR_RETUR: 0.18, MIN_ZILE: 3, KM_5: 0.05, C47_TOL: 0.10, C47_MIN_KM: 1, C47_ABATERE: 0.60, R_SAT: 1.2, R_TRECE: 1.5, R_OPR: 0.8, SEPT: '2026-09-01', C4_FEREASTRA_MIN: 15 };
const set = dir => { const J = f => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  const S = J('schelet-ideal.json'), O = J('obs-ideal.json'), E = J('etalon-ideal.json'), D = J('curse-ideal.json'), N = J('nomenclator.json'), SH = J('schimburi-ideal.json');
  const EG = creeazaEtalon({ O, D, E, N, porti: PORTI, P }); const L = new Map();
  const nObs = new Map(); for (const c of O.curse) { const k = `${c.ruta}|${c.linie}`; nObs.set(k, (nObs.get(k) || 0) + 1); }
  for (const l of S) { const k = `${l.ruta}|${l.linie}`; const m = l.km ? EG.metrici(l, new Set(), false) : null;   /* etalon-gps v5: implicitul e «aceeași mașină»; false = dedup între mașini (v4.1) */ const m2 = l.km ? EG.metrici(l, new Set(), true) : null; const q = SH[k];
    L.set(k, { l, km: l.km ?? null, tz: l.tureZi ?? null, kmZi: l.informativ ? null : (l.kmZi ?? null), diag: l.diagnostic ? l.diagnosticMotiv : '', zi: l.zi ? `${l.zi} ${l.schimbZi} ${l.masinaZi}` : '',
      et: m?.etalonGPS ?? null, tzG: m?.tureZi ?? null, tzG1: m2?.tureZi ?? null, obs: nObs.get(k) || 0, reg: q ? `${q.regim}${q.par ? '/' + q.par : q.faza ? '/' + ({ A: 'impare', B: 'pare' })[q.faza] : ''}` : '' }); }
  return { L, O, D }; };
const A = set(process.argv[2]), B = set(process.argv[3]);
const f = x => x == null ? '—' : String(x);
const sum = (M, g) => [...M.values()].reduce((s, x) => s + (g(x) || 0), 0);
console.log('| rută|linie | card km v2 → v3 | ture/zi v2 → v3 | km/zi card v2 → v3 | etalon GPS v2 → v3 | ture/zi GPS (dedup între mașini / doar aceeași mașină) v2 → v3 | observații v2 → v3 | regim v2 → v3 | ziua aleasă v2 → v3 | steag v3 |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
let n = 0;
for (const k of [...new Set([...A.L.keys(), ...B.L.keys()])].sort()) { const a = A.L.get(k), b = B.L.get(k);
  if (!a || !b) { console.log(`| ${k} | ${a ? 'DISPĂRUTĂ în v3' : 'NOUĂ în v3'} | | | | | | ${a ? a.obs : 0} → ${b ? b.obs : 0} | | | |`); n++; continue; }
  const ch = a.km !== b.km || a.tz !== b.tz || a.kmZi !== b.kmZi || a.et !== b.et || a.tzG !== b.tzG || a.tzG1 !== b.tzG1 || a.obs !== b.obs || a.reg !== b.reg || a.zi !== b.zi || a.diag !== b.diag;
  if (!ch) continue; n++;
  console.log(`| ${k} | ${f(a.km)} → ${f(b.km)} | ${f(a.tz)} → ${f(b.tz)} | ${f(a.kmZi)} → ${f(b.kmZi)} | ${f(a.et)} → ${f(b.et)} | ${f(a.tzG)}/${f(a.tzG1)} → ${f(b.tzG)}/${f(b.tzG1)} | ${a.obs} → ${b.obs} | ${a.reg} → ${b.reg} | ${a.zi} → ${b.zi} | ${b.diag} |`); }
const kmG = (M, t) => sum(M, x => x.et != null && x[t] != null && !x.l.informativ && !x.l.gps ? 2 * x.et * x[t] : 0);
console.log(`\nlinii cu diferențe: ${n}`);
console.log(`km/zi card (fără informative): v2 ${sum(A.L, x => x.kmZi).toFixed(1)} → v3 ${sum(B.L, x => x.kmZi).toFixed(1)}`);
console.log(`km/zi GPS (2 × etalon × ture/zi GPS, linii din act): dedup între mașini v2 ${kmG(A.L, 'tzG').toFixed(1)} → v3 ${kmG(B.L, 'tzG').toFixed(1)} · doar aceeași mașină v2 ${kmG(A.L, 'tzG1').toFixed(1)} → v3 ${kmG(B.L, 'tzG1').toFixed(1)}`);
console.log(`observații cu rută: v2 ${A.O.curse.length} → v3 ${B.O.curse.length} · R7|Slobozia*: v2 ${A.O.curse.filter(c => c.ruta === 'R7' && c.linie === 'Slobozia*').length} → v3 ${B.O.curse.filter(c => c.ruta === 'R7' && c.linie === 'Slobozia*').length}`);
const salt = d => d.dinP && d.spreP && d.pIn && d.pOut && d.pIn !== d.pOut && d.km <= 5; const ok = d => `${d.m}|${d.t0}|${d.km}`;
for (const [nm, X] of [['v2', A], ['v3', B]]) { const S = new Set(X.D.curse.filter(salt).map(ok)); const pe = X.O.curse.filter(c => S.has(ok(c)));
  const pl = {}; for (const c of pe) pl[`${c.ruta}|${c.linie}`] = (pl[`${c.ruta}|${c.linie}`] || 0) + 1;
  console.log(`${nm}: salturi poartă→altă poartă ≤5 km ${S.size} · observații din salturi ${pe.length} ${JSON.stringify(pl)}`); }
// bucle scurte pe aceeași poartă (≤5 km) cu rută — nu sunt în pct. 3, doar numărate
const bucla = d => d.dinP && d.spreP && d.pIn && d.pIn === d.pOut && d.km <= 5;
{ const S = new Set(B.D.curse.filter(bucla).map(ok)); const pe = B.O.curse.filter(c => S.has(ok(c))); const pl = {}; for (const c of pe) pl[`${c.ruta}|${c.linie}`] = (pl[`${c.ruta}|${c.linie}`] || 0) + 1;
  console.log(`v3: bucle pe ACEEAȘI poartă ≤5 km ${S.size} · cu rută ${pe.length} ${JSON.stringify(pl)}`); }
