import { describe, expect, it } from 'vitest';
import { calculeazaCurse, incarcaCurse, normalizeStop, resolveTariffRates, stopFilterValue, type DateCurse } from './pret';

// Fixture din baza reală (02.10.2026): Briceni → Chișinău, rutele 2 (Briceni, tur 104 / retur 105,
// retur ascuns), 7 (Criva, 106 / 105) și 29 (Ocnița, 122 / 120); tariful din 25.09.2026: 1,19 / 1,29.
const BRICENI_CHISINAU: DateCurse = {
  fromStops: [
    { crm_route_id: 2, stop_order: 10, hour_from_chisinau: '21:40', hour_from_nord: '05:45' },
    { crm_route_id: 7, stop_order: 80, hour_from_chisinau: '21:50', hour_from_nord: '12:05' },
    { crm_route_id: 29, stop_order: 5, hour_from_chisinau: '23:10', hour_from_nord: '08:30' },
  ],
  toStops: [
    { crm_route_id: 2, stop_order: 340, hour_from_chisinau: '17:50', hour_from_nord: '09:50' },
    { crm_route_id: 7, stop_order: 410, hour_from_chisinau: '18:30', hour_from_nord: '16:10' },
    { crm_route_id: 29, stop_order: 360, hour_from_chisinau: '18:10', hour_from_nord: '14:35' },
  ],
  matchingRouteIds: [2, 7, 29],
  routes: [
    { id: 2, dest_to_ro: 'Chișinău - Briceni', dest_to_ru: 'Кишинёв - Бричаны', dest_from_ro: 'Briceni - Chișinău', dest_from_ru: 'Бричаны - Кишинёв', time_chisinau: '17:50 - 21:40', time_nord: '05:45 - 08:20', tariff_id_tur: 104, tariff_id_retur: 105, retur_ascuns: true, tur_ascuns: false },
    { id: 7, dest_to_ro: 'Chișinău - Criva', dest_to_ru: 'Кишинёв - Крива', dest_from_ro: 'Criva - Chișinău', dest_from_ru: 'Крива - Кишинёв', time_chisinau: '18:30 - 22:35', time_nord: '11:00 - 15:35', tariff_id_tur: 106, tariff_id_retur: 105, retur_ascuns: false, tur_ascuns: false },
    { id: 29, dest_to_ro: 'Chișinău - Ocnița', dest_to_ru: 'Кишинёв - Окница', dest_from_ro: 'Ocnița - Chișinău', dest_from_ru: 'Окница - Кишинёв', time_chisinau: '18:10 - 21:50', time_nord: '09:50 - 13:50', tariff_id_tur: 122, tariff_id_retur: 120, retur_ascuns: false, tur_ascuns: false },
  ],
  kmPairs: [
    { tariff_id: 106, km: 238, from_district: 'briceni', to_district: null, start_district: 'briceni' },
    { tariff_id: 105, km: 238, from_district: null, to_district: 'briceni', start_district: 'briceni' },
    { tariff_id: 104, km: 238, from_district: 'briceni', to_district: null, start_district: 'briceni' },
    { tariff_id: 122, km: 287, from_district: 'briceni', to_district: null, start_district: 'briceni' },
    { tariff_id: 120, km: 287, from_district: null, to_district: 'briceni', start_district: 'briceni' },
  ],
  rates: { rateLong: 1.19, rateSub: 1.29 },
  offer: null,
};

describe('calculeazaCurse — Briceni → Chișinău (fixture 02.10.2026)', () => {
  it('dă aceleași curse și prețuri ca searchTrips de pe site: 238 km × 1,19 = 283, ruta 29 pe 287 km = 342', () => {
    const curse = calculeazaCurse(BRICENI_CHISINAU, '2026-10-03');
    expect(curse.map((c) => [c.routeId, c.time, c.price, c.originalPrice])).toEqual([
      [2, '05:45', 283, null],
      [29, '08:30', 342, null],
      [7, '12:05', 283, null],
    ]);
    expect(curse.every((c) => !c.goingNorth)).toBe(true);
  });

  it('oferta zilei înlocuiește prețul și păstrează originalul tăiat (Bălți → Chișinău, 158 → 138 la 1,19)', () => {
    const d: DateCurse = {
      ...BRICENI_CHISINAU,
      offer: { from_locality: 'Bălți', to_locality: 'Chișinău', original_price: 158, offer_price: 138 },
    };
    const curse = calculeazaCurse(d, '2026-10-03');
    expect(curse[0].originalPrice).toBe(283);
    expect(curse[0].price).toBeLessThan(283);
    expect(curse.every((c) => c.price === curse[0].price)).toBe(true);
  });

  it('fără tarif prețul e 0, nu lipsește cursa', () => {
    const curse = calculeazaCurse({ ...BRICENI_CHISINAU, rates: { rateLong: null, rateSub: null } }, '2026-10-03');
    expect(curse.length).toBe(3);
    expect(curse.every((c) => c.price === 0)).toBe(true);
  });
});

