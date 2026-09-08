/**
 * Urmărirea GPS pe toată tura (spec peron-app-android, S05/S06).
 *
 * În fereastra turei (`presenceWindow` din /day: prima cursă − 30 min … ultima
 * + 30 min) aplicația trimite poziția la 2 minute, din fundal, printr-un serviciu
 * în prim-plan Android cu notificare permanentă. În afara ferestrei nu urmărește
 * nimic. Ping-urile neexpediate stau în AsyncStorage și pleacă în lot (≤ 200) la
 * următoarea ocazie — singura coadă offline din aplicație; la 401 sau fără rețea
 * rămân în coadă, cel mult o zi.
 *
 * `TaskManager.defineTask` trebuie să ruleze la nivel de modul, deci `app/_layout.tsx`
 * importă fișierul ăsta necondiționat.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { MAX_PINGS_PER_REQUEST, isApiError, postPresence } from './api';
import { haversineDistance, localDate, localHHMM } from './format';
import type { PresencePing, PresenceWindow, Station } from './types';

export const PRESENCE_TASK = 'presence';
export const PING_INTERVAL_MS = 2 * 60 * 1000;
export const QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const QUEUE_MAX_LENGTH = 1500; // > o zi de ping-uri la 2 min

const KEY_QUEUE = 'peron_presence_queue';
const KEY_WINDOW = 'peron_presence_window';
const KEY_LAST = 'peron_presence_last';

/** Fereastra zilei, așa cum a dat-o /day; `date` spune pentru ce zi e valabilă. */
export interface StoredWindow {
  date: string; // YYYY-MM-DD
  window: PresenceWindow | null;
  station: Station | null;
}

export interface LastReading {
  at: string; // ISO
  lat: number;
  lon: number;
  accuracyM: number | null;
  inZone: boolean | null; // null = fără stație cunoscută
}

export type PermissionState = 'granted' | 'foreground-only' | 'denied';

// ── Funcții pure ──────────────────────────────────────────────────────────────

/** `hhmm` e în [from, to] (inclusiv)? Comparare lexicografică — HH:MM e cu zero în față. */
export function isWithinWindow(hhmm: string, window: PresenceWindow | null): boolean {
  if (!window) return false;
  return hhmm >= window.from && hhmm <= window.to;
}

/** Trebuie urmărit acum? Doar în ziua ferestrei stocate și în interiorul ei. */
export function shouldTrack(now: Date, stored: StoredWindow | null): boolean {
  if (!stored || !stored.window) return false;
  if (stored.date !== localDate(now)) return false;
  return isWithinWindow(localHHMM(now), stored.window);
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

export function toPing(loc: Location.LocationObject): PresencePing {
  return {
    at: new Date(loc.timestamp).toISOString(),
    lat: loc.coords.latitude,
    lon: loc.coords.longitude,
    accuracyM: loc.coords.accuracy == null ? null : Math.max(0, Math.round(loc.coords.accuracy)),
  };
}

export function inZone(ping: Pick<PresencePing, 'lat' | 'lon'>, station: Station | null): boolean | null {
  if (!station) return null;
  return haversineDistance(ping.lat, ping.lon, station.lat, station.lon) <= station.radiusM;
}

// ── Stocare ───────────────────────────────────────────────────────────────────

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function getStoredWindow(): Promise<StoredWindow | null> {
  return readJson<StoredWindow>(KEY_WINDOW);
}

export async function getLastReading(): Promise<LastReading | null> {
  return readJson<LastReading>(KEY_LAST);
}

export async function getQueueLength(): Promise<number> {
  return ((await readJson<PresencePing[]>(KEY_QUEUE)) ?? []).length;
}

async function enqueue(pings: PresencePing[]): Promise<void> {
  const queue = (await readJson<PresencePing[]>(KEY_QUEUE)) ?? [];
  await writeJson(KEY_QUEUE, pruneQueue([...queue, ...pings], new Date()));
}

let flushing = false;

/**
 * Trimite coada în loturi de ≤ 200. La OFFLINE / 401 / 5xx lotul rămâne în coadă;
 * la 400 (lot respins de server) lotul se aruncă, altfel ar bloca coada pentru totdeauna.
 */
export async function flushPresenceQueue(): Promise<{ sent: number; left: number }> {
  if (flushing) return { sent: 0, left: await getQueueLength() };
  flushing = true;
  let sent = 0;
  try {
    for (;;) {
      const queue = pruneQueue((await readJson<PresencePing[]>(KEY_QUEUE)) ?? [], new Date());
      if (queue.length === 0) {
        await writeJson(KEY_QUEUE, []);
        return { sent, left: 0 };
      }
      const batch = queue.slice(0, MAX_PINGS_PER_REQUEST);
      const rest = queue.slice(batch.length);
      try {
        await postPresence(batch);
        sent += batch.length;
      } catch (e) {
        if (isApiError(e) && e.status === 400) {
          await writeJson(KEY_QUEUE, rest);
          continue;
        }
        await writeJson(KEY_QUEUE, queue);
        return { sent, left: queue.length };
      }
      await writeJson(KEY_QUEUE, rest);
    }
  } finally {
    flushing = false;
  }
}

// ── Permisiuni ────────────────────────────────────────────────────────────────

export async function getPermissionState(): Promise<PermissionState> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  const bg = await Location.getBackgroundPermissionsAsync();
  return bg.status === 'granted' ? 'granted' : 'foreground-only';
}

