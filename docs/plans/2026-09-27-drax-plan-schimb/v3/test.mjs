// teste pe funcțiile pure (model.mjs + plan.mjs):  node test.mjs
import assert from 'node:assert/strict';
import { kmZi, kmZiDet, kmSapt, ungar, componente, ordoneaza, jumatati, conflict, amprenta, goluri } from './model.mjs';
import { optimizeaza, lanturiDin, peRotatie, inversata, picate, INVARIANTI } from './plan.mjs';
const P = (x) => ({ x }); const d = (a, b) => Math.abs(a.x - b.x);     // puncte pe o dreaptă
const G = P(0), H = P(30), cA = P(40), cB = P(10);
const h = (z, k, c, lin = 'L') => (k[0] === 't' ? { z, k, lin, a: c, b: G } : { z, k, lin, a: G, b: c });
// ---- model: calendar exact, (b), direct = min
const S1 = { jum: [h('z1', 'ts1', cA), h('z2', 'ts1', cA), h('z1', 'rs1', cA)] };
const S2 = { jum: [h('z1', 'ts2', cB), h('z1', 'rs2', cB)] };
const m = { casa: H };
assert.equal(kmZi(m, [S1, S2], 'z1', d, 'obicei'), 120);
assert.equal(kmZi(m, [S1, S2], 'z2', d, 'obicei'), 40);          // doar turul, niciun retur inventat
assert.equal(kmSapt(m, [S1, S2], d, 'obicei'), 160);
assert.equal(kmZi(m, [S1, S2], 'z1', d, 'asteapta'), 80);
assert.deepEqual(kmZiDet(m, [S1, S2], 'z1', d, 'asteapta'), { start: 10, final: 20, dim: 10, seara: 40, zi: 0, alt: 0, direct: 0 });
const dd = (a, b) => (a === G && b === cB ? 99 : d(a, b));
assert.equal(goluri(m, [S1, S2], 'z1', dd, 'asteapta').find((g) => g.f === 'dim').direct, 50);
assert.equal(kmZi({ casa: H, acasa: { dim: false } }, [S1, S2], 'z1', d, 'obicei'), 80);
assert.deepEqual(jumatati([S1, S2], 'z1').map((x) => x.k), ['ts1', 'ts2', 'rs1', 'rs2']);
assert.equal(conflict([S1, { jum: [h('z2', 'ts1', cB)] }]), true);
assert.equal(conflict([S1, S2]), false);
assert.equal(amprenta([S1, S2]), amprenta([S2, S1]));
assert.deepEqual(ungar([[4, 1, 3], [2, 0, 5], [3, 2, 2]]), [1, 0, 2]);
assert.equal(componente([{ dela: 'A', la: 'B' }, { dela: 'B', la: 'A' }, { dela: 'B', la: 'C' }, { dela: 'C', la: 'B' }]).length, 1);
assert.deepEqual(ordoneaza([{ dela: 'B', la: 'C' }, { dela: 'A', la: 'B' }, { dela: 'C', la: 'A' }]).map((q) => q.dela), ['B', 'C', 'A']);

// ---- plan: o flotă sintetică; costul = Σ |casă − capăt| × zile (liniile pe dreaptă)
const prog = (id, azi, schimb, cap, zile, cheie = `L${cap}`) => ({ id, azi, schimb, cheie, cap, zile, forma: 'TR' });
const flota = (defs) => { const masini = defs.map(([mm, casa, s1, s2]) => ({ m: mm, casa, prog: { s1, s2 } }));
  return { masini, M: new Map(masini.map((x) => [x.m, x])), azi: new Map(masini.map((x) => [x.m, { s1: x.prog.s1 ?? null, s2: x.prog.s2 ?? null }])) }; };
