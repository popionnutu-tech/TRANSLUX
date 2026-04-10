import { describe, it, expect } from 'vitest';
import {
  parseTimeLabel,
  parseFirstTime,
  resolveReturTime,
  buildTurAssignmentMap,
  buildReturAssignmentMap,
  type RawAssignment,
} from './assignments';

/* ── parseTimeLabel ── */

describe('parseTimeLabel', () => {
  it('extracts HH:MM from range', () => {
    expect(parseTimeLabel('10:40 - 14:30')).toBe('10:40');
  });

  it('extracts single time', () => {
    expect(parseTimeLabel('3:50')).toBe('3:50');
  });

  it('returns input unchanged if no match', () => {
    expect(parseTimeLabel('')).toBe('');
    expect(parseTimeLabel('abc')).toBe('abc');
  });
});

/* ── parseFirstTime ── */

describe('parseFirstTime', () => {
  it('returns minutes since midnight', () => {
    expect(parseFirstTime('10:40 - 14:30')).toBe(640);
    expect(parseFirstTime('5:45')).toBe(345);
    expect(parseFirstTime('0:00')).toBe(0);
  });

  it('returns 0 for invalid input', () => {
    expect(parseFirstTime('')).toBe(0);
    expect(parseFirstTime('abc')).toBe(0);
  });
});

/* ── resolveReturTime ── */

describe('resolveReturTime', () => {
  const routeLookup = new Map<number, { time_chisinau: string }>([
    [20, { time_chisinau: '10:40 - 14:30' }],
    [30, { time_chisinau: '15:55 - 19:00' }],
  ]);

  it('returns own time when no override', () => {
    expect(resolveReturTime(null, '8:00 - 12:00', routeLookup)).toBe('8:00');
    expect(resolveReturTime({ retur_route_id: null }, '8:00 - 12:00', routeLookup)).toBe('8:00');
  });

  it('returns retur route time when override set', () => {
    expect(resolveReturTime({ retur_route_id: 20 }, '8:00', routeLookup)).toBe('10:40');
    expect(resolveReturTime({ retur_route_id: 30 }, '8:00', routeLookup)).toBe('15:55');
  });

  it('falls back to own time if retur route not found', () => {
    expect(resolveReturTime({ retur_route_id: 999 }, '8:00', routeLookup)).toBe('8:00');
  });
});

/* ── buildTurAssignmentMap ── */

describe('buildTurAssignmentMap', () => {
  it('maps crm_route_id to driver', () => {
    const assignments: RawAssignment[] = [
      { crm_route_id: 10, driver_id: 'driverA', vehicle_id: 'v1' },
      { crm_route_id: 20, driver_id: 'driverB', vehicle_id: 'v2' },
    ];

    const map = buildTurAssignmentMap(assignments);

    expect(map.get(10)).toEqual({ driver_id: 'driverA', vehicle_id: 'v1' });
    expect(map.get(20)).toEqual({ driver_id: 'driverB', vehicle_id: 'v2' });
  });

  it('ignores retur_route_id (tur is always own route)', () => {
    const assignments: RawAssignment[] = [
      { crm_route_id: 10, driver_id: 'driverA', vehicle_id: 'v1', retur_route_id: 20 },
    ];

    const map = buildTurAssignmentMap(assignments);
    expect(map.get(10)?.driver_id).toBe('driverA');
    expect(map.has(20)).toBe(false);
  });
});

/* ── buildReturAssignmentMap ── */

describe('buildReturAssignmentMap', () => {
  it('default: driver does own retur when no override', () => {
    const assignments: RawAssignment[] = [
      { crm_route_id: 10, driver_id: 'driverA', vehicle_id: 'v1' },
    ];

    const map = buildReturAssignmentMap(assignments);
    expect(map.get(10)?.driver_id).toBe('driverA');
  });

  it('uses vehicle_id_retur for retur when available', () => {
    const assignments: RawAssignment[] = [
      { crm_route_id: 10, driver_id: 'driverA', vehicle_id: 'v1', vehicle_id_retur: 'v2' },
    ];

    const map = buildReturAssignmentMap(assignments);
    expect(map.get(10)?.vehicle_id).toBe('v2');
  });

  it('override IN: retur_route_id assigns driver to another route retur', () => {
    const assignments: RawAssignment[] = [
      { crm_route_id: 10, driver_id: 'driverA', vehicle_id: 'v1', retur_route_id: 20 },
      { crm_route_id: 20, driver_id: 'driverB', vehicle_id: 'v2' },
    ];

    const map = buildReturAssignmentMap(assignments);

    // driverA does route 20's retur (override IN)
    expect(map.get(20)?.driver_id).toBe('driverA');
  });

  it('override OUT: driver with retur_route_id does NOT do own retur', () => {
    const assignments: RawAssignment[] = [
      { crm_route_id: 10, driver_id: 'driverA', vehicle_id: 'v1', retur_route_id: 20 },
      { crm_route_id: 20, driver_id: 'driverB', vehicle_id: 'v2' },
    ];

    const map = buildReturAssignmentMap(assignments);

    // Route 10's retur is NOT driverA (he went to route 20)
    // And driverB does his own retur on route 20? No — driverA overrode it.
    // Route 10 has no retur driver from assignments alone.
    expect(map.has(10)).toBe(false);
  });

  /**
   * THE PALAMARI REGRESSION TEST
   *
   * Scenario: Palamari is assigned to route X (time_nord=5:45).
   * His retur_route_id = Y (time_chisinau=10:40).
   *
   * TUR (Briceni→Chișinău): Palamari should be on route X.
   * RETUR (Chișinău→Briceni): Palamari should be on route Y (not X).
   *
   * The old bug: searchTrips used returAssignMap for TUR direction,
   * which placed Palamari on route Y's TUR time (3:50) instead of
   * his own route X TUR time (5:45).
   */
  it('Palamari scenario: tur/retur maps must not be confused', () => {
    const ROUTE_X = 10; // time_nord=5:45 (Palamari's tur route)
    const ROUTE_Y = 20; // time_chisinau=10:40 (Palamari's retur route)

    const assignments: RawAssignment[] = [
      { crm_route_id: ROUTE_X, driver_id: 'palamari', vehicle_id: 'v1', retur_route_id: ROUTE_Y },
      { crm_route_id: ROUTE_Y, driver_id: 'other', vehicle_id: 'v2' },
    ];

    const turMap = buildTurAssignmentMap(assignments);
    const returMap = buildReturAssignmentMap(assignments);

    // TUR direction: Palamari on his own route X
    expect(turMap.get(ROUTE_X)?.driver_id).toBe('palamari');

    // TUR direction: route Y has its own driver
    expect(turMap.get(ROUTE_Y)?.driver_id).toBe('other');

    // RETUR direction: Palamari on route Y (override IN)
    expect(returMap.get(ROUTE_Y)?.driver_id).toBe('palamari');

    // RETUR direction: route X has NO driver (Palamari overrode OUT)
    expect(returMap.has(ROUTE_X)).toBe(false);

    // Critical: turMap must NOT have Palamari on route Y
    expect(turMap.get(ROUTE_Y)?.driver_id).not.toBe('palamari');

    // Critical: returMap must NOT have Palamari on route X
    expect(returMap.get(ROUTE_X)?.driver_id).not.toBe('palamari');
  });
});
