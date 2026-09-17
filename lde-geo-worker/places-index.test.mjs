// Teste pentru indexul spațial (node --test lde-geo-worker/places-index.test.mjs).
// Miza: `nearestWithin` stă pe calea banilor, deci trebuie să dea EXACT ce dădea
// scanarea liniară — nu „aproape la fel". O celulă ratată = altă localitate = alt
// tronson la cârpire = alți km = alt salariu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlacesIndex, nearestLiniar, RAZA_MAX_SIGURA_KM } from './places-index.mjs';

// ~1.800 de locuri împrăștiate peste Moldova, ca fișierul real
function locuriAleatoare(n, seed = 42) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out = [];
  for (let i = 0; i < n; i++) out.push({ name: `loc${i}`, lat: 45.5 + rnd() * 3.2, lon: 26.6 + rnd() * 3.8 });
  return out;
}

test('grila dă exact ce dă scanarea liniară, pe 5.000 de puncte aleatoare', () => {
  const places = locuriAleatoare(1800);
  const idx = buildPlacesIndex(places);
  let s = 7;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let verificate = 0, gasite = 0;
  for (let i = 0; i < 5000; i++) {
    const p = { lat: 45.5 + rnd() * 3.2, lon: 26.6 + rnd() * 3.8 };
    const grid = idx.nearestWithin(p, 2.0);
    const lin = nearestLiniar(places, p);
    const linSubPrag = lin && lin.d <= 2.0 ? lin : null;
    if (linSubPrag === null) assert.equal(grid, null, `punct ${i}: liniar n-a găsit nimic sub prag, grila a găsit`);
    else {
      assert.ok(grid, `punct ${i}: liniar a găsit ${linSubPrag.name} la ${linSubPrag.d}, grila n-a găsit nimic`);
      assert.equal(grid.name, linSubPrag.name, `punct ${i}: nume diferit`);
      assert.equal(grid.d, linSubPrag.d, `punct ${i}: distanță diferită`);
      gasite++;
    }
    verificate++;
  }
  assert.equal(verificate, 5000);
  assert.ok(gasite > 100, `eșantionul trebuie să conțină și potriviri reale (a găsit ${gasite})`);
});

test('punct exact pe marginea unei celule: vecinul din celula alăturată nu se pierde', () => {
  // locul e la 1,2 km nord de punct, dar în celula următoare
  const places = [{ name: 'Vecinul', lat: 47.0501, lon: 28.0 }];
  const idx = buildPlacesIndex(places);
  const p = { lat: 47.0392, lon: 28.0 };   // ~1,21 km mai jos, altă celulă (0,05°)
  const g = idx.nearestWithin(p, 2.0);
  assert.ok(g, 'vecinul din celula de deasupra trebuie găsit');
  assert.equal(g.name, 'Vecinul');
  assert.equal(g.d, nearestLiniar(places, p).d);
});

test('raza peste garanția grilei e refuzată, nu ghicită', () => {
  const idx = buildPlacesIndex(locuriAleatoare(50));
  assert.throws(() => idx.nearestWithin({ lat: 47, lon: 28 }, RAZA_MAX_SIGURA_KM + 0.1), /peste garanția grilei/);
});

test('allWithin întoarce TOATE locurile sub prag, nu doar cel mai apropiat', () => {
  const places = [
    { name: 'Aproape', lat: 47.0000, lon: 28.0000 },
    { name: 'Mijloc',  lat: 47.0090, lon: 28.0000 },   // ~1,0 km
    { name: 'Departe', lat: 47.0450, lon: 28.0000 },   // ~5,0 km
  ];
  const idx = buildPlacesIndex(places);
  const nume = idx.allWithin({ lat: 47.0, lon: 28.0 }, 2.0).map((x) => x.name).sort();
  assert.deepEqual(nume, ['Aproape', 'Mijloc'], 'varianta B ia și satul al doilea, pe care A îl masca');
  assert.equal(idx.nearestWithin({ lat: 47.0, lon: 28.0 }, 2.0).name, 'Aproape');
});

test('fără niciun loc sub prag → null (câmp deschis)', () => {
  const idx = buildPlacesIndex([{ name: 'Undeva', lat: 48.0, lon: 29.0 }]);
  assert.equal(idx.nearestWithin({ lat: 47.0, lon: 28.0 }, 2.0), null);
  assert.deepEqual(idx.allWithin({ lat: 47.0, lon: 28.0 }, 2.0), []);
});
