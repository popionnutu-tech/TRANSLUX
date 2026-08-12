import { describe, it, expect } from 'vitest';
import { weekDates, valideazaZileMulti } from './saptamana';

describe('weekDates', () => {
  it('miercuri → săptămâna L 10.08 – D 16.08', () => {
    expect(weekDates('2026-08-12')).toEqual([
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13',
      '2026-08-14', '2026-08-15', '2026-08-16',
    ]);
  });
  it('luni → începe cu ea însăși', () => {
    expect(weekDates('2026-08-10')[0]).toBe('2026-08-10');
  });
  it('duminică → începe cu lunea din urmă', () => {
    expect(weekDates('2026-08-16')).toEqual(weekDates('2026-08-10'));
  });
  it('trecere de an', () => {
    expect(weekDates('2026-01-01')).toEqual([
      '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01',
      '2026-01-02', '2026-01-03', '2026-01-04',
    ]);
  });
});

describe('valideazaZileMulti', () => {
  const today = '2026-08-12';

  it('dedupe + sortare', () => {
    expect(valideazaZileMulti(['2026-08-13', '2026-08-11', '2026-08-11'], today)).toEqual([
      '2026-08-11', '2026-08-13',
    ]);
  });

  it('8 zile distincte → aruncă Maxim 7 zile', () => {
    const dates = Array.from({ length: 8 }, (_, i) => `2026-08-${String(10 + i).padStart(2, '0')}`);
    expect(() => valideazaZileMulti(dates, today)).toThrow('Maxim 7 zile');
  });

  it('32 de zile în viitor → aruncă Dată în afara intervalului', () => {
    expect(() => valideazaZileMulti(['2026-09-13'], today)).toThrow('Dată în afara intervalului');
  });

  it('31 de zile în viitor → trece', () => {
    expect(valideazaZileMulti(['2026-09-12'], today)).toEqual(['2026-09-12']);
  });

  it('31 de zile în trecut → trece (limită)', () => {
    expect(valideazaZileMulti(['2026-07-12'], today)).toEqual(['2026-07-12']);
  });

  it('32 de zile în trecut → aruncă', () => {
    expect(() => valideazaZileMulti(['2026-07-11'], today)).toThrow('Dată în afara intervalului');
  });

  it('format invalid (garbage) → aruncă Dată invalidă', () => {
    expect(() => valideazaZileMulti(['abc'], today)).toThrow('Dată invalidă');
  });
});
