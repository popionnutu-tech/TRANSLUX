// teste pe funcțiile pure din model.mjs:  node test.mjs
import assert from 'node:assert/strict';
import { kmZi, kmZiDet, kmSapt, ungar, componente, ordoneaza, jumatati, conflict, amprenta, goluri } from './model.mjs';
const P = (x) => ({ x }); const d = (a, b) => Math.abs(a.x - b.x);     // puncte pe o dreaptă
const G = P(0), H = P(30), cA = P(40), cB = P(10);
const h = (z, k, c, lin = 'L') => (k[0] === 't' ? { z, k, lin, a: c, b: G } : { z, k, lin, a: G, b: c });
// programul s1 pe A: tur în z1, z2; retur DOAR în z1 (calendarul exact: fără retur inventat în z2)
const S1 = { jum: [h('z1', 'ts1', cA), h('z2', 'ts1', cA), h('z1', 'rs1', cA)] };
const S2 = { jum: [h('z1', 'ts2', cB), h('z1', 'rs2', cB)] };
const m = { casa: H };
// z1, acasă în ambele goluri: 10 + 50 + 0 + 40 + 20 = 120
assert.equal(kmZi(m, [S1, S2], 'z1', d, 'obicei'), 120);
// z2: doar turul s1: H→cA 10, G→H 30 = 40 (nu 80, cum ar fi dat returul inventat)
assert.equal(kmZi(m, [S1, S2], 'z2', d, 'obicei'), 40);
assert.equal(kmSapt(m, [S1, S2], d, 'obicei'), 160);
// pârghia b: golurile directe: z1 = 10 + (G→cB 10) + 0 + (cA→G 40) + 20 = 80
assert.equal(kmZi(m, [S1, S2], 'z1', d, 'asteapta'), 80);
assert.deepEqual(kmZiDet(m, [S1, S2], 'z1', d, 'asteapta'), { start: 10, final: 20, dim: 10, seara: 40, zi: 0, alt: 0, direct: 0 });
// directul = min(direct, prin casă) (triunghi încălcat de Valhalla)
const dd = (a, b) => (a === G && b === cB ? 99 : d(a, b));
assert.equal(goluri(m, [S1, S2], 'z1', dd, 'asteapta').find((g) => g.f === 'dim').direct, 50);
// obiceiul «nu merge acasă dimineața» = direct și în 'obicei'
assert.equal(kmZi({ casa: H, acasa: { dim: false } }, [S1, S2], 'z1', d, 'obicei'), 80);
assert.deepEqual(jumatati([S1, S2], 'z1').map((x) => x.k), ['ts1', 'ts2', 'rs1', 'rs2']);
// conflict: două curse ts1 în aceeași zi
assert.equal(conflict([S1, { jum: [h('z2', 'ts1', cB)] }]), true);
assert.equal(conflict([S1, S2]), false);
assert.equal(amprenta([S1, S2]), amprenta([S2, S1]));
assert.deepEqual(ungar([[4, 1, 3], [2, 0, 5], [3, 2, 2]]), [1, 0, 2]);
assert.deepEqual(ungar([[1, 1e9], [1e9, 1]]), [0, 1]);
// componente pe ambele schimburi: A↔B pe s1 și B↔C pe s2 = un singur lanț
assert.equal(componente([{ dela: 'A', la: 'B' }, { dela: 'B', la: 'A' }, { dela: 'B', la: 'C' }, { dela: 'C', la: 'B' }]).length, 1);
assert.deepEqual(ordoneaza([{ dela: 'B', la: 'C' }, { dela: 'A', la: 'B' }, { dela: 'C', la: 'A' }]).map((q) => q.dela), ['B', 'C', 'A']);
console.log('model.mjs v2: toate testele trec');
