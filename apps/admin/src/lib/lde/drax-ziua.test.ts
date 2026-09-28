import { describe, it, expect } from 'vitest';
import { frazaSaptamana, grupeInterval, povesteZi, sumarSaptamana, textMiscare } from './drax-ziua';
import type { MasinaDrax } from './drax-analiza';
import fti925 from './drax-925fti-2026-09-14.fixture.json';
import kaj345 from './drax-345kaj-2026-09-14.fixture.json';

const fti = fti925 as unknown as MasinaDrax;
const kaj = kaj345 as unknown as MasinaDrax;
const luni = (m: MasinaDrax) => m.detalii.find((d) => d.z === '2026-09-14')!;

describe('ziua povestită — 925FTI luni 14.09', () => {
  const miscari = povesteZi(luni(fti), fti.casa);

  it('o linie pe mișcare, în ordine; drumul direct și ocolul pe același interval devin o singură linie', () => {
    expect(miscari.map((x) => x.text)).toEqual([
      '03:00–05:30 acasă (Sărata Veche) → Ilenuța, gol, 22 km',
      '05:30–06:20 Ilenuța → uzina, cu oameni, 38 km',
      '06:20–13:49 uzina → acasă (Sărata Veche) → Musteața, gol, 98 km — din care 52 km doar pentru că a trecut pe acasă',
      '13:49–14:32 Musteața → uzina, cu oameni, 43 km',
      '14:32–15:52 pe lângă uzină, gol, 7 km',
      '15:52–16:30 uzina → Ilenuța, cu oameni, 38 km',
      '16:30–00:14 Ilenuța → acasă (Sărata Veche) → uzina, gol, cu o oprire la parcul de lângă uzină, 79 km — din care 41 km doar pentru că a trecut pe acasă',
      '00:14–00:52 uzina → Musteața, cu oameni, 44 km',
      '00:52–03:00 Musteața → acasă (Sărata Veche), gol, 42 km',
    ]);
  });

  it('niciun interval de două ori; km-ii zilei se păstrează', () => {
    const ore = miscari.map((x) => x.ora);
    expect(new Set(ore).size).toBe(ore.length);
    const kmBucati = luni(fti).bucati.reduce((s, b) => s + b.km, 0);
    expect(miscari.reduce((s, x) => s + x.km, 0)).toBeCloseTo(kmBucati, 0);
  });

  it('«în plus pe acasă» al zilei = R1b măsurat al zilei', () => {
    expect(miscari.reduce((s, x) => s + x.kmPeAcasa, 0)).toBeCloseTo(luni(fti).economie!.R1b, 0);
  });
});

describe('grupeInterval și textMiscare', () => {
  it('bucățile cu aceeași oră consecutive se unesc', () => {
    expect(grupeInterval(luni(fti).bucati).map((g) => g.length)).toEqual([1, 1, 2, 1, 1, 1, 3, 1, 1]);
  });
  it('cursă de prânz și drum pe loc', () => {
    expect(textMiscare({ ora: '10:00–11:00', tip: 'cuOameni', traseu: ['Sofia', 'uzina'], km: 30.4, kmPeAcasa: 0, parc: false, pranz: true }))
      .toBe('10:00–11:00 Sofia → uzina, cu oameni, cursă de prânz, 30 km');
    expect(textMiscare({ ora: '14:35–15:53', tip: 'gol', traseu: ['uzina', 'uzina'], km: 15, kmPeAcasa: 0, parc: true, pranz: false }))
      .toBe('14:35–15:53 pe lângă uzină, gol, cu o oprire la parcul de lângă uzină, 15 km');
  });
});

describe('fraza săptămânii (în locul rândului «Măsurat…»)', () => {
  it('925FTI: zilele măsurate, drumul pe acasă = R1b măsurat', () => {
    const s = sumarSaptamana(fti);
    expect(s.zile).toBe(4);
    expect(s.peAcasa).toBe(Math.round(fti.economie.R1b + fti.economie.R3));
    expect(frazaSaptamana(fti, { kmSapt: 475.1, parti: { dimineata: { kmZi: 51.6, kmSapt: 258 }, seara: { kmZi: 43.4, kmSapt: 217.1 } } })).toBe(
      'În cele 4 zile măsurate din 5: 639 km cu oameni, 994 km goi. Drumul acasă între curse: dimineața ≈ 52 km, seara ≈ 43 km pe zi (475 pe săptămână).');
  });
  it('fără drum acasă: o spune', () => {
    expect(frazaSaptamana(fti, { kmSapt: 0, parti: { dimineata: { kmZi: 0, kmSapt: 0 }, seara: { kmZi: 0, kmSapt: 0 } } })).toMatch(/Între curse nu merge acasă\.$/);
  });
  it('345KAJ: aceeași regulă', () => {
    expect(sumarSaptamana(kaj).peAcasa).toBe(Math.round(kaj.economie.R1b + kaj.economie.R3));
  });
});

describe('ION-119 — drumul între porți e cursă între uzine, nu gol', () => {
  const b = (x: Partial<import('./drax-analiza').BucataDrax>) => ({ t0: 0, t1: 1, golImpus: 0, ocol: false, pranz: false, de: null, pana: null, lin: null, motiv: null, ...x }) as import('./drax-analiza').BucataDrax;
  const zi = (bucati: import('./drax-analiza').BucataDrax[]) => ({ z: '2026-09-14', bucati } as unknown as import('./drax-analiza').ZiDrax);

  it('mișcarea doar între porți: «poarta VEST → poarta EST, cursă între uzine»', () => {
    const [x] = povesteZi(zi([b({ ora: '14:32–15:52', cat: 'intreUzine', km: 7.1, porti: 'VEST → EST' })]), null);
    expect(x.tip).toBe('intreUzine');
    expect(x.text).toBe('14:32–15:52 poarta VEST → poarta EST, cursă între uzine, 7 km');
  });

  it('dus-întors între porți: toate porțile în ordine', () => {
    const [x] = povesteZi(zi([b({ ora: '06:20–06:40', cat: 'intreUzine', km: 7, porti: 'EST → VEST, VEST → EST' })]), null);
    expect(x.text).toBe('06:20–06:40 poarta EST → poarta VEST → poarta EST, cursă între uzine, 7 km');
  });

  it('mișcarea mixtă: golul rămâne gol, porțiunea între porți se spune separat și nu intră în gol', () => {
    const [x] = povesteZi(zi([
      b({ ora: '16:30–00:14', cat: 'livrare', km: 40, ocol: true, acasa: 'Sărata Veche' }),
      b({ ora: '16:30–00:14', cat: 'legatura', km: 30 }),
      b({ ora: '16:30–00:14', cat: 'intreUzine', km: 3.4, porti: 'VEST → EST' }),
    ]), 'Sărata Veche');
    expect(x.tip).toBe('gol');
    expect(x.km).toBe(70);
    expect(x.text).toContain('plus 3 km cursă între uzine (poarta VEST → poarta EST)');
  });
});