describe('normalizeStop / stopFilterValue', () => {
  it('normalizează ca la import: diacritice, sufixe, prefixe', () => {
    expect(normalizeStop('Chișinău')).toBe('chisinau');
    expect(normalizeStop('Briceni Translux')).toBe('briceni');
    expect(normalizeStop('Ocnița GA')).toBe('ocnita');
    expect(normalizeStop('Sl. Mare')).toBe('slobozia mare');
    expect(normalizeStop('Caracusenii Noi/-')).toBe('caracusenii noi');
    expect(stopFilterValue('Criva (Larga)')).toBe('criva larga');
  });
});

/** Client fals: răspunde fiecărui `.from(tabel)` cu rândurile pregătite, indiferent de filtre. */
function dbFals(raspunsuri: Record<string, unknown[]>, apeluri: string[] = []) {
  const q = (table: string) => {
    const rows = raspunsuri[table] ?? [];
    const builder: Record<string, unknown> = {};
    const self = () => builder;
    for (const m of ['select', 'eq', 'ilike', 'in', 'lte', 'gte', 'order', 'limit']) builder[m] = self;
    builder.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    builder.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok);
    return builder;
  };
  return { from: (table: string) => { apeluri.push(table); return q(table); } };
}

describe('resolveTariffRates', () => {
  it('ia perioada care acoperă data; fără ea cade pe cea mai recentă începută; fără nimic → null', async () => {
    const cuPerioada = await resolveTariffRates(dbFals({ tariff_periods: [{ rate_interurban_long: '1.19', rate_suburban: '1.29' }] }), '2026-10-03');
    expect(cuPerioada).toEqual({ rateLong: 1.19, rateSub: 1.29 });
    const fara = await resolveTariffRates(dbFals({ tariff_periods: [] }), '2026-10-03');
    expect(fara).toEqual({ rateLong: null, rateSub: null });
  });
});

describe('incarcaCurse', () => {
  it('întoarce null când o oprire lipsește sau nicio rută nu le are pe amândouă', async () => {
    expect(await incarcaCurse(dbFals({ crm_stop_fares: [] }), { fromRo: 'X', toRo: 'Y', date: '2026-10-03' })).toBeNull();
  });

  it('încarcă opririle, rutele, km-ii în ambele sensuri, tariful și oferta', async () => {
    const apeluri: string[] = [];
    const db = dbFals({
      crm_stop_fares: [{ crm_route_id: 2, stop_order: 10, hour_from_chisinau: '21:40', hour_from_nord: '05:45', name_ro: 'Briceni' }],
      crm_routes: [BRICENI_CHISINAU.routes[0]],
      v_interurban_v2_km_pairs: [{ tariff_id: 104, km: 238, from_district: 'briceni', to_district: null, start_district: 'briceni' }],
      offers: [],
      tariff_periods: [{ rate_interurban_long: 1.19, rate_suburban: 1.29 }],
    }, apeluri);
    const d = await incarcaCurse(db, { fromRo: 'Briceni', toRo: 'Chișinău', date: '2026-10-03' });
    expect(d?.matchingRouteIds).toEqual([2]);
    expect(d?.kmPairs.length).toBe(2);
    expect(d?.rates).toEqual({ rateLong: 1.19, rateSub: 1.29 });
    expect(d?.offer).toBeNull();
    expect(apeluri.filter((t) => t === 'crm_stop_fares').length).toBe(2);
    // numele canonic al opririi ajunge la apelant (punctele de urcare se caută după el, ION-198)
    expect(d?.fromStops[0].name_ro).toBe('Briceni');
  });
});
