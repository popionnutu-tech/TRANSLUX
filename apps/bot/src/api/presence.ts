/**
 * Prezența GPS pe toată tura (spec peron-app-android, S05).
 *
 * Aplicația trimite poziția la 2 minute în fereastra turei (prima cursă − 30 min …
 * ultima cursă + 30 min, din `trips`); serverul decide «în zonă» față de stația
 * punctului (raza 150 m) și scrie ping-urile în `peron_presence_pings`. Nimic nu
 * pleacă spre admini în timpul zilei — perioadele de lipsă din zonă (≥ 5 min în
 * afara razei) și fără semnal (≥ 10 min fără ping) se calculează seara, în digest.
 *
 * Partea pură (fereastra, perioadele, linia din digest, parsarea corpului) e aici
 * și e testată în presence.test.ts; DB-ul e atins doar de `postPresence`.
 */
import type { PeronPresencePing, PointEnum, Trip } from '@translux/db';
import { config } from '../config.js';
import { getPresencePings, insertPresencePings, type PresencePingInsert } from '../services/db.js';
import { getAllTripsForDirection, getDirectionForPoint } from '../services/db.js';
import { formatTime, getTodayDate, haversineDistance } from '../utils.js';
import type { AppUser } from './auth.js';
import { badRequest } from './errors.js';
import { asObject } from './server.js';

export const PRESENCE_WINDOW_PAD_MINUTES = 30;
export const ABSENCE_MIN_MINUTES = 5;
export const NO_SIGNAL_MIN_MINUTES = 10;
export const LATE_START_MINUTES = 15;
export const MAX_PINGS_PER_REQUEST = 200;

const MINUTE_MS = 60 * 1000;

// ── Fereastra turei ────────────────────────────────────────────────────────────

export interface PresenceWindow {
  from: string; // HH:MM, ora locală
  to: string; // HH:MM
}

/** Prima cursă − 30 min, ultima + 30 min, din cursele active ale punctului. null fără curse. */
export function presenceWindow(trips: Array<Pick<Trip, 'departure_time'>>, padMinutes = PRESENCE_WINDOW_PAD_MINUTES): PresenceWindow | null {
  const minutes = trips.map((t) => hhmmToMinutes(formatTime(t.departure_time))).filter((m) => Number.isFinite(m));
  if (minutes.length === 0) return null;
  const first = Math.max(0, Math.min(...minutes) - padMinutes);
  const last = Math.min(24 * 60 - 1, Math.max(...minutes) + padMinutes);
  return { from: minutesToHHMM(first), to: minutesToHHMM(last) };
}

export interface PresenceBounds {
  fromMs: number;
  toMs: number;
}

/** Fereastra unei zile calendaristice (ora locală a punctului) → momente absolute. */
export function windowBounds(date: string, window: PresenceWindow, tz = config.timezone): PresenceBounds {
  return { fromMs: localToUtcMs(date, window.from, tz), toMs: localToUtcMs(date, window.to, tz) };
}

// ── Ora locală ↔ UTC (fără biblioteci; Intl e în Node) ─────────────────────────

function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const { type, value } of dtf.formatToParts(new Date(utcMs))) p[type] = value;
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** 'YYYY-MM-DD' + 'HH:MM' în fusul `tz` → milisecunde UTC. */
export function localToUtcMs(date: string, hhmm: string, tz = config.timezone): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let utc = guess - tzOffsetMs(guess, tz);
  const off = tzOffsetMs(utc, tz);
  if (utc + off !== guess) utc = guess - off;
  return utc;
}

