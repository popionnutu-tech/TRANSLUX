// Cardurile de sub mesajul asistentului (ION-39, macheta aprobată de Ion 23.09).
// Le construiește SERVERUL din rezultatele tool-urilor, nu modelul: orele, prețurile,
// numerele și punctul de pe hartă ajung la client exact cum au ieșit din bază.

import { STATIONS, mapsUrl, wazeUrl, type Station } from './knowledge';
import type { BusPoint, OnRoadTrip } from './bus-location';

export type Card =
  | { type: 'trips'; from: string; to: string; date: string; total: number;
      trips: { time: string; price: number | null; phone: string | null }[] }
  | { type: 'station'; key: Station['key']; name_ro: string; name_ru: string;
      address_ro: string; address_ru: string; maps: string; waze: string }
  | { type: 'pick'; from: string; to: string; trips: OnRoadTrip[] }
  | { type: 'bus'; from: string; to: string; departure: string; lat: number; lon: number;
      near: string | null; at: string; maps: string };

/** Cât arată cardul din lista curselor; restul le numără «Toate cele N curse». */
export const TRIPS_SHOWN = 6;

type RawTrip = { departure?: string; price?: number; phone?: string | null; awaiting_driver?: boolean };

export function tripsCard(input: Record<string, unknown>, result: unknown): Card | null {
  const r = result as { count?: number; date?: string; trips?: RawTrip[] } | null;
  if (!r || !Array.isArray(r.trips) || r.trips.length === 0) return null;
  return {
    type: 'trips',
    from: String(input.from ?? ''),
    to: String(input.to ?? ''),
    date: String(r.date ?? ''),
    total: r.trips.length,
    trips: r.trips.slice(0, TRIPS_SHOWN).map((t) => ({
      time: String(t.departure ?? ''),
      price: typeof t.price === 'number' && t.price > 0 ? t.price : null,
      // Cursa fără șofer repartizat nu are pe cine suna.
      phone: t.awaiting_driver ? null : (t.phone ?? null),
    })),
  };
}

export function stationCard(key: string): Card | null {
  const s = STATIONS.find((x) => x.key === key);
  if (!s) return null;
  return {
    type: 'station', key: s.key, name_ro: s.name_ro, name_ru: s.name_ru,
    address_ro: s.address_ro, address_ru: s.address_ru, maps: mapsUrl(s.query), waze: wazeUrl(s.query),
  };
}

export function pickCard(from: string, to: string, trips: OnRoadTrip[]): Card | null {
  return trips.length > 1 ? { type: 'pick', from, to, trips } : null;
}

export function busCard(p: BusPoint): Card {
  return {
    type: 'bus', from: p.from, to: p.to, departure: p.departure,
    lat: p.lat, lon: p.lon, near: p.near, at: p.at,
    maps: `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lon.toFixed(6)}`,
  };
}
