import { describe, expect, it } from 'vitest';
import { alegePunct, catrePublic, puncteLocalitate, punctePentru, type PunctRand } from './puncte-reguli';

const P = (id: number, localitate: string, rang: number, perechi: Array<[number, boolean]>): PunctRand => ({
  id, localitate, nume_ro: `Punct ${id}`, nume_ru: `Пункт ${id}`, lat: 48.35, lon: 27.1, rang, perechi,
});
const ACTIVE = [
  P(2, 'Briceni', 2, [[14, false], [14, true]]),
  P(1, 'Briceni', 1, [[14, false], [27, false]]),
  P(3, 'Briceni', 3, [[27, false]]),
  P(9, 'Drepcăuți', 1, [[1, false]]),
];

describe('puncteLocalitate / punctePentru', () => {
  it('întoarce punctele localității după rang, potrivire exactă', () => {
    expect(puncteLocalitate(ACTIVE, 'Briceni').map((p) => p.id)).toEqual([1, 2, 3]);
    expect(puncteLocalitate(ACTIVE, ' Briceni ').map((p) => p.id)).toEqual([1, 2, 3]);
    expect(puncteLocalitate(ACTIVE, 'briceni')).toEqual([]);
    expect(puncteLocalitate(ACTIVE, '%')).toEqual([]);
    expect(puncteLocalitate(ACTIVE, 'Bricen_')).toEqual([]);
    expect(puncteLocalitate(ACTIVE, '')).toEqual([]);
  });

  it('filtrează pe rută și sens (going_north = retur)', () => {
    expect(punctePentru(ACTIVE, 'Briceni', 14, false).map((p) => p.id)).toEqual([1, 2]);
    expect(punctePentru(ACTIVE, 'Briceni', 14, true).map((p) => p.id)).toEqual([2]);
    expect(punctePentru(ACTIVE, 'Briceni', 27, false).map((p) => p.id)).toEqual([1, 3]);
    expect(punctePentru(ACTIVE, 'Briceni', 5, false)).toEqual([]);
  });

  it('răspunsul public nu are localitatea și statistici', () => {
    expect(Object.keys(catrePublic(ACTIVE[0])).sort()).toEqual(['id', 'lat', 'lon', 'nume_ro', 'nume_ru', 'perechi', 'rang']);
  });
});

describe('alegePunct', () => {
  const lista = punctePentru(ACTIVE, 'Briceni', 14, false); // [1, 2]

  it('id din listă → acela; id lipsă → primul', () => {
    expect(alegePunct(lista, 'Briceni', 2, 'Briceni')).toEqual({ tip: 'punct', punct: lista[1] });
    expect(alegePunct(lista, 'Briceni', null, null)).toEqual({ tip: 'punct', punct: lista[0] });
    expect(alegePunct(lista, 'Briceni', undefined, null)).toEqual({ tip: 'punct', punct: lista[0] });
  });

  it('id al aceleiași localități, dar dezactivat sau fără pereche pe sens → primul din listă', () => {
    expect(alegePunct(lista, 'Briceni', 3, 'Briceni')).toEqual({ tip: 'punct', punct: lista[0] });
    expect(alegePunct(lista, 'Briceni', 77, 'Briceni')).toEqual({ tip: 'punct', punct: lista[0] });
  });

  it('id al altei localități sau inexistent → validare', () => {
    expect(alegePunct(lista, 'Briceni', 9, 'Drepcăuți')).toEqual({ tip: 'validare' });
    expect(alegePunct(lista, 'Briceni', 12345, null)).toEqual({ tip: 'validare' });
    expect(alegePunct(lista, 'Briceni', -1, null)).toEqual({ tip: 'validare' });
    expect(alegePunct(lista, 'Briceni', 1.5, null)).toEqual({ tip: 'validare' });
  });

  it('cursa fără puncte → niciunul; un id străin tot validare', () => {
    expect(alegePunct([], 'Prepelița', null, null)).toEqual({ tip: 'niciunul' });
    expect(alegePunct([], 'Prepelița', 9, 'Drepcăuți')).toEqual({ tip: 'validare' });
    expect(alegePunct([], 'Prepelița', 40, 'Prepelița')).toEqual({ tip: 'niciunul' });
  });
});
