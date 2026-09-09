/**
 * Logica pură a pozelor de curățenie (spec S08, fără React): zonele și textele de
 * cadru (copiate din apps/bot/src/services/cleaningCheck.ts), tura după oră și
 * poarta «prima cursă raportată» / 16:25 — oglinda lui `cleaningGateSlot` + `cleaningMissing` din
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
 * Poarta de curățenie pentru o cursă (doar Chișinău) — oglinda lui `cleaningGateSlot` din
 * bot, cu stările din /day în loc de seturile de id-uri:
 *  - DIMINEATA: prima cursă raportată EFECTIV azi (nicio cursă `done`), nu prima din orar —
 *    cursele sărite («N-am fost la cursă») nu contează (Vitalie, 09.09: Aurel vine la 07:30);
 *  - ZIUA: cursa `cleaningGateTripTime` (16:25) sau, dacă aceea e `skipped`, prima cursă
 *    de după ea fără nicio cursă `done` între ele.
 * Întoarce null când cursa nu are poartă sau setul e deja complet.
 */
export function cleaningGateFor(
  day: Pick<DayResponse, 'point' | 'trips' | 'cleaning' | 'cleaningGateTripTime'>,
  tripId: string,
): CleaningGate | null {
  if (day.point !== 'CHISINAU') return null;
  const idx = day.trips.findIndex((t) => t.id === tripId);
  if (idx < 0) return null;
  const slot = gateSlotFor(day, idx);
  if (!slot) return null;
  const missing = missingZones(day.cleaning?.[slot] ?? []);
  return missing.length > 0 ? { slot, missing } : null;
}

function gateSlotFor(day: Pick<DayResponse, 'trips' | 'cleaningGateTripTime'>, idx: number): CleaningSlot | null {
  const trips = day.trips;
  if (!trips.some((t) => t.state === 'done')) return 'DIMINEATA';
  const gateTime = day.cleaningGateTripTime;
  if (!gateTime) return null;
  if (trips[idx]!.departure_time === gateTime) return 'ZIUA';
  const gateIdx = trips.findIndex((t) => t.departure_time === gateTime);
  if (gateIdx >= 0 && gateIdx < idx && trips[gateIdx]!.state === 'skipped') {
    const doneBetween = trips.slice(gateIdx + 1, idx).some((t) => t.state === 'done');
    if (!doneBetween) return 'ZIUA';
  }
  return null;
}
