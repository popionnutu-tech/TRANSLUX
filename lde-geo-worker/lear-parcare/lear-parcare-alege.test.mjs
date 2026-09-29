// node lear-parcare-alege.test.mjs — cazurile construite pentru alegerea locurilor (Codex r1 C4)
import assert from 'node:assert/strict';
import { alegeLocuri } from './lear-parcare-alege.mjs';
const hav = (a, b) => Math.hypot(a.lat - b.lat, a.lon - b.lon);   // coordonate plane, în km, doar pentru probă
// Contraexemplul Codex: două grupuri de câte trei drumuri, real 50 km. Grupul 1: A la 10 km, dar la ≤ 2 km de unde stă acum; B la 20 km.
// Grupul 2: A la 20 km, B la 60 km. Programul corect: grupul 1 prin B, grupul 2 prin A = 3×20 + 3×20 = 120 km.
const A = { n: 'A', lat: 0, lon: 0, pref: 0 }, B = { n: 'B', lat: 100, lon: 0, pref: 0 };
const legi = [...Array(3).fill(0).map(() => ({ real: 50, acum: { lat: 1, lon: 0 } })), ...Array(3).fill(0).map(() => ({ real: 50, acum: null }))];
const cost = [...Array(3).fill([10, 20]), ...Array(3).fill([20, 60])];
const r = alegeLocuri({ legi, cand: [A, B], cost, hav });
assert.deepEqual([...r.ales.idx].sort(), [0, 1], 'perechea A + B');
assert.equal(Math.round(r.ales.t), 120, 'perechea A + B face 120 km');
for (let i = 0; i < 3; i++) assert.equal(r.alege(r.ales.idx, i), 1, `grupul 1 drumul ${i}: prin B (A e chiar unde stă)`);
for (let i = 3; i < 6; i++) assert.equal(r.alege(r.ales.idx, i), 0, `grupul 2 drumul ${i}: prin A`);
// câștigul sub prag rămâne cum e
const r2 = alegeLocuri({ legi: [{ real: 30, acum: null }], cand: [A], cost: [[29]], hav });
assert.equal(r2.alege(r2.ales.idx, 0), -1, 'câștig 1 km < 2 km: rămâne cum e');
assert.equal(r2.costAles(r2.ales.idx, 0), 30);
// propunerea nu depășește niciodată realul
const r3 = alegeLocuri({ legi: [{ real: 10, acum: null }], cand: [A], cost: [[40]], hav });
assert.equal(r3.costAles(r3.ales.idx, 0), 10, 'locul mai scump: rămâne cum e');
console.log('alegerea locurilor: 4 probe trecute');
