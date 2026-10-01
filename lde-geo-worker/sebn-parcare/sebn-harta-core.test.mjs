// node sebn-harta-core.test.mjs — felul golului pe harta SEBN (ION-147)
import assert from 'node:assert/strict';
import { clasaGol } from './sebn-harta-core.mjs';
const hav = (a, b) => Math.hypot(a.lat - b.lat, a.lon - b.lon);   // coordonate plane, în km, doar pentru probă
const G = { lat: 0, lon: 0 }, ctx = { G, rPoarta: 0.9, porti: [{ ...G, n: 'Orhei' }, { lat: 100, lon: 0, n: 'Strășeni' }], parc: { lat: 0, lon: 200 }, rParc: 0.5, hav };
let T = 0; const p = (lat, lon, v = 20, dt = 60) => ({ lat, lon, v, t: (T += dt * 1000) });
assert.equal(clasaGol([p(0, 0.2), p(0.5, 1.0, 0), p(0, 0.3)], ctx), 'uzina', 'stă lângă poartă');
assert.equal(clasaGol([p(0, 0.5), p(3.7, 0), p(0.4, 0)], ctx), 'bucla', 'bucla prin Slobozia Doamnei (3,7 km) și înapoi');
assert.equal(clasaGol([p(0, 0.5), p(8, 0), p(0.4, 0)], ctx), 'gol', 'iese la 8 km: nu e buclă');
assert.equal(clasaGol([p(0, 0.5), p(3, 0), p(30, 0)], ctx), 'gol', 'pleacă de la poartă spre capăt: gol');
assert.equal(clasaGol([p(30, 0), p(3, 0), p(0.4, 0)], ctx), 'gol', 'vine gol la poartă: gol');
assert.equal(clasaGol([p(50, 0), p(0, 199.8, 0), p(50, 0)], ctx), 'munca', 'oprire la Parcul Bălți: service');
assert.equal(clasaGol([p(50, 0), p(0, 199.8, 30), p(50, 0)], ctx), 'gol', 'trece pe lângă parc fără oprire: gol');
assert.equal(clasaGol([p(100, 0.2), p(100.5, 0)], ctx), 'uzina', 'lângă poarta Strășeni: uzină');
assert.equal(clasaGol([p(0, 0.5), p(3.7, 0), p(3.7, 0.1, 0, 3 * 3600), p(0.4, 0)], ctx), 'gol', 'doarme acasă la 3,7 km de poartă: nu e buclă');
assert.equal(clasaGol([p(0, 0.5), p(3.7, 0), p(0.4, 0.1), p(0.4, 0.1, 0, 3000), p(0.4, 0)], ctx), 'bucla', 'bucla, apoi așteaptă 50 min la Bucuria: buclă');
console.log('felul golului SEBN: 10 probe trecute');
