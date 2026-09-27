// Faza 2 (ION-97): măsurarea celor 7 linii cu «diagnostic cerut» pe setul v3 (doar citire). Pentru fiecare linie: picioarele cu schimb
// (sursa liniei), satele atinse pe partea cu oameni (apropieri ≤1,2 km din extracție), variantele = semnătura satelor discriminante
// (prezente în 10–90 % din picioare), km GPS completat (plin + raza porții, etalon-gps.mjs), mașini, schimb, zile, poartă;
// perechile (schimb, mașină, zi) pe variantă. Etalonul pe submulțimi = metrici(l, scoate) al modulului comun.
//   node diag7.mjs <dir> [toate]
import { readFileSync } from 'node:fs';
import { creeazaEtalon, med } from '/home/verif/verificator/cod/etalon-gps.mjs';
import { fazaSapt } from '/root/lde-worker/drax/cod/ideal-v3/timp.mjs';
const DIR = process.argv[2]; const J = f => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));
const S = J('schelet-ideal.json'), O = J('obs-ideal.json'), E = J('etalon-ideal.json'), D = J('curse-ideal.json'), N = J('nomenclator.json'), SH = J('schimburi-ideal.json');
const PORTI = JSON.parse(readFileSync('/home/verif/verificator/date/porti-drax.json', 'utf8'));
const P = { DIF_TUR_RETUR: 0.18, MIN_ZILE: 3, KM_5: 0.05, C47_TOL: 0.10, C47_MIN_KM: 1, C47_ABATERE: 0.60, R_SAT: 1.2, R_TRECE: 1.5, R_OPR: 0.8, SEPT: '2026-09-01', C4_FEREASTRA_MIN: 15 };
const EG = creeazaEtalon({ O, D, E, N, porti: PORTI, P });
const okey = c => `${c.m}|${c.t0}|${c.km}`;
const r1 = x => x == null ? '—' : (+x).toFixed(1);
const LINII = ['R18|Zarojeni', 'R24|Catranic', 'R36|Bocancea Schit', 'R27|Sturzovca', 'R32|Trifanesti', 'R3|Nihoreni', 'R6|Mihailenii Vechi', 'R11|Limbenii Noi'];
const TOATE = process.argv[3] === 'toate';
const sateLeg = c => { const d = EG.depl.get(okey(c)); if (!d) return [];
  const om = a => c.sens === 'tur' ? a.km >= c.kmCap - P.R_OPR : a.km <= c.kmCap + P.R_OPR;
  return [...new Set(d.apr.filter(om).map(a => a.k))]; };
const grupa = c => { const f = fazaSapt(c.zi); return c.schimb === 's1' ? (f === 'A' ? 'D' : 'EZ') : (f === 'A' ? 'EZ' : 'D'); };   // D face s1 în faza A (schimburi.mjs, act «II-D»)
for (const key of LINII) { const [ruta, linie] = key.split('|'); const l = S.find(x => x.ruta === ruta && x.linie === linie); if (!l) { console.log(`\n### ${key}: lipsă`); continue; }
  const src = c => TOATE || l.sursa === 'toate' || c.zi >= P.SEPT;
  const legs = O.curse.filter(c => c.schimb && c.ruta === ruta && c.linie === linie && src(c)).map(c => ({ c, sate: sateLeg(c), km: EG.plinC(c), rupt: EG.rupt(c), g: grupa(c) }));
  const m0 = EG.metrici(l), mT = EG.metrici({ ...l, sursa: 'toate' });
  console.log(`\n### ${key} · card ${l.km} · ture/zi ${l.tureZi} · kmZi ${l.kmZi} · sursa ${l.sursa} · porți ${l.real?.poartaTur}/${l.real?.poartaRetur} · regim ${SH[key]?.regim}${SH[key]?.faza ? '/s1 în faza ' + SH[key].faza : ''} · act ${JSON.stringify(l.autobuze)} · steag: ${l.diagnosticMotiv ?? '—'}`);
  console.log(`  etalon ${l.sursa}: ${m0.etalonGPS} (${m0.nBune} zile) · orice poartă ${m0.etalonOricePoarta} (${m0.nBuneOrice}) · ture/zi GPS ${m0.tureZi} · «toate»: ${mT.etalonGPS} (${mT.nBune}) · orice poartă ${mT.etalonOricePoarta} (${mT.nBuneOrice}) · ture/zi ${mT.tureZi} · regulate tur ${JSON.stringify(m0.reg.tur)} retur ${JSON.stringify(m0.reg.retur)}`);
  const cnt = new Map(); for (const x of legs) for (const s of x.sate) cnt.set(s, (cnt.get(s) || 0) + 1);
  const disc = [...cnt].filter(([, n]) => n >= 0.1 * legs.length && n <= 0.9 * legs.length).map(([s]) => s).sort();
  console.log(`  picioare ${legs.length} (rupte ${legs.filter(x => x.rupt).length}) · sate discriminante: ${disc.join(', ')}`);
  // pe (sens, schimb, poartă, mașină)
  const grp = (f) => { const G = new Map(); for (const x of legs) { if (x.rupt) continue; const k = f(x); (G.get(k) ?? G.set(k, []).get(k)).push(x); } return [...G].sort((a, b) => b[1].length - a[1].length); };
  console.log('  pe sens|schimb|poartă|mașină: ' + grp(x => `${x.c.sens}|${x.c.schimb}|${x.c.poarta}|${x.c.m}`).map(([k, a]) => `${k} n${a.length} med ${r1(med(a.map(x => x.km)))} [${r1(Math.min(...a.map(x => x.km)))}–${r1(Math.max(...a.map(x => x.km)))}]`).join(' · '));
  console.log('  variante (semnătura satelor discriminante):');
  for (const [k, a] of grp(x => disc.filter(s => x.sate.includes(s)).join('+') || '(drumul de bază)')) {
    const ms = {}; for (const x of a) ms[x.c.m] = (ms[x.c.m] || 0) + 1; const sh = {}; for (const x of a) sh[`${x.c.sens} ${x.c.schimb} ${x.c.poarta}`] = (sh[`${x.c.sens} ${x.c.schimb} ${x.c.poarta}`] || 0) + 1;
    const gr = {}; for (const x of a) gr[x.g] = (gr[x.g] || 0) + 1;
    console.log(`    [${k}] n${a.length} · km med ${r1(med(a.map(x => x.km)))} [${r1(Math.min(...a.map(x => x.km)))}–${r1(Math.max(...a.map(x => x.km)))}] · zile ${new Set(a.map(x => x.c.zi)).size} · mașini ${JSON.stringify(ms)} · ${JSON.stringify(sh)} · grupa ${JSON.stringify(gr)}`); }
}
