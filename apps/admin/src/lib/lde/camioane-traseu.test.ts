import { describe, expect, it } from 'vitest';
import { mesajTraseu, type Verificare } from './camioane-traseu';

const r = (o: Partial<Verificare>): Verificare => ({
  placa: 'KWX620', tip: 'incarcata', de: 'Petromidia', pana: 'Bacioi', km_gps: 621, km_ideal: 399, km_plus: 222, lei_plus: 2437,
  abateri: [{ cod: 'vama', text: 'vama Albița în loc de Giurgiulești' }, { cod: 'a2', text: 'A2 prin Fetești–Slobozia, nu drumul de jos' }], ok: false, ...o,
});

describe('mesajTraseu (ION-144)', () => {
  it('mașinile în regulă nu apar', () => {
    const [m] = mesajTraseu('2026-08-28', [r({}), r({ placa: 'LJN076', ok: true, abateri: [], km_plus: 5 })]);
    expect(m).toContain('KWX620');
    expect(m).not.toContain('LJN076');
    expect(m).toContain('1</b> mașină, 1 din 2 drumuri');
    expect(m).toContain('+222');
  });

  it('drumul ideal și cel real, totalul și părțile cu km în față', () => {
    const [m] = mesajTraseu('2026-09-26', [r({ placa: 'HMK135', km_gps: 662, km_ideal: 430, km_plus: 232, lei_plus: 2877, abateri: [
      { cod: 'vama', text: 'vama Albița în loc de Giurgiulești', km: 29 },
      { cod: 'drum', text: 'România: A2 (Fetești–Slobozia), nu prin Măcin', km: 77 },
      { cod: 'drum', text: 'Moldova: ocol prin Cricova → Orhei', km: 126 },
      { cod: 'km', text: '662 km în loc de 430 km', km: 232 },
      { cod: 'traseu', text: '', ideal: 'Giurgiulești · 430 km · Constanța → Măcin → Galați → Chișinău', real: 'Albița · 662 km · Constanța → Fetești → Albița → Orhei → Chișinău' },
    ] })]);
    expect(m).toContain('ideal: Giurgiulești · 430 km');
    expect(m).toContain('real: Albița · 662 km');
    expect(m).toContain('<b>+232 km</b>, din care:');
    expect(m).not.toContain('lei');
    expect(m).toContain('<code>+29</code> vama Albița');
    expect(m).toContain('<code>+126</code> Moldova');
    expect(m).not.toContain('662 km în loc de 430 km');
  });

  it('fără abateri: o singură linie', () => {
    expect(mesajTraseu('2026-08-28', [r({ ok: true, abateri: [] })])).toEqual(['🚚 <b>Cisterne · traseul de ieri, 28.08.2026</b>\n✅ 1 drum, toate pe traseu.']);
  });

  it('escapează HTML și împarte mesajele lungi', () => {
    const multe = Array.from({ length: 80 }, (_, i) => r({ placa: `P${String(i).padStart(3, '0')}`, de: 'A<B' }));
    const b = mesajTraseu('2026-08-28', multe);
    expect(b.length).toBeGreaterThan(1);
    expect(b.every((x) => x.length <= 4096)).toBe(true);
    expect(b.join('')).toContain('A&lt;B');
  });
});
