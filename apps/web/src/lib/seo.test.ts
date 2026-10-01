import { describe, expect, it } from 'vitest';
import { jsonLd, legacySearchTarget, MAJOR, parsePair, routePath, slugify } from './seo';

describe('slugify', () => {
  it('scoate diacriticele, și virgula, și sedila', () => {
    expect(slugify('Chișinău')).toBe('chisinau');
    expect(slugify('Chişinău')).toBe('chisinau');
    expect(slugify('Rîșcani')).toBe('riscani');
    expect(slugify('CORJEUȚI')).toBe('corjeuti');
  });
  it('slug-urile majore nu conțin «-» (perechea se desparte după el)', () => {
    for (const m of MAJOR) {
      expect(m.slug).toBe(slugify(m.ro));
      expect(m.slug).not.toContain('-');
    }
  });
});

describe('parsePair', () => {
  it('pereche cu hub, în ambele sensuri', () => {
    expect(parsePair('chisinau-briceni')?.to.ro).toBe('Briceni');
    expect(parsePair('lipcani-balti')?.from.ru).toBe('Липканы');
  });
  it('fără hub, aceeași localitate sau gunoi → null', () => {
    expect(parsePair('briceni-lipcani')).toBeNull();
    expect(parsePair('chisinau-chisinau')).toBeNull();
    expect(parsePair('chisinau-larga')).toBeNull();
    expect(parsePair('chisinau-briceni-x')).toBeNull();
    expect(parsePair('')).toBeNull();
  });
});

describe('legacySearchTarget — adresele vechi /search/<de>/<spre>', () => {
  it('duce pe pagina de direcție', () => {
    expect(legacySearchTarget('ro', 'chisinau', 'lipcani')).toBe('/ro/autobuz/chisinau-lipcani');
    expect(legacySearchTarget('ro', 'Lipcani', 'Chi%C5%9Fin%C4%83u')).toBe('/ro/autobuz/lipcani-chisinau');
    expect(legacySearchTarget('ru', 'Balti', 'Edinet')).toBe(routePath('ru', 'balti', 'edinet'));
  });
  it('perechea fără pagină → pagina principală', () => {
    expect(legacySearchTarget('ro', 'chisinau', 'larga')).toBe('/');
    expect(legacySearchTarget('ru', 'briceni', 'lipcani')).toBe('/ru');
  });
  it('codarea stricată nu aruncă', () => {
    expect(legacySearchTarget('ro', '%E0%A4%A', 'x')).toBe('/');
    expect(legacySearchTarget('ro', 'Chi%FEin%E3u', 'balti')).toBe('/');
  });
});

describe('jsonLd', () => {
  it('nu lasă un nume să închidă <script>', () => {
    const out = jsonLd({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('<');
    expect(JSON.parse(out).name).toBe('</script><script>alert(1)</script>');
  });
});

describe('direcții anunțate (Drochia, fără curse încă)', () => {
  it('doar cu Chișinău, în ambele sensuri', () => {
    expect(parsePair('chisinau-drochia')).toMatchObject({ upcoming: true, to: { ro: 'Drochia', ru: 'Дрокия' } });
    expect(parsePair('drochia-chisinau')?.upcoming).toBe(true);
    expect(parsePair('balti-drochia')).toBeNull();
    expect(parsePair('chisinau-briceni')?.upcoming).toBe(false);
  });
  it('adresa veche duce pe pagina anunțată', () => {
    expect(legacySearchTarget('ru', 'Drochia', 'Chisinau')).toBe('/ru/avtobus/drochia-chisinau');
  });
});
