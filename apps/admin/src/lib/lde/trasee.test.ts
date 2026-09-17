import { describe, it, expect } from 'vitest';
import { costPereche, propuneriSchimb, economieCumulata, haversineKm, type RutaCost, type SoferCurent } from './trasee';

const ruta = (id: string, lat: number, lon: number): RutaCost => ({
  factory_route_id: id, eticheta: `ruta ${id}`,
  primaStatie: { lat, lon }, ultimaStatie: { lat, lon },
});

describe('costul unei perechi șofer↔rută', () => {
  it('e dusul + întorsul de acasă la prima stație', () => {
    const c = costPereche({ lat: 47.0, lon: 28.0 }, ruta('A', 47.09, 28.0));
    expect(c).toBeCloseTo(2 * haversineKm({ lat: 47, lon: 28 }, { lat: 47.09, lon: 28 }), 1);
  });

  it('fără bază sau fără etalon → null, NU o estimare inventată', () => {
    expect(costPereche(null, ruta('A', 47, 28))).toBeNull();
    expect(costPereche({ lat: 47, lon: 28 }, { ...ruta('A', 47, 28), primaStatie: null })).toBeNull();
  });
});

describe('propunerile de schimb', () => {
  const rute = new Map([['A', ruta('A', 47.5, 28.0)], ['B', ruta('B', 47.0, 28.0)]]);

  it('găsește schimbul evident: fiecare e pe ruta celuilalt', () => {
    const soferi: SoferCurent[] = [
      { driver_id: 's1', nume: 'Unu', baza: { lat: 47.0, lon: 28.0 }, factory_route_id: 'A' },
      { driver_id: 's2', nume: 'Doi', baza: { lat: 47.5, lon: 28.0 }, factory_route_id: 'B' },
    ];
    const p = propuneriSchimb(soferi, rute);
    expect(p).toHaveLength(1);
    expect(p[0].economie_km_zi).toBeGreaterThan(100);
    expect(p[0].a.pe).toBe('ruta B');
  });

  it('nu propune nimic când fiecare e deja pe ruta lui', () => {
    const soferi: SoferCurent[] = [
      { driver_id: 's1', nume: 'Unu', baza: { lat: 47.0, lon: 28.0 }, factory_route_id: 'B' },
      { driver_id: 's2', nume: 'Doi', baza: { lat: 47.5, lon: 28.0 }, factory_route_id: 'A' },
    ];
    expect(propuneriSchimb(soferi, rute)).toHaveLength(0);
  });

  it('sare perechea unde o singură latură e necunoscută', () => {
    const soferi: SoferCurent[] = [
      { driver_id: 's1', nume: 'Unu', baza: null, factory_route_id: 'A' },
      { driver_id: 's2', nume: 'Doi', baza: { lat: 47.5, lon: 28.0 }, factory_route_id: 'B' },
    ];
    expect(propuneriSchimb(soferi, rute)).toHaveLength(0);
  });

  it('economia cumulată nu folosește același șofer de două ori', () => {
    const rute3 = new Map([...rute, ['C', ruta('C', 48.0, 28.0)]]);
    const soferi: SoferCurent[] = [
      { driver_id: 's1', nume: 'Unu', baza: { lat: 47.0, lon: 28.0 }, factory_route_id: 'A' },
      { driver_id: 's2', nume: 'Doi', baza: { lat: 47.5, lon: 28.0 }, factory_route_id: 'B' },
      { driver_id: 's3', nume: 'Trei', baza: { lat: 48.0, lon: 28.0 }, factory_route_id: 'C' },
    ];
    const { aplicabile } = economieCumulata(propuneriSchimb(soferi, rute3));
    const ids = aplicabile.flatMap((p) => [p.a.driver_id, p.b.driver_id]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('costul cere AMBELE capete (defect găsit 17.09, perechea Popescu–Pangalos)', () => {
  it('ruta fără etalon de retur nu primește jumătate de formulă', () => {
    const doarTur: RutaCost = { factory_route_id: 'X', eticheta: 'X', primaStatie: { lat: 47.1, lon: 28.6 }, ultimaStatie: null };
    expect(costPereche({ lat: 47.5, lon: 28.8 }, doarTur)).toBeNull();
  });

  it('nu se compară o rută socotită „2 × dus" cu una socotită „dus + întors"', () => {
    // ruta A: dusul lung, întorsul scurt; ruta B: simetrică. Cu vechea formulă (dublarea
    // dusului când lipsea returul), A ar fi ieșit artificial scumpă și schimbul propus greșit.
    const A: RutaCost = { factory_route_id: 'A', eticheta: 'A', primaStatie: { lat: 47.9, lon: 28.0 }, ultimaStatie: { lat: 47.05, lon: 28.0 } };
    const B: RutaCost = { factory_route_id: 'B', eticheta: 'B', primaStatie: { lat: 47.2, lon: 28.0 }, ultimaStatie: { lat: 47.2, lon: 28.0 } };
    const baza = { lat: 47.0, lon: 28.0 };
    const cA = costPereche(baza, A)!, cB = costPereche(baza, B)!;
    // A = 100 km dus + 5,5 km întors ≈ 105; B = 22 + 22 = 44. Ambele pe aceeași formulă.
    expect(cA).toBeGreaterThan(cB);
    expect(cA).toBeLessThan(2 * haversineKm(baza, A.primaStatie!));
  });
});
