'use server';

import { unstable_cache } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { buildTurAssignmentMap, buildReturAssignmentMap } from '@/lib/assignments';

export interface Locality {
  id: number;
  name_ro: string;
  name_ru: string;
  is_major: boolean;
  sort_order: number;
}

export interface TripResult {
  time: string;
  arrivalTime: string;
  destination_ro: string;
  destination_ru: string;
  duration: string;
  driver: string | null;
  phone: string | null;
  vehicle_plate: string | null;
  price: number;
  originalPrice: number | null; // non-null when an offer applies (show crossed out)
}

export interface ActiveOffer {
  from_locality: string;
  to_locality: string;
  original_price: number;
  offer_price: number;
}

export async function getActiveOffers(): Promise<ActiveOffer[]> {
  const { data } = await getSupabase()
    .from('offers')
    .select('from_locality, to_locality, original_price, offer_price')
    .eq('active', true);
  return (data || []) as ActiveOffer[];
}

export async function getLocalities(): Promise<Locality[]> {
  const { data } = await getSupabase()
    .from('localities')
    .select('id, name_ro, name_ru, is_major, sort_order')
    .eq('active', true)
    .order('name_ro');
  return (data || []) as Locality[];
}

export interface PopularRoutePrice {
  from_ro: string;
  to_ro: string;
  from_ru: string;
  to_ru: string;
  price: number;
}

/** Fetch latest popular route prices from price_nomenclator (saved by ANTA cron) */
export async function getPopularPrices(): Promise<PopularRoutePrice[]> {
  const { data } = await getSupabase()
    .from('price_nomenclator')
    .select('prices')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (data?.prices) return data.prices as PopularRoutePrice[];

  // Fallback: compute from route_km_pairs if no nomenclator exists yet
  const routes = [
    { from: 'chisinau', to: 'balti', from_ro: 'Chișinău', to_ro: 'Bălți', from_ru: 'Кишинёв', to_ru: 'Бэлць' },
    { from: 'chisinau', to: 'edinet', from_ro: 'Chișinău', to_ro: 'Edineț', from_ru: 'Кишинёв', to_ru: 'Единец' },
    { from: 'chisinau', to: 'singerei', from_ro: 'Chișinău', to_ro: 'Sîngerei', from_ru: 'Кишинёв', to_ru: 'Сынжерей' },
    { from: 'chisinau', to: 'ocnita', from_ro: 'Chișinău', to_ro: 'Ocnița', from_ru: 'Кишинёв', to_ru: 'Окница' },
    { from: 'chisinau', to: 'otaci', from_ro: 'Chișinău', to_ro: 'Otaci', from_ru: 'Кишинёв', to_ru: 'Отачь' },
    { from: 'chisinau', to: 'briceni', from_ro: 'Chișinău', to_ro: 'Briceni', from_ru: 'Кишинёв', to_ru: 'Бричень' },
    { from: 'chisinau', to: 'cupcini', from_ro: 'Chișinău', to_ro: 'Cupcini', from_ru: 'Кишинёв', to_ru: 'Купчинь' },
    { from: 'chisinau', to: 'lipcani', from_ro: 'Chișinău', to_ro: 'Lipcani', from_ru: 'Кишинёв', to_ru: 'Липкань' },
    { from: 'chisinau', to: 'corjeuti', from_ro: 'Chișinău', to_ro: 'Corjeuți', from_ru: 'Кишинёв', to_ru: 'Коржеуць' },
    { from: 'chisinau', to: 'grimancauti', from_ro: 'Chișinău', to_ro: 'Grimăncăuți', from_ru: 'Кишинёв', to_ru: 'Гримэнкэуць' },
    { from: 'chisinau', to: 'criva', from_ro: 'Chișinău', to_ro: 'Criva', from_ru: 'Кишинёв', to_ru: 'Крива' },
    { from: 'chisinau', to: 'larga', from_ro: 'Chișinău', to_ro: 'Larga', from_ru: 'Кишинёв', to_ru: 'Ларга' },
  ];

  const supabase = getSupabase();

  const results = await Promise.all(
    routes.map(async (r) => {
      const { data: pairs } = await supabase
        .from('route_km_pairs')
        .select('price')
        .eq('from_stop', r.from)
        .eq('to_stop', r.to)
        .limit(1);

      return {
        from_ro: r.from_ro,
        to_ro: r.to_ro,
        from_ru: r.from_ru,
        to_ru: r.to_ru,
        price: pairs?.[0]?.price ?? 0,
      };
    })
  );

  return results;
}

/** Cached version of getLocalities for public pages (60s ISR) */
export const getCachedLocalities = unstable_cache(
  async () => getLocalities(),
  ['public-localities'],
  { revalidate: 60, tags: ['localities'] }
);

