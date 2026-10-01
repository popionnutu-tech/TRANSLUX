import { describe, it, expect } from 'vitest';
import {
  depTime, mondayOf, weekGrid, othersShare, fmtRangePct, orarSignals, compareMonths, windowMonths, tariffSteps,
  legSegments, netMarks, dayCell,
} from './analiza';
import type { OrarLeg, OrarRoute, TendintaLuna, ClientiTronson, ClientiZi } from './types';

const leg = (o: Partial<OrarLeg>): OrarLeg => ({
  leg: 'nord_chisinau', bilete: 0, lei: 0, plecari: 0, plecari_fara_bilete: 0, din_grafic: true, plin_tiki: null,
  bilete_an_trecut: null, eticheta_comuna: false, zile_sapt: null, saptamani: null, ...o,
});
const route = (id: number, coridor: string, l: Partial<OrarLeg>, t = '08:00 - 12:00'): OrarRoute => ({
  route_id: id, coridor, nume: `R${id}`, time_nord: t, time_chisinau: '15:00 - 19:00', picioare: [leg(l)],
});

describe('ora plecării', () => {
  it('prima parte din «02:35 - 07:00»', () => {
    expect(depTime('02:35 - 07:00')).toBe('02:35');
    expect(depTime('7:05 - 12:20')).toBe('07:05');
    expect(depTime(null)).toBeNull();
    expect(depTime('fără oră')).toBeNull();
  });
});

describe('săptămânile', () => {
  it('lunea săptămânii', () => {
    expect(mondayOf('2026-10-01')).toBe('2026-09-28'); // joi
    expect(mondayOf('2026-09-28')).toBe('2026-09-28');
    expect(mondayOf('2026-10-04')).toBe('2026-09-28'); // duminică
  });
  it('săptămâna neterminată nu intră; anul trecut = cu 364 de zile în urmă; lipsa = gol', () => {
    const g = weekGrid([['2026-09-21', 83], ['2026-09-28', 39], ['2025-09-22', 70]], '2026-09-30', 4);
    expect(g.weeks).toEqual(['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21']);
    expect(g.cur).toEqual([null, null, null, 83]);
    expect(g.prev).toEqual([null, null, null, 70]);
  });
});

describe('ceilalți din drumul făcut', () => {
  it('interval când TIKI e interval', () => {
    const s = othersShare({ om_km_numarat: 1000, om_km_tiki_min: 620, om_km_tiki_max: 700 });
    expect(s!.min).toBeCloseTo(30); expect(s!.max).toBeCloseTo(38);
    expect(fmtRangePct(s)).toBe('30–38 %');
    expect(fmtRangePct(othersShare({ om_km_numarat: 1000, om_km_tiki_min: 750, om_km_tiki_max: 750 }))).toBe('25 %');
  });
  it('fără numărare = nu știm', () => {
    expect(othersShare({ om_km_numarat: 0, om_km_tiki_min: 0, om_km_tiki_max: 0 })).toBeNull();
  });
});

describe('«De decis»', () => {
  const base = [
    route(1, 'Criva', { bilete: 600, plecari: 30 }),
    route(2, 'Criva', { bilete: 540, plecari: 30 }),
    route(3, 'Criva', { bilete: 660, plecari: 30 }),
  ];
  it('slabă față de coridor și în scădere față de anul trecut', () => {
    const s = orarSignals([...base, route(4, 'Criva', { bilete: 150, plecari: 30, bilete_an_trecut: 300 })]);
    expect(s).toHaveLength(1);
    expect(s[0].route_id).toBe(4);
    expect(s[0].kind).toBe('slaba');
    expect(s[0].text).toContain('-50 %');
  });
  it('niciodată pe o etichetă comună', () => {
    expect(orarSignals([...base, route(4, 'Criva', { bilete: 150, plecari: 30, eticheta_comuna: true })])).toHaveLength(0);
  });
  it('slabă dar în creștere față de anul trecut nu e semnal', () => {
    expect(orarSignals([...base, route(4, 'Criva', { bilete: 150, plecari: 30, bilete_an_trecut: 100 })])).toHaveLength(0);
  });
  it('multe plecări din grafic fără bilete', () => {
    const s = orarSignals([...base, route(5, 'Criva', { bilete: 500, plecari: 30, plecari_fara_bilete: 10 })]);
    expect(s.map(x => x.kind)).toEqual(['fara_bilete']);
  });
  it('cel mult 5', () => {
    const many = Array.from({ length: 9 }, (_, i) => route(10 + i, 'Criva', { bilete: 300, plecari: 30, plecari_fara_bilete: 15 }));
    expect(orarSignals(many)).toHaveLength(5);
  });
});

