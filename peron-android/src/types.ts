/**
 * Formele răspunsurilor API-ului din bot (apps/bot/src/api/*), copiate manual —
 * aplicația nu importă din packages/db. Sursa: day.ts (S02), reportRules.ts (S03),
 * cleaning.ts / driverPhoto.ts (S04), presence.ts (S05).
 */
export type PointEnum = 'CHISINAU' | 'BALTI';
/** `skipped` = operatorul n-a fost la cursă (POST /skip): închisă pentru ordine, dar fără raport. */
export type TripState = 'done' | 'skipped' | 'next' | 'locked';
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

/**
 * Prima poză acceptată AZI a unui șofer (spec peron-app-criteria-v2: «o dată pe zi per
 * șofer»). `driver_appearance_checks` ține doar `groomed_ok = bărbierit && aspect`, deci
 * nu există `shavedOk` separat. `at` = HH:MM, ora Chișinăului.
 */
export interface DayDriverCheck {
  id: string;
  uniformOk: boolean;
  groomedOk: boolean;
  at: string; // HH:MM
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
  driverChecks: Record<string, DayDriverCheck>; // per driver_id; {} la Bălți sau când nimeni nu are poză azi
  cleaningGateTripTime: string | null;
  locationExemptTimes: string[];
  station: Station;
  allowFull: boolean;
  /** null când punctul n-are curse azi sau e zi fără operator — aplicația nu urmărește. */
  presenceWindow: PresenceWindow | null;
  /** Zi fără operator la punct (config.noOperatorWeekdays din bot — vineri la Chișinău). */
  dayOff: boolean;
  /** «Vineri: zi fără operator la Chișinău» — se afișează ca atare; null în zilele de lucru. */
  dayOffText: string | null;
}

/**
 * POST /app/v1/skip { tripId } — «N-am fost la cursă» pe cursa `next` (apps/bot/src/api/skip.ts).
 * `next` = id-ul cursei care devine următoarea, sau null când nu mai e niciuna.
 * Refuzuri: 400 UNKNOWN_TRIP; 409 DAY_OFF / ALREADY_REPORTED / ALREADY_SKIPPED / NOT_NEXT.
 */
export interface SkipResponse {
  next: string | null;
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

/** Poza trebuie refăcută: nimeni în cadru, sau cadrul nu e cel cerut (din față, întreg, încălțăminte → cap). */
export type DriverPhotoRetakeCode = 'NO_PERSON' | 'REFA_POZA';

/**
 * Răspunsul lui apps/bot/src/api/driverPhoto.ts. Verdictul modelului e final — aplicația
 * doar îl afișează. La `NO_PERSON` / `REFA_POZA`: 200 cu `code` + `message` gata de afișat,
 * `driverCheckId` null, fără rând în DB. La `EROARE` (modelul n-a răspuns): rândul există,
 * toate verdictele sunt null și raportul pleacă fără ele.
 */
export interface DriverPhotoResponse {
  verdict: 'OK' | 'EROARE' | DriverPhotoRetakeCode;
  /** Prezent doar când poza trebuie refăcută; `message` spune de ce. */
  code?: DriverPhotoRetakeCode;
  message?: string;
  driverCheckId: string | null;
  personVisible: boolean | null;
  frameOk: boolean | null;
  /** uniforma (îmbrăcăminte de serviciu + încălțăminte corespunzătoare) */
  uniformOk: boolean | null;
  /** bărbierit sau barbă îngrijită */
  shavedOk: boolean | null;
  /** aspect îngrijit (păr, haine curate) — brut; în `reports.exterior_ok` intră bărbierit && aspect */
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
