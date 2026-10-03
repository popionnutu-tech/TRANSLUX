import { unstable_cache } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import {
  resolveTariffRates, stopFilterValue,
  type OfertaActiva, type TarifeZi, type TimetableKmPair, type TimetableRoute, type TimetableStop,
} from '@translux/db';

/**
 * Datele căutării «Mai târziu» care NU se schimbă în timpul zilei, în cache-ul de date al Next
 * (ION-205, Ion 03.10: «site ultrafast», punctul 5). Până acum searchTrips citea la fiecare
 * căutare opririle după nume, perechile de km, oferta și tariful zilei — aceleași rânduri pentru
 * toți cei care caută Chișinău → Bălți. Aici fiecare stă în `unstable_cache` cu cheia pe numele
 * normalizat (minuscule) sau pe dată, 1 h (oferta 5 min, ca o ofertă nou activată să intre repede).
 *
 * Ce se schimbă în timpul zilei (atribuirile, șoferii, mașinile, rutele) NU trece pe aici — rămâne
 * live în searchTrips. Interogările sunt exact cele din `incarcaCurse` (@translux/db), ca prețul
 * să iasă identic cu API-ul biletelor; la o eroare a bazei ARUNCĂ (unstable_cache nu memorează
 * excepțiile, deci o cădere trecătoare nu rămâne o oră în cache).
 */

const UN_CEAS = 3600;
const CINCI_MINUTE = 300;

const COLOANE_OPRIRE = 'id, crm_route_id, stop_order, hour_from_chisinau, hour_from_nord';
const COLOANE_KM = 'tariff_id, km, from_district, to_district, start_district';
const COLOANE_RUTA = 'id, dest_to_ro, dest_to_ru, dest_from_ro, dest_from_ru, time_chisinau, time_nord, tariff_id_tur, tariff_id_retur, retur_ascuns, tur_ascuns';

function esueaza(sursa: string, error: { message: string } | null): void {
  if (error) throw new Error(`[cautare-cache] ${sursa}: ${error.message}`);
}

/** Cheia cache-ului: ILIKE e oricum fără majuscule, deci «Bălți» și «bălți» împart intrarea. */
const cheieNume = (nume: string) => nume.toLowerCase();

const opririDupaNume = unstable_cache(
  async (nume: string): Promise<TimetableStop[]> => {
    const { data, error } = await getSupabase().from('crm_stop_fares').select(COLOANE_OPRIRE).ilike('name_ro', nume);
    esueaza('crm_stop_fares', error);
    return (data || []) as TimetableStop[];
  },
  ['cautare-opriri'],
  { revalidate: UN_CEAS, tags: ['crm_stop_fares'] },
);

/** Opririle cu numele dat (ilike), pe toate rutele. Cache 1 h pe nume. */
export function opririle(numeRo: string): Promise<TimetableStop[]> {
  return opririDupaNume(cheieNume(numeRo));
}

const perechiKm = unstable_cache(
  async (deNorm: string, spreNorm: string): Promise<TimetableKmPair[]> => {
    const view = () => getSupabase().from('v_interurban_v2_km_pairs').select(COLOANE_KM);
    const [a, b] = await Promise.all([
      view().eq('from_stop', deNorm).eq('to_stop', spreNorm),
      view().eq('from_stop', spreNorm).eq('to_stop', deNorm),
    ]);
    esueaza('v_interurban_v2_km_pairs A→B', a.error);
    esueaza('v_interurban_v2_km_pairs B→A', b.error);
    // Ca în incarcaCurse: A→B apoi B→A; primul rând al unui tarif câștigă.
    return [...((a.data || []) as TimetableKmPair[]), ...((b.data || []) as TimetableKmPair[])];
  },
  ['cautare-km'],
  { revalidate: UN_CEAS, tags: ['km-pairs'] },
);

/** Perechile de km în ambele sensuri, după numele normalizate ca la import. Cache 1 h. */
export function perechileKm(fromRo: string, toRo: string): Promise<TimetableKmPair[]> {
  return perechiKm(stopFilterValue(fromRo), stopFilterValue(toRo));
}

const ofertaPerechii = unstable_cache(
  async (de: string, spre: string): Promise<OfertaActiva | null> => {
    const { data, error } = await getSupabase()
      .from('offers')
      .select('from_locality, to_locality, original_price, offer_price')
      .eq('active', true)
      .ilike('from_locality', de)
      .ilike('to_locality', spre);
    esueaza('offers', error);
    return data && data.length > 0 ? (data[0] as OfertaActiva) : null;
  },
  ['cautare-oferta'],
  { revalidate: CINCI_MINUTE, tags: ['offers'] },
);

/** Oferta activă pe sensul căutat (prima, ca în incarcaCurse) sau null. Cache 5 min. */
export function oferta(fromRo: string, toRo: string): Promise<OfertaActiva | null> {
  return ofertaPerechii(cheieNume(fromRo), cheieNume(toRo));
}

const tarifeZi = unstable_cache(
  async (date: string): Promise<TarifeZi> => resolveTariffRates(getSupabase(), date),
  ['cautare-tarif'],
  { revalidate: UN_CEAS, tags: ['tariff_periods'] },
);

/** Tarifele (interurban lung + suburban) ale unei zile, cu căderea pe ultima perioadă. Cache 1 h pe dată. */
export function tarifeleZilei(date: string): Promise<TarifeZi> {
  return tarifeZi(date);
}

export interface RepereCautare {
  fromStops: TimetableStop[];
  toStops: TimetableStop[];
  /** Rutele care au AMBELE opriri (după nume), în ordinea din bază — ca în incarcaCurse. */
  matchingRouteIds: number[];
  kmPairs: TimetableKmPair[];
  rates: TarifeZi;
  offer: OfertaActiva | null;
}

/**
 * Runda întâi a căutării: tot ce nu depinde de rute, pornit deodată (opriri, km, ofertă, tarif).
 * null când o oprire nu există sau nicio rută nu le are pe amândouă — exact ca incarcaCurse.
 * Rutele (live) se citesc apoi cu `rutele`, din id-urile de aici.
 */
export async function repereleCautarii(args: { fromRo: string; toRo: string; date: string }): Promise<RepereCautare | null> {
  const { fromRo, toRo, date } = args;
  const [fromStops, toStops, kmPairs, offer, rates] = await Promise.all([
    opririle(fromRo),
    opririle(toRo),
    perechileKm(fromRo, toRo),
    oferta(fromRo, toRo),
    tarifeleZilei(date),
  ]);
  if (fromStops.length === 0 || toStops.length === 0) return null;

  const toIds = new Set(toStops.map((s) => s.crm_route_id));
  const matchingRouteIds = [...new Set(fromStops.map((s) => s.crm_route_id))].filter((id) => toIds.has(id));
  if (matchingRouteIds.length === 0) return null;

  return { fromStops, toStops, matchingRouteIds, kmPairs, rates, offer };
}

/** Rutele active cu id-urile date — LIVE (dispecerul le poate schimba orele în timpul zilei). Aruncă la eroare. */
export async function rutele(ids: number[]): Promise<TimetableRoute[] | null> {
  const { data, error } = await getSupabase().from('crm_routes').select(COLOANE_RUTA).in('id', ids).eq('active', true);
  esueaza('crm_routes', error);
  return data as TimetableRoute[] | null;
}
