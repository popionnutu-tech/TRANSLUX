// ION-123 r1 — varianta recomandată și comparația pe mașină (node rezumat2.mjs)
import { readFileSync } from 'node:fs';
const J = JSON.parse(readFileSync(new URL('./ziua-ideala.json', import.meta.url)));
const r1 = (x) => Math.round(x * 10) / 10;
for (const k of Object.keys(J.variante).filter((k) => k.includes('DeLamurit') || k.endsWith('/tol'))) { const f = J.variante[k].flota; console.log(k, 'zile', f.zile, 'gol', f.gol, 'ideal', f.ideal, 'econ', f.economie, '/zi', r1(f.economie / f.zile), JSON.stringify(f.cauze), JSON.stringify(f.separat), JSON.stringify(J.variante[k].probe)); }
const C = J.comparatieReguli4; const s = C.reduce((a, r) => a + (r.recomandat || 0), 0);
console.log('recomandat Σ mașini', r1(s), 'mașini ≥ 100/săpt', C.filter((r) => (r.recomandat || 0) >= 100).length, '/ < 0', C.filter((r) => (r.recomandat || 0) < 0).map((r) => r.m + ' ' + r.recomandat));
console.log(C.map((r) => `${r.m}:${r.recomandat}/${r.recomandatZile}z vs r4 ${r.r4total}`).join(' · '));
console.log('probe recom', JSON.stringify(Object.fromEntries(Object.entries(J.probeDetaliiRecomandat).map(([k, v]) => [k, v.length]))), JSON.stringify(J.probeDetaliiRecomandat.economieNegativa));
