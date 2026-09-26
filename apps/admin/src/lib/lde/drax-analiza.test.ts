import { describe, it, expect } from 'vitest';
import { modDrax, scrieModul, esteAnalizaDrax, indicatiiDrax, masiniLiber } from './drax-analiza';
import { fixtureDrax } from './drax-fixture.test-util';

const m = (s: string) => modDrax(new URLSearchParams(s));

describe('modDrax — modurile rutei drax-optimizari (F3 S4)', () => {
  it('tabelul complet', () => {
    expect(m('')).toEqual({ tip: 'png' });
    expect(m('saptamina=2026-09-14')).toEqual({ tip: 'png' });
    expect(m('poster=1')).toEqual({ tip: 'poster', force: false, dry: false });
    expect(m('poster=1&force=1')).toEqual({ tip: 'poster', force: true, dry: false });
    expect(m('indicatii=1&dry=1')).toEqual({ tip: 'indicatii', force: false, dry: true });
    expect(m('liber=1&dry=1&saptamina=2026-09-14')).toEqual({ tip: 'liber', force: false, dry: true });
    for (const s of ['send=1', 'poster=1&liber=1', 'poster=1&indicatii=1', 'liber=yes', 'force=1', 'dry=1', 'liber=1&dry=true', 'saptamina=2026-9-14', 'saptamina=x'])
      expect(m(s)).toMatchObject({ tip: 'eroare', status: 400 });
  });
  it('invariant: fără mod explicit, sau cu dry, nimic nu atinge Telegram sau baza', () => {
    for (const s of ['', 'liber=1&dry=1', 'poster=1&dry=1', 'indicatii=1&dry=1', 'send=1', 'force=1']) expect(scrieModul(m(s))).toBe(false);
    for (const s of ['poster=1', 'indicatii=1', 'liber=1']) expect(scrieModul(m(s))).toBe(true);
  });
});

describe('esteAnalizaDrax', () => {
  it('acceptă rândul Drăxlmaier, respinge Briceni și nimic', () => {
    expect(esteAnalizaDrax(fixtureDrax())).toBe(true);
    expect(esteAnalizaDrax({ uzina: 'BRICENI', saptamina: '2026-09-14', masini: [] })).toBe(false);
    expect(esteAnalizaDrax(null)).toBe(false);
    expect(esteAnalizaDrax({ ...fixtureDrax(), economie: {} })).toBe(false);
  });
});

describe('indicatiiDrax (§12)', () => {
  it('top peste pragul de 100 km, cu întrebările R1b / R3, fără R1a, fără lei și fără casă', () => {
    const t = indicatiiDrax(fixtureDrax(), 'https://x')!;
    expect(t).toContain('<b>345KAJ</b>');
    expect(t).toContain('la capăt sau la uzină, nu acasă?');
    expect(t).not.toContain('024XKY');
    expect(t).not.toMatch(/lei|Zăicani|R1a/);
    expect(t).toContain('https://x/lde/reguli?saptamina=2026-09-14&amp;uz=drax'.replace('&amp;', '&'));
  });
  it('R3 peste 0 → întrebarea «așteaptă lângă uzină?»', () => {
    const a = fixtureDrax(); a.indicatii.top = [{ m: '024XKY', R1b: 0, R3: 150, R1a: 0, zile: '4/5', R1bR3: 150 }];
    expect(indicatiiDrax(a, 'https://x')).toContain('între tur și retur −150 km/săpt.: așteaptă lângă uzină?');
  });
  it('nimic peste prag → null (tăcere)', () => {
    const a = fixtureDrax(); a.indicatii.top = []; expect(indicatiiDrax(a, 'https://x')).toBeNull();
    a.indicatii.top = [{ m: 'X', R1b: 50, R3: 20, R1a: 900, zile: '5/5', R1bR3: 70 }]; expect(indicatiiDrax(a, 'https://x')).toBeNull();
  });
});

describe('masiniLiber', () => {
  it('doar mașinile cu analiza §11, în forma textTimpLiber', () => {
    const a = fixtureDrax(); a.masini[0].liber = null;
    expect(masiniLiber(a).map((x) => x.masina)).toEqual(['024XKY']);
  });
});
