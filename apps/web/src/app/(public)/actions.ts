'use server';

import { unstable_cache } from 'next/cache';
import { headers } from 'next/headers';
import { createHash } from 'crypto';
import { getSupabase } from '@/lib/supabase';
import { depasesteLimita, FEREASTRA_MINUTE } from '@/lib/search-rate-limit';
import { visitorHash } from '@/lib/visitor';
import { configBilete } from '@/lib/bilete-api';
import { vanzareDeschisaPeSite } from '@/lib/bilete-reguli';
// Prețul, orarul și atribuirile zilei vin din @translux/db (ION-192): aceleași reguli pe site,
// în asistent și în API-ul biletelor online.
import {
  buildTurAssignmentMap, buildReturAssignmentMap, calculeazaCurse, incarcaCurse, pickRate,
  resolveOfferForDate, resolveTariffRates, parseTimeLabel,
} from '@translux/db';

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
  isAwaitingDriver?: boolean; // true when departure is >7 days out and no driver assigned yet
  // Biletele online (ION-197): identitatea cursei pentru comandă și dacă se vinde online acum.
  crm_route_id: number;
  going_north: boolean;
  trip_date: string;
  sale_open: boolean;
}

export interface ActiveOffer {
  from_locality: string;
  to_locality: string;
  original_price: number;
  offer_price: number;
}

export async function getActiveOffers(): Promise<ActiveOffer[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('offers')
    .select('from_locality, to_locality, original_price, offer_price')
    .eq('active', true);
  const offers = (data || []) as ActiveOffer[];
  if (offers.length === 0) return offers;

  // Bannerul urmează tariful de AZI (formula RPC), nu snapshotul din offers —
  // între miezul nopții și rularea RPC-ului de aplicare, tabelul mai are prețul vechi.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  const { rateLong } = await resolveTariffRates(supabase, today);

  return offers.map((o) => resolveOfferForDate(o, rateLong, today));
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
  /** Slug-urile (chisinau, balti…) — pentru linkul spre pagina de direcție (ION-153). */
  from_slug?: string;
  to_slug?: string;
  from_ro: string;
  to_ro: string;
  from_ru: string;
  to_ru: string;
  price: number;
}

const POPULAR_ROUTES = [
  { from: 'chisinau', to: 'balti', from_ro: 'Chișinău', to_ro: 'Bălți', from_ru: 'Кишинёв', to_ru: 'Бельцы' },
  { from: 'chisinau', to: 'edinet', from_ro: 'Chișinău', to_ro: 'Edineț', from_ru: 'Кишинёв', to_ru: 'Единец' },
  { from: 'chisinau', to: 'singerei', from_ro: 'Chișinău', to_ro: 'Sîngerei', from_ru: 'Кишинёв', to_ru: 'Сынжерей' },
  { from: 'chisinau', to: 'ocnita', from_ro: 'Chișinău', to_ro: 'Ocnița', from_ru: 'Кишинёв', to_ru: 'Окница' },
  { from: 'chisinau', to: 'otaci', from_ro: 'Chișinău', to_ro: 'Otaci', from_ru: 'Кишинёв', to_ru: 'Атаки' },
  { from: 'chisinau', to: 'briceni', from_ro: 'Chișinău', to_ro: 'Briceni', from_ru: 'Кишинёв', to_ru: 'Бричаны' },
  { from: 'chisinau', to: 'cupcini', from_ro: 'Chișinău', to_ro: 'Cupcini', from_ru: 'Кишинёв', to_ru: 'Купчинь' },
  { from: 'chisinau', to: 'lipcani', from_ro: 'Chișinău', to_ro: 'Lipcani', from_ru: 'Кишинёв', to_ru: 'Липканы' },
  { from: 'chisinau', to: 'corjeuti', from_ro: 'Chișinău', to_ro: 'Corjeuți', from_ru: 'Кишинёв', to_ru: 'Коржеуцы' },
  { from: 'chisinau', to: 'grimancauti', from_ro: 'Chișinău', to_ro: 'Grimăncăuți', from_ru: 'Кишинёв', to_ru: 'Гриманкауцы' },
  { from: 'chisinau', to: 'criva', from_ro: 'Chișinău', to_ro: 'Criva', from_ru: 'Кишинёв', to_ru: 'Крива' },
  { from: 'chisinau', to: 'larga', from_ro: 'Chișinău', to_ro: 'Larga', from_ru: 'Кишинёв', to_ru: 'Ларга' },
];


