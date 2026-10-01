// ION-149 — testele funcțiilor pure ale hărții mejgorod. Rulare: node --test harta-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alegeNoapte, bucataLa, bucatiGol, felGol, intervaleZi, judecaPauza, kmPas, miezulNoptii, numeAcum, regula2509, PREF,
} from './harta-core.mjs';

const ora = (zi, h, m = 0) => miezulNoptii(zi) + (h * 60 + m) * 6e4;

test('00:00 la Chișinău: vara UTC+3, iarna UTC+2', () => {
  assert.equal(new Date(miezulNoptii('2026-09-21')).toISOString(), '2026-09-20T21:00:00.000Z');
  assert.equal(new Date(miezulNoptii('2026-12-01')).toISOString(), '2026-11-30T22:00:00.000Z');
});

test('felul golului: sub 60 min, noapte până la 20 h, zi liberă, poarta altei uzine, pauza de zi', () => {
  assert.equal(felGol({ t1: ora('2026-09-21', 12), t0Urm: ora('2026-09-21', 12, 59) }).motiv, 'sub 60 min');
  const n = felGol({ t1: ora('2026-09-21', 19), t0Urm: ora('2026-09-22', 7, 40) });
  assert.equal(n.noapte, true); assert.equal(n.motiv, null);
  assert.equal(felGol({ t1: ora('2026-09-21', 19), t0Urm: ora('2026-09-22', 15, 1) }).motiv, 'peste 20 h (zi liberă)');
  assert.equal(felGol({ t1: ora('2026-09-21', 8), t0Urm: ora('2026-09-21', 11), poarta: 'SEBN Orhei' }).motiv, 'la poarta SEBN Orhei (muncă știută)');
  const z = felGol({ t1: ora('2026-09-21', 8), t0Urm: ora('2026-09-21', 10, 18) });
  assert.equal(z.noapte, false); assert.equal(z.motiv, null);
  // cursa de la 02:05 (ruta 1, Criva) aparține zilei de lucru de dinainte: golul 19:00 → 02:05 e tot noapte? nu — 02:05 < 03:00
  assert.equal(felGol({ t1: ora('2026-09-21', 19), t0Urm: ora('2026-09-22', 2, 5) }).noapte, false);
});

test('pauza de prânz: ieșirea > 5 km de capete = timp liber (răspunsul 7)', () => {
  assert.equal(judecaPauza({ departe: 33 }), 'liber');
  assert.equal(judecaPauza({ departe: 1.2 }), 'pauza');
});

test('Briceni = parcare existentă (răspunsul 3)', () => {
  assert.equal(numeAcum({ lat: 48.36, lon: 27.08 }, 'Briceni'), 'Briceni (parcare existentă)');
  assert.equal(numeAcum({ lat: 48.12, lon: 27.2 }, 'Halahora de Sus'), 'Halahora de Sus');
  // Ion, 01.10: noaptea la Briceni nu se mută; pauza de zi la Briceni rămâne pauză
  assert.equal(felGol({ t1: ora('2026-09-21', 20), t0Urm: ora('2026-09-22', 5), briceni: true }).motiv, 'Briceni (parcare existentă)');
  assert.equal(felGol({ t1: ora('2026-09-21', 11), t0Urm: ora('2026-09-21', 14), briceni: true }).motiv, null);
});

test('pasul GPS: saltul > 5 km și deriva mașinii oprite nu se numără', () => {
  assert.equal(kmPas({ lat: 47, lon: 28, v: 0 }, { lat: 47.001, lon: 28, v: 0 }), 0);
  assert.ok(kmPas({ lat: 47, lon: 28, v: 40 }, { lat: 47.01, lon: 28, v: 40 }) > 1);
  assert.equal(kmPas({ lat: 47, lon: 28, v: 40 }, { lat: 47.1, lon: 28, v: 40 }), 0);
});

// trei nopți: mașina doarme la «Acasă» (12 km de capăt), satul X e pe drum (cel mai ieftin), capătul rutei costă puțin mai mult
const legi = [0, 1, 2].map(() => ({ real: 40, acum: { lat: 48.2, lon: 27.2 } }));
const cand = (capKm) => ({
  cand: [{ n: 'satul X', lat: 48.3, lon: 27.0, pref: PREF.sat }, { n: 'Criva (capătul rutei)', lat: 48.27, lon: 26.65, pref: PREF.capat }],
  cost: legi.map(() => [10, capKm]),
});

