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
