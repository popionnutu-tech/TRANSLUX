// ION-123 r1 — rezumatul variantelor din ziua-ideala.json (rulare locală: node rezumat.mjs)
import { readFileSync } from 'node:fs';
const J = JSON.parse(readFileSync(new URL('./ziua-ideala.json', import.meta.url)));
const r1 = (x) => Math.round(x * 10) / 10;
const lin = (k) => { const x = J.variante[k]; const f = x.flota; const c = f.cauze;
  return `${k.padEnd(48)} zile ${String(f.zile).padStart(3)} ideal ${String(f.ideal).padStart(8)} econ ${String(f.economie).padStart(8)} /zi ${String(r1(f.economie / f.zile)).padStart(6)} | nopte ${r1(c.noapte)} wk ${r1(c.noapteWeekend)} bal ${r1(c.noapteBalti)} acasa ${r1(c.acasa)} uz ${r1(c.laUzina)} lung ${r1(c.drumLung)} gT ${r1(c.golTure)} etal ${r1(c.cursaVsEtalon)} | sep ${JSON.stringify(f.separat)} | probe ${JSON.stringify(x.probe)}`; };
const b = J.baza.split('/'); const k = (o) => { const v = { Q1: b[0], Q2: b[1], N: b[2], W: b[3], B: b[4], X: b[5], ...o }; return `${v.Q1}/${v.Q2}/${v.N}/${v.W}/${v.B}/${v.X}`; };
const sel = [{}, { Q1: 'etalon' }, { Q2: 'etalon' }, { Q1: 'etalon', Q2: 'etalon' }, { N: 'uzina' }, { N: 'min' }, { W: 'separat' }, { B: 'uzina' }, { B: 'separat' }, { X: 'faraExcluse' },
  { N: 'min', W: 'separat', B: 'separat', X: 'faraExcluse' }, { N: 'min', W: 'separat', B: 'uzina', X: 'faraExcluse' }, { Q1: 'etalon', Q2: 'etalon', N: 'min', W: 'separat', B: 'separat', X: 'faraExcluse' }];
for (const o of sel) console.log(lin(k(o)));
console.log('reguli4', JSON.stringify(J.reguli4Flota));
const L = J.randuriBaza; const lv = L.filter((r) => r.dow <= 5);
for (const m of ['710CWN', '925FTI']) { const x = lv.filter((r) => r.m === m); console.log(m, 'L–V', x.length, 'econ/zi', r1(x.reduce((a, r) => a + r.economie, 0) / x.length), x.map((r) => `${r.z.slice(5)} ${r.total}→${r.ideal} (${r.economie})`).join('; ')); }
console.log('comparatie (top 15 + ultimele 5)');
const C = J.comparatieReguli4; for (const r of [...C.slice(0, 15), ...C.slice(-5)]) console.log(`${r.m} z${r.zile} econ ${r.economie} /zi ${r.peZi} | noapte ${r.noapte} acasa ${r.acasa} uz ${r.laUzina} lung ${r.drumLung} gT ${r.golTure} || r4 ${r.r4total} (R1 ${r.r4R1} / toate ${r.r4R1toate}, R4 ${r.r4R4}, balti ${r.r4balti})`);
const tot = C.reduce((a, r) => ({ e: a.e + r.economie, r4: a.r4 + r.r4total, n: a.n + r.noapte, ac: a.ac + r.acasa, r1t: a.r1t + r.r4R1toate, R4: a.R4 + r.r4R4 }), { e: 0, r4: 0, n: 0, ac: 0, r1t: 0, R4: 0 });
console.log('sume', JSON.stringify(Object.fromEntries(Object.entries(tot).map(([a, v]) => [a, r1(v)]))));
console.log('masini econ > 100/sapt', C.filter((r) => r.economie >= 100).length, 'din', C.length, '; r4 > 0', C.filter((r) => r.r4total > 0).length);
console.log('probe baza', JSON.stringify(J.probeDetaliiBaza.economieNegativa), JSON.stringify(J.probeDetaliiBaza.drumLungNegativ));
const pe = J.probeDetaliiEtalon; console.log('probe etalon: econ>gol', pe.economiePesteGol.length, JSON.stringify(pe.economiePesteGol.slice(0, 5)), 'ideal<cuO', pe.idealSubCuOameni.length, JSON.stringify(pe.idealSubCuOameni.slice(0, 5)), 'neg', pe.economieNegativa.length, JSON.stringify(pe.economieNegativa.slice(0, 5)));
console.log('contoare', JSON.stringify(J.contoare));