test('locul de noapte: capătul rutei câștigă când costă ≤ 20 km/săpt. mai mult (răspunsul 2)', () => {
  const { cand: c, cost } = cand(16);             // 3 × 6 = 18 km/săpt. mai mult → capătul
  const r = alegeNoapte({ legi, cand: c, cost });
  assert.deepEqual(r.idx.map((j) => c[j].n), ['Criva (capătul rutei)']);
  assert.deepEqual(r.loc, [1, 1, 1]);
  assert.equal(r.totalPropus, 48);
});

test('locul de noapte: capătul prea scump (peste 20 km/săpt.) → satul cel mai ieftin', () => {
  const { cand: c, cost } = cand(18);             // 3 × 8 = 24 km/săpt. mai mult → satul
  const r = alegeNoapte({ legi, cand: c, cost });
  assert.deepEqual(r.idx.map((j) => c[j].n), ['satul X']);
  assert.equal(r.real - r.totalPropus, 90);
});

test('rămâne cum e: locul la ≤ 4 km de unde stă deja nu e mutare (răspunsul 6)', () => {
  const l = [{ real: 15, acum: { lat: 48.3, lon: 27.0 } }];
  const r = alegeNoapte({ legi: l, cand: [{ n: 'lângă', lat: 48.31, lon: 27.0, pref: PREF.sat }], cost: [[8]] });
  assert.deepEqual(r.loc, [0]); assert.equal(r.totalPropus, 15);
});

test('bucățile golului: stă ≥ 15 min = parcare, restul drum; acoperă exact golul', () => {
  const t0 = ora('2026-09-21', 18), t1 = ora('2026-09-22', 6);
  const Q = [
    { lat: 48.27, lon: 26.8, t: t0, v: 30 }, { lat: 48.3, lon: 26.9, t: t0 + 10 * 6e4, v: 40 },
    { lat: 48.36, lon: 27.08, t: t0 + 25 * 6e4, v: 0 },                     // tace toată noaptea la Briceni
    { lat: 48.36, lon: 27.081, t: t1 - 30 * 6e4, v: 10 }, { lat: 48.3, lon: 26.9, t: t1 - 10 * 6e4, v: 40 },
  ];
  const b = bucatiGol(Q, t0, t1, 'gol', { noapte: true });
  assert.deepEqual(b.map((x) => x.tip), ['gol', 'parcare', 'gol']);
  assert.equal(b[0].t0, t0); assert.equal(b.at(-1).t1, t1);
  for (let i = 1; i < b.length; i++) assert.equal(b[i].t0, b[i - 1].t1);
  assert.equal(b[1].noapte, true);
});

test('intervalele zilei: Σ intervale = Σ pași; bucata care trece de miezul nopții se taie', () => {
  const A = ora('2026-09-22', 0), B = ora('2026-09-23', 0);
  const spans = [{ t0: A - 5 * 36e5, t1: A + 6 * 36e5 }, { t0: A + 6 * 36e5, t1: A + 10 * 36e5 }, { t0: A + 10 * 36e5, t1: B + 36e5 }];
  const pasi = [{ t: A + 1e3, km: 0.2, k: 0 }, { t: A + 7 * 36e5, km: 120, k: 1 }, { t: A + 11 * 36e5, km: 3.5, k: 2 }];
  assert.equal(bucataLa(spans, A + 6 * 36e5), 1);
  assert.equal(bucataLa(spans, A - 9 * 36e5), -1);
  const iv = intervaleZi(spans, pasi, A, B);
  assert.equal(iv.length, 3);
  assert.equal(iv[0].t0, A); assert.equal(iv[2].t1, B);
  assert.equal(iv.reduce((s, x) => s + x.km, 0), 123.7);
});

test('regula din 25.09 pe mașină: doar zilele săptămânii, doar mașina', () => {
  const o = [{ detalii: [{ z: '2026-09-21', m: 'A', optim: 30, laCapat: true }, { z: '2026-09-22', m: 'A', optim: 0, cazB: true }, { z: '2026-09-21', m: 'B', optim: 9 }, { z: '2026-09-28', m: 'A', optim: 50 }] }];
  const r = regula2509(o, 'A', ['2026-09-21', '2026-09-22']);
  assert.deepEqual([r.km, r.zile, r.laCapat, r.cazB], [30, 2, 1, 1]);
});
