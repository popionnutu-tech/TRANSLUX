import { describe, it, expect } from 'vitest';
import { povesteZi } from './drax-ziua';
import { masiniSaptamana, oraLocala, durata, eticZi, type ZiHarta, type RandListaHarta } from './drax-harta';
import zi446 from './drax-harta-446asb-2026-09-14.fixture.json';

const zi = zi446 as unknown as ZiHarta;

describe('ION-130 — harta 446ASB luni 14.09', () => {
  it('fiecare rând din «Ziua făcută, drum cu drum» are intervalul lui pe hartă (aceeași oră)', () => {
    const ore = new Set(zi.iv.map((v) => v.ora));
    const miscari = povesteZi(zi.zi!, zi.casa?.n ?? null);
    expect(miscari.length).toBe(9);
    for (const x of miscari) expect(ore.has(x.ora)).toBe(true);
  });
  it('cele 4 curse cu oameni sunt «cursa», nopțile și drumurile goale «gol»', () => {
    expect(zi.iv.filter((v) => v.tip === 'cursa').map((v) => v.ora)).toEqual(['04:29–06:18', '13:27–14:54', '15:52–17:05', '00:22–01:28']);
    expect(zi.iv.find((v) => v.ora === '01:28–03:00')?.tip).toBe('gol');
  });
  it('km pe intervale = totalul zilei', () => {
    expect(zi.iv.reduce((s, v) => s + v.km, 0)).toBeCloseTo(413.2, 0);
  });
  it('ora locală din secundele zilei (Chișinău, vara UTC+3)', () => {
    expect(oraLocala(zi.t00, 0)).toBe('03:00');
    expect(oraLocala(zi.t00, 5340)).toBe('04:29');
  });
});

describe('lista mașinilor', () => {
  const r = (m: string, z: string, economie: number | null, total = 100): RandListaHarta =>
    ({ m, z, sumar: { dow: 1, total, cuOameni: 50, gol: 50, economie, ideal: null, linii: [`R1|${m}`] } });
  it('suma economiei pe zile, cele mai mari întâi; zilele în ordine', () => {
    const L = masiniSaptamana([r('B', '2026-09-15', 10), r('A', '2026-09-14', 5), r('B', '2026-09-14', 30), r('A', '2026-09-15', null)]);
    expect(L.map((x) => [x.m, x.economie, x.zile])).toEqual([['B', 40, ['2026-09-14', '2026-09-15']], ['A', 5, ['2026-09-14', '2026-09-15']]]);
  });
  it('durata și eticheta zilei', () => {
    expect(durata(299 * 60)).toBe('4 h 59 min');
    expect(durata(20 * 60)).toBe('20 min');
    expect(eticZi('2026-09-14')).toBe('lun 14.09');
  });
});
