import { describe, expect, it } from 'vitest';
import { comparatie, lastFullMonth, monthBounds, monthsDesc, rutaRand, ruteSumar, shiftMonthKey, soferRand } from './raport';
import type { TikiComparatie, TikiRuta, TikiSoferV2 } from './types';

describe('luni', () => {
  it('ultima lună întreagă', () => {
    expect(lastFullMonth('2026-09-30')).toBe('2026-09');
    expect(lastFullMonth('2026-10-01')).toBe('2026-09');
    expect(lastFullMonth('2026-01-15')).toBe('2025-12');
  });
  it('limitele lunii și mutarea', () => {
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2025-09', -12)).toBe('2024-09');
    expect(monthsDesc('2026-07-20', '2026-09-02')).toEqual(['2026-09', '2026-08', '2026-07']);
  });
});

const ruta = (o: Partial<TikiRuta>): TikiRuta => ({
  route: 1, de_la: 'Briceni', pana_la: 'Chișinău', time_nord: '05:00', time_chisinau: '15:00',
  zile_circulate: 30, zile_numarate: 20, tiki: 900, lei: 90000, tiki_c: 600, fara_c: 400, top: [], top_tiki: [], mici: 300, mici_fara_c: 100, ...o,
});

describe('rute', () => {
  it('TIKI pe zi circulată, fără bilet pe zi complet numărată', () => {
    const r = rutaRand(ruta({ top: [{ cheie: 'a|b', de_la: 'A', pana_la: 'B', tiki: 300, fara: 200 }] }));
    expect(r.numarata).toBe(true);
    expect(r.tikiZi).toBe(30);
    expect(r.faraZi).toBe(20);
    expect(r.oameniZi).toBe(50);
    expect(r.top[0]).toEqual({ nume: 'A – B', oameniZi: 25, pct: 50 });
    expect(r.miciZi).toBe(15);          // 300/30 TIKI + 100/20 fără bilet
    expect(r.miciPct).toBe(30);         // din 50 oameni pe zi
  });
  it('sub 50 % zile complet numărate: fără «fără bilet», clienții doar din TIKI', () => {
    const r = rutaRand(ruta({ zile_numarate: 14, top: [{ cheie: 'a|b', de_la: 'A', pana_la: 'B', tiki: 1, fara: 1 }],
                              top_tiki: [{ cheie: 'c|d', de_la: 'C', pana_la: 'D', tiki: 450 }] }));
    expect(r.numarata).toBe(false);
    expect(r.faraZi).toBeNull();
    expect(r.oameniZi).toBeNull();
    expect(r.topDoarTiki).toBe(true);
    expect(r.top).toEqual([{ nume: 'C – D', oameniZi: 15, pct: 50 }]);
  });
  it('media pe rută doar peste rutele estimate', () => {
    const s = ruteSumar([rutaRand(ruta({})), rutaRand(ruta({ zile_numarate: 0, tiki: 3000 }))]);
    expect(s).toMatchObject({ circulate: 2, estimate: 1, oameniZi: 50 });
  });
});

const cmp = (o: Partial<TikiComparatie>): TikiComparatie => ({
  zile_a: 30, zile_b: 31, numarare_a: true, numarare_b: true, rute_circulate: 30, rute_incluse: 27, rute_excluse: [],
  perechi: [], ...o,
});

describe('comparație', () => {
  it('perioade de lungimi diferite: diferența pe zi', () => {
    const c = comparatie(cmp({ perechi: [{ cheie: 'a|b', de_la: 'A', pana_la: 'B', tiki_a: 300, tiki_b: 310, fara_a: 300, fara_b: 310 }] }));
    expect(c.cuFara).toBe(true);
    expect(c.randuri[0].oameniA).toBe(600);
    expect(c.randuri[0].difZi).toBeCloseTo(0, 6);   // 20 pe zi în ambele
  });
  it('fără Numărare într-o perioadă: doar TIKI', () => {
    const c = comparatie(cmp({ numarare_b: false, perechi: [{ cheie: 'a|b', de_la: 'A', pana_la: 'B', tiki_a: 60, tiki_b: 31, fara_a: 5, fara_b: 0 }] }));
    expect(c.cuFara).toBe(false);
    expect(c.randuri[0].faraA).toBeNull();
    expect(c.randuri[0].difZi).toBeCloseTo(1, 6);
  });
  it('primele N, «Altele», Total; cea mai mare scădere sus', () => {
    const perechi = Array.from({ length: 5 }, (_, i) => ({
      cheie: `k${i}`, de_la: `A${i}`, pana_la: 'B', tiki_a: 100 * (i + 1) - i * 40, tiki_b: 100 * (i + 1), fara_a: 0, fara_b: 0,
    }));
    const c = comparatie(cmp({ zile_a: 1, zile_b: 1, perechi }), 3);
    expect(c.randuri).toHaveLength(4);
    expect(c.randuri[0].nume).toBe('A4 – B');
    expect(c.randuri[3].nume).toBe('Altele (2)');
    expect(c.total.tikiB).toBe(1500);
  });
});

describe('șoferi', () => {
  const s = (o: Partial<TikiSoferV2>): TikiSoferV2 => ({
    sofer: 'X', zile: 10, curse: 30, bilete: 600, lei: 60000, curse_comp: 20, bilete_comp: 400, asteptat: 440,
    ruta: 1, ruta_de_la: 'Briceni', ruta_ora: '05:00', ...o,
  });
  it('diferența doar pe cursele comparabile', () => {
    const r = soferRand(s({}));
    expect(r.peCursa).toBe(20);
    expect(r.colegiPeCursa).toBe(22);
    expect(r.difPeCursa).toBe(-2);
    expect(r.dif).toBe(-40);
    expect(r.leiZi).toBe(6000);
  });
  it('fără curse comparabile: «nu are cu cine fi comparat»', () => {
    const r = soferRand(s({ curse_comp: 0, bilete_comp: 0, asteptat: 0 }));
    expect(r.dif).toBeNull();
    expect(r.colegiPeCursa).toBeNull();
  });
});

describe('numele rutei', () => {
  it('capătul din nord', async () => {
    const { capatNord } = await import('./raport');
    expect(capatNord('Grimăncăuți - Chișinău', 'Chișinău - Grimăncăuți')).toBe('Grimăncăuți');
    expect(capatNord('Chișinău', 'Ocnița')).toBe('Ocnița');
  });
});

describe('graficul rutei', () => {
  it('12 luni, anul trecut, oameni pe zi doar pe lunile numărate', async () => {
    const { seriiRuta } = await import('./raport');
    const rows = [
      { route: 1, luna: '2026-09', zile_circulate: 30, zile_numarate: 30, tiki: 900, tiki_c: 900, fara_c: 600 },
      { route: 1, luna: '2025-09', zile_circulate: 30, zile_numarate: 0, tiki: 800, tiki_c: 0, fara_c: 0 },
      { route: 2, luna: '2026-09', zile_circulate: 30, zile_numarate: 30, tiki: 5, tiki_c: 5, fara_c: 0 },
    ];
    const g = seriiRuta(rows, 1, '2026-09');
    expect(g.months[0]).toBe('2025-10');
    expect(g.cur[11]).toBe(900);
    expect(g.prev[11]).toBe(800);
    expect(g.oameniZi[11]).toBe(50);
    expect(g.cur[0]).toBeNull();
  });
});
