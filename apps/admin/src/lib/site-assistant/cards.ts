// Cardurile de sub mesajul asistentului (ION-39, macheta aprobată de Ion 23.09).
// Le construiește SERVERUL din bază, nu modelul: orele, prețurile, numerele și
// punctul de pe hartă ajung la client exact cum sunt în bază.

import { STATIONS, stationMaps, stationWaze, type Station } from './knowledge';
import type { BusPoint, OnRoadTrip } from './bus-location';
import { driverFirstName } from '@/lib/driver-name';
import { searchTrips } from '@/lib/trips-search';
import { localitiesToRo } from '@/lib/voice-locality';

/**
 * Cine duce cursa (Ion, 23.09: «lângă oră să fie datele: șofer, mașină, număr șofer»).
 * Doar PRENUMELE șoferului — ca pe linia vocală (lib/driver-name) — și numărul lui,
 * același pe care site-ul îl dă deja la căutare. Mașina, ca omul s-o recunoască în stație.
 */
export interface Crew { driver: string | null; plate: string | null; phone: string | null }

/** «651AKD» → «651 AKD», «ABC123» → «ABC 123»; altfel cum e în nomenclator. */
export function fmtPlate(raw: string | null | undefined): string | null {
  const p = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!p) return null;
  const m = p.match(/^(\d{3})([A-Z]{3})$/) ?? p.match(/^([A-Z]{3})(\d{3})$/);
  return m ? `${m[1]} ${m[2]}` : p;
}

export function crewOf(t: { driver: string | null; vehicle_plate: string | null; phone: string | null; isAwaitingDriver?: boolean }): Crew {
  // Cursa fără șofer repartizat n-are nici om, nici număr de sunat.
  if (t.isAwaitingDriver) return { driver: null, plate: null, phone: null };
  return { driver: driverFirstName(t.driver), plate: fmtPlate(t.vehicle_plate), phone: t.phone ?? null };
}

export type Card =
  | { type: 'trips'; from: string; to: string; date: string; total: number;
      trips: (Crew & { time: string; price: number | null })[] }
  | { type: 'station'; key: Station['key']; name_ro: string; name_ru: string;
      address_ro: string; address_ru: string; maps: string; waze: string }
  | { type: 'pick'; from: string; to: string; trips: OnRoadTrip[] }
  | ({ type: 'bus'; from: string; to: string; departure: string; lat: number; lon: number;
      near: string | null; at: string; maps: string } & Crew);

/** Cât arată cardul din lista curselor; restul le numără «Toate cele N curse». */
export const TRIPS_SHOWN = 6;

/**
 * Cardul curselor se face din aceeași căutare ca rezultatul vocal, dar direct din bază:
 * rezultatul vocal nu poartă mașina (modelul n-are ce face cu ea). Ziua e cea rezolvată
 * deja de tool (`date` din rezultat), ca lista și textul să vorbească de aceeași zi.
 */
export async function tripsCard(input: Record<string, unknown>, result: unknown): Promise<Card | null> {
  const r = result as { date?: string; trips?: unknown[] } | null;
  if (!r?.date || !Array.isArray(r.trips) || r.trips.length === 0) return null;
  const { values: [fromRo, toRo], unknown } = await localitiesToRo([String(input.from ?? ''), String(input.to ?? '')]);
  if (unknown.length || !fromRo || !toRo) return null;
  let trips = await searchTrips(fromRo, toRo, r.date, { skipLog: true });
  const dep = typeof input.departure === 'string' ? input.departure.trim().padStart(5, '0') : '';
  if (dep) trips = trips.filter((t) => t.time.padStart(5, '0') === dep);
  if (trips.length === 0) return null;
  return {
    type: 'trips', from: fromRo, to: toRo, date: r.date, total: trips.length,
    trips: trips.slice(0, TRIPS_SHOWN).map((t) => ({
      time: t.time.padStart(5, '0'),
      price: t.price > 0 ? t.price : null,
      ...crewOf(t),
    })),
  };
}

export function stationCard(key: string): Card | null {
  const s = STATIONS.find((x) => x.key === key);
  if (!s) return null;
  return {
    type: 'station', key: s.key, name_ro: s.name_ro, name_ru: s.name_ru,
    address_ro: s.address_ro, address_ru: s.address_ru, maps: stationMaps(s), waze: stationWaze(s),
  };
}

export function pickCard(from: string, to: string, trips: OnRoadTrip[]): Card | null {
  return trips.length > 1 ? { type: 'pick', from, to, trips } : null;
}

export function busCard(p: BusPoint): Card {
  return {
    type: 'bus', from: p.from, to: p.to, departure: p.departure,
    lat: p.lat, lon: p.lon, near: p.near, at: p.at,
    driver: p.driver, plate: p.plate, phone: p.phone,
    maps: `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lon.toFixed(6)}`,
  };
}