const costF = (mm, asg) => ['s1', 's2'].reduce((a, s) => a + (asg[s] ? Math.abs(mm.casa - asg[s].cap) * asg[s].zile : 0), 0);
const voieT = () => true;
// optimul cunoscut, prin forță brută pe 3 mașini de 2 schimburi
{ const F = flota([['A', 0, prog('a1', 'A', 's1', 50, 5), prog('a2', 'A', 's2', 40, 5)], ['B', 50, prog('b1', 'B', 's1', 0, 5), prog('b2', 'B', 's2', 10, 5)], ['C', 20, prog('c1', 'C', 's1', 20, 5), prog('c2', 'C', 's2', 20, 5)]]);
  const O = optimizeaza(F.masini, F.azi, voieT, costF);
  const perm = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perm([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  let best = Infinity; const p1 = F.masini.map((x) => x.prog.s1), p2 = F.masini.map((x) => x.prog.s2);
  for (const a of perm(p1)) for (const b of perm(p2)) best = Math.min(best, F.masini.reduce((t, x, i) => t + costF(x, { s1: a[i], s2: b[i] }), 0));
  assert.equal(O.costNormalizat, best); assert.equal(O.costNormalizat, 100);
  const L = lanturiDin(F.masini, F.azi, O.plan, costF, F.M);
  assert.equal(L.reduce((a, x) => a + x.ec, 0), 900 - 100);                          // Σ lanțuri = diferența
}
// normalizarea nu strică: două programe cu aceeași cheie și zile diferite; mutarea lor e economie reală și rămâne
{ const F = flota([['A', 0, prog('a1', 'A', 's1', 30, 5, 'X'), null], ['B', 30, prog('b1', 'B', 's1', 30, 1, 'X'), null]]);
  const O = optimizeaza(F.masini, F.azi, voieT, costF);
  assert.ok(O.costNormalizat <= O.costOptimizator + 1e-9);
  assert.equal(O.costNormalizat, 30);                                               // A ia programul de 1 zi, B pe cel de 5
}
// forma: un program «doar aducere» nu se schimbă cu unul întreg (voie refuză) → nimic mutat
{ const a = { ...prog('a1', 'A', 's1', 50, 5), forma: 'T-' }, b = prog('b1', 'B', 's1', 0, 5);
  const F = flota([['A', 0, a, null], ['B', 50, b, null]]);
  const voieF = (mm, Pq) => Pq.azi === mm.m || Pq.forma === F.azi.get(mm.m).s1.forma;
  const O = optimizeaza(F.masini, F.azi, voieF, costF);
  assert.equal(O.plan.get('A').s1.id, 'a1');
}
// rotația: mașina cu aceeași linie pe ambele schimburi (N6); săptămâna precedentă are schimburile inversate
{ const W = flota([['A', 0, prog('a1', 'A', 's1', 50, 5, 'Y'), prog('a2', 'A', 's2', 50, 5, 'Y')], ['B', 50, prog('b1', 'B', 's1', 0, 5, 'Z'), prog('b2', 'B', 's2', 0, 5, 'Z')], ['C', 25, prog('c1', 'C', 's1', 25, 5, 'X'), prog('c2', 'C', 's2', 25, 5, 'V')]]);
  const R = flota([['A', 0, prog('ra1', 'A', 's1', 50, 5, 'Y'), prog('ra2', 'A', 's2', 50, 5, 'Y')], ['B', 50, prog('rb1', 'B', 's1', 0, 5, 'Z'), prog('rb2', 'B', 's2', 0, 5, 'Z')], ['C', 25, prog('rc1', 'C', 's1', 25, 5, 'V'), prog('rc2', 'C', 's2', 25, 5, 'X')]]);
  assert.equal(inversata(W.masini, R.M), true);
  const O = optimizeaza(W.masini, W.azi, voieT, costF);
  const Ls = lanturiDin(W.masini, W.azi, O.plan, costF, W.M);
  assert.equal(Ls.length, 1);
  const r = peRotatie(Ls[0], { ...R, voie: voieT, cost: costF, inv: true });
  assert.equal(r.verificat, true); assert.equal(r.ecKmSapt, Ls[0].ec);            // pe schimbul corespondent, nu pe primul program
  assert.equal(peRotatie(Ls[0], null).verificat, false);
  assert.equal(peRotatie(Ls[0], { ...R, voie: voieT, cost: costF, inv: null }).verificat, false);   // inversarea nedeterminată = neverificat
}
// invarianții: concordanța model ↔ GPS nu blochează (nici cu 0 mașini peste prag)
{ const C = Object.fromEntries(INVARIANTI.map((k) => [k, { trece: true }])); C.asteptareModelVsGps = { trece: false, masini: 0 };
  assert.deepEqual(picate(C), []); C.conservare.trece = false; assert.deepEqual(picate(C), ['conservare']); }
console.log('model.mjs + plan.mjs v3: toate testele trec');
