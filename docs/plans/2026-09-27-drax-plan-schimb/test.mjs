// teste pe funcțiile pure din model.mjs:  node test.mjs
import assert from 'node:assert/strict';
import { kmZi, kmSapt, ungar, componente, ordoneaza, jumatati } from './model.mjs';
const P = (x) => ({ x }); const d = (a, b) => Math.abs(a.x - b.x);     // puncte pe o dreaptă
const G = P(0), H = P(30), cA = P(40), cB = P(10);
const J1 = { schimb: 's1', zile: ['z1', 'z2'], tur: { capat: cA, poarta: G }, ret: { poarta: G, capat: cA } };
const J2 = { schimb: 's2', zile: ['z1'], tur: { capat: cB, poarta: G }, ret: { poarta: G, capat: cB } };
// două schimburi, acasă în ambele goluri: H→cA 10, G→H 30 + H→cB 20, G→G 0, cA→H 10 + H→G 30, cB→H 20 = 120
assert.equal(kmZi({ casa: H }, [J1, J2], 'z1', d), 120);
// dimineața NU merge acasă: G→cB 10 în loc de 50 → 80
assert.equal(kmZi({ casa: H, acasa: { dim: false } }, [J1, J2], 'z1', d), 80);
// z2 doar J1: acasă între tur și retur 10 + 60 + 10 = 80; așteaptă la poartă 10 + 0 + 10 = 20
assert.equal(kmZi({ casa: H }, [J1, J2], 'z2', d), 80);
assert.equal(kmZi({ casa: H, acasa: { zi: false } }, [J1], 'z2', d), 20);
assert.equal(kmSapt({ casa: H }, [J1, J2], d), 200);
assert.deepEqual(jumatati([J1, J2], 'z1').map((x) => x.k), ['ts1', 'ts2', 'rs1', 'rs2']);
assert.deepEqual(ungar([[4, 1, 3], [2, 0, 5], [3, 2, 2]]), [1, 0, 2]);
assert.deepEqual(ungar([[1, 1e9], [1e9, 1]]), [0, 1]);
const mut = [{ dela: 'A', la: 'B' }, { dela: 'C', la: 'D' }, { dela: 'B', la: 'A' }, { dela: 'D', la: 'C' }];
assert.equal(componente(mut).length, 2);
assert.deepEqual(ordoneaza([{ dela: 'B', la: 'C' }, { dela: 'A', la: 'B' }, { dela: 'C', la: 'A' }]).map((q) => q.dela), ['B', 'C', 'A']);
console.log('model.mjs: toate testele trec');
import { cicluri, kmZiDet } from './model.mjs';
{ const c = cicluri([{ schimb: 's1', dela: 'A', la: 'B' }, { schimb: 's2', dela: 'A', la: 'C' }, { schimb: 's1', dela: 'B', la: 'A' }, { schimb: 's2', dela: 'C', la: 'A' }]);
  assert.equal(c.length, 2); assert.ok(c.every((x) => x.length === 2 && new Set(x.map((q) => q.schimb)).size === 1)); }
{ const o = kmZiDet({ casa: H }, [J1, J2], 'z1', d); assert.deepEqual(o, { start: 10, final: 20, dim: 50, seara: 40, zi: 0, alt: 0, direct: 0 }); }
console.log('cicluri + kmZiDet: trec');