describe('față de anul trecut', () => {
  const row = (luna: string, coridor: string, bilete: number, lei = bilete * 100): TendintaLuna =>
    ({ luna, coridor, bilete, lei, zile: 30, ultima_zi: `${luna}-28` });
  it('luna în curs se compară pe aceleași zile', () => {
    const rows = [row('2026-09', 'Criva', 1500), row('2025-09', 'Criva', 3000)];
    const t = compareMonths(rows, ['2026-09'], '2026-09-15');
    expect(t.prev.bilete).toBe(1500);          // 3000 × 15/30
    expect(t.partialDays).toBe(15);
    expect(t.missing).toEqual([]);
  });
  it('lunile fără date anul trecut se spun', () => {
    const t = compareMonths([row('2026-09', 'Criva', 10)], windowMonths('12luni', '2026-09'), '2026-09-30');
    expect(t.missing).toHaveLength(12);
  });
  it('ferestrele', () => {
    expect(windowMonths('an', '2026-03')).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(windowMonths('12luni', '2026-09')[0]).toBe('2025-10');
  });
  it('treptele de tarif', () => {
    const s = tariffSteps([{ luna: '2026-02', pret: 99.8 }, { luna: '2026-03', pret: 102.3 }, { luna: '2026-04', pret: 121.7 }, { luna: '2026-05', pret: 120.6 }]);
    expect([...s.keys()]).toEqual(['2026-03', '2026-04']);
  });
});

describe('cine merge pe rută', () => {
  const t = (stop_order: number, km: number, km_next: number | null, numarat: number, tiki: number): ClientiTronson =>
    ({ leg: 'nord_chisinau', stop_order, stop: `S${stop_order}`, km, km_next, numarat, tiki_min: tiki, tiki_max: tiki, zile: 10 });
  it('tronsoanele și urcările / coborârile nete ale celorlalți', () => {
    const segs = legSegments([t(1, 0, 10, 5, 5), t(2, 10, 30, 9, 5), t(3, 30, 50, 6, 5), t(4, 50, null, 0, 0)], 'nord_chisinau');
    expect(segs).toHaveLength(3);
    expect(netMarks(segs)).toEqual([{ stop: 'S2', km: 10, delta: 4 }, { stop: 'S3', km: 30, delta: -3 }]);
  });
  const z = (o: Partial<ClientiZi>): ClientiZi => ({
    zi: '2026-09-01', leg: 'nord_chisinau', eligibil: true, oameni_numarati: 0, oameni_tiki: 0, om_km: 0, om_km_tiki_min: 0, om_km_tiki_max: 0, ...o,
  });
  it('ziua: sigur, «?», «!»', () => {
    expect(dayCell([])).toMatchObject({ state: 'fara' });
    expect(dayCell([z({ oameni_numarati: 20, oameni_tiki: 15 })])).toMatchObject({ state: 'ok', tiki: 15, others: 5 });
    expect(dayCell([z({ oameni_tiki: 15, eligibil: false })])).toMatchObject({ state: 'necunoscut', others: null });
    expect(dayCell([z({ oameni_numarati: 10, oameni_tiki: 15 })])).toMatchObject({ state: 'neconcordanta', others: 0 });
  });
});