/** Cached version of getPopularPrices for public pages (60s ISR) */
export const getCachedPopularPrices = unstable_cache(
  async () => getPopularPrices(),
  ['public-popular-prices'],
  { revalidate: 60, tags: ['popular-prices'] }
);

/**
 * Normalize stop name: lowercase, remove diacritics, trim
 * Must match the normalization in import-km-prices.mjs
 */
function normalizeStop(name: string): string {
  let n = name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

  n = n.replace(/\s*translux$/i, '');
  n = n.replace(/\s+ga$/i, '');
  n = n.replace(/\(sat\)$/i, '');
  n = n.replace(/^ret\s+/i, '');
  n = n.replace(/^sl\.\s*/i, 'slobozia ');
  n = n.replace(/^-\//, '');
  n = n.replace(/\/-$/, '');

  const aliases: Record<string, string> = {
    'coteala': 'cotelea',
    'hlinaia': 'hlina',
    'criva vama': 'criva',
    'gordinestii noi': 'gordinesti',
    'intersectia tabani': 'tabani',
    'intersectia trestieni': 'halahora de sus',
    'intersectia riscani': 'riscani',
    'petrom riscani': 'riscani',
    'beleavinti': 'larga',
    'beleavinti/larga': 'larga',
    'berlinti/cotiujeni': 'cotiujeni',
    'caracusenii noi/-': 'caracusenii noi',
  };

  n = n.trim();
  return aliases[n] || n;
}

export async function searchTrips(
  fromRo: string,
  toRo: string,
  date: string,
): Promise<TripResult[]> {
  const supabase = getSupabase();

  // Fire-and-forget: log search query for analytics
  supabase.from('search_log').insert({
    from_locality: fromRo,
    to_locality: toRo,
    search_date: date,
  }).then(() => {});

  // Query 1+2: Get from/to stops in parallel
  const [{ data: fromStops }, { data: toStops }] = await Promise.all([
    supabase
      .from('crm_stop_fares')
      .select('id, crm_route_id, hour_from_chisinau, hour_from_nord')
      .ilike('name_ro', fromRo),
    supabase
      .from('crm_stop_fares')
      .select('id, crm_route_id, hour_from_chisinau, hour_from_nord')
      .ilike('name_ro', toRo),
  ]);

  if (!fromStops || !toStops || fromStops.length === 0 || toStops.length === 0) return [];

  const fromMap = new Map(fromStops.map((s: any) => [s.crm_route_id, s]));
  const toMap = new Map(toStops.map((s: any) => [s.crm_route_id, s]));

  const matchingRouteIds = [...fromMap.keys()].filter(id => toMap.has(id));
  if (matchingRouteIds.length === 0) return [];

  // Normalized stop names for km lookup — sanitize for PostgREST filter safety
  const fromNorm = normalizeStop(fromRo).replace(/[(),."'\\]/g, '');
  const toNorm = normalizeStop(toRo).replace(/[(),."'\\]/g, '');

  // Query 3+4+5+6+7: Get routes, prices, assignments, retur overrides AND offers in parallel
  const [{ data: routes }, { data: kmPairsA }, { data: kmPairsB }, { data: assignments }, { data: returOverrides }, { data: activeOffers }] = await Promise.all([
    supabase
      .from('crm_routes')
      .select('id, dest_to_ro, dest_to_ru, dest_from_ro, dest_from_ru, time_chisinau, time_nord, tariff_id_tur, tariff_id_retur')
      .in('id', matchingRouteIds)
      .eq('active', true),
    supabase
      .from('route_km_pairs')
      .select('tariff_id, price')
      .eq('from_stop', fromNorm)
      .eq('to_stop', toNorm),
    supabase
      .from('route_km_pairs')
      .select('tariff_id, price')
      .eq('from_stop', toNorm)
      .eq('to_stop', fromNorm),
    supabase
      .from('daily_assignments')
      .select('crm_route_id, driver_id, vehicle_id, vehicle_id_retur, retur_route_id')
      .eq('assignment_date', date)
      .in('crm_route_id', matchingRouteIds),
    supabase
      .from('daily_assignments')
      .select('crm_route_id, driver_id, vehicle_id, vehicle_id_retur, retur_route_id')
      .eq('assignment_date', date)
      .in('retur_route_id', matchingRouteIds),
    supabase
      .from('offers')
      .select('from_locality, to_locality, original_price, offer_price')
      .eq('active', true)
      .ilike('from_locality', fromRo)
      .ilike('to_locality', toRo),
  ]);

  if (!routes) return [];

  // Fetch drivers and vehicles separately to avoid Supabase FK join issues
  const allAssignments = [...(assignments || []), ...(returOverrides || [])];
  const driverIds = [...new Set(allAssignments.map((a: any) => a.driver_id).filter(Boolean))];
  const vehicleIds = [...new Set(allAssignments.flatMap((a: any) => [a.vehicle_id, a.vehicle_id_retur].filter(Boolean)))];

  const [{ data: driversData }, { data: vehiclesData }] = await Promise.all([
    driverIds.length > 0
      ? supabase.from('drivers').select('id, full_name, phone').in('id', driverIds)
      : Promise.resolve({ data: [] }),
    vehicleIds.length > 0
      ? supabase.from('vehicles').select('id, plate_number').in('id', vehicleIds)
      : Promise.resolve({ data: [] }),
  ]);

  const driverMap = new Map((driversData || []).map((d: any) => [d.id, d]));
  const vehicleMap = new Map((vehiclesData || []).map((v: any) => [v.id, v]));

  // Merge both direction results
  const kmPairs = [...(kmPairsA || []), ...(kmPairsB || [])];

  // Check if an offer applies to this search direction
  const offer = (activeOffers && activeOffers.length > 0) ? activeOffers[0] as any : null;

  // Build price lookup: tariff_id → price
  const priceMap = new Map<number, number>();
  for (const p of (kmPairs) as any[]) {
    if (!priceMap.has(p.tariff_id)) {
      priceMap.set(p.tariff_id, p.price);
    }
  }

  // Build tur/retur assignment maps using shared utility
  const turDriverMap = buildTurAssignmentMap(allAssignments as any[]);
  const returDriverMap = buildReturAssignmentMap(allAssignments as any[]);

  // Resolve driver_id/vehicle_id → display details
  function resolveDetails(resolved: { driver_id: string; vehicle_id: string | null } | undefined) {
    if (!resolved) return null;
    const driver = driverMap.get(resolved.driver_id);
    const vehicle = resolved.vehicle_id ? vehicleMap.get(resolved.vehicle_id) : null;
    return {
      driver: driver?.full_name || null,
      phone: driver?.phone || null,
      plate: vehicle?.plate_number || null,
    };
  }

  const results: TripResult[] = [];

  for (const route of routes as any[]) {
    const from = fromMap.get(route.id)!;
    const to = toMap.get(route.id)!;
    const goingNorth = from.id > to.id;
    const tariffId = goingNorth ? route.tariff_id_retur : route.tariff_id_tur;
    if (!tariffId) continue;

    const price = priceMap.get(tariffId) ?? 0;

    // Apply offer: override price and keep original for display
    const offerPrice = offer ? offer.offer_price as number : null;
    const displayPrice = offerPrice ?? price;
    const displayOriginal = offerPrice ? price : null;

    if (goingNorth) {
      // RETUR direction (Chișinău → Nord) — use retur assignment map
      const time = from.hour_from_chisinau;
      const arrival = to.hour_from_chisinau && to.hour_from_chisinau !== '0:00' ? to.hour_from_chisinau : '';
      if (time && time !== '0:00') {
        const details = resolveDetails(returDriverMap.get(route.id));
        // Only show routes with an assigned driver and phone number
        if (!details?.driver || !details?.phone) continue;
        results.push({
          time,
          arrivalTime: arrival,
          destination_ro: route.dest_to_ro,
          destination_ru: route.dest_to_ru,
          duration: route.time_chisinau || '',
          driver: details.driver,
          phone: details.phone,
          vehicle_plate: details?.plate || null,
          price: displayPrice,
          originalPrice: displayOriginal,
        });
      }
    } else {
      // TUR direction (Nord → Chișinău) — use tur assignment map
      const time = from.hour_from_nord;
      const arrival = to.hour_from_nord && to.hour_from_nord !== '0:00' ? to.hour_from_nord : '';
      if (time && time !== '0:00') {
        const details = resolveDetails(turDriverMap.get(route.id));
        // Only show routes with an assigned driver and phone number
        if (!details?.driver || !details?.phone) continue;
        results.push({
          time,
          arrivalTime: arrival,
          destination_ro: route.dest_from_ro,
          destination_ru: route.dest_from_ru,
          duration: route.time_nord || '',
          driver: details.driver,
          phone: details.phone,
          vehicle_plate: details?.plate || null,
          price: displayPrice,
          originalPrice: displayOriginal,
        });
      }
    }
  }

  results.sort((a, b) => {
    const [ah, am] = a.time.split(':').map(Number);
    const [bh, bm] = b.time.split(':').map(Number);
    return ah * 60 + am - (bh * 60 + bm);
  });

  // If searching for today, hide trips that already departed
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  if (date === today) {
    const now = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });
    const nowMin = parseInt(now.split(':')[0]) * 60 + parseInt(now.split(':')[1]);
    return results.filter(r => {
      const [h, m] = r.time.split(':').map(Number);
      return h * 60 + m > nowMin;
    });
  }

  return results;
}
