// node accepta-plan.test.mjs — verificaPlan pe forme bune și stricate
import assert from 'node:assert/strict';
import { verificaPlan, subset, VERSIUNE_PLAN } from './accepta-plan.mjs';
const A = { luni: '2026-09-14', md5Economie: 'e1', md5Zile: 'z1' };
const bun = () => ({ sapt: '2026-09-14', versiune: `${VERSIUNE_PLAN} (ION-108 A)`, intrare: { economie: 'e1', economieZile: 'z1' }, invarianti: ['conservare', 'economieA'],
  control: { conservare: { trece: true }, economieA: { trece: true }, asteptareModelVsGps: { trece: false, informativ: true } }, asteptare: {}, schimb: {} });
assert.deepEqual(verificaPlan(bun(), A), { ok: true, motiv: null });                                  // concordanța informativă nu contează
assert.match(verificaPlan({ ...bun(), sapt: '2026-09-07' }, A).motiv, /altă săptămână/);
assert.match(verificaPlan({ ...bun(), versiune: 'plan-schimb v2' }, A).motiv, /altă versiune/);
assert.match(verificaPlan({ ...bun(), intrare: { economie: 'x', economieZile: 'z1' } }, A).motiv, /amprenta/);
{ const p = bun(); p.control.economieA.trece = false; assert.match(verificaPlan(p, A).motiv, /economieA/); }
{ const p = bun(); delete p.control.conservare; assert.match(verificaPlan(p, A).motiv, /conservare/); }
assert.match(verificaPlan({ ...bun(), invarianti: [] }, A).motiv, /invarianților/);
assert.equal(verificaPlan(null, A).ok, false);
assert.deepEqual(Object.keys(subset(bun())), ['sapt', 'pana', 'versiune', 'estimare', 'rotatie', 'asteptare', 'schimb', 'intrare']);
console.log('accepta-plan: toate testele trec');
