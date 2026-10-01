import { describe, expect, it } from 'vitest';
import { jsonLd, legacySearchTarget, LOCALITIES, MAJOR, parsePair, routePath, slugify, UPCOMING } from './seo';

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
    expect(parsePair('balti-larga')).toBeNull();
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
    expect(legacySearchTarget('ro', 'balti', 'larga')).toBe('/');
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

describe('toate localitățile din nord ↔ Chișinău (01.10)', () => {
  const all = [...MAJOR, ...LOCALITIES, ...UPCOMING];

  it('slug-uri unice, egale cu slugify(nume)', () => {
    expect(new Set(all.map((l) => l.slug)).size).toBe(all.length);
    for (const l of LOCALITIES) expect(l.slug).toBe(slugify(l.ro));
  });

  it('fiecare localitate are pagina în ambele sensuri, cu tăietura corectă', () => {
    for (const l of LOCALITIES) {
      expect(parsePair(`chisinau-${l.slug}`)).toMatchObject({ from: { slug: 'chisinau' }, to: { slug: l.slug } });
      expect(parsePair(`${l.slug}-chisinau`)).toMatchObject({ from: { slug: l.slug }, to: { slug: 'chisinau' } });
    }
  });

  it('numele cu cratimă: Ocnița-Sat nu se confundă cu Ocnița', () => {
    expect(parsePair('ocnita-sat-chisinau')?.from.ro).toBe('Ocnița-Sat');
    expect(parsePair('chisinau-ocnita-sat')?.to.ro).toBe('Ocnița-Sat');
    expect(parsePair('chisinau-ocnita')?.to.ro).toBe('Ocnița');
    expect(parsePair('chisinau-grinauti-raia')?.to.ru).toBe('Гринауцы-Рая');
  });

  it('satele au pagină doar cu Chișinău', () => {
    expect(parsePair('balti-larga')).toBeNull();
    expect(parsePair('larga-briceni')).toBeNull();
    expect(parsePair('larga-tabani')).toBeNull();
  });

  it('adresa veche cu un sat → pagina satului', () => {
    expect(legacySearchTarget('ro', 'Chisinau', 'Larga')).toBe('/ro/autobuz/chisinau-larga');
    expect(legacySearchTarget('ru', 'Ocni%C8%9Ba-Sat', 'Chi%C8%99in%C4%83u')).toBe('/ru/avtobus/ocnita-sat-chisinau');
  });
});

describe('Glodeni (anunțată, 01.10)', () => {
  it('Chișinău ↔ Glodeni în ambele sensuri', () => {
    expect(parsePair('chisinau-glodeni')).toMatchObject({ upcoming: true, to: { ru: 'Глодяны' } });
    expect(parsePair('glodeni-chisinau')?.upcoming).toBe(true);
  });
});
