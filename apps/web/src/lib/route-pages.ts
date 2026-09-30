import { unstable_cache } from 'next/cache';
import { resolveOfferPriceForDate } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { HUB_SLUGS, MAJOR, type MajorLocality } from '@/lib/seo';
import { buildScheduledTrips, type ScheduledTrip, type TimetableKmPair, type TimetableRoute, type TimetableStop } from '@/lib/timetable';

/**
 * Datele paginilor de direcție /ro/autobuz/<de>-<spre> (ION-153): orarul planificat și prețul
 * de azi, din aceleași tabele și prin același nucleu (lib/timetable.ts) ca searchTrips.
 *
 * Citește doar orarul și tarifele — nu șoferi, nu mașini, nu search_log.
 * La o eroare Supabase ARUNCĂ: unstable_cache nu memorează excepțiile, iar ISR-ul servește
 * în continuare pagina veche. O listă goală memorată ar da 404 pe toate paginile o oră întreagă.
 */

export interface RouteTimetable {
  from: MajorLocality;
  to: MajorLocality;
  trips: ScheduledTrip[];
  /** Cel mai mic preț al zilei (ofertă inclusă); null când tariful lipsește. */
  priceFrom: number | null;
  /** Prețul ofertei active pe acest sens, aplicat tuturor curselor, ca în căutare. */
  offerPrice: number | null;
}

export interface RoutePair {
  from: MajorLocality;
  to: MajorLocality;
  trips: number;
}

const MAJOR_NAMES = MAJOR.map((m) => m.ro);
const todayChisinau = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });

/** Aceeași normalizare ca searchTrips (actions.ts normalizeStop) pentru cele 13 nume majore. */
function kmKey(nameRo: string): string {
  return nameRo.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`[route-pages] ${what}: ${error.message}`);
}

async function loadRates(date: string): Promise<{ rateLong: number | null; rateSub: number | null }> {
  const supabase = getSupabase();
  const covering = await supabase
    .from('tariff_periods')
    .select('rate_interurban_long, rate_suburban')
    .lte('period_start', date)
    .gte('period_end', date)
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (covering.error) fail('tariff_periods', covering.error);
  let period = covering.data as { rate_interurban_long: number; rate_suburban: number } | null;
  if (!period) {
    // Ca în resolveTariffRates: fără perioadă pe azi → cea mai recentă începută.
    const latest = await supabase
      .from('tariff_periods')
      .select('rate_interurban_long, rate_suburban')
      .lte('period_start', date)
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.error) fail('tariff_periods', latest.error);
    period = latest.data as typeof period;
  }
  return {
    rateLong: period ? Number(period.rate_interurban_long) : null,
    rateSub: period ? Number(period.rate_suburban) : null,
  };
}

/** Opririle celor 13 localități majore pe toate rutele active + rutele. O singură citire pentru toate perechile. */
async function loadNetwork() {
  const supabase = getSupabase();
  const [stops, routes] = await Promise.all([
    supabase
      .from('crm_stop_fares')
      .select('crm_route_id, name_ro, stop_order, hour_from_chisinau, hour_from_nord')
      .in('name_ro', MAJOR_NAMES),
    supabase
      .from('crm_routes')
      .select('id, dest_to_ro, dest_to_ru, dest_from_ro, dest_from_ru, time_chisinau, time_nord, tariff_id_tur, tariff_id_retur, retur_ascuns, tur_ascuns')
      .eq('active', true),
  ]);
  if (stops.error) fail('crm_stop_fares', stops.error);
  if (routes.error) fail('crm_routes', routes.error);
  return {
    stops: (stops.data || []) as (TimetableStop & { name_ro: string })[],
    routes: (routes.data || []) as TimetableRoute[],
  };
}

async function loadKmPairs(from: MajorLocality, to: MajorLocality): Promise<TimetableKmPair[]> {
  const supabase = getSupabase();
  const cols = 'tariff_id, km, from_district, to_district, start_district';
  const [a, b] = await Promise.all([
    supabase.from('v_interurban_v2_km_pairs').select(cols).eq('from_stop', kmKey(from.ro)).eq('to_stop', kmKey(to.ro)),
    supabase.from('v_interurban_v2_km_pairs').select(cols).eq('from_stop', kmKey(to.ro)).eq('to_stop', kmKey(from.ro)),
  ]);
  if (a.error) fail('km A→B', a.error);
  if (b.error) fail('km B→A', b.error);
  // Ca în searchTrips: A→B urmat de B→A, primul rând al unui tarif câștigă.
  return [...(a.data || []), ...(b.data || [])] as TimetableKmPair[];
}

async function loadOfferPrice(from: MajorLocality, to: MajorLocality, rateLong: number | null): Promise<number | null> {
  const { data, error } = await getSupabase()
    .from('offers')
    .select('from_locality, to_locality, original_price, offer_price')
    .eq('active', true)
    .ilike('from_locality', from.ro)
    .ilike('to_locality', to.ro);
  if (error) fail('offers', error);
  const offer = data && data.length > 0 ? data[0] : null;
  // Oferta urmează tariful zilei (formula RPC), ca în searchTrips — doar pe sensul ei.
  return offer ? resolveOfferPriceForDate(offer as any, rateLong) : null;
}

