/**
 * Prețul unei curse între două opriri — ÎNTR-UN SINGUR LOC (ION-192, pasul 2 din planul biletelor online).
 *
 * Până acum regulile stăteau în searchTrips din apps/web (rata zilei, km după numele normalizate,
 * oferta după numele localităților) peste nucleul pur din timetable.ts. API-ul comenzii de bilete
 * (apps/admin) trebuie să calculeze EXACT același preț pe care-l vede pasagerul pe site — deci
 * încărcarea și calculul stau aici, iar clientul Supabase se injectează: anon pe site, service_role
 * în panou; tabelele și regulile sunt aceleași.
 *
 * Două straturi, ca să fie testabile separat:
 *   - incarcaCurse(db, …)  — citește opririle, rutele, km-ii, tariful zilei și oferta;
 *   - calculeazaCurse(…)   — funcție pură: buildScheduledTrips + oferta zilei.
 */
import { buildScheduledTrips, type ScheduledTrip, type TimetableKmPair, type TimetableRoute, type TimetableStop } from './timetable.js';
import { resolveOfferPriceForDate } from './offer-calc.js';

/**
 * Minimul din clientul Supabase pe care îl folosim (query builder-ul lui `from`), ca să nu legăm
 * pachetul de versiunea tipurilor generate; `supabase-js` din web și admin satisface tipul.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = { from(table: string): any };

export interface TarifeZi {
  rateLong: number | null;
  rateSub: number | null;
}

export interface OfertaActiva {
  from_locality: string;
  to_locality: string;
  original_price: number;
  offer_price: number;
}

export interface DateCurse {
  fromStops: TimetableStop[];
  toStops: TimetableStop[];
  /** Rutele care au AMBELE opriri (după nume), în ordinea din bază. */
  matchingRouteIds: number[];
  routes: TimetableRoute[];
  kmPairs: TimetableKmPair[];
  rates: TarifeZi;
  offer: OfertaActiva | null;
}

export interface CursaCuPret extends ScheduledTrip {
  /** Prețul afișat: oferta zilei dacă există, altfel tariful. */
  price: number;
  /** Prețul de bază, doar când o ofertă l-a înlocuit (se arată tăiat). */
  originalPrice: number | null;
}

/**
 * Tarifele (interurban lung + suburban) pentru o dată. Dacă niciun period nu acoperă data
 * (ex. săptămâna curentă încă n-are tarif), cade pe cel mai recent period început — ca prețurile
 * să nu apară niciodată 0.
 */
/** O eroare a bazei la datele de PREȚ nu e «lipsă de date»: aruncă, ca apelantul să nu vândă pe un tarif gol. */
export class PretIndisponibilError extends Error {
  constructor(sursa: string, mesaj: string) {
    super(`${sursa}: ${mesaj}`);
    this.name = 'PretIndisponibilError';
  }
}

function verifica<T>(sursa: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new PretIndisponibilError(sursa, r.error.message);
  return r.data;
}

export async function resolveTariffRates(db: DbClient, date: string): Promise<TarifeZi> {
  const covering = await db
    .from('tariff_periods')
    .select('rate_interurban_long, rate_suburban')
    .lte('period_start', date)
    .gte('period_end', date)
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  let period = verifica('tariff_periods', covering) as { rate_interurban_long: number; rate_suburban: number } | null;

  if (!period) {
    const latest = await db
      .from('tariff_periods')
      .select('rate_interurban_long, rate_suburban')
      .lte('period_start', date)
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    period = verifica('tariff_periods', latest) as { rate_interurban_long: number; rate_suburban: number } | null;
  }

  return {
    rateLong: period ? Number(period.rate_interurban_long) : null,
    rateSub: period ? Number(period.rate_suburban) : null,
  };
}

/**
 * Numele opririi, normalizat ca în import-km-prices.mjs (minuscule, fără diacritice, fără sufixele
 * «translux», «ga», «(sat)», prefixul «ret», «sl.» → «slobozia»). Trebuie să rămână identic cu
 * normalizarea de la import, altfel km-ii nu se găsesc.
 */
export function normalizeStop(name: string): string {
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

  // Aliasurile vechi (beleavinti→larga etc.) au dispărut după migr. 078: opririle au rândurile lor.
  const aliases: Record<string, string> = {
    'caracusenii noi/-': 'caracusenii noi',
  };

  n = n.trim();
  return aliases[n] || n;
}

