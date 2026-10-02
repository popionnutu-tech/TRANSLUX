import { describe, expect, it } from 'vitest';
import { buildScheduledTrips, segmentMinutes, type TimetableKmPair, type TimetableRoute, type TimetableStop } from './timetable';

// Fixture din baza reală (30.09.2026): rutele 2, 8, 13, 16 între Chișinău și Lipcani.
const route = (r: Partial<TimetableRoute> & { id: number }): TimetableRoute => ({
  dest_to_ro: '', dest_to_ru: '', dest_from_ro: '', dest_from_ru: '',
  time_chisinau: null, time_nord: null, tariff_id_tur: null, tariff_id_retur: null,
  retur_ascuns: false, tur_ascuns: false, ...r,
});

const ROUTES: TimetableRoute[] = [
  route({ id: 2, tariff_id_tur: 104, tariff_id_retur: 105, retur_ascuns: true, dest_to_ro: 'Chișinău - Briceni', dest_from_ro: 'Briceni - Chișinău', time_nord: '05:45 - 08:20' }),
  route({ id: 8, tariff_id_tur: 106, tariff_id_retur: 105, dest_to_ro: 'Chișinău - Criva', dest_from_ro: 'Criva - Chișinău', time_chisinau: '20:00 - 00:05' }),
  route({ id: 13, tariff_id_tur: 110, tariff_id_retur: 109, tur_ascuns: true, dest_to_ro: 'Chișinău - Lipcani (Rîșcani)' }),
  route({ id: 16, tariff_id_tur: 106, tariff_id_retur: 105, dest_to_ro: 'Chișinău - Lipcani' }),
];

const CHISINAU: TimetableStop[] = [
  { crm_route_id: 2, stop_order: 340, hour_from_chisinau: '17:50', hour_from_nord: '09:50' },
  { crm_route_id: 8, stop_order: 410, hour_from_chisinau: '20:00', hour_from_nord: '18:10' },
  { crm_route_id: 13, stop_order: 430, hour_from_chisinau: '08:00', hour_from_nord: '21:45' },
  { crm_route_id: 16, stop_order: 410, hour_from_chisinau: '10:40', hour_from_nord: '07:30' },
];
const LIPCANI: TimetableStop[] = [
  { crm_route_id: 2, stop_order: 5, hour_from_chisinau: '22:30', hour_from_nord: '04:55' },
  { crm_route_id: 8, stop_order: 40, hour_from_chisinau: '00:00', hour_from_nord: '13:10' },
  { crm_route_id: 13, stop_order: 10, hour_from_chisinau: '14:40', hour_from_nord: '15:00' },
  { crm_route_id: 16, stop_order: 40, hour_from_chisinau: '15:00', hour_from_nord: '03:15' },
];

const km = (tariff_id: number, kmVal: number): TimetableKmPair => ({
  tariff_id, km: String(kmVal), from_district: null, to_district: 'briceni', start_district: 'briceni',
});
// A→B urmat de B→A, cu rânduri duble ca în v_interurban_v2_km_pairs.
const KM: TimetableKmPair[] = [
  km(105, 265), km(105, 265), km(109, 295), km(118, 266),
  km(98, 285), km(104, 275), km(106, 265), km(106, 265), km(110, 295),
];

const base = { routes: ROUTES, kmPairs: KM, rateLong: 1.16, rateSub: 0.9 };

describe('buildScheduledTrips — Chișinău → Lipcani', () => {
  const trips = buildScheduledTrips({ ...base, fromStops: CHISINAU, toStops: LIPCANI });

  it('ascunde ruta 2 (retur_ascuns), păstrează 13, 16 și 8, sortate după oră', () => {
    expect(trips.map((t) => [t.routeId, t.time, t.arrival])).toEqual([
      [13, '08:00', '14:40'],
      [16, '10:40', '15:00'],
      [8, '20:00', '00:00'],
    ]);
    expect(trips.every((t) => t.goingNorth)).toBe(true);
  });

  it('«00:00» e oră reală: durata peste miezul nopții e pozitivă', () => {
    const r8 = trips.find((t) => t.routeId === 8)!;
    expect(r8.segmentMinutes).toBe(240);
    expect(r8.routeDuration).toBe('20:00 - 00:05');
    expect(r8.destination_ro).toBe('Chișinău - Criva');
  });

  it('prețul = km × rata lungă, pe tariful sensului', () => {
    expect(trips.find((t) => t.routeId === 16)!.price).toBe(307); // 265 × 1.16
    expect(trips.find((t) => t.routeId === 13)!.price).toBe(342); // 295 × 1.16
  });
});

describe('buildScheduledTrips — Lipcani → Chișinău', () => {
  const trips = buildScheduledTrips({ ...base, fromStops: LIPCANI, toStops: CHISINAU });

  it('ascunde ruta 13 (tur_ascuns), destinația e dest_from', () => {
    expect(trips.map((t) => [t.routeId, t.time, t.arrival])).toEqual([
      [16, '03:15', '07:30'],
      [2, '04:55', '09:50'],
      [8, '13:10', '18:10'],
    ]);
    expect(trips.find((t) => t.routeId === 2)!.destination_ro).toBe('Briceni - Chișinău');
    expect(trips.every((t) => !t.goingNorth)).toBe(true);
  });
});

describe('buildScheduledTrips — reguli de excludere', () => {
  it('fără pereche km pe tariful sensului → cursa nu apare', () => {
    const trips = buildScheduledTrips({ ...base, kmPairs: KM.filter((k) => k.tariff_id !== 105), fromStops: CHISINAU, toStops: LIPCANI });
    expect(trips.map((t) => t.routeId)).toEqual([13]);
  });

  it('«0:00» la plecare = nu oprește; «0:00» la sosire = sosire goală', () => {
    const from = CHISINAU.map((s) => (s.crm_route_id === 16 ? { ...s, hour_from_chisinau: '0:00' } : s));
    const to = LIPCANI.map((s) => (s.crm_route_id === 13 ? { ...s, hour_from_chisinau: '0:00' } : s));
    const trips = buildScheduledTrips({ ...base, fromStops: from, toStops: to });
    expect(trips.map((t) => t.routeId)).toEqual([13, 8]);
    expect(trips[0].arrival).toBe('');
    expect(trips[0].segmentMinutes).toBeNull();
  });

  it('fără tarif (rate null) prețul e 0, cursa rămâne', () => {
    const trips = buildScheduledTrips({ ...base, rateLong: null, fromStops: CHISINAU, toStops: LIPCANI });
    expect(trips).toHaveLength(3);
    expect(trips.every((t) => t.price === 0)).toBe(true);
  });
});

describe('segmentMinutes', () => {
  it('trece peste miezul nopții', () => {
    expect(segmentMinutes('23:35', '00:20')).toBe(45);
    expect(segmentMinutes('10:40', '15:00')).toBe(260);
    expect(segmentMinutes('10:40', '')).toBeNull();
  });
});
