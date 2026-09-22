// Capătul cursei se caută doar în satele rutei — cazul 827MUM, ruta 11 Ungheni, 22.09.2026.
// Rulare: node --test lde-geo-worker/etalon-write.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { capatPermis } from './etalon-write.mjs';

const RUTA_11 = new Set(['ungheni', 'elizavetovca', 'novaia nicolaevca', 'pirlita', 'todiresti']);

test('parcarea din afara rutei nu poate fi capăt de cursă', () => {
  const ok = capatPermis(RUTA_11);
  assert.equal(ok('Fălești'), false, 'Fălești e parcarea lui 827MUM, nu un sat al rutei 11');
  assert.equal(ok('Todirești'), true);
  assert.equal(ok('Pîrlița'), true, 'oprește sistematic dincolo de satul de start, dar e a rutei');
});

test('diacriticele și majusculele nu schimbă verdictul', () => {
  const ok = capatPermis(RUTA_11);
  assert.equal(ok('TODIREȘTI'), true);
  assert.equal(ok('Pirlita'), true);
});

test('oprirea fără localitate rămâne candidată', () => {
  // Despre ea nu putem spune nimic; aruncând-o, tăietura s-ar muta în celălalt sens.
  assert.equal(capatPermis(RUTA_11)(null), true);
});

test('ruta fără etalon folositor nu e filtrată deloc', () => {
  // Sub două sate nu avem cu ce judeca, deci rămâne comportamentul de dinainte.
  assert.equal(capatPermis(new Set(['todiresti']))('Fălești'), true);
  assert.equal(capatPermis(new Set())('Fălești'), true);
  assert.equal(capatPermis(null)('Fălești'), true);
});

test('regula e aceeași în ambele sensuri', () => {
  // Simetria iese din construcție: un singur predicat, pentru prima și pentru ultima oprire.
  const ok = capatPermis(RUTA_11);
  for (const sat of ['Todirești', 'Pîrlița', 'Ungheni']) assert.equal(ok(sat), true);
  for (const strain of ['Fălești', 'Bușila', 'Chirileni', 'Făgădău']) assert.equal(ok(strain), false);
});
