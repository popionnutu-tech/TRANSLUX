import { describe, expect, it } from 'vitest';
import { homeOptions, homePopular } from './home-props';

const localities = [
  { id: 1, name_ro: 'Chișinău', name_ru: 'Кишинёв', is_major: true, sort_order: 100 },
  { id: 2, name_ro: 'Bălți', name_ru: 'Бельцы', is_major: true, sort_order: 90 },
  { id: 3, name_ro: 'Șirăuți', name_ru: 'Ширеуцы', is_major: false, sort_order: 0 },
  { id: 4, name_ro: 'Larga', name_ru: 'Ларга', is_major: false, sort_order: 0 },
  { id: 5, name_ro: 'Ocnița-Sat', name_ru: 'Окница-Сат', is_major: false, sort_order: 0 },
];

describe('homeOptions (ION-204)', () => {
  it('principalele după sort_order descrescător, valoarea e mereu numele RO', () => {
    const o = homeOptions(localities, 'ru');
    expect(o.major).toEqual([
      { v: 'Chișinău', l: 'Кишинёв' },
      { v: 'Bălți', l: 'Бельцы' },
    ]);
  });

  it('celelalte sortate după eticheta în limba paginii', () => {
    expect(homeOptions(localities, 'ro').minor.map((o) => o.l)).toEqual(['Larga', 'Ocnița-Sat', 'Șirăuți']);
    expect(homeOptions(localities, 'ru').minor.map((o) => o.l)).toEqual(['Ларга', 'Окница-Сат', 'Ширеуцы']);
  });

  it('nu duce în client decât valoarea și eticheta', () => {
    const o = homeOptions(localities, 'ro');
    for (const x of [...o.major, ...o.minor]) expect(Object.keys(x).sort()).toEqual(['l', 'v']);
  });
});

describe('homePopular (ION-204)', () => {
  const prices = [
    { from_slug: 'chisinau', to_slug: 'balti', from_ro: 'Chișinău', to_ro: 'Bălți', from_ru: 'Кишинёв', to_ru: 'Бельцы', price: 100 },
    { from_slug: 'chisinau', to_slug: 'otaci', from_ro: 'Chișinău', to_ro: 'Otaci', from_ru: 'Кишинёв', to_ru: 'Атаки', price: 170 },
    { from_ro: 'Chișinău', to_ro: 'Criva', from_ru: 'Кишинёв', to_ru: 'Крива', price: 180 },
  ];
  const links = [{ key: 'chisinau-balti', href: '/ru/avtobus/chisinau-balti', label: 'x' }];

  it('numele în limba paginii și linkul doar când perechea are pagină', () => {
    expect(homePopular(prices, links, 'ru')).toEqual([
      { name: 'Кишинёв - Бельцы', price: 100, href: '/ru/avtobus/chisinau-balti' },
      { name: 'Кишинёв - Атаки', price: 170 },
      { name: 'Кишинёв - Крива', price: 180 },
    ]);
    expect(homePopular(prices, links, 'ro')[0].name).toBe('Chișinău - Bălți');
  });
});
