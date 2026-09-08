/**
 * Regulile pure ale urmăririi GPS (spec peron-app-tracking-always, S01): fără Expo,
 * fără React, fără AsyncStorage — doar decizii pe date, ca să poată fi testate cu
 * `node:test`. Efectele (serviciul de locație, stocarea, rețeaua) stau în
 * presence.ts și backgroundRearm.ts.
 */
import type { DayResponse, PointEnum, PresencePing, PresenceWindow, Station } from './types';

export const QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const QUEUE_MAX_LENGTH = 1500; // > o zi de ping-uri la 2 min

/** Planul zilei — `presence:plan` în AsyncStorage, scris la fiecare /day. */
export interface PresencePlan {
  date: string; // YYYY-MM-DD, ziua pentru care e valabil
  window: PresenceWindow | null;
  station: Station | null;
  point: PointEnum | null;
}

export type PresenceAction = 'start' | 'stop' | 'keep';

/** Ce știm în momentul deciziei. */
export interface PresenceState {
  /** Ora curentă e în fereastra turei din planul zilei. */
  inWindow: boolean;
  /** Serviciul de locație e pornit (`hasStartedLocationUpdatesAsync`). */
  tracking: boolean;
  /** Avem «Permite tot timpul». */
  permitted: boolean;
}

const HHMM_RE = /^\d{2}:\d{2}$/;

/**
 * Trebuie urmărit la ora `nowHHMM`? Doar cu o fereastră validă și în interiorul ei
 * (inclusiv la capete). Comparare lexicografică — HH:MM e cu zero în față.
 */
export function shouldTrack(nowHHMM: string, window: PresenceWindow | null | undefined): boolean {
  if (!window || !HHMM_RE.test(window.from) || !HHMM_RE.test(window.to) || !HHMM_RE.test(nowHHMM)) return false;
  return nowHHMM >= window.from && nowHHMM <= window.to;
}

/** Planul de salvat din răspunsul /day. */
export function planFromDay(day: Pick<DayResponse, 'date' | 'presenceWindow' | 'station' | 'point'>): PresencePlan {
  return { date: day.date, window: day.presenceWindow ?? null, station: day.station ?? null, point: day.point ?? null };
}

/**
 * Planul citit din AsyncStorage, dacă e întreg și e pentru ziua `today`; altfel null
 * (task-ul de fundal cere atunci /day). `point` poate lipsi — planurile vechi nu-l aveau.
 */
export function planFromStorage(raw: unknown, today: string): PresencePlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.date !== today) return null;
  const window = parseWindow(o.window);
  if (window === undefined) return null;
  const station = parseStation(o.station);
  if (station === undefined) return null;
  const point = o.point === 'CHISINAU' || o.point === 'BALTI' ? o.point : null;
  return { date: today, window, station, point };
}

/** `undefined` = formă greșită; `null` = lipsește legitim (zi fără curse). */
function parseWindow(v: unknown): PresenceWindow | null | undefined {
  if (v == null) return null;
  if (typeof v !== 'object') return undefined;
  const { from, to } = v as Record<string, unknown>;
  if (typeof from !== 'string' || typeof to !== 'string' || !HHMM_RE.test(from) || !HHMM_RE.test(to)) return undefined;
  return { from, to };
}

function parseStation(v: unknown): Station | null | undefined {
  if (v == null) return null;
  if (typeof v !== 'object') return undefined;
  const { lat, lon, radiusM } = v as Record<string, unknown>;
  if (typeof lat !== 'number' || typeof lon !== 'number' || typeof radiusM !== 'number') return undefined;
  return { lat, lon, radiusM };
}

/**
 * Singura decizie de pornire/oprire din aplicație. În fereastră: pornește dacă nu e
 * pornit și avem permisiunea (fără permisiune nu putem face nimic — `keep`). În afara
 * ferestrei: oprește dacă e pornit. Altfel nu se atinge nimic — serviciul rămâne cum
 * e, indiferent dacă aplicația e deschisă, închisă din «recente» sau telefonul a fost
 * repornit între timp.
 */
export function nextAction(state: PresenceState): PresenceAction {
  if (state.inWindow) return state.permitted && !state.tracking ? 'start' : 'keep';
  return state.tracking ? 'stop' : 'keep';
}

/**
 * Din prim-plan (ecranul zilei), când `nextAction` zice `keep` pentru că serviciul e deja
 * «pornit»: trebuie re-chemat `startLocationUpdatesAsync`. expo-location pornește
 * serviciul cu notificare DOAR când aplicația e în prim-plan; după repornirea
 * telefonului task-ul e restaurat cu locații rare și fără notificare, iar din fundal
 * (task-ul de re-armare) pornirea aruncă `ForegroundServiceStartNotAllowedException`.
 * Re-înregistrarea e idempotentă în nativ (aceeași cerere de locație, aceeași notificare).
 */
export function shouldRefreshForeground(state: PresenceState): boolean {
  return state.inWindow && state.tracking && state.permitted;
}

/** Aruncă ping-urile mai vechi de o zi și păstrează cel mult QUEUE_MAX_LENGTH (cele mai noi). */
export function pruneQueue(queue: PresencePing[], now: Date): PresencePing[] {
  const cutoff = now.getTime() - QUEUE_MAX_AGE_MS;
  const fresh = queue.filter((p) => {
    const t = Date.parse(p.at);
    return Number.isFinite(t) && t >= cutoff;
  });
  return fresh.length > QUEUE_MAX_LENGTH ? fresh.slice(fresh.length - QUEUE_MAX_LENGTH) : fresh;
}