/** La login: întâi permisiunea în prim-plan, apoi «Permite tot timpul». */
export async function requestPresencePermissions(): Promise<PermissionState> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted' ? 'granted' : 'foreground-only';
}

// ── Pornire / oprire ──────────────────────────────────────────────────────────

export async function isTracking(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(PRESENCE_TASK);
  } catch {
    return false;
  }
}

async function startTracking(): Promise<void> {
  if (await isTracking()) return;
  await Location.startLocationUpdatesAsync(PRESENCE_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: PING_INTERVAL_MS,
    distanceInterval: 0,
    deferredUpdatesInterval: PING_INTERVAL_MS,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'TRANSLUX Peron',
      notificationBody: 'Urmărește locația în timpul turei',
      notificationColor: '#1d4ed8',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopTracking(): Promise<void> {
  if (await isTracking()) await Location.stopLocationUpdatesAsync(PRESENCE_TASK);
}

/**
 * Aliniază urmărirea cu fereastra: pornește dacă suntem în ea și avem permisiunea
 * de fundal, oprește altfel. Se cheamă la fiecare deschidere a ecranului zilei
 * (cu fereastra proaspătă din /day) și la fiecare ping (cu cea stocată).
 */
export async function syncPresenceTracking(fresh?: { date: string; window: PresenceWindow | null; station: Station | null }): Promise<boolean> {
  if (fresh) await writeJson(KEY_WINDOW, fresh satisfies StoredWindow);
  const stored = fresh ?? (await getStoredWindow());
  const wanted = shouldTrack(new Date(), stored);
  if (!wanted) {
    await stopTracking();
    return false;
  }
  if ((await getPermissionState()) !== 'granted') {
    await stopTracking();
    return false;
  }
  try {
    await startTracking();
    return true;
  } catch (e) {
    console.warn('[presence] nu pot porni urmărirea:', e);
    return false;
  }
}

// ── Task-ul de fundal ─────────────────────────────────────────────────────────

interface LocationTaskData {
  locations: Location.LocationObject[];
}

TaskManager.defineTask<LocationTaskData>(PRESENCE_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[presence] task error:', error.message);
    return;
  }
  const locations = data?.locations ?? [];
  if (locations.length === 0) return;

  const stored = await getStoredWindow();
  const pings = locations.map(toPing);
  const last = pings[pings.length - 1];
  if (last) {
    await writeJson(KEY_LAST, { ...last, inZone: inZone(last, stored?.station ?? null) } satisfies LastReading);
  }
  await enqueue(pings);
  try {
    await flushPresenceQueue();
  } catch (e) {
    console.warn('[presence] flush a picat:', e);
  }
  // Fereastra s-a închis între timp → oprim serviciul (verificare la fiecare ping).
  if (!shouldTrack(new Date(), stored)) await stopTracking();
});