function tripsFor(network: Awaited<ReturnType<typeof loadNetwork>>, from: MajorLocality, to: MajorLocality, kmPairs: TimetableKmPair[], rateLong: number | null, rateSub: number | null) {
  const fromStops = network.stops.filter((s) => s.name_ro === from.ro);
  const toStops = network.stops.filter((s) => s.name_ro === to.ro);
  const common = new Set(fromStops.map((s) => s.crm_route_id).filter((id) => toStops.some((t) => t.crm_route_id === id)));
  const routes = network.routes.filter((r) => common.has(r.id));
  return buildScheduledTrips({ routes, fromStops, toStops, kmPairs, rateLong, rateSub });
}

async function computeTimetable(fromSlug: string, toSlug: string): Promise<RouteTimetable | null> {
  const from = MAJOR.find((m) => m.slug === fromSlug);
  const to = MAJOR.find((m) => m.slug === toSlug);
  if (!from || !to) return null;
  const [network, kmPairs, rates] = await Promise.all([loadNetwork(), loadKmPairs(from, to), loadRates(todayChisinau())]);
  const trips = tripsFor(network, from, to, kmPairs, rates.rateLong, rates.rateSub);
  if (trips.length === 0) return { from, to, trips, priceFrom: null, offerPrice: null };
  const offerPrice = await loadOfferPrice(from, to, rates.rateLong);
  const prices = trips.map((t) => offerPrice ?? t.price).filter((p) => p > 0);
  return { from, to, trips, priceFrom: prices.length ? Math.min(...prices) : null, offerPrice };
}

/** Orarul unei perechi (slug-uri deja validate de parsePair). Cache 1 h. */
export const getRouteTimetable = (fromSlug: string, toSlug: string) =>
  unstable_cache(() => computeTimetable(fromSlug, toSlug), ['route-timetable', fromSlug, toSlug], {
    revalidate: 3600,
    tags: ['route-pages'],
  })();

/**
 * Toate perechile km cu un hub la un capăt, în două cereri (238 de rânduri pe 30.09 — sub
 * plafonul de 1000 al PostgREST), grupate pe «de|spre» în ordinea răspunsului.
 */
async function loadHubKmPairs(): Promise<Map<string, TimetableKmPair[]>> {
  const supabase = getSupabase();
  const cols = 'from_stop, to_stop, tariff_id, km, from_district, to_district, start_district';
  const hubs = MAJOR.filter((m) => (HUB_SLUGS as readonly string[]).includes(m.slug)).map((m) => kmKey(m.ro));
  const all = MAJOR.map((m) => kmKey(m.ro));
  const nonHubs = all.filter((k) => !hubs.includes(k));
  const [fromHub, toHub] = await Promise.all([
    supabase.from('v_interurban_v2_km_pairs').select(cols).in('from_stop', hubs).in('to_stop', all),
    // Hub↔hub e deja în prima cerere; aici doar majoră (non-hub) → hub.
    supabase.from('v_interurban_v2_km_pairs').select(cols).in('from_stop', nonHubs).in('to_stop', hubs),
  ]);
  if (fromHub.error) fail('km din hub', fromHub.error);
  if (toHub.error) fail('km spre hub', toHub.error);
  const byPair = new Map<string, TimetableKmPair[]>();
  for (const row of [...(fromHub.data || []), ...(toHub.data || [])] as (TimetableKmPair & { from_stop: string; to_stop: string })[]) {
    const key = `${row.from_stop}|${row.to_stop}`;
    const list = byPair.get(key) ?? [];
    list.push(row);
    byPair.set(key, list);
  }
  return byPair;
}

async function computePairs(): Promise<RoutePair[]> {
  const [network, km] = await Promise.all([loadNetwork(), loadHubKmPairs()]);
  const isHub = (s: string) => (HUB_SLUGS as readonly string[]).includes(s);
  const pairs: RoutePair[] = [];
  for (const a of MAJOR) {
    for (const b of MAJOR) {
      if (a.slug === b.slug || (!isHub(a.slug) && !isHub(b.slug))) continue;
      // Ca în searchTrips: A→B urmat de B→A.
      const kmPairs = [...(km.get(`${kmKey(a.ro)}|${kmKey(b.ro)}`) ?? []), ...(km.get(`${kmKey(b.ro)}|${kmKey(a.ro)}`) ?? [])];
      const trips = tripsFor(network, a, b, kmPairs, null, null);
      if (trips.length > 0) pairs.push({ from: a, to: b, trips: trips.length });
    }
  }
  return pairs;
}

/** Toate perechile hub↔majoră cu ≥1 plecare (pentru sitemap și linkurile interne). Cache 1 h. */
export const getRoutePairs = unstable_cache(computePairs, ['route-pairs'], {
  revalidate: 3600,
  tags: ['route-pages'],
});
