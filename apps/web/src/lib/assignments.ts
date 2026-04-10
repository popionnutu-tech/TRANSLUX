/**
 * Shared tur/retur assignment resolution utilities.
 *
 * Single source of truth for:
 * - Time parsing helpers (parseTimeLabel, parseFirstTime)
 * - Retur time resolution (resolveReturTime)
 * - Per-direction driver maps (buildTurAssignmentMap, buildReturAssignmentMap)
 */

/* ── Types ── */

export interface RawAssignment {
  crm_route_id: number;
  driver_id: string;
  vehicle_id: string | null;
  vehicle_id_retur?: string | null;
  retur_route_id?: number | null;
}

export interface ResolvedDriver {
  driver_id: string;
  vehicle_id: string | null;
}

/* ── Time helpers ── */

/** Extract first "HH:MM" from a display string like "10:40 - 14:30". */
export function parseTimeLabel(display: string): string {
  const match = display.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : display;
}

/** Parse first "HH:MM" from a display string and return minutes since midnight. */
export function parseFirstTime(display: string): number {
  const match = display.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

/* ── Retur time resolution ── */

/**
 * Resolve the effective Chișinău departure time for a route's retur.
 *
 * If retur_route_id is set, returns that route's time_chisinau.
 * Otherwise returns the route's own time_chisinau.
 */
export function resolveReturTime(
  assignment: { retur_route_id?: number | null } | null | undefined,
  ownTimeChisinau: string,
  routeLookup: Map<number, { time_chisinau: string }>,
): string {
  if (assignment?.retur_route_id) {
    const rr = routeLookup.get(assignment.retur_route_id);
    if (rr) return parseTimeLabel(rr.time_chisinau || '');
  }
  return parseTimeLabel(ownTimeChisinau || '');
}

/* ── Per-direction driver maps ── */

/**
 * Build TUR (Nord → Chișinău) assignment map: routeId → driver/vehicle.
 *
 * A route's TUR driver is whoever is assigned to that route (crm_route_id).
 */
export function buildTurAssignmentMap(
  assignments: RawAssignment[],
): Map<number, ResolvedDriver> {
  const map = new Map<number, ResolvedDriver>();
  for (const a of assignments) {
    if (!map.has(a.crm_route_id)) {
      map.set(a.crm_route_id, {
        driver_id: a.driver_id,
        vehicle_id: a.vehicle_id,
      });
    }
  }
  return map;
}

/**
 * Build RETUR (Chișinău → Nord) assignment map: routeId → driver/vehicle.
 *
 * Three cases:
 * 1. Override IN: someone's retur_route_id points here → they do this retur
 * 2. Default: route's own driver has no retur_route_id → they do their own retur
 * 3. Override OUT: route's own driver has retur_route_id elsewhere → unclaimed
 */
export function buildReturAssignmentMap(
  assignments: RawAssignment[],
): Map<number, ResolvedDriver> {
  const map = new Map<number, ResolvedDriver>();

  // Pass 1: Overrides — someone's retur_route_id points to a route
  for (const a of assignments) {
    if (a.retur_route_id) {
      map.set(a.retur_route_id, {
        driver_id: a.driver_id,
        vehicle_id: a.vehicle_id_retur ?? a.vehicle_id,
      });
    }
  }

  // Pass 2: Default — route's own driver does their own retur
  for (const a of assignments) {
    if (!map.has(a.crm_route_id) && !a.retur_route_id) {
      map.set(a.crm_route_id, {
        driver_id: a.driver_id,
        vehicle_id: a.vehicle_id_retur ?? a.vehicle_id,
      });
    }
  }

  return map;
}
