/**
 * Logica pură a pozelor de curățenie (spec S08, fără React): zonele și textele de
 * cadru (copiate din apps/bot/src/services/cleaningCheck.ts), tura după oră și
 * poarta 06:55 / 16:25 — oglinda lui `cleaningGateSlot` + `cleaningMissing` din
 * apps/bot/src/api/reportRules.ts. Serverul verifică oricum; aici doar ca operatorul
 * să fie dus la camera înainte să completeze cursa degeaba.
 */
import type { CleaningSlot, CleaningZone, DayResponse } from './types';

export const CLEANING_ZONES: readonly CleaningZone[] = ['PERON', 'PIETONI', 'VECEU'];

export const ZONE_LABEL: Record<CleaningZone, string> = {
  PERON: 'Peron',
  PIETONI: 'Zona pietoni (stația GARA)',
  VECEU: 'Zona veceu',
};

/** Cum trebuie făcută poza, ca să fie comparabilă de la o zi la alta (identic cu botul). */
export const ZONE_HINT: Record<CleaningZone, string> = {
  PERON: 'Din colțul parcării spre clădirea portocalie (DaviDan / AutoStoc), cu pavajul și locul microbuzului în cadru.',
  PIETONI: 'De pe trotuar, cu stâlpul cu semnul „GARA”, conurile portocalii și pavajul în cadru.',
  VECEU: 'Din ușă, cu podeaua, cabinele și chiuvetele în cadru.',
};

export const SLOT_LABEL: Record<CleaningSlot, string> = {
  DIMINEATA: 'dimineață, înainte de prima cursă',
  ZIUA: 'ziua, ora 15:00',
};

export const MURDAR_WARNING = '⚠️ Informația se stochează și va fi penalizată.';

export function isCleaningSlot(v: unknown): v is CleaningSlot {
  return v === 'DIMINEATA' || v === 'ZIUA';
}

/** Tura după ora telefonului: până la 12:00 → DIMINEATA, altfel ZIUA. */
export function slotForTime(d: Date): CleaningSlot {
  return d.getHours() < 12 ? 'DIMINEATA' : 'ZIUA';
}

/** Zonele care lipsesc din set, în ordinea PERON → PIETONI → VECEU. Gol = setul e complet. */
export function missingZones(done: readonly CleaningZone[]): CleaningZone[] {
  return CLEANING_ZONES.filter((z) => !done.includes(z));
}

/** Prima zonă neînchisă sau null când setul e complet. */
export function nextZone(done: readonly CleaningZone[]): CleaningZone | null {
  return missingZones(done)[0] ?? null;
}

/** Reuniunea fără duplicate, în ordinea canonică — pentru `zonesDone` din răspuns + zona abia trimisă. */
export function mergeDone(...lists: readonly (readonly CleaningZone[])[]): CleaningZone[] {
  const all = new Set<CleaningZone>();
  for (const l of lists) for (const z of l) all.add(z);
  return CLEANING_ZONES.filter((z) => all.has(z));
}

export interface CleaningGate {
  slot: CleaningSlot;
  missing: CleaningZone[];
}

/**
 * Poarta de curățenie pentru o cursă (doar Chișinău): prima cursă a zilei cere setul
 * DIMINEATA complet, cursa `cleaningGateTripTime` (16:25) cere setul ZIUA complet.
 * Întoarce null când cursa nu are poartă sau setul e deja complet.
 */
export function cleaningGateFor(
  day: Pick<DayResponse, 'point' | 'trips' | 'cleaning' | 'cleaningGateTripTime'>,
  tripId: string,
): CleaningGate | null {
  if (day.point !== 'CHISINAU') return null;
  const trip = day.trips.find((t) => t.id === tripId);
  if (!trip) return null;
  let slot: CleaningSlot | null = null;
  if (trip.id === day.trips[0]?.id) slot = 'DIMINEATA';
  else if (day.cleaningGateTripTime && trip.departure_time === day.cleaningGateTripTime) slot = 'ZIUA';
  if (!slot) return null;
  const missing = missingZones(day.cleaning?.[slot] ?? []);
  return missing.length > 0 ? { slot, missing } : null;
}
