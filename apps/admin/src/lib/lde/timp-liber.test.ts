import { describe, it, expect } from 'vitest';
import { textTimpLiber, perioada, PLAFON } from './timp-liber';
import type { TimpLiberMasina } from '@/app/(dashboard)/lde/reguli/actions';

const L = (km: number, extra: Partial<TimpLiberMasina> = {}): TimpLiberMasina => ({
  km, prag_km: 50, peste_prag: km >= 50, zile: 2, iesiri: [
    { zi: '2026-09-15', de_la: '16:00', pana_la: '18:00', km: km / 2, departare: 40, eticheta: 'liber', loc_principal: 'Fălești', repetat: true, opriri: [] },
    { zi: '2026-09-16', de_la: '16:00', pana_la: '18:00', km: km / 2, departare: 40, eticheta: 'liber', loc_principal: 'Fălești', repetat: true, opriri: [] },
  ], ...extra });

describe('textTimpLiber', () => {
  it('nimic peste prag → null (tăcere)', () => {
    expect(textTimpLiber('2026-09-14', '2026-09-20', [{ masina: 'A', liber: L(12) }, { masina: 'B' }], 50, 'https://x')).toBeNull();
  });
  it('o mașină peste prag: km, zile, ieșiri, locul repetat, link din saptamina', () => {
    const t = textTimpLiber('2026-09-14', '2026-09-20', [{ masina: '456BRAX', liber: L(87.1) }], 50, 'https://central-hub-md.vercel.app')!;
    expect(t).toContain('14–20 septembrie');
    expect(t).toContain('<b>456BRAX</b> — 87,1 km liber în 2 zile, 2 ieșiri, 2 în același loc în zile diferite');
    expect(t).toContain('href="https://central-hub-md.vercel.app/lde/reguli?saptamina=2026-09-14"');
    expect(t).not.toMatch(/Fălești/);   // opririle și locurile NU pleacă pe Telegram
  });
  it('ordinea e după km, descrescător', () => {
    const t = textTimpLiber('2026-09-14', '2026-09-20', [{ masina: 'MIC', liber: L(60) }, { masina: 'MARE', liber: L(120) }], 50, 'https://x')!;
    expect(t.indexOf('MARE')).toBeLessThan(t.indexOf('MIC'));
  });
  it('scapă HTML-ul din numele mașinii și din perioadă', () => {
    const t = textTimpLiber('2026-09-14', '2026-09-20', [{ masina: 'A<b>&', liber: L(70) }], 50, 'https://x')!;
    expect(t).toContain('A&lt;b&gt;&amp;');
    expect(t).not.toContain('A<b>&');
  });
  it('plafonul taie pe linii întregi și spune câte a lăsat', () => {
    const multe = Array.from({ length: 200 }, (_, i) => ({ masina: `MASINA-${String(i).padStart(3, '0')}`, liber: L(60 + i) }));
    const t = textTimpLiber('2026-09-14', '2026-09-20', multe, 50, 'https://x')!;
    expect(t.length).toBeLessThanOrEqual(PLAFON);
    expect(t).toMatch(/… și încă \d+/);
    expect((t.match(/<b>/g) || []).length).toBe((t.match(/<\/b>/g) || []).length);   // tag-uri închise
  });
  it('perioada peste două luni', () => {
    expect(perioada('2026-09-28', '2026-10-04')).toBe('28 septembrie – 4 octombrie');
  });
});
