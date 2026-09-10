import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ getSupabase: () => ({ from: vi.fn() }) }));

import { buildGraficReturRows } from './grafic-data';

const routes = [
  { id: 1, time_chisinau: '14:30 - 18:00', dest_to_ro: 'Chișinău - Lipcani' },
  { id: 2, time_chisinau: '10:40', dest_to_ro: 'Chișinău - Criva (Larga)' },
  { id: 3, time_chisinau: '8:00', dest_to_ro: 'Chișinău - Ocnița' },
];
const drivers = new Map([
  ['d1', { full_name: 'Strasnii Alexandru', phone: '+37369353782' }],
  ['d2', { full_name: 'Zait Serghei', phone: '069401448' }],
]);
const vehicles = new Map([
  ['v1', { plate_number: '784 MJW' }],
  ['v9', { plate_number: '999 RET' }],
]);

describe('buildGraficReturRows — graficul «din Chișinău»', () => {
  it('șoferul rutei face și returul ei; ordinea după ora din Chișinău; ruta «Chișinău - X»', () => {
    const rows = buildGraficReturRows(routes, [
      { crm_route_id: 1, driver_id: 'd1', vehicle_id: 'v1' },
      { crm_route_id: 3, driver_id: 'd2', vehicle_id: null },
    ], drivers, vehicles, new Set());
    expect(rows.map(r => `${r.time_chisinau} ${r.dest_to}`)).toEqual([
      '08:00 Chișinău - Ocnița', '10:40 Chișinău - Criva (Larga)', '14:30 Chișinău - Lipcani',
    ]);
    const lipcani = rows.find(r => r.crm_route_id === 1)!;
    expect(lipcani.driver_full_name).toBe('Strasnii Alexandru');
    expect(lipcani.driver_phone).toBe('069353782');
    expect(lipcani.vehicle_plate).toBe('784 MJW');
    expect(rows.find(r => r.crm_route_id === 2)!.driver_id).toBeNull();
  });

  it('retur dat altcuiva: apare la ruta luată, cu mașina de retur; ruta lui rămâne fără șofer', () => {
    const rows = buildGraficReturRows(routes, [
      { crm_route_id: 1, driver_id: 'd1', vehicle_id: 'v1', vehicle_id_retur: 'v9', retur_route_id: 2 },
    ], drivers, vehicles, new Set());
    const criva = rows.find(r => r.crm_route_id === 2)!;
    expect(criva.driver_full_name).toBe('Strasnii Alexandru');
    expect(criva.vehicle_plate).toBe('999 RET');
    expect(rows.find(r => r.crm_route_id === 1)!.driver_id).toBeNull();
  });

  it('cursa anulată e marcată; șoferul inactiv/necunoscut lasă rândul fără șofer', () => {
    const rows = buildGraficReturRows(routes, [
      { crm_route_id: 1, driver_id: 'd1', vehicle_id: 'v1' },
      { crm_route_id: 2, driver_id: 'necunoscut', vehicle_id: null },
    ], drivers, vehicles, new Set([1]));
    expect(rows.find(r => r.crm_route_id === 1)!.cancelled).toBe(true);
    expect(rows.find(r => r.crm_route_id === 2)!.driver_id).toBeNull();
  });
});