/** Fetch popular route prices using today's tariff rate from tariff_periods */
export async function getPopularPrices(): Promise<PopularRoutePrice[]> {
  const supabase = getSupabase();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });

  // Get today's tariff rates (interurban long + suburban), falling back to the
  // most recent period so prices never drop to 0 when the current week has no tariff.
  const { rateLong, rateSub } = await resolveTariffRates(supabase, today);

  // Get km for each popular route from interurban_v2 view and calculate price
  // Uses cel mai scurt km între cele 2 opriri (toate tarifele care au ambele opriri)
  const results = await Promise.all(
    POPULAR_ROUTES.map(async (r) => {
      const { data: pairs } = await supabase
        .from('v_interurban_v2_km_pairs')
        .select('km, from_district, to_district, start_district')
        .eq('from_stop', r.from)
        .eq('to_stop', r.to)
        .order('km', { ascending: true })
        .limit(1);

      const row = pairs?.[0] as any;
      const km = row ? Number(row.km) : 0;
      let price = 0;
      if (rateLong && rateSub && km > 0 && km < 1000) {
        const rate = pickRate(row.from_district, row.to_district, row.start_district, rateLong, rateSub);
        price = Math.round(km * rate);
      }

      return {
        from_slug: r.from,
        to_slug: r.to,
        from_ro: r.from_ro,
        to_ro: r.to_ro,
        from_ru: r.from_ru,
        to_ru: r.to_ru,
        price,
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
 * Resolve which date to read daily_assignments from for the public site.
 *
 * If the requested date has no grafic yet (dispatcher hasn't introduced it),
 * fall back to the most recent earlier date with grafic — but only when the
 * requested date sits in the window [today+1 .. today+7] (Europe/Chisinau).
 * This keeps passengers from seeing an empty search result while the
 * dispatcher still sees the day as "not introduced" in the admin grafic.
 */
async function resolveAssignmentDate(
  supabase: ReturnType<typeof getSupabase>,
  date: string,
): Promise<string> {
  const { data: anyOnDate } = await supabase
    .from('daily_assignments')
    .select('id')
    .eq('assignment_date', date)
    .limit(1);

  if (anyOnDate && anyOnDate.length > 0) return date;

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  const todayMs = Date.parse(today + 'T00:00:00Z');
  const targetMs = Date.parse(date + 'T00:00:00Z');
  if (Number.isNaN(todayMs) || Number.isNaN(targetMs)) return date;

  const diffDays = Math.round((targetMs - todayMs) / 86_400_000);
  if (diffDays < 1 || diffDays > 7) return date;

  const lowerBoundStr = new Date(targetMs - 7 * 86_400_000).toISOString().slice(0, 10);

  const { data: latest } = await supabase
    .from('daily_assignments')
    .select('assignment_date')
    .lt('assignment_date', date)
    .gte('assignment_date', lowerBoundStr)
    .order('assignment_date', { ascending: false })
    .limit(1);

  if (latest && latest.length > 0) return latest[0].assignment_date as string;
  return date;
}

/**
 * Sursa unei căutări, pentru search_log.
 *
 * IP-ul NU se păstrează: se scrie doar SHA-256(sare + IP). Atât e de ajuns ca două
 * căutări să fie legate de aceeași sursă, dar adresa nu poate fi citită înapoi.
 * Sarea vine din IP_HASH_SALT; fără ea cade pe cheia anon, care e oricum în env-ul
 * fiecărui deploy — hash-urile rămân comparabile între ele.
 *
 * Nu aruncă niciodată: un log lipsă nu are voie să rupă căutarea.
 */
async function clientFingerprint(): Promise<{ ip_hash: string | null; user_agent: string | null; vizitator: string | null }> {
  try {
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || null;
    const salt = process.env.IP_HASH_SALT || process.env.SUPABASE_ANON_KEY || '';
    return {
      ip_hash: ip ? createHash('sha256').update(salt + ip).digest('hex').slice(0, 16) : null,
      user_agent: h.get('user-agent')?.slice(0, 200) || null,
      vizitator: visitorHash(h),
    };
  } catch {
    return { ip_hash: null, user_agent: null, vizitator: null };
  }
}

export async function searchTrips(
  fromRo: string,
  toRo: string,
  date: string,
): Promise<TripResult[]> {
  const supabase = getSupabase();
  const sursa = await clientFingerprint();

  // Anti-scraper (Ion, 09.09): peste 10 căutări în 10 minute de la aceeași sursă,
  // răspunsul e listă goală. Numărăm ÎNAINTE de a loga căutarea curentă, prin RPC-ul
  // cautari_recente (migr. 334) — anon nu poate citi search_log. Orice eroare → nu
  // blocăm: limita nu are voie să rupă căutarea clienților.
  let blocata = false;
  if (sursa.ip_hash) {
    const { data: anterioare, error } = await supabase.rpc('cautari_recente', {
      p_ip_hash: sursa.ip_hash,
      p_minute: FEREASTRA_MINUTE,
    });
    if (error) console.warn('[search_log] cautari_recente eșuat:', error.message);
    else blocata = depasesteLimita(anterioare as number | null);
  }

  // Fire-and-forget: log search query for analytics (și cele blocate — scraperul
  // rămâne vizibil în analytics, iar fereastra lui nu se «răcește» cât insistă).
  supabase.from('search_log').insert({
    from_locality: fromRo,
    to_locality: toRo,
    search_date: date,
    mod: 'mai_tarziu',
    ...sursa,
  }).then(({ error }) => {
    // Un deploy peste o bază fără migrația 282 ar goli analiza căutărilor în tăcere.
    if (error) console.warn('[search_log] insert eșuat:', error.message);
  });

  if (blocata) return [];

  const assignmentDate = await resolveAssignmentDate(supabase, date);

  // Compute days between today and the requested date (Europe/Chișinău).
  // Used to decide whether routes without an assigned driver should appear
  // as a "driver coming soon" placeholder (>7 days) or be hidden (today / 1–7 days).
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  const todayMs = Date.parse(todayStr + 'T00:00:00Z');
  const targetMs = Date.parse(date + 'T00:00:00Z');
  const daysUntilDeparture = (Number.isNaN(todayMs) || Number.isNaN(targetMs))
    ? 0
    : Math.round((targetMs - todayMs) / 86_400_000);

  // Opririle, rutele, km-ii, tariful zilei și oferta — din @translux/db, ca API-ul biletelor
  // să calculeze același preț (ION-192). Atribuirile zilei rămân aici: sunt partea site-ului.
  // O eroare a bazei la preț/orar NU e «nicio cursă»: pe site păstrăm lista goală (ca înainte), dar o jurnalizăm;
  // în API-ul biletelor aceeași eroare oprește comanda (nu se vinde pe un tarif gol).
  let datele: Awaited<ReturnType<typeof incarcaCurse>>;
  try { datele = await incarcaCurse(supabase, { fromRo, toRo, date }); } catch (e) {
    console.error('[searchTrips] datele cursei indisponibile:', e instanceof Error ? e.message : e);
    return [];
  }
  if (!datele) return [];
  const { matchingRouteIds } = datele;

  const [{ data: assignments }, { data: returOverrides }] = await Promise.all([
    supabase
      .from('daily_assignments')
      .select('crm_route_id, driver_id, vehicle_id, vehicle_id_retur, driver_id_retur, retur_route_id')
      .eq('assignment_date', assignmentDate)
      .in('crm_route_id', matchingRouteIds),
    supabase
      .from('daily_assignments')
      .select('crm_route_id, driver_id, vehicle_id, vehicle_id_retur, driver_id_retur, retur_route_id')
      .eq('assignment_date', assignmentDate)
      .in('retur_route_id', matchingRouteIds),
  ]);

  // Fetch drivers and vehicles separately to avoid Supabase FK join issues
  const allAssignments = [...(assignments || []), ...(returOverrides || [])];
  const driverIds = [...new Set(allAssignments.map((a: any) => a.driver_id).filter(Boolean))];
  const vehicleIds = [...new Set(allAssignments.flatMap((a: any) => [a.vehicle_id, a.vehicle_id_retur].filter(Boolean)))];

  const [{ data: driversData }, { data: vehiclesData }] = await Promise.all([
    driverIds.length > 0
      ? supabase.from('public_drivers_view').select('id, full_name, phone').in('id', driverIds)
      : Promise.resolve({ data: [] }),
    vehicleIds.length > 0
      ? supabase.from('public_vehicles_view').select('id, plate_number').in('id', vehicleIds)
      : Promise.resolve({ data: [] }),
  ]);

  const driverMap = new Map((driversData || []).map((d: any) => [d.id, {
    ...d,
    display_name: d.full_name ? d.full_name.trim().split(/\s+/).pop() : null,
  }]));
  const vehicleMap = new Map((vehiclesData || []).map((v: any) => [v.id, v]));

  // Care curse leagă cele două opriri, la ce oră și cu ce preț (oferta zilei inclusă) — nucleul
  // comun cu paginile de direcție și cu API-ul biletelor. Aici se adaugă doar șoferul și mașina.
  const scheduled = calculeazaCurse(datele, date);

  // Build tur/retur assignment maps using shared utility
  const turDriverMap = buildTurAssignmentMap(allAssignments as any[]);
  const returDriverMap = buildReturAssignmentMap(allAssignments as any[]);

  // Resolve driver_id/vehicle_id → display details
  function resolveDetails(resolved: { driver_id: string; vehicle_id: string | null } | undefined) {
    if (!resolved) return null;
    const driver = driverMap.get(resolved.driver_id);
    const vehicle = resolved.vehicle_id ? vehicleMap.get(resolved.vehicle_id) : null;
    return {
      driver: driver?.display_name || null,
      phone: driver?.phone || null,
      plate: vehicle?.plate_number || null,
    };
  }

  // Biletele online (ION-197): configurația panoului o dată pe căutare (cache 60 s; fără răspuns = închis).
  // Butonul cere șofer atribuit PE ziua cursei: când ziua n-are încă grafic, site-ul arată șoferul zilei
  // anterioare, dar pe ăla nu se vinde (API-ul ar refuza oricum).
  const cfgBilete = await configBilete();
  const graficPeZi = assignmentDate === date;
  const nowMs = Date.now();
  function pornireRuta(routeId: number, goingNorth: boolean): string | null {
    const r = datele!.routes.find((x) => x.id === routeId);
    const interval = r ? (goingNorth ? r.time_chisinau : r.time_nord) : null;
    const p = interval ? parseTimeLabel(interval) : null;
    return p && /^\d{2}:\d{2}$/.test(p) ? p : null;
  }

  const results: TripResult[] = [];

  for (const trip of scheduled) {
    const bilet = {
      crm_route_id: trip.routeId,
      going_north: trip.goingNorth,
      trip_date: date,
    };
    // Prețul afișat vine deja cu oferta aplicată (calculeazaCurse); originalPrice e cel tăiat.
    const displayPrice = trip.price;
    const displayOriginal = trip.originalPrice;

    // Chișinău → Nord folosește harta retur, Nord → Chișinău harta tur.
    const details = resolveDetails((trip.goingNorth ? returDriverMap : turDriverMap).get(trip.routeId));
    const hasDriver = !!(details?.driver && details?.phone);
    const base = {
      time: trip.time,
      arrivalTime: trip.arrival,
      destination_ro: trip.destination_ro,
      destination_ru: trip.destination_ru,
      duration: trip.routeDuration,
    };

    if (!hasDriver) {
      // Cursa fără șofer se ARATĂ pentru orice zi viitoare. Decizia lui Ion (25.08,
      // pe agentul vocal; 26.08 aceeași lipsă văzută pe site): «dacă nu este șoferul,
      // trebuie spus că ruta va fi, dar datele șoferului mai târziu». Graficul zilei
      // următoare se completează după-amiaza, iar oamenii caută dimineața — altfel
      // cursa de 10:40 Chișinău–Bălți pur și simplu lipsea din listă.
      // Pentru AZI rămâne ascunsă: azi graficul e complet, iar lipsa șoferului
      // înseamnă de obicei că nu se merge.
      if (daysUntilDeparture >= 1) {
        results.push({
          ...base,
          driver: null,
          phone: null,
          vehicle_plate: null,
          // Peste 7 zile tariful se mai poate schimba, deci 0; pentru zilele
          // apropiate prețul e cunoscut și pasagerul are dreptul să-l vadă.
          price: daysUntilDeparture > 7 ? 0 : displayPrice,
          originalPrice: daysUntilDeparture > 7 ? null : displayOriginal,
          isAwaitingDriver: true,
          ...bilet,
          sale_open: false,
        });
      }
      continue;
    }
    results.push({
      ...base,
      driver: details!.driver,
      phone: details!.phone,
      vehicle_plate: details?.plate || null,
      price: displayPrice,
      originalPrice: displayOriginal,
      ...bilet,
      sale_open: displayPrice > 0 && vanzareDeschisaPeSite({
        cfg: cfgBilete, routeId: trip.routeId, goingNorth: trip.goingNorth, tripDate: date, time: trip.time,
        pornireRuta: pornireRuta(trip.routeId, trip.goingNorth), soferPeZi: graficPeZi, nowMs,
      }),
    });
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
