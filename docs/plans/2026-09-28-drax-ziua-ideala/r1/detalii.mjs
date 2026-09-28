// ION-123 r1 — detalii pe intervale din rândurile variantei de bază (node detalii.mjs)
import { readFileSync } from 'node:fs';
const J = JSON.parse(readFileSync(new URL('./ziua-ideala.json', import.meta.url)));
const r1 = (x) => Math.round(x * 10) / 10;
const I = J.randuriBaza.flatMap((r) => r.intervale.map((i) => ({ m: r.m, z: r.z, ...i })));
const drum = I.filter((i) => !i.laUz);
let tot = 0, tol = 0; for (const i of drum) { const d = i.rest - i.leg; if (d > 0) { tot += d; tol += Math.min(d, 0.05 * i.leg + 1); } }
console.log('drumLung pozitiv', r1(tot), 'din care în toleranța GPS (5 % + 1 km)', r1(tol), 'intervale', drum.length);
const bins = [0, 2, 5, 10, 20, 50, 1e9]; const h = bins.slice(0, -1).map((b, k) => ({ b: `${b}–${bins[k + 1]}`, n: 0, km: 0 }));
for (const i of drum) { const d = i.rest - i.leg; if (d <= 0) continue; const k = bins.findIndex((b, j) => d >= b && d < bins[j + 1]); h[k].n++; h[k].km += d; }
console.log('histograma drumLung pe interval', h.map((x) => `${x.b}: ${x.n} int / ${r1(x.km)} km`).join('; '));
const lu = I.filter((i) => i.laUz); console.log('laUzina intervale', lu.length, 'km', r1(lu.reduce((a, i) => a + i.rest + i.parc - i.leg, 0)), 'cu parc', r1(lu.reduce((a, i) => a + i.parc, 0)));
const gt = I.filter((i) => i.golTure > 0); console.log('golTure', gt.length, gt.map((i) => `${i.m} ${i.z.slice(5)} ${i.ora} ${i.golTure} (${i.prev} → ${i.next})`).join(' | '));
console.log('top drumLung', drum.map((i) => ({ ...i, d: r1(i.rest - i.leg) })).sort((a, b) => b.d - a.d).slice(0, 8).map((i) => `${i.m} ${i.z.slice(5)} ${i.ora} rest ${i.rest} leg ${i.leg} d ${i.d} (${i.prev} → ${i.next})`).join('\n'));
for (const m of ['386PKP', '024XKY', '435ASB', '224BZP', '146BRAZ', '414ASB']) { const x = J.randuriBaza.filter((r) => r.m === m); console.log('--', m, x.map((r) => `${r.z.slice(5)} ${r.tipar} tot ${r.total} gol ${r.gol} ideal ${r.ideal} econ ${r.economie} excl ${r.exclus ?? '-'} c ${JSON.stringify(r.cauze)}`).join('\n   ')); }
// weekend/balti km in base
const nb = J.randuriBaza.reduce((a, r) => a + r.cauze.noapteBalti, 0); console.log('noapteBalti', r1(nb), 'masini', [...new Set(J.randuriBaza.filter((r) => r.cauze.noapteBalti > 1).map((r) => r.m))].join(','));
