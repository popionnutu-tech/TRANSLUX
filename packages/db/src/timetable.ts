/**
 * Nucleul orarului public (ION-153): care curse leagă două opriri, la ce oră, cu ce preț.
 *
 * Extras din searchTrips, ca paginile de direcție (/ro/autobuz/…) și căutarea să aplice
 * EXACT aceleași reguli — o regulă schimbată doar într-un loc ar arăta în Google o cursă
 * pe care căutarea n-o mai oferă. Funcție pură: fără bază, fără șofer, fără dată.
 */

export interface TimetableStop {
  crm_route_id: number;
  stop_order: number;
  hour_from_chisinau: string | null;
  hour_from_nord: string | null;
}

export interface TimetableRoute {
  id: number;
  dest_to_ro: string;
  dest_to_ru: string;
  dest_from_ro: string;
  dest_from_ru: string;
  time_chisinau: string | null;
  time_nord: string | null;
  tariff_id_tur: number | null;
  tariff_id_retur: number | null;
  retur_ascuns: boolean | null;
  tur_ascuns: boolean | null;
}

export interface TimetableKmPair {
  tariff_id: number;
  km: number | string;
  from_district: string | null;
  to_district: string | null;
  start_district: string | null;
}

export interface ScheduledTrip {
  routeId: number;
  /** Chișinău → nord (în codul vechi «retur»). */
  goingNorth: boolean;
  time: string;
  /** '' când oprirea de sosire n-are oră. */
  arrival: string;
  /** Durata segmentului de la oprirea A la B, cu trecerea peste miezul nopții; null fără sosire. */
  segmentMinutes: number | null;
  /** Intervalul întregii rute («20:00 - 00:05»), cum îl arată căutarea. */
  routeDuration: string;
  price: number;
  destination_ro: string;
  destination_ru: string;
}

/**
 * Alege rata corectă: dacă AMBELE opriri (A și B) sunt în raionul de start
 * al rutei → tarif suburban; altfel → tarif interurban (lung).
 */
export function pickRate(
  fromD: string | null,
  toD: string | null,
  startD: string | null,
  rateLong: number,
  rateSub: number,
): number {
  if (startD && fromD === startD && toD === startD) return rateSub;
  return rateLong;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function segmentMinutes(time: string, arrival: string): number | null {
  if (!arrival) return null;
  return (toMinutes(arrival) - toMinutes(time) + 1440) % 1440;
}

export function buildScheduledTrips(input: {
  routes: TimetableRoute[];
  fromStops: TimetableStop[];
  toStops: TimetableStop[];
  /** Perechile km în AMBELE sensuri (A→B urmat de B→A); primul rând al unui tarif câștigă. */
  kmPairs: TimetableKmPair[];
  rateLong: number | null;
  rateSub: number | null;
}): ScheduledTrip[] {
  const { routes, rateLong, rateSub } = input;
  const fromMap = new Map(input.fromStops.map((s) => [s.crm_route_id, s]));
  const toMap = new Map(input.toStops.map((s) => [s.crm_route_id, s]));

  // tariff_id → preț. Dacă ambele opriri sunt în raionul de start al rutei → tarif suburban; altfel interurban.
  const priceMap = new Map<number, number>();
  for (const p of input.kmPairs) {
    if (!priceMap.has(p.tariff_id)) {
      const kmVal = Number(p.km);
      let price = 0;
      if (rateLong && rateSub && kmVal > 0 && kmVal < 1000) {
        const rate = pickRate(p.from_district, p.to_district, p.start_district, rateLong, rateSub);
        price = Math.round(kmVal * rate);
      }
      priceMap.set(p.tariff_id, price);
    }
  }

  const trips: ScheduledTrip[] = [];
  for (const route of routes) {
    const from = fromMap.get(route.id);
    const to = toMap.get(route.id);
    if (!from || !to) continue;
    // Ordinea opririlor vine din stop_order (id-ul nu mai garanteaza ordinea dupa migratia 263)
    const goingNorth = from.stop_order > to.stop_order;
    const tariffId = goingNorth ? route.tariff_id_retur : route.tariff_id_tur;
    if (!tariffId) continue;

    // Hide route if there's no km pair for this tariff — means the bus
    // doesn't physically pass through both stops on this direction
    // (ex: Coteala listed as stop in crm_stop_fares but tariff_retur=105 Criva Direct
    //  which doesn't include Coteala).
    if (!priceMap.has(tariffId)) continue;
    const price = priceMap.get(tariffId) ?? 0;

    // Chișinău → Nord: plecarea din Chișinău poate fi ascunsă (migr. 284) — slotul există în
    // orar, dar nu se operează ca plecare separată (ruta 2, al cărei șofer face returul la 10:40).
    // Nord → Chișinău: plecarea din Nord poate fi ascunsă (migr. 332) — ruta 13, Lipcani prin
    // Rîșcani 15:00, nu se mai operează, dar returul ei de 08:00 din Chișinău da (Ion, 09.09).
    if (goingNorth ? route.retur_ascuns : route.tur_ascuns) continue;

    const time = goingNorth ? from.hour_from_chisinau : from.hour_from_nord;
    const rawArrival = goingNorth ? to.hour_from_chisinau : to.hour_from_nord;
    // «0:00» = nu oprește; «00:00» e o oră reală (ruta 8 ajunge la Lipcani la miezul nopții).
    if (!time || time === '0:00') continue;
    const arrival = rawArrival && rawArrival !== '0:00' ? rawArrival : '';

    trips.push({
      routeId: route.id,
      goingNorth,
      time,
      arrival,
      segmentMinutes: segmentMinutes(time, arrival),
      routeDuration: (goingNorth ? route.time_chisinau : route.time_nord) || '',
      price,
      destination_ro: goingNorth ? route.dest_to_ro : route.dest_from_ro,
      destination_ru: goingNorth ? route.dest_to_ru : route.dest_from_ru,
    });
  }

  return trips.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}
