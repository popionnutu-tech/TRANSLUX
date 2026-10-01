import { describe, expect, it } from 'vitest';
import { mesajTraseu, type Verificare } from './camioane-traseu';

const r = (o: Partial<Verificare>): Verificare => ({
  placa: 'RWN193', tip: 'biodiesel', de: 'Бердичев', pana: 'Русе (через ZEL)', km_gps: 1123, km_ideal: 896, km_plus: 227, lei_plus: 0,
  abateri: [
    { cod: 'dupa_zel', text: 'после ZEL через Кишинёв, а не сразу на Албицу', km: 112 },
    { cod: 'baza', text: 'заезд на База Бричены (стоял 28 ч), не по пути', km: 54 },
    { cod: 'ro_drum', text: 'в Румынии по другой дороге: через Пантелимон', km: 32 },
    { cod: 'km', text: '1123 km вместо 896 km', km: 227 },
    { cod: 'stai', text: 'стоял: ZEL 79 ч, Албица 56 ч' },
    { cod: 'traseu', text: '', ideal: 'x', real: 'y' },
  ], ok: false, ...o,
});

describe('mesajTraseu (ION-144, forma din 01.10)', () => {
  it('pe mașină: traseul, km față de ideal, cauzele numerotate cu km în față, stările', () => {
    const [m] = mesajTraseu('2026-09-30', [r({})]);
    expect(m).toContain('<b>RWN193</b> · биодизель Бердичев → Русе (через ZEL)');
    expect(m).toContain('1 123 км вместо 896 · <b>+227 км</b>');
    expect(m).toContain('1. +112 — после ZEL через Кишинёв');
    expect(m).toContain('2. +54 — заезд на База Бричены');
    expect(m).toContain('3. +32 — в Румынии');
    expect(m).toContain('4. +29 — прочее, без точной причины');
    expect(m).toContain('<i>Стоял: ZEL 79 ч, Албица 56 ч</i>');
    expect(m).not.toContain('1123 km вместо');
  });

  it('mașinile în regulă nu apar; fără abateri — o linie', () => {
    const [m] = mesajTraseu('2026-09-30', [r({}), r({ placa: 'LJN076', ok: true, abateri: [] })]);
    expect(m).not.toContain('LJN076');
    expect(mesajTraseu('2026-09-30', [r({ ok: true, abateri: [] })])).toEqual(['🚚 <b>Цистерны · отчёт за 30.09</b>\n✅ Рейсов: 1, все по маршруту.']);
  });

  it('escapează HTML și împarte mesajele lungi', () => {
    const multe = Array.from({ length: 60 }, (_, i) => r({ placa: `P${String(i).padStart(3, '0')}`, de: 'A<B' }));
    const b = mesajTraseu('2026-09-30', multe);
    expect(b.length).toBeGreaterThan(1);
    expect(b.every((x) => x.length <= 4096)).toBe(true);
    expect(b.join('')).toContain('A&lt;B');
  });
});
