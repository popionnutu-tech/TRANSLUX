import { describe, expect, it } from 'vitest';
import { curseleZilei, gasesteNeconformitati, textMesaj, ziuaRu, type Atribuire, type Trecere } from './neconformitati';

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

  it('plecarea cu 5+ min înainte de grafic e neconformitate; 1–4 min, întârzierea și ora exactă nu (Ion, 07.10)', () => {
    const r = gasesteNeconformitati([
      tr(9, false, 'Briceni', -5), tr(9, false, 'Edineț', -4), tr(9, false, 'Bălți', 12), tr(9, false, 'Sîngerei', 3),
    ], [tur]);
    expect(r.lista).toHaveLength(1);
    expect(r.lista[0]).toMatchObject({ tip: 'devreme', gara: 'Briceni', minute: -5 });
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
  it('Sîngerei pe centură: aproape de linia rutei, dar la 950 m de centru = neconformitate (Ion, 07.10)', () => {
    const r = gasesteNeconformitati([
      { ...tr(9, false, 'Sîngerei', 0, 17), centru_m: 950 },
      { ...tr(9, true, 'Sîngerei', 0, 17), centru_m: 120 },
    ], [tur, retur]);
    expect(r.lista.map((x) => [x.tip, x.retur])).toEqual([['singerei', false]]);
    expect(textMesaj('06.10.2026, вторник', r, nume)).toContain('Не заехал в центр Сынджерей и не остановился на перекрёстке Врэнешть — 1');
  });
  it('oprirea la Intersecția Vrănești (centura) ține loc de centru, la tur și la retur (Ion, 07.10)', () => {
    const r = gasesteNeconformitati([
      { ...tr(9, false, 'Sîngerei', 0, 17), centru_m: 957, vranesti_s: 19 },
      { ...tr(9, true, 'Sîngerei', 0, 17), centru_m: 951, vranesti_s: 10 },
    ], [tur, retur]);
    expect(r.lista).toEqual([]);
  });
  it('trecut pe lângă Intersecția Vrănești fără oprire (sub 10 s) sau nemăsurat = abatere', () => {
    const r = gasesteNeconformitati([
      { ...tr(9, false, 'Sîngerei', 0, 17), centru_m: 957, vranesti_s: 9 },
      { ...tr(9, true, 'Sîngerei', 0, 17), centru_m: 951, vranesti_s: null },
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
    expect(textMesaj('04.10.2026, воскресенье', { lista: [], faraGps: [] }, nume)).toContain('✅ Нарушений нет');
  });
  it('rândurile cu ruta, șoferul, mașina și ora', () => {
    const r = gasesteNeconformitati([tr(9, false, 'Edineț', -8), tr(9, false, 'Sîngerei', 0)], [{ ruta: 9, retur: false, driver_id: 'a', vehicle_id: 'x' }]);
    const t = textMesaj('04.10.2026, воскресенье', r, nume);
    expect(t.split('\n')[0]).toBe('📅 <b>04.10.2026, воскресенье</b>');
    expect(t).toContain('Рейс 9 · Șofer a · ABx — Единец: по графику 06:10, выехал 06:02 (-8 мин)');
    expect(t).not.toContain('Сынджерей');
  });
  it('ultimul rând: cursele pline ies din analiză (Ion, 07.10), și în ziua curată', () => {
    const nota = '<i>Рейсы, на которых микроавтобус был заполнен, будут исключены из анализа (проверка по подсчёту пассажиров).</i>';
    const r = { lista: [{ tip: 'singerei' as const, ruta: 1, retur: true, driver_id: 'a', vehicle_id: 'x' }], faraGps: [] };
    expect(textMesaj('z', r, nume).split('\n').at(-1)).toBe(nota);
    expect(textMesaj('z', { lista: [], faraGps: [] }, nume).split('\n').at(-1)).toBe(nota);
  });
  it('escapează numele', () => {
    const r = { lista: [{ tip: 'singerei' as const, ruta: 1, retur: true, driver_id: '<b>', vehicle_id: null }], faraGps: [] };
    expect(textMesaj('z', r, nume)).toContain('Șofer &lt;b&gt;');
  });
});

describe('ziuaRu + fără GPS', () => {
  it('data în rusă, iar cursele fără GPS nu apar în mesaj (Ion, 07.10)', () => {
    expect(ziuaRu('2026-10-06')).toBe('06.10.2026, вторник');
    const t = textMesaj('06.10.2026, вторник', { lista: [], faraGps: [{ ruta: 8, retur: false, driver_id: null, vehicle_id: null }] }, nume);
    expect(t).not.toContain('8');
    expect(t).toContain('✅ Нарушений нет');
  });
});
