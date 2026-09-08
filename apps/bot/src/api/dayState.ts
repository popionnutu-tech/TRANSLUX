/**
 * Starea curselor zilei pentru aplicația de peron — aceeași regulă ca grila din
 * conversations/report.ts: cursele raportate sunt `done`, PRIMA neraportată (în
 * ordinea plecării) e `next`, restul sunt `locked`. Se poate raporta doar `next`.
 */
export type TripState = 'done' | 'next' | 'locked';

export function tripStates<T extends { id: string }>(
  trips: readonly T[],
  reportedIds: ReadonlySet<string>,
): Array<{ id: string; state: TripState }> {
  let nextFound = false;
  return trips.map((t) => {
    if (reportedIds.has(t.id)) return { id: t.id, state: 'done' as const };
    if (!nextFound) {
      nextFound = true;
      return { id: t.id, state: 'next' as const };
    }
    return { id: t.id, state: 'locked' as const };
  });
}

/** Id-ul cursei `next` (prima neraportată) sau null când toate sunt raportate. */
export function nextTripId<T extends { id: string }>(trips: readonly T[], reportedIds: ReadonlySet<string>): string | null {
  return trips.find((t) => !reportedIds.has(t.id))?.id ?? null;
}
