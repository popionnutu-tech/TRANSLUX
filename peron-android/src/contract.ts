/**
 * Contractul cu API-ul botului, verificat de `tsc --noEmit` (spec peron-app-e2e, S03).
 *
 * Fixture-urile din `__fixtures__/` sunt răspunsurile REALE ale API-ului, scrise de
 * testele cap-coadă din bot (`WRITE_FIXTURES=1 npm run test --workspace=apps/bot`,
 * vezi apps/bot/src/test/contractFixtures.ts). Aici se atribuie tipurilor aplicației:
 *
 *  - `Loose<T>`: JSON-ul importat are literalele lărgite (`"CHISINAU"` → `string`),
 *    deci comparăm cu tipul lărgit la fel — o proprietate obligatorie LIPSĂ din
 *    fixture sau cu alt tip (număr vs text, null vs obiect) e eroare de compilare;
 *  - `SameKeys<A, B>`: seturile de chei trebuie să fie identice, la fiecare nivel
 *    (răspuns, cursă, repartizare, fereastră…) — o proprietate ștearsă sau redenumită
 *    în `types.ts`, dar încă trimisă de API (sau invers), e eroare de compilare, iar
 *    mesajul arată cheia în plus / în minus.
 *
 * Fișierul nu e importat de nimic din aplicație — există doar pentru typecheck.
 * Testul de rulare (forma valorilor) e în contract.test.ts.
 */
import dayBalti from './__fixtures__/day.balti.json';
import dayChisinau from './__fixtures__/day.chisinau.json';
import reportOk from './__fixtures__/report.ok.json';
import type { AppUserInfo, DayAssignment, DayResponse, DayTrip, PresenceWindow, ReportResponse, Station } from './types';

/** Tipul cu literalele lărgite, cum le vede TypeScript într-un JSON importat. */
type Loose<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends null
        ? null
        : T extends readonly (infer U)[]
          ? Loose<U>[]
          : T extends object
            ? { [K in keyof T]: Loose<T[K]> }
            : T;

/** `true` când A și B au exact aceleași chei; altfel tipul e cheile care diferă (apar în eroarea tsc). */
type SameKeys<A, B> = [Exclude<keyof A, keyof B> | Exclude<keyof B, keyof A>] extends [never]
  ? true
  : Exclude<keyof A, keyof B> | Exclude<keyof B, keyof A>;

type Values<T> = T[keyof T];

// ── GET /app/v1/day — Chișinău (repartizări, reclamă, climă, curățenie nenule) ──

export const contractDayChisinau: Loose<DayResponse> = dayChisinau;
export const dayChisinauKeys: SameKeys<typeof dayChisinau, DayResponse> = true;
export const dayChisinauUserKeys: SameKeys<typeof dayChisinau.user, AppUserInfo> = true;
export const dayChisinauTripKeys: SameKeys<(typeof dayChisinau.trips)[number], DayTrip> = true;
export const dayChisinauAssignmentKeys: SameKeys<Values<typeof dayChisinau.assignments>, DayAssignment> = true;
export const dayChisinauDriverKeys: SameKeys<(typeof dayChisinau.drivers)[number], DayResponse['drivers'][number]> = true;
export const dayChisinauVehicleKeys: SameKeys<(typeof dayChisinau.vehicles)[number], DayResponse['vehicles'][number]> = true;
export const dayChisinauReclamaKeys: SameKeys<Values<typeof dayChisinau.openReclama>, Values<DayResponse['openReclama']>> = true;
export const dayChisinauCleaningKeys: SameKeys<typeof dayChisinau.cleaning, DayResponse['cleaning']> = true;
export const dayChisinauStationKeys: SameKeys<typeof dayChisinau.station, Station> = true;
export const dayChisinauWindowKeys: SameKeys<NonNullable<typeof dayChisinau.presenceWindow>, PresenceWindow> = true;

// ── GET /app/v1/day — Bălți (fluxul scurt: liste goale, allowFull) ──

export const contractDayBalti: Loose<DayResponse> = dayBalti;
export const dayBaltiKeys: SameKeys<typeof dayBalti, DayResponse> = true;
export const dayBaltiTripKeys: SameKeys<(typeof dayBalti.trips)[number], DayTrip> = true;
export const dayBaltiStationKeys: SameKeys<typeof dayBalti.station, Station> = true;
export const dayBaltiWindowKeys: SameKeys<NonNullable<typeof dayBalti.presenceWindow>, PresenceWindow> = true;

// ── POST /app/v1/report — răspunsul unui raport reușit ──

export const contractReportOk: Loose<ReportResponse> = reportOk;
export const reportOkKeys: SameKeys<typeof reportOk, ReportResponse> = true;
