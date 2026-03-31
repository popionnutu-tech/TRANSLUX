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
  destination_ro: string;
  destination_ru: string;
  duration: string;
  driver: string | null;
  phone: string | null;
  price: number;
}

export async function getLocalities(): Promise<Locality[]> {
  const { data } = await getSupabase()
    .from('localities')
    .select('id, name_ro, name_ru, is_major, sort_order')
    .order('name_ro');
  return (data || []) as Locality[];
}

export async function getDepartureTimes(fromRo: string, toRo: string): Promise<string[]> {
  const results = await searchTrips(fromRo, toRo);
  return [...new Set(results.map(r => r.time))].sort((a, b) => {
    const [ah, am] = a.split(':').map(Number);
    const [bh, bm] = b.split(':').map(Number);
    return ah * 60 + am - (bh * 60 + bm);
  });
}

export async function searchTrips(
  fromRo: string,
  toRo: string,
): Promise<TripResult[]> {
  const supabase = getSupabase();

  // Get all fares that match the "from" stop name
  const { data: fromStops } = await supabase
    .from('crm_stop_fares')
    .select('id, crm_route_id, price_from_chisinau, price_from_nord, hour_from_chisinau, hour_from_nord')
    .ilike('name_ro', fromRo);

  // Get all fares that match the "to" stop name
  const { data: toStops } = await supabase
    .from('crm_stop_fares')
    .select('id, crm_route_id, price_from_chisinau, price_from_nord, hour_from_chisinau, hour_from_nord')
    .ilike('name_ro', toRo);

  if (!fromStops || !toStops || fromStops.length === 0 || toStops.length === 0) return [];

  // Build maps by crm_route_id
  const fromMap = new Map(fromStops.map((s: any) => [s.crm_route_id, s]));
  const toMap = new Map(toStops.map((s: any) => [s.crm_route_id, s]));

  // Find routes that pass through both stops
  const matchingRouteIds = [...fromMap.keys()].filter(id => toMap.has(id));
  if (matchingRouteIds.length === 0) return [];

  // Get route details
  const { data: routes } = await supabase
    .from('crm_routes')
    .select('id, dest_to_ro, dest_to_ru, dest_from_ro, dest_from_ru, time_chisinau, time_nord')
    .in('id', matchingRouteIds)
    .eq('active', true);

  if (!routes) return [];

  const results: TripResult[] = [];

  for (const route of routes as any[]) {
    const from = fromMap.get(route.id)!;
    const to = toMap.get(route.id)!;

    // Determine direction: if "from" stop has a later hour than "to",
    // we're going northward (from Chisinau); otherwise southward
    const fromId = from.id;
    const toId = to.id;

    // Going from Chișinău direction: use hour_from_chisinau + price_from_chisinau
    // Going from Nord direction: use hour_from_nord + price_from_nord
    // Determine direction by comparing stop IDs (lower id = closer to destination/nord)
    const goingNorth = fromId > toId;

    if (goingNorth) {
      // Chișinău → Nord direction
      const time = from.hour_from_chisinau;
      // Price = sum of segments between from and to
      // Since segments are cumulative prices, calculate difference
      // Actually, price_from_chisinau is per-segment price, need to sum from "from" to "to"
      // For now, sum all segment prices between the two stops on this route
      const { data: segments } = await supabase
        .from('crm_stop_fares')
        .select('id, price_from_chisinau')
        .eq('crm_route_id', route.id)
        .lte('id', fromId)
        .gte('id', toId);

      const price = (segments || []).reduce((sum: number, s: any) => sum + s.price_from_chisinau, 0);

      if (time) {
        results.push({
          time,
          destination_ro: route.dest_to_ro,
          destination_ru: route.dest_to_ru,
          duration: route.time_chisinau || '',
          driver: null,
          phone: '+37360401010',
          price,
        });
      }
    } else {
      // Nord → Chișinău direction
      const time = from.hour_from_nord;
      const { data: segments } = await supabase
        .from('crm_stop_fares')
        .select('id, price_from_nord')
        .eq('crm_route_id', route.id)
        .gte('id', fromId)
        .lte('id', toId);

      const price = (segments || []).reduce((sum: number, s: any) => sum + s.price_from_nord, 0);

      if (time) {
        results.push({
          time,
          destination_ro: route.dest_from_ro,
          destination_ru: route.dest_from_ru,
          duration: route.time_nord || '',
          driver: null,
          phone: '+37360401010',
          price,
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