/** Milisecunde UTC → 'HH:MM' în fusul `tz`. */
export function formatHHMM(ms: number, tz = config.timezone): string {
  return new Date(ms).toLocaleTimeString('sv-SE', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHHMM(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Perioadele de lipsă / fără semnal ──────────────────────────────────────────

export interface PresencePingLike {
  at: string | number; // ISO sau ms
  in_zone: boolean;
}

export interface PresencePeriod {
  kind: 'LIPSA' | 'FARA_SEMNAL';
  from: string; // HH:MM
  to: string; // HH:MM
  minutes: number;
  fromMs: number;
  toMs: number;
}

function toMs(at: string | number): number {
  return typeof at === 'number' ? at : Date.parse(at);
}

/**
 * LIPSA = ping-uri consecutive în afara razei, de la primul la ultimul, ≥ 5 min;
 * FARA_SEMNAL = pauză ≥ 10 min între ping-uri, de la începutul ferestrei până la
 * primul ping sau de la ultimul până la `now` / sfârșitul ferestrei. O pauză fără
 * semnal rupe seria de lipsă (perioada aceea e deja raportată ca fără semnal).
 * Sub praguri nu se raportează nimic — GPS-ul sare.
 */
export function presencePeriods(
  pings: PresencePingLike[],
  bounds: PresenceBounds,
  now: Date | number = Date.now(),
  tz = config.timezone,
): PresencePeriod[] {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const end = Math.min(nowMs, bounds.toMs);
  if (end <= bounds.fromMs) return [];

  const pts = pings
    .map((p) => ({ ms: toMs(p.at), inZone: p.in_zone }))
    .filter((p) => Number.isFinite(p.ms) && p.ms >= bounds.fromMs && p.ms <= bounds.toMs)
    .sort((a, b) => a.ms - b.ms);

  const out: PresencePeriod[] = [];
  const period = (kind: PresencePeriod['kind'], fromMs: number, toMs: number): PresencePeriod => ({
    kind,
    from: formatHHMM(fromMs, tz),
    to: formatHHMM(toMs, tz),
    minutes: Math.round((toMs - fromMs) / MINUTE_MS),
    fromMs,
    toMs,
  });

  // Fără semnal
  let prev = bounds.fromMs;
  for (const p of pts) {
    if (p.ms - prev >= NO_SIGNAL_MIN_MINUTES * MINUTE_MS) out.push(period('FARA_SEMNAL', prev, p.ms));
    prev = p.ms;
  }
  if (end - prev >= NO_SIGNAL_MIN_MINUTES * MINUTE_MS) out.push(period('FARA_SEMNAL', prev, end));

  // Lipsă din zonă
  let runStart = -1;
  let runEnd = -1;
  const flush = () => {
    if (runStart >= 0 && runEnd - runStart >= ABSENCE_MIN_MINUTES * MINUTE_MS) out.push(period('LIPSA', runStart, runEnd));
    runStart = -1;
    runEnd = -1;
  };
  let prevMs: number | null = null;
  for (const p of pts) {
    if (prevMs !== null && p.ms - prevMs >= NO_SIGNAL_MIN_MINUTES * MINUTE_MS) flush();
    if (p.inZone) flush();
    else {
      if (runStart < 0) runStart = p.ms;
      runEnd = p.ms;
    }
    prevMs = p.ms;
  }
  flush();

  return out.sort((a, b) => a.fromMs - b.fromMs || a.toMs - b.toMs);
}

/** 'HH:MM' al primului ping dacă e la peste 15 min după începutul ferestrei; altfel null. */
export function lateStart(pings: PresencePingLike[], bounds: PresenceBounds, tz = config.timezone): string | null {
  const first = pings
    .map((p) => toMs(p.at))
    .filter((ms) => Number.isFinite(ms) && ms >= bounds.fromMs && ms <= bounds.toMs)
    .sort((a, b) => a - b)[0];
  if (first === undefined) return null;
  return first - bounds.fromMs > LATE_START_MINUTES * MINUTE_MS ? formatHHMM(first, tz) : null;
}

// ── Linia din digest ───────────────────────────────────────────────────────────

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`;
}

const PERIOD_LABEL: Record<PresencePeriod['kind'], string> = { LIPSA: 'lipsă', FARA_SEMNAL: 'fără semnal' };

/**
 * «Vitalie (Chișinău): lipsă 12:40–13:05 (25 min) · fără semnal 17:10–17:30 (20 min)»,
 * «Andrei (Bălți): toată tura în zonă», plus «urmărire pornită abia la HH:MM».
 */
export function formatPresenceLine(operator: string, pointLabel: string, periods: PresencePeriod[], lateStartAt: string | null): string {
  const parts = periods.map((p) => `${PERIOD_LABEL[p.kind]} ${p.from}–${p.to} (${formatMinutes(p.minutes)})`);
  if (lateStartAt) parts.push(`urmărire pornită abia la ${lateStartAt}`);
  return `${operator} (${pointLabel}): ${parts.length ? parts.join(' · ') : 'toată tura în zonă'}`;
}

// ── POST /app/v1/presence ──────────────────────────────────────────────────────

export interface PresencePingBody {
  atMs: number;
  at: string; // ISO normalizat
  lat: number;
  lon: number;
  accuracyM: number | null;
}

export function parsePresenceBody(rawBody: unknown): PresencePingBody[] {
  const b = asObject(rawBody);
  if (!Array.isArray(b.pings)) throw badRequest('pings trebuie să fie o listă');
  if (b.pings.length > MAX_PINGS_PER_REQUEST) {
    throw badRequest(`Maximum ${MAX_PINGS_PER_REQUEST} ping-uri per cerere`, 'TOO_MANY_PINGS');
  }
  return b.pings.map((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw badRequest(`pings[${i}] trebuie să fie un obiect`);
    const p = raw as Record<string, unknown>;
    const atMs = typeof p.at === 'string' ? Date.parse(p.at) : NaN;
    if (!Number.isFinite(atMs)) throw badRequest(`pings[${i}].at trebuie să fie dată ISO`);
    const lat = p.lat;
    const lon = p.lon;
    if (typeof lat !== 'number' || !Number.isFinite(lat) || typeof lon !== 'number' || !Number.isFinite(lon)) {
      throw badRequest(`pings[${i}].lat/lon trebuie să fie numere`);
    }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw badRequest(`pings[${i}].lat/lon în afara intervalului`);
    let accuracyM: number | null = null;
    if (p.accuracyM !== undefined && p.accuracyM !== null) {
      if (typeof p.accuracyM !== 'number' || !Number.isFinite(p.accuracyM) || p.accuracyM < 0) {
        throw badRequest(`pings[${i}].accuracyM trebuie să fie număr ≥ 0`);
      }
      accuracyM = Math.round(p.accuracyM);
    }
    return { atMs, at: new Date(atMs).toISOString(), lat, lon, accuracyM };
  });
}

export function isInZone(lat: number, lon: number, station: { lat: number; lon: number; radiusM: number }): boolean {
  return haversineDistance(lat, lon, station.lat, station.lon) <= station.radiusM;
}

/**
 * Din lot păstrează doar ping-urile din fereastră, fără duplicate (același `at`,
 * în lot sau deja în DB), și le pregătește pentru insert cu `in_zone` calculat.
 */
export function selectNewPings(
  pings: PresencePingBody[],
  bounds: PresenceBounds,
  existingAtMs: Iterable<number>,
  userId: string,
  point: PointEnum,
): PresencePingInsert[] {
  const seen = new Set<number>(existingAtMs);
  const station = config.stations[point];
  const rows: PresencePingInsert[] = [];
  for (const p of pings) {
    if (p.atMs < bounds.fromMs || p.atMs > bounds.toMs) continue;
    if (seen.has(p.atMs)) continue;
    seen.add(p.atMs);
    rows.push({
      user_id: userId,
      point,
      at: p.at,
      lat: p.lat,
      lon: p.lon,
      accuracy_m: p.accuracyM,
      in_zone: isInZone(p.lat, p.lon, station),
    });
  }
  return rows;
}

export interface PresenceResponse {
  accepted: number;
}

export async function postPresence(user: AppUser, rawBody: unknown): Promise<PresenceResponse> {
  const pings = parsePresenceBody(rawBody);
  if (pings.length === 0) return { accepted: 0 };

  const trips = await getAllTripsForDirection(getDirectionForPoint(user.point));
  const window = presenceWindow(trips);
  if (!window) return { accepted: 0 };

  const bounds = windowBounds(getTodayDate(), window);
  const existing: PeronPresencePing[] = await getPresencePings(
    user.id,
    new Date(bounds.fromMs).toISOString(),
    new Date(bounds.toMs).toISOString(),
  );
  const rows = selectNewPings(pings, bounds, existing.map((e) => Date.parse(e.at)), user.id, user.point);
  if (rows.length > 0) await insertPresencePings(rows);
  return { accepted: rows.length };
}
