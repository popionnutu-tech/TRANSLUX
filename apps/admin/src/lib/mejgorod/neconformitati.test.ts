import { describe, expect, it } from 'vitest';
import { curseleZilei, gasesteNeconformitati, textMesaj, type Atribuire, type Trecere } from './neconformitati';

const asg = (o: Partial<Atribuire>): Atribuire => ({
  crm_route_id: null, retur_route_id: null, driver_id: null, driver_id_retur: null, vehicle_id: null, vehicle_id_retur: null, ...o,
});
const tr = (ruta: number, nord: boolean, stop: string, offset: number, dist = 20): Trecere => ({
  crm_route_id: ruta, going_north: nord, stop_name: stop, scheduled: '06:10',
  passed_at: '2026-10-04T03:02:00Z', offset_min: offset, distance_m: dist, vehicle_id: 'v',
});
const nume = { sofer: (id: string | null) => (id ? `Șofer ${id}` : null), masina: (id: string | null) => (id ? `AB${id}` : null), ora: () => '06:02' };

describe('curseleZilei', () => {
  it('turul din rândul rutei, returul cu șoferul și mașina de retur', () => {
    const c = curseleZilei([asg({ crm_route_id: 9, driver_id: 'a', driver_id_retur: 'b', vehicle_id: 'x', vehicle_id_retur: 'y' })]);
    expect(c).toEqual([
      { ruta: 9, retur: false, driver_id: 'a', vehicle_id: 'x' },
      { ruta: 9, retur: true, driver_id: 'b', vehicle_id: 'y' },
    ]);
  });
  it('returul încrucișat (retur_route_id) câștigă în fața rândului rutei', () => {
    const c = curseleZilei([
      asg({ crm_route_id: 2, retur_route_id: 16, driver_id: 'a', vehicle_id: 'x' }),
      asg({ crm_route_id: 16, driver_id: 'b', vehicle_id: 'y' }),
    ]);
    expect(c.find((k) => k.ruta === 16 && k.retur)).toEqual({ ruta: 16, retur: true, driver_id: 'a', vehicle_id: 'x' });
    expect(c.find((k) => k.ruta === 2 && k.retur)).toBeUndefined();
  });
  it('fără mașină nu e tur', () => {
    expect(curseleZilei([asg({ crm_route_id: 3, driver_id: 'a' })]).filter((k) => !k.retur)).toEqual([]);
  });
});

describe('gasesteNeconformitati', () => {
  const tur = { ruta: 9, retur: false, driver_id: 'a', vehicle_id: 'x' };
  const retur = { ruta: 9, retur: true, driver_id: 'b', vehicle_id: 'y' };

  it('plecarea înainte de grafic e neconformitate, întârzierea și ora exactă nu', () => {
    const r = gasesteNeconformitati([
      tr(9, false, 'Briceni', -1), tr(9, false, 'Edineț', 0), tr(9, false, 'Bălți', 12), tr(9, false, 'Sîngerei', 3),
    ], [tur]);
    expect(r.lista).toHaveLength(1);
    expect(r.lista[0]).toMatchObject({ tip: 'devreme', gara: 'Briceni', minute: -1 });
  });
  it('pe retur plecarea devreme din gări nu contează', () => {
    const r = gasesteNeconformitati([tr(9, true, 'Bălți', -20), tr(9, true, 'Sîngerei', 0)], [retur]);
    expect(r.lista).toEqual([]);
  });
  it('Sîngerei lipsă sau departe = neconformitate pe ambele sensuri', () => {
    const r = gasesteNeconformitati([
      tr(9, false, 'Bălți', 2), tr(9, true, 'Sîngerei', 0, 900),
    ], [tur, retur]);
    expect(r.lista.map((x) => [x.tip, x.retur])).toEqual([['singerei', false], ['singerei', true]]);
  });
  it('cursa fără GPS nu se judecă, merge în lista separată', () => {
    const r = gasesteNeconformitati([], [tur]);
    expect(r.lista).toEqual([]);
    expect(r.faraGps).toEqual([tur]);
  });
});

describe('textMesaj', () => {
  it('zi curată', () => {
    expect(textMesaj('duminică, 04.10.2026', { lista: [], faraGps: [] }, nume)).toContain('✅ Fără neconformități');
  });
  it('rândurile cu ruta, șoferul, mașina și ora', () => {
    const r = gasesteNeconformitati([tr(9, false, 'Edineț', -8), tr(9, false, 'Sîngerei', 0)], [{ ruta: 9, retur: false, driver_id: 'a', vehicle_id: 'x' }]);
    const t = textMesaj('duminică, 04.10.2026', r, nume);
    expect(t).toContain('Ruta 9 · Șofer a · ABx — Edineț: grafic 06:10, plecat 06:02 (-8 min)');
    expect(t).not.toContain('Sîngerei —');
  });
  it('escapează numele', () => {
    const r = { lista: [{ tip: 'singerei' as const, ruta: 1, retur: true, driver_id: '<b>', vehicle_id: null }], faraGps: [] };
    expect(textMesaj('z', r, nume)).toContain('Șofer &lt;b&gt;');
  });
});
