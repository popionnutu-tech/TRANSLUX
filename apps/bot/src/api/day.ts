/**
 * GET /app/v1/day — tot ce îi trebuie aplicației ca să deseneze ziua operatorului:
 * cursele cu starea lor (done / skipped / next / locked), repartizările din grafic, listele de
 * șoferi și auto încă nefolosite azi, sarcinile reclamă deschise per placă, întrebarea
 * de climă per auto, zonele de curățenie închise, poza de azi a fiecărui șofer
 * (`driverChecks` — valabilă la toate cursele lui din zi, Ion 09.09) și configul de
 * locație al punctului.
 *
 * Bălți primește fluxul scurt: doar cursele + stația; listele vin goale, `allowFull`.
 *
 * Zi fără operator la punct (vineri la Chișinău): `dayOff: true` cu textul pentru
 * ecran, `presenceWindow: null` (aplicația nu urmărește GPS-ul); restul rămâne ca să
 * nu se schimbe contractul.
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
  getSkippedTripIds,
  getTodayDriverChecks,
  getUsedDriverIds,
  getUsedVehicleIds,
} from '../services/db.js';
import type { CleaningZone, PointEnum } from '@translux/db';
import type { AppUser } from './auth.js';
import { dayOffText, tripStates, type TripState } from './dayState.js';
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

/** Prima poză acceptată de azi a unui șofer: id-ul pentru POST /report, verdictele modelului, ora (HH:MM Chișinău). */
export interface DayDriverCheck {
  id: string;
  uniformOk: boolean;
  groomedOk: boolean;
  at: string;
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
  /** Per driver_id: poza de azi (o dată pe zi per șofer); lipsă → aplicația cere poza. */
  driverChecks: Record<string, DayDriverCheck>;
  cleaningGateTripTime: string | null;
  locationExemptTimes: string[];
  station: { lat: number; lon: number; radiusM: number };
  allowFull: boolean;
  /** Fereastra turei (prima cursă − 30 min … ultima + 30 min): aplicația urmărește GPS-ul doar în ea; null la zi liberă. */
  presenceWindow: PresenceWindow | null;
  /** Zi fără operator la punct (config.noOperatorWeekdays): fără grilă, fără GPS, rutele de scriere dau 409 DAY_OFF. */
  dayOff: boolean;
  /** «Vineri: zi fără operator la Chișinău» — textul ecranului; null în zilele de lucru. */
  dayOffText: string | null;
}

/** ISO → HH:MM pe ora Chișinăului (ora la care s-a făcut poza). */
function timeHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { timeZone: config.timezone, hour: '2-digit', minute: '2-digit' });
}

export async function getDay(user: AppUser): Promise<DayResponse> {
  const date = getTodayDate();
  const point = user.point;

  const [allTrips, reportedIds, skippedIds] = await Promise.all([
    getAllTripsForDirection(getDirectionForPoint(point)),
    getReportedTripIds(date, point),
    getSkippedTripIds(date, point),
  ]);
  const states = new Map(tripStates(allTrips, reportedIds, skippedIds).map((s) => [s.id, s.state]));
  const trips: DayTrip[] = allTrips.map((t) => ({
    id: t.id,
    departure_time: formatTime(t.departure_time),
    route_name: t.route_name,
    crm_route_id: t.crm_route_id,
    state: states.get(t.id) ?? 'locked',
  }));

  const offText = dayOffText(point, date);
  const base = {
    date,
    point,
    user: { id: user.id, name: user.name, point },
    trips,
    presenceWindow: offText ? null : presenceWindow(allTrips),
    dayOff: offText !== null,
    dayOffText: offText,
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
      driverChecks: {},
      cleaningGateTripTime: null,
      locationExemptTimes: [],
      station: config.stations.BALTI,
      allowFull: true,
    };
  }

  const [assignmentRows, activeDrivers, usedDriverIds, activeVehicles, usedVehicleIds, reclamaTasks, morningDone, dayDone, todayChecks] =
    await Promise.all([
      Promise.all(allTrips.map((t) => getAssignmentForTrip(t.crm_route_id, date))),
      getActiveDrivers(),
      getUsedDriverIds(date, point),
      getActiveVehicles(),
      getUsedVehicleIds(date, point),
      getOpenReclamaTasks(),
      getCleaningZonesDone(date, 'DIMINEATA'),
      getCleaningZonesDone(date, 'ZIUA'),
      getTodayDriverChecks(date),
    ]);

  const assignments: Record<string, DayAssignment> = {};
  allTrips.forEach((t, i) => {
    const a = assignmentRows[i];
    if (a) assignments[t.id] = { driver_id: a.driver_id, driver_name: a.driver_name, vehicle_id: a.vehicle_id, plate: a.plate_number };
  });

  const drivers = activeDrivers.filter((d) => !usedDriverIds.has(d.id)).map((d) => ({ id: d.id, name: d.full_name }));
  const vehicles = activeVehicles.filter((v) => !usedVehicleIds.has(v.id)).map((v) => ({ id: v.id, plate: v.plate_number }));

  // Poza șoferului e pe zi: prima acceptată de azi per șofer (verdict al modelului, persoana vizibilă).
  const driverChecks: DayResponse['driverChecks'] = {};
  for (const [driverId, c] of todayChecks) {
    driverChecks[driverId] = { id: c.id, uniformOk: c.uniform_ok_model, groomedOk: c.groomed_ok_model, at: timeHHMM(c.created_at) };
  }

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
    driverChecks,
    cleaningGateTripTime: config.cleaningGateTripTime,
    locationExemptTimes: [...config.chisinauExemptTimes],
    station: config.stations.CHISINAU,
    allowFull: false,
  };
}
