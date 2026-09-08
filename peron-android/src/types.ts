/**
 * Formele răspunsurilor API-ului din bot (apps/bot/src/api/*), copiate manual —
 * aplicația nu importă din packages/db. Sursa: day.ts (S02), reportRules.ts (S03),
 * cleaning.ts / driverPhoto.ts (S04), presence.ts (S05).
 */
export type PointEnum = 'CHISINAU' | 'BALTI';
export type TripState = 'done' | 'next' | 'locked';
export type CleaningSlot = 'DIMINEATA' | 'ZIUA';
export type CleaningZone = 'PERON' | 'PIETONI' | 'VECEU';
export type CleaningVerdict = 'CURAT' | 'MURDAR' | 'ALT_LOC' | 'EROARE';

export interface AppUserInfo {
  id: string;
  name: string | null;
  point: PointEnum;
}

/** POST /app/v1/auth/link { code, deviceLabel } */
export interface LinkResponse {
  token: string;
  user: AppUserInfo;
}

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

export interface PresenceWindow {
  from: string; // HH:MM, ora locală
  to: string; // HH:MM
}

export interface Station {
  lat: number;
  lon: number;
  radiusM: number;
}

/** GET /app/v1/day */
export interface DayResponse {
  date: string; // YYYY-MM-DD
  point: PointEnum;
  user: AppUserInfo;
  trips: DayTrip[];
  assignments: Record<string, DayAssignment>; // per trip_id
  drivers: Array<{ id: string; name: string }>;
  vehicles: Array<{ id: string; plate: string }>;
  openReclama: Record<string, { taskId: string; description: string; lastComment: string | null }>; // per placă
  climate: Record<string, 'ac' | 'heat' | null>; // per vehicle_id
  cleaning: { DIMINEATA: CleaningZone[]; ZIUA: CleaningZone[] };
  cleaningGateTripTime: string | null;
  locationExemptTimes: string[];
  station: Station;
  allowFull: boolean;
  presenceWindow: PresenceWindow | null;
}

export type ReportStatus = 'OK' | 'ABSENT' | 'FULL';
export type ReclamaProblem = 'bus' | 'panou_ruta' | 'ambele';
export type ClimateStatus = 'works' | 'broken' | 'none';

/** POST /app/v1/report — corpul exact din apps/bot/src/api/reportRules.ts */
export interface ReportBody {
  tripId: string;
  status: ReportStatus;
  passengersCount: number | null;
  driverId: string | null;
  vehicleId: string | null;
  assignmentChanged: boolean;
  loadingHelpOk: boolean | null;
  autoCurat: boolean | null;
  driverCheckId: string | null;
  uniformOk: boolean | null;
  exteriorOk: boolean | null;
  reclamaOk: boolean | null;
  reclamaProblem: ReclamaProblem | null;
  reclamaRepairConfirmed: boolean;
  reclamaTaskId: string | null;
  acStatus: ClimateStatus | null;
  heatStatus: ClimateStatus | null;
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
}

export interface ReportResponse {
  summary: string;
  allDone: boolean;
}

/** POST /app/v1/vehicle { plate } */
export interface VehicleResponse {
  id: string;
  plate_number: string;
  existed: boolean;
}

/** POST /app/v1/cleaning-photo */
export interface CleaningPhotoBody {
  slot: CleaningSlot;
  zone: CleaningZone;
  imageBase64: string;
  lat: number | null;
  lon: number | null;
}

export interface CleaningPhotoResponse {
  verdict: CleaningVerdict;
  problems: string[];
  description: string;
  zonesDone: CleaningZone[];
}

/** POST /app/v1/driver-photo */
export interface DriverPhotoBody {
  tripId: string;
  driverId: string | null;
  imageBase64: string;
  lat: number | null;
  lon: number | null;
}

export interface DriverPhotoResponse {
  verdict: 'OK' | 'EROARE' | 'NO_PERSON';
  code?: 'NO_PERSON';
  driverCheckId: string | null;
  personVisible: boolean | null;
  uniformOk: boolean | null;
  groomedOk: boolean | null;
  description: string;
}

/** POST /app/v1/presence { pings } — maximum 200 per cerere */
export interface PresencePing {
  at: string; // ISO
  lat: number;
  lon: number;
  accuracyM: number | null;
}

export interface PresenceResponse {
  accepted: number;
}

/** Detaliile lui 409 CLEANING_REQUIRED. */
export interface CleaningRequiredDetails {
  slot: CleaningSlot;
  missing: CleaningZone[];
}
