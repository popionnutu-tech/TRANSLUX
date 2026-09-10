/**
 * Starea curselor zilei pentru aplicația de peron — aceeași regulă ca grila din
 * conversations/report.ts: cursele raportate sunt `done`, PRIMA neraportată (în
 * ordinea plecării) e `next`, restul sunt `locked`. Se poate raporta doar `next`.
 *
 * Cursa la care operatorul n-a fost (operator_trip_skips) e `skipped`: contează ca
 * închisă pentru regula «prima neraportată = next» (Vitalie, 09.09: Aurel vine la
 * 07:30 și nu poate raporta 06:55), dar nu e `done`. De la 10.09 (Ion) sărirea scrie
 * și rândul cu cifra de pasageri în `reports`, deci o cursă e și raportată, și sărită
 * — sărirea bate: pe ecran rămâne «n-am fost», cu cifra lângă oră.
 *
 * Tot aici: ziua fără operator la punct (config.noOperatorWeekdays, vineri la
 * Chișinău) — pură, pe data 'YYYY-MM-DD', fără DB.
 */
import type { PointEnum } from '@translux/db';
import { POINT_LABELS } from '@translux/db';
import { config } from '../config.js';
import { ApiError } from './errors.js';

export type TripState = 'done' | 'skipped' | 'next' | 'locked';

const NO_SKIPS: ReadonlySet<string> = new Set();

export function tripStates<T extends { id: string }>(
  trips: readonly T[],
  reportedIds: ReadonlySet<string>,
  skippedIds: ReadonlySet<string> = NO_SKIPS,
): Array<{ id: string; state: TripState }> {
  let nextFound = false;
  return trips.map((t) => {
    if (skippedIds.has(t.id)) return { id: t.id, state: 'skipped' as const };
    if (reportedIds.has(t.id)) return { id: t.id, state: 'done' as const };
    if (!nextFound) {
      nextFound = true;
      return { id: t.id, state: 'next' as const };
    }
    return { id: t.id, state: 'locked' as const };
  });
}

/** Id-ul cursei `next` (prima nici raportată, nici sărită) sau null când nu mai e niciuna. */
export function nextTripId<T extends { id: string }>(
  trips: readonly T[],
  reportedIds: ReadonlySet<string>,
  skippedIds: ReadonlySet<string> = NO_SKIPS,
): string | null {
  return trips.find((t) => !reportedIds.has(t.id) && !skippedIds.has(t.id))?.id ?? null;
}

// ── Zi fără operator ──────────────────────────────────────────────────────────

const WEEKDAY_NAMES = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'] as const;

/** 'YYYY-MM-DD' → ziua săptămânii ISO (1 = luni … 7 = duminică). Data e deja pe ora Chișinăului. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = duminică
  return day === 0 ? 7 : day;
}

export function isDayOff(point: PointEnum, date: string): boolean {
  const days = config.noOperatorWeekdays[point] as readonly number[];
  return days.includes(isoWeekday(date));
}

/** «Vineri: zi fără operator la Chișinău» — textul pe care îl arată aplicația; null în zilele de lucru. */
export function dayOffText(point: PointEnum, date: string): string | null {
  if (!isDayOff(point, date)) return null;
  const name = WEEKDAY_NAMES[isoWeekday(date) - 1];
  return `${name[0].toUpperCase()}${name.slice(1)}: zi fără operator la ${POINT_LABELS[point]}`;
}

/** «vineri» — pentru rândul din digest («Chișinău: vineri, zi fără operator»). */
export function weekdayName(date: string): string {
  return WEEKDAY_NAMES[isoWeekday(date) - 1];
}

/** 409 DAY_OFF pe rutele de scriere (/report, /cleaning-photo, /driver-photo). /skip rămâne
 *  deschis: vinerea cifrele de pasageri intră pe acolo (Ion, 10.09). */
export function assertNotDayOff(point: PointEnum, date: string): void {
  const text = dayOffText(point, date);
  if (text) throw new ApiError(409, 'DAY_OFF', `${text} — azi nu se raportează nimic`);
}
