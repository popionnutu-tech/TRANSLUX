'use server';

import { getSupabase } from '@/lib/supabase';

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

  // Normalized stop names for km lookup
  const fromNorm = normalizeStop(fromRo);
  const toNorm = normalizeStop(toRo);

  // Query 3+4+5+6: Get routes, prices, assignments AND offers in parallel
  const [{ data: routes }, { data: kmPairs }, { data: assignments }, { data: activeOffers }] = await Promise.all([
    supabase
      .from('crm_routes')
      .select('id, dest_to_ro, dest_to_ru, dest_from_ro, dest_from_ru, time_chisinau, time_nord, tariff_id_tur, tariff_id_retur')
      .in('id', matchingRouteIds)
      .eq('active', true),
    supabase
      .from('route_km_pairs')
      .select('tariff_id, price')
      .or(`and(from_stop.eq.${fromNorm},to_stop.eq.${toNorm}),and(from_stop.eq.${toNorm},to_stop.eq.${fromNorm})`),
    supabase
      .from('daily_assignments')
      .select('crm_route_id, drivers(full_name, phone), vehicles(plate_number)')
      .eq('assignment_date', date)
      .in('crm_route_id', matchingRouteIds),
    supabase
      .from('offers')
      .select('from_locality, to_locality, original_price, offer_price')
      .eq('active', true)
      .ilike('from_locality', fromRo)
      .ilike('to_locality', toRo),
  ]);

  if (!routes) return [];

  // Check if an offer applies to this search direction
  const offer = (activeOffers && activeOffers.length > 0) ? activeOffers[0] as any : null;

  // Build price lookup: tariff_id → price
  const priceMap = new Map<number, number>();
  for (const p of (kmPairs || []) as any[]) {
    if (!priceMap.has(p.tariff_id)) {
      priceMap.set(p.tariff_id, p.price);
    }
  }

  // Build assignment lookup: routeId → { driver, phone, plate }
  const assignMap = new Map<number, { driver: string; phone: string | null; plate: string | null }>();
  for (const a of (assignments || []) as any[]) {
    assignMap.set(a.crm_route_id, {
      driver: a.drivers?.full_name || null,
      phone: a.drivers?.phone || null,
      plate: a.vehicles?.plate_number || null,
    });
  }

  const results: TripResult[] = [];

  for (const route of routes as any[]) {
    const from = fromMap.get(route.id)!;
    const to = toMap.get(route.id)!;
    const goingNorth = from.id > to.id;
    const tariffId = goingNorth ? route.tariff_id_retur : route.tariff_id_tur;
    if (!tariffId) continue;

    const price = priceMap.get(tariffId) ?? 0;

    const assign = assignMap.get(route.id);

    // Apply offer: override price and keep original for display
    const offerPrice = offer ? offer.offer_price as number : null;
    const displayPrice = offerPrice ?? price;
    const displayOriginal = offerPrice ? price : null;

    if (goingNorth) {
      const time = from.hour_from_chisinau;
      const arrival = to.hour_from_chisinau && to.hour_from_chisinau !== '0:00' ? to.hour_from_chisinau : '';
      if (time && time !== '0:00') {
        results.push({
          time,
          arrivalTime: arrival,
          destination_ro: route.dest_to_ro,
          destination_ru: route.dest_to_ru,
          duration: route.time_chisinau || '',
          driver: assign?.driver || null,
          phone: assign?.phone || '+37360401010',
          vehicle_plate: assign?.plate || null,
          price: displayPrice,
          originalPrice: displayOriginal,
        });
      }
    } else {
      const time = from.hour_from_nord;
      const arrival = to.hour_from_nord && to.hour_from_nord !== '0:00' ? to.hour_from_nord : '';
      if (time && time !== '0:00') {
        results.push({
          time,
          arrivalTime: arrival,
          destination_ro: route.dest_from_ro,
          destination_ru: route.dest_from_ru,
          duration: route.time_nord || '',
          driver: assign?.driver || null,
          phone: assign?.phone || '+37360401010',
          vehicle_plate: assign?.plate || null,
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

  return results;
}
