// ION-150 — testele funcțiilor pure ale hărții cisternelor. Rulare: node --test harta-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { casaDin, cheieBiodiesel, cheieMotorina, judecaStationare, locuriSaptamana, miezulNoptii, odihnaBuna, scurt, taieZiua } from './harta-core.mjs';

test('00:00 la Chișinău: vara UTC+3, iarna UTC+2', () => {
  assert.equal(new Date(miezulNoptii('2026-09-14')).toISOString(), '2026-09-13T21:00:00.000Z');
  assert.equal(new Date(miezulNoptii('2026-12-01')).toISOString(), '2026-11-30T22:00:00.000Z');
});

test('judecata staționării: acasă, ≥ 24 h rămâne, pauză, locurile bune ale lui Ion, linia ideală', () => {
  assert.equal(judecaStationare({ min: 600, incert: false, dCasa: 1.2, dLinie: 40, dBun: null }).fel, 'casa');
  assert.equal(judecaStationare({ min: 30 * 60, incert: false, dCasa: 50, dLinie: 40, dBun: null }).fel, 'lunga');
  assert.equal(judecaStationare({ min: 120, incert: false, dCasa: 50, dLinie: 40, dBun: null }).fel, 'pauza');
  assert.equal(judecaStationare({ min: 600, incert: false, dCasa: 50, dLinie: 40, dBun: 2 }).fel, 'drum');
  assert.equal(judecaStationare({ min: 600, incert: false, dCasa: null, dLinie: 3, dBun: null }).fel, 'drum');
  const a = judecaStationare({ min: 600, incert: false, dCasa: null, dLinie: 23.4, dBun: null });
  assert.equal(a.fel, 'abatere'); assert.match(a.nota, /23 km de drumul ideal — abatere/);
  assert.equal(judecaStationare({ min: 600, incert: false, dCasa: null, dLinie: null, dBun: null }).fel, 'faraIdeal');
  assert.equal(judecaStationare({ min: 900, incert: true, dCasa: 0, dLinie: 0, dBun: null }).fel, 'semnal');
});

test('locurile bune de odihnă (Ion, 30.09): Galați, Agigea, Giurgiu, Novi Iskăr; Albina nu', () => {
  assert.equal(odihnaBuna({ lat: 45.44, lon: 28.02 })?.n, 'Galați');
  assert.equal(odihnaBuna({ lat: 42.8189, lon: 23.3687 })?.n, 'Novi Iskăr');
  assert.equal(odihnaBuna({ lat: 46.56, lon: 28.95 }), null);
});

test('tăietura zilei: Σ intervale = Σ pași, staționarea și drumul nu se amestecă', () => {
  const p = [
    { i: 1, t: 1, km: 0.1, sta: 0, drum: null }, { i: 2, t: 2, km: 0.0, sta: 0, drum: null },
    { i: 3, t: 3, km: 12.5, sta: null, drum: 4 }, { i: 4, t: 4, km: 20, sta: null, drum: 4 },
    { i: 5, t: 5, km: 7, sta: null, drum: 5 }, { i: 6, t: 6, km: 0.2, sta: 1, drum: 5 },
  ];
  const b = taieZiua(p);
  assert.deepEqual(b.map((x) => x.cheie), ['s0', 'd4', 'd5', 's1']);
  assert.equal(b.reduce((a, x) => a + x.km, 0), p.reduce((a, x) => a + x.km, 0));
});

test('casa: parcările ≥ 8 h din Moldova în afara punctelor, cel puțin două', () => {
  const o = (lat, lon, min, extra = {}) => ({ lat, lon, min, incert: false, punct: null, tara: 'Moldova', ...extra });
  const c = casaDin([o(47.0, 28.9, 600), o(47.005, 28.905, 700), o(46.0, 28.0, 2000, { tara: 'România' }), o(47.01, 28.9, 900, { punct: { name: 'x' } })]);
  assert.equal(c.n, 2); assert.equal(c.lat, 47.0);
  assert.equal(casaDin([o(47, 28.9, 600)]), null);
});

test('P1/P2 informativ: după orele din săptămână, doar parcările ≥ 8 h', () => {
  const l = locuriSaptamana([
    { lat: 47, lon: 28.9, min: 900, minTot: 900, fel: 'casa', nota: 'acasă' },
    { lat: 45.44, lon: 28.0, min: 600, minTot: 600, fel: 'drum', nota: 'odihnă pe drum — bună' },
    { lat: 45.44, lon: 28.0, min: 200, minTot: 200, fel: 'pauza', nota: 'pauză' },
  ], () => 'loc');
  assert.deepEqual(l.map((x) => [x.nr, x.fel, x.ore]), [[1, 'casa', 15], [2, 'drum', 10]]);
});

test('cheile liniilor din schelet-camioane.json și numele scurte', () => {
  const S = { motorina: [{ id: 'Port Constanța → Bacioi', origine: 'Port Constanța', destinatie: 'Bacioi', deBaza: 'baza-giu', variante: [{ id: 'baza-giu' }, { id: 'baza-alb' }] }], biodiesel: [{ id: 'B2' }] };
  assert.equal(cheieMotorina(S, 'Port Constanța', 'Bacioi', 'Albița'), 'm|Port Constanța → Bacioi|baza-alb');
  assert.equal(cheieMotorina(S, 'Port Constanța', 'Bacioi', null), 'm|Port Constanța → Bacioi|baza-giu');
  assert.equal(cheieMotorina(S, 'Petromidia', 'Bacioi', null), null);
  assert.equal(cheieBiodiesel(S, 'B2'), 'b|B2|ideal1');
  assert.equal(scurt('Bază Chișinău — stație Bacioi'), 'Bacioi');
  assert.equal(scurt('Rafinăria Petromidia — Năvodari'), 'Petromidia');
  assert.equal(scurt('TLX Orhei — descărcare diesel'), 'TLX Orhei');
});