/** Numele normalizat, curățat pentru filtrele PostgREST. */
export function stopFilterValue(name: string): string {
  return normalizeStop(name).replace(/[(),."'\\]/g, '');
}

/**
 * Citește tot ce trebuie pentru prețul și orarul curselor între două opriri la o dată.
 * Întoarce null când una din opriri nu există sau nicio rută nu le are pe amândouă.
 */
export async function incarcaCurse(
  db: DbClient,
  args: { fromRo: string; toRo: string; date: string },
): Promise<DateCurse | null> {
  const { fromRo, toRo, date } = args;

  const [rFrom, rTo] = await Promise.all([
    db
      .from('crm_stop_fares')
      .select('id, crm_route_id, stop_order, hour_from_chisinau, hour_from_nord, name_ro')
      .ilike('name_ro', fromRo),
    db
      .from('crm_stop_fares')
      .select('id, crm_route_id, stop_order, hour_from_chisinau, hour_from_nord, name_ro')
      .ilike('name_ro', toRo),
  ]);
  const fromStops = verifica('crm_stop_fares', rFrom) as TimetableStop[] | null;
  const toStops = verifica('crm_stop_fares', rTo) as TimetableStop[] | null;

  if (!fromStops || !toStops || fromStops.length === 0 || toStops.length === 0) return null;

  const toIds = new Set((toStops as TimetableStop[]).map((s) => s.crm_route_id));
  const matchingRouteIds = [...new Set((fromStops as TimetableStop[]).map((s) => s.crm_route_id))].filter((id) => toIds.has(id));
  if (matchingRouteIds.length === 0) return null;

  const fromNorm = stopFilterValue(fromRo);
  const toNorm = stopFilterValue(toRo);

  const [rRoutes, rKmA, rKmB, rOffers, rates] = await Promise.all([
    db
      .from('crm_routes')
      .select('id, dest_to_ro, dest_to_ru, dest_from_ro, dest_from_ru, time_chisinau, time_nord, tariff_id_tur, tariff_id_retur, retur_ascuns, tur_ascuns')
      .in('id', matchingRouteIds)
      .eq('active', true),
    db
      .from('v_interurban_v2_km_pairs')
      .select('tariff_id, km, from_district, to_district, start_district')
      .eq('from_stop', fromNorm)
      .eq('to_stop', toNorm),
    db
      .from('v_interurban_v2_km_pairs')
      .select('tariff_id, km, from_district, to_district, start_district')
      .eq('from_stop', toNorm)
      .eq('to_stop', fromNorm),
    db
      .from('offers')
      .select('from_locality, to_locality, original_price, offer_price')
      .eq('active', true)
      .ilike('from_locality', fromRo)
      .ilike('to_locality', toRo),
    resolveTariffRates(db, date),
  ]);

  const routes = verifica('crm_routes', rRoutes) as TimetableRoute[] | null;
  const kmPairsA = verifica('v_interurban_v2_km_pairs', rKmA) as TimetableKmPair[] | null;
  const kmPairsB = verifica('v_interurban_v2_km_pairs', rKmB) as TimetableKmPair[] | null;
  const activeOffers = verifica('offers', rOffers) as OfertaActiva[] | null;
  if (!routes) return null;

  return {
    fromStops: fromStops as TimetableStop[],
    toStops: toStops as TimetableStop[],
    matchingRouteIds,
    routes: routes as TimetableRoute[],
    // Perechile km în AMBELE sensuri (A→B apoi B→A); primul rând al unui tarif câștigă.
    kmPairs: [...((kmPairsA || []) as TimetableKmPair[]), ...((kmPairsB || []) as TimetableKmPair[])],
    rates,
    offer: activeOffers && activeOffers.length > 0 ? (activeOffers[0] as OfertaActiva) : null,
  };
}

/**
 * Cursele cu preț, din datele încărcate (funcție pură). Oferta urmează tariful DATEI căutate
 * (formula RPC: km × rată − reducere), nu snapshotul din offers, care se rescrie abia în ziua
 * intrării în vigoare; o singură cifră pe zi pentru toate cursele.
 */
export function calculeazaCurse(d: DateCurse, date: string): CursaCuPret[] {
  const scheduled = buildScheduledTrips({
    routes: d.routes,
    fromStops: d.fromStops,
    toStops: d.toStops,
    kmPairs: d.kmPairs,
    rateLong: d.rates.rateLong,
    rateSub: d.rates.rateSub,
  });
  const offerPrice = d.offer ? resolveOfferPriceForDate(d.offer, d.rates.rateLong, date) : null;
  return scheduled.map((t) => ({
    ...t,
    price: offerPrice ?? t.price,
    originalPrice: offerPrice ? t.price : null,
  }));
}

/** Încărcare + calcul: cursele cu preț între două opriri la o dată; [] când nu există. */
export async function cursePentru(
  db: DbClient,
  args: { fromRo: string; toRo: string; date: string },
): Promise<CursaCuPret[]> {
  const d = await incarcaCurse(db, args);
  return d ? calculeazaCurse(d, args.date) : [];
}
