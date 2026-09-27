// ION-99 diagnostic R6 (doar citire): perechile bune pe poarta sensului și pe orice poartă, C47 pe fiecare, pe mașini
import { readFileSync } from 'node:fs';
import { creeazaEtalon } from '/home/verif/verificator/cod/etalon-gps.mjs';
const DIR = process.argv[2] || '/root/lde-worker/drax/date/ideal-v3.1', RUTA = process.argv[3] || 'R6', LIN = process.argv[4] || 'Mihailenii Vechi';
const J = f => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));
const S = J('schelet-ideal.json'), O = J('obs-ideal.json'), E = J('etalon-ideal.json'), D = J('curse-ideal.json'), N = J('nomenclator.json');
const PORTI = JSON.parse(readFileSync('/home/verif/verificator/date/porti-drax.json', 'utf8'));
const P = { DIF_TUR_RETUR: 0.18, MIN_ZILE: 3, KM_5: 0.05, C47_TOL: 0.10, C47_MIN_KM: 1, C47_ABATERE: 0.60, R_SAT: 1.2, R_TRECE: 1.5, R_OPR: 0.8, SEPT: '2026-09-01', C4_FEREASTRA_MIN: 15 };
const EG = creeazaEtalon({ O, D, E, N, porti: PORTI, P });
const l = S.find(x => x.ruta === RUTA && x.linie === LIN);
console.log('linia', RUTA, LIN, 'sursa', l.sursa, 'real', JSON.stringify(l.real), 'km', l.km, 'tureZi', l.tureZi, 'zi', l.zi, l.masinaZi);
const m = EG.metrici(l);
console.log('poarta sensului:', m.etalonGPS, 'n', m.nBune, '· orice poartă:', m.etalonOricePoarta, 'n', m.nBuneOrice, '· rupte', m.rupte, '· altaPoarta', m.altaPoarta, '· tureZi', m.tureZi, '· reg', JSON.stringify(m.reg));
const ob = O.curse.filter(c => c.ruta === RUTA && c.linie === LIN && c.schimb && (l.sursa === 'toate' || c.zi >= P.SEPT));
const per = new Map(); for (const c of ob) { const q = `${c.schimb}|${c.m}|${c.zi}`; const p = per.get(q) || {}; if (!p[c.sens] || c.plin > p[c.sens].plin) p[c.sens] = c; per.set(q, p); }
for (const [q, p] of [...per].sort()) console.log(' ', q, 'tur', p.tur ? `${EG.plinC(p.tur)} ${p.tur.poarta}${EG.rupt(p.tur) ? ' RUPT' : ''}${p.tur.carpit ? ' cârpit ' + p.tur.plinCarpit : ''}${p.tur.atribuire ? ' MUTAT' : ''}` : '—', '| retur', p.retur ? `${EG.plinC(p.retur)} ${p.retur.poarta}${EG.rupt(p.retur) ? ' RUPT' : ''}${p.retur.carpit ? ' cârpit ' + p.retur.plinCarpit : ''}${p.retur.atribuire ? ' MUTAT' : ''}` : '—', m.bune.has(q) ? 'BUNĂ(poarta sensului)' : '');
for (const E0 of [m.etalonGPS, m.etalonOricePoarta]) { if (E0 == null) continue; const tol = Math.max(P.C47_TOL * E0, P.C47_MIN_KM);
  const pe = ob.filter(c => !EG.rupt(c) && !c.rt && c.poarta === (c.sens === 'tur' ? l.real?.poartaTur : l.real?.poartaRetur));
  const toate = ob.filter(c => !EG.rupt(c) && !c.rt);
  const k = x => x.filter(c => Math.abs(EG.plinC(c) - E0) <= tol).length;
  console.log(`C47 la E=${E0}: pe poarta sensului ${k(pe)}/${pe.length} = ${(100 * k(pe) / pe.length).toFixed(0)} % · pe orice poartă ${k(toate)}/${toate.length} = ${(100 * k(toate) / toate.length).toFixed(0)} %`); }
