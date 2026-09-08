/**
 * GET /app/v1/day — tot ce îi trebuie aplicației ca să deseneze ziua operatorului:
 * cursele cu starea lor (done / next / locked), repartizările din grafic, listele de
 * șoferi și auto încă nefolosite azi, sarcinile reclamă deschise per placă, întrebarea
 * de climă per auto, zonele de curățenie închise și configul de locație al punctului.
 *
 * Bălți primește fluxul scurt: doar cursele + stația; listele vin goale, `allowFull`.
 * Totul se citește prin services/db.ts, exact ca în conversations/report.ts.
 */
import { config } from '../config.js';
import { formatTime, getTodayDate } from '../utils.js';
import {
  climateKindForDate,
  climateQuestionNeeded,
  getActiveDrivers,
  getActiveVehicles,
  getAllTripsForDirection,
  getAssignmentForTrip,
  getCleaningZonesDone,
  getDirectionForPoint,
  getOpenReclamaTasks,
  getReportedTripIds,
  getUsedDriverIds,
  getUsedVehicleIds,
} from '../services/db.js';
import type { CleaningZone, PointEnum } from '@translux/db';
import type { AppUser } from './auth.js';
import { tripStates, type TripState } from './dayState.js';
import { presenceWindow, type PresenceWindow } from './presence.js';

export interface DayTrip {
  id: string;
  departure_time: string; // HH:MM
  route_name: string;
  crm_route_id: number | null;
  state: TripState;
}

export interface DayAssignment {
  driver_id: string;
  driver_name: string;
  vehicle_id: string | null;
  plate: string | null;
}

export interface DayResponse {
  date: string;
  point: PointEnum;
  user: { id: string; name: string | null; point: PointEnum };
  trips: DayTrip[];
  assignments: Record<string, DayAssignment>; // per trip_id
  drivers: Array<{ id: string; name: string }>;
  vehicles: Array<{ id: string; plate: string }>;
  openReclama: Record<string, { taskId: string; description: string; lastComment: string | null }>; // per placă
  climate: Record<string, 'ac' | 'heat' | null>; // per vehicle_id
  cleaning: { DIMINEATA: CleaningZone[]; ZIUA: CleaningZone[] };
  cleaningGateTripTime: string | null;
  locationExemptTimes: string[];
  station: { lat: number; lon: number; radiusM: number };
  allowFull: boolean;
  /** Fereastra turei (prima cursă − 30 min … ultima + 30 min): aplicația urmărește GPS-ul doar în ea. */
  presenceWindow: PresenceWindow | null;
}

export async function getDay(user: AppUser): Promise<DayResponse> {
  const date = getTodayDate();
  const point = user.point;

  const [allTrips, reportedIds] = await Promise.all([
    getAllTripsForDirection(getDirectionForPoint(point)),
    getReportedTripIds(date, point),
  ]);
  const states = new Map(tripStates(allTrips, reportedIds).map((s) => [s.id, s.state]));
  const trips: DayTrip[] = allTrips.map((t) => ({
    id: t.id,
    departure_time: formatTime(t.departure_time),
    route_name: t.route_name,
    crm_route_id: t.crm_route_id,
    state: states.get(t.id) ?? 'locked',
  }));

  const base = {
    date,
    point,
    user: { id: user.id, name: user.name, point },
    trips,
    presenceWindow: presenceWindow(allTrips),
  };

  if (point === 'BALTI') {
    return {
      ...base,
      assignments: {},
      drivers: [],
      vehicles: [],
      openReclama: {},
      climate: {},
      cleaning: { DIMINEATA: [], ZIUA: [] },
      cleaningGateTripTime: null,
      locationExemptTimes: [],
      station: config.stations.BALTI,
      allowFull: true,
    };
  }

  const [assignmentRows, activeDrivers, usedDriverIds, activeVehicles, usedVehicleIds, reclamaTasks, morningDone, dayDone] =
    await Promise.all([
      Promise.all(allTrips.map((t) => getAssignmentForTrip(t.crm_route_id, date))),
      getActiveDrivers(),
      getUsedDriverIds(date, point),
      getActiveVehicles(),
      getUsedVehicleIds(date, point),
      getOpenReclamaTasks(),
      getCleaningZonesDone(date, 'DIMINEATA'),
      getCleaningZonesDone(date, 'ZIUA'),
    ]);

  const assignments: Record<string, DayAssignment> = {};
  allTrips.forEach((t, i) => {
    const a = assignmentRows[i];
    if (a) assignments[t.id] = { driver_id: a.driver_id, driver_name: a.driver_name, vehicle_id: a.vehicle_id, plate: a.plate_number };
  });

  const drivers = activeDrivers.filter((d) => !usedDriverIds.has(d.id)).map((d) => ({ id: d.id, name: d.full_name }));
  const vehicles = activeVehicles.filter((v) => !usedVehicleIds.has(v.id)).map((v) => ({ id: v.id, plate: v.plate_number }));

  const openReclama: DayResponse['openReclama'] = {};
  for (const t of reclamaTasks) openReclama[t.plate] = { taskId: t.id, description: t.description, lastComment: t.lastReport };

  // Clima: în afara sezonului nu întrebăm DB-ul (climateQuestionNeeded o face oricum,
  // dar aici sărim și bucla). În sezon: o dată pe lună per auto — decizia e în db.ts.
  const climate: Record<string, 'ac' | 'heat' | null> = {};
  const vehicleIds = new Set<string>(activeVehicles.map((v) => v.id));
  for (const a of Object.values(assignments)) if (a.vehicle_id) vehicleIds.add(a.vehicle_id);
  if (climateKindForDate(date)) {
    const ids = Array.from(vehicleIds);
    const kinds = await Promise.all(ids.map((id) => climateQuestionNeeded(id, date)));
    ids.forEach((id, i) => { climate[id] = kinds[i]; });
  } else {
    for (const id of vehicleIds) climate[id] = null;
  }

  return {
    ...base,
    assignments,
    drivers,
    vehicles,
    openReclama,
    climate,
    cleaning: { DIMINEATA: Array.from(morningDone), ZIUA: Array.from(dayDone) },
    cleaningGateTripTime: config.cleaningGateTripTime,
    locationExemptTimes: [...config.chisinauExemptTimes],
    station: config.stations.CHISINAU,
    allowFull: false,
  };
}
