import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ getSupabase: () => ({ from: vi.fn() }) }));

import { ziuaRo, graficGroupCaption, graficSnapshot, diffGraficSnapshots } from './grafic-group';

describe('grafic-group', () => {
  it('ziuaRo: ziua săptămânii din data calendaristică, fără fus orar', () => {
    expect(ziuaRo('2026-09-08')).toBe('marți, 08.09.2026');
    expect(ziuaRo('2026-09-06')).toBe('duminică, 06.09.2026');
    expect(ziuaRo('2026-01-01')).toBe('joi, 01.01.2026');
  });

  it('caption: ziua + numărul de curse, fără mențiunea de corectare la prima trimitere', () => {
    const c = graficGroupCaption('2026-09-08', 27, false);
    expect(c).toContain('marți, 08.09.2026');
    expect(c).toContain('27 curse');
    expect(c).not.toContain('corectat');
  });

  it('caption: retrimiterea spune limpede că înlocuiește imaginea de mai devreme', () => {
    const c = graficGroupCaption('2026-09-08', 1, true);
    expect(c).toContain('1 cursă');
    expect(c).toContain('Grafic corectat');
  });

  const row = (o: Partial<Parameters<typeof graficSnapshot>[0][number]>) => ({
    crm_route_id: 1, time_nord: '05:00', dest_to: 'Chișinău - Briceni', time_chisinau: '15:55',
    driver_id: 'd1', driver_full_name: 'Docuciaev Dumitru', driver_name: 'Dumitru',
    vehicle_plate: '123 ABC', vehicle_plate_retur: null, cancelled: false, ...o,
  });

  it('diff: șofer schimbat, cu cine era', () => {
    const prev = graficSnapshot([row({})]);
    const next = graficSnapshot([row({ driver_id: 'd2', driver_full_name: 'Ciobanu Ion' })]);
    expect(diffGraficSnapshots(prev, next)).toEqual(['• 05:00 Briceni: șofer schimbat — Ciobanu Ion (era Docuciaev Dumitru)']);
  });

  it('diff: șofer nou pe cursă goală, fără șofer, anulată, repusă', () => {
    const gol = graficSnapshot([row({ driver_id: null, driver_full_name: null })]);
    const plin = graficSnapshot([row({})]);
    expect(diffGraficSnapshots(gol, plin)).toEqual(['• 05:00 Briceni: șofer nou — Docuciaev Dumitru']);
    expect(diffGraficSnapshots(plin, gol)).toEqual(['• 05:00 Briceni: fără șofer (era Docuciaev Dumitru)']);
    const anulat = graficSnapshot([row({ cancelled: true })]);
    expect(diffGraficSnapshots(plin, anulat)).toEqual(['• 05:00 Briceni: cursa ANULATĂ (era Docuciaev Dumitru)']);
    expect(diffGraficSnapshots(anulat, plin)).toEqual(['• 05:00 Briceni: cursa REPUSĂ în grafic — Docuciaev Dumitru']);
  });

  it('diff: retur și mașină pe aceeași cursă, într-un singur rând; ordinea după oră', () => {
    const prev = graficSnapshot([row({}), row({ crm_route_id: 2, time_nord: '02:35', dest_to: 'Chișinău - Lipcani', driver_id: 'd3', driver_full_name: 'Zaiț S.' })]);
    const next = graficSnapshot([
      row({ time_chisinau: '13:00', vehicle_plate: '319 YEK' }),
      row({ crm_route_id: 2, time_nord: '02:35', dest_to: 'Chișinău - Lipcani', driver_id: 'd4', driver_full_name: 'Rusu Vasile' }),
    ]);
    expect(diffGraficSnapshots(prev, next)).toEqual([
      '• 02:35 Lipcani: șofer schimbat — Rusu Vasile (era Zaiț S.)',
      '• 05:00 Briceni: retur din Chișinău 13:00 (era 15:55); mașina 319 YEK (era 123 ABC)',
    ]);
  });

  it('diff: foaia de parcurs sau o cursă fără șofer nu produc rânduri', () => {
    const a = graficSnapshot([row({}), row({ crm_route_id: 9, driver_id: null, driver_full_name: null })]);
    const b = graficSnapshot([row({}), row({ crm_route_id: 9, driver_id: null, driver_full_name: null, vehicle_plate: 'X' })]);
    expect(diffGraficSnapshots(a, b)).toEqual([]);
  });

  it('caption cu schimbări: le listează, escapează HTML și stă sub 1024 de caractere', () => {
    const c = graficGroupCaption('2026-09-08', 27, true, ['• 05:00 Briceni: șofer nou — <Ion>']);
    expect(c).toContain('Grafic actualizat');
    expect(c).toContain('&lt;Ion&gt;');
    expect(c).not.toContain('Grafic corectat');
    const multe = Array.from({ length: 60 }, (_, i) => `• ${String(i).padStart(2, '0')}:00 Cursa ${i}: șofer schimbat — Nume Foarte Lung ${i} (era Alt Nume Lung ${i})`);
    const lung = graficGroupCaption('2026-09-08', 27, true, multe);
    expect(lung.length).toBeLessThanOrEqual(1024);
    expect(lung).toMatch(/… și încă \d+ schimbări/);
  });
});

describe('grafic-group: albumul cu plecările din Chișinău', () => {
  it('caption: spune care imagine e care doar când pleacă și a doua', () => {
    expect(graficGroupCaption('2026-09-10', 27, false, [], true)).toContain('2️⃣ plecările din Chișinău');
    expect(graficGroupCaption('2026-09-10', 27, false, [], false)).not.toContain('plecările din Chișinău');
  });
});
