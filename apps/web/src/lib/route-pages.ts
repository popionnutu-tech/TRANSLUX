import { unstable_cache } from 'next/cache';
import { resolveOfferPriceForDate } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { HUB_SLUGS, LOCALITIES, MAJOR, pageLocalityBySlug, routePath, UPCOMING, type MajorLocality } from '@/lib/seo';
import { buildScheduledTrips, type ScheduledTrip, type TimetableKmPair, type TimetableRoute, type TimetableStop } from '@translux/db';

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

// Și localitățile anunțate (Drochia): când opririle lor apar în orar, pagina le arată singură.
const PAGE_NAMES = [...MAJOR, ...LOCALITIES, ...UPCOMING].map((m) => m.ro);
const todayChisinau = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });

/** Aceeași normalizare ca searchTrips (actions.ts normalizeStop) pentru numele din seo.ts (fără paranteze, puncte, «ga»). */
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

/** Plafonul PostgREST: un răspuns plin poate fi trunchiat, deci se citește pe pagini. */
const PAGE = 1000;

/**
 * Opririle tuturor localităților cu pagină pe toate rutele active + rutele. O singură citire
 * pentru toate perechile. Opririle sunt peste 1000 (1215 pe 01.10) → pe pagini, după id.
 */
async function loadNetwork() {
  const supabase = getSupabase();
  const stops: (TimetableStop & { name_ro: string })[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('crm_stop_fares')
      .select('crm_route_id, name_ro, stop_order, hour_from_chisinau, hour_from_nord')
      .in('name_ro', PAGE_NAMES)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) fail('crm_stop_fares', error);
    stops.push(...((data || []) as typeof stops));
    if (!data || data.length < PAGE) break;
  }
  const routes = await supabase
    .from('crm_routes')
    .select('id, dest_to_ro, dest_to_ru, dest_from_ro, dest_from_ru, time_chisinau, time_nord, tariff_id_tur, tariff_id_retur, retur_ascuns, tur_ascuns')
    .eq('active', true);
  if (routes.error) fail('crm_routes', routes.error);
  return { stops, routes: (routes.data || []) as TimetableRoute[] };
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
  const from = pageLocalityBySlug(fromSlug);
  const to = pageLocalityBySlug(toSlug);
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
 * Perechile km pentru toate paginile, în patru cereri (01.10: 722 de rânduri cu Chișinău la
 * un capăt, câteva zeci Bălți↔majore), grupate pe «de|spre» în ordinea răspunsului.
 * Un răspuns de exact 1000 de rânduri ar putea fi trunchiat → eroare, nu o listă incompletă.
 */
async function loadPageKmPairs(): Promise<Map<string, TimetableKmPair[]>> {
  const supabase = getSupabase();
  const cols = 'from_stop, to_stop, tariff_id, km, from_district, to_district, start_district';
  const chi = kmKey('Chișinău');
  const balti = kmKey('Bălți');
  const majorsNoChi = MAJOR.map((m) => kmKey(m.ro)).filter((k) => k !== chi && k !== balti);
  const view = () => supabase.from('v_interurban_v2_km_pairs').select(cols);
  const parts = await Promise.all([
    view().eq('from_stop', chi),
    view().eq('to_stop', chi),
    view().eq('from_stop', balti).in('to_stop', majorsNoChi),
    view().in('from_stop', majorsNoChi).eq('to_stop', balti),
  ]);
  const byPair = new Map<string, TimetableKmPair[]>();
  for (const part of parts) {
    if (part.error) fail('km', part.error);
    if ((part.data?.length ?? 0) >= PAGE) throw new Error('[route-pages] km: răspuns de 1000 de rânduri, posibil trunchiat');
    for (const row of (part.data || []) as (TimetableKmPair & { from_stop: string; to_stop: string })[]) {
      const key = `${row.from_stop}|${row.to_stop}`;
      const list = byPair.get(key) ?? [];
      list.push(row);
      byPair.set(key, list);
    }
  }
  return byPair;
}

/** Perechile care au pagină: majore cu un hub + Chișinău ↔ fiecare localitate din LOCALITIES. */
function candidatePairs(): [MajorLocality, MajorLocality][] {
  const isHub = (s: string) => (HUB_SLUGS as readonly string[]).includes(s);
  const out: [MajorLocality, MajorLocality][] = [];
  for (const a of MAJOR) {
    for (const b of MAJOR) {
      if (a.slug !== b.slug && (isHub(a.slug) || isHub(b.slug))) out.push([a, b]);
    }
  }
  const chisinau = MAJOR[0];
  for (const l of LOCALITIES) out.push([chisinau, l], [l, chisinau]);
  return out;
}

async function computePairs(): Promise<RoutePair[]> {
  const [network, km] = await Promise.all([loadNetwork(), loadPageKmPairs()]);
  const pairs: RoutePair[] = [];
  for (const [a, b] of candidatePairs()) {
    // Ca în searchTrips: A→B urmat de B→A.
    const kmPairs = [...(km.get(`${kmKey(a.ro)}|${kmKey(b.ro)}`) ?? []), ...(km.get(`${kmKey(b.ro)}|${kmKey(a.ro)}`) ?? [])];
    const trips = tripsFor(network, a, b, kmPairs, null, null);
    if (trips.length > 0) pairs.push({ from: a, to: b, trips: trips.length });
  }
  return pairs;
}

/** Toate perechile cu pagină și ≥1 plecare (pentru sitemap și linkurile interne). Cache 1 h. */
export const getRoutePairs = unstable_cache(computePairs, ['route-pairs-v2'], {
  revalidate: 3600,
  tags: ['route-pages'],
});

export interface HomeLink {
  key: string;
  href: string;
  label: string;
}

/**
 * Linkurile paginii principale: direcțiile dintre orașele principale (blocul «Toate rutele»)
 * și Chișinău → fiecare sat din nord (blocul «Toate localitățile»; retururile se leagă din pagini).
 */
export function homeLinks(pairs: RoutePair[], locale: 'ro' | 'ru'): { routes: HomeLink[]; localities: HomeLink[] } {
  const isMajor = (slug: string) => MAJOR.some((m) => m.slug === slug);
  const link = (p: RoutePair, label: string): HomeLink => ({
    key: `${p.from.slug}-${p.to.slug}`,
    href: routePath(locale, p.from.slug, p.to.slug),
    label,
  });
  return {
    routes: pairs.filter((p) => isMajor(p.from.slug) && isMajor(p.to.slug)).map((p) => link(p, `${p.from[locale]} – ${p.to[locale]}`)),
    localities: pairs
      .filter((p) => p.from.slug === 'chisinau' && !isMajor(p.to.slug))
      .map((p) => link(p, p.to[locale]))
      .sort((a, b) => a.label.localeCompare(b.label, locale)),
  };
}
