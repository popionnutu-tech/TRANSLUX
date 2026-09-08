/**
 * Urmărirea GPS pe toată tura (spec peron-app-android S05/S06, apoi
 * peron-app-tracking-always S01: merge singură, indiferent dacă aplicația e deschisă).
 *
 * În fereastra turei (`presenceWindow` din /day: prima cursă − 30 min … ultima + 30 min)
 * un serviciu în prim-plan Android cu notificare permanentă trimite poziția la 2 minute.
 * Serviciul se pornește o dată (la login / la prima deschidere în fereastră / din task-ul
 * de re-armare) și NU se oprește la părăsirea ecranului sau la închiderea aplicației din
 * «recente» (`killServiceOnDestroy: false`). Se oprește în exact două situații: ieșirea
 * din fereastră (verificată la fiecare ping, din chiar task-ul de locație) și
 * deconectarea (`session.ts` → logout, sau token șters la 401).
 *
 * Planul zilei `{ date, window, station, point }` stă în AsyncStorage sub `presence:plan`,
 * scris la fiecare /day, ca task-urile din fundal să nu depindă de rețea.
 *
 * Ping-urile neexpediate stau în AsyncStorage și pleacă în lot (≤ 200) la următoarea
 * ocazie — singura coadă offline din aplicație; la 401 sau fără rețea rămân în coadă,
 * cel mult o zi.
 *
 * `TaskManager.defineTask` trebuie să ruleze la nivel de modul, înainte ca Android să
 * livreze locații — fișierul e importat din `index.ts` (entry-ul rădăcină, care rulează
 * și headless) și din `app/_layout.tsx`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { MAX_PINGS_PER_REQUEST, getToken, isApiError, postPresence } from './api';
import { haversineDistance, localDate, localHHMM } from './format';
import { nextAction, planFromDay, planFromStorage, pruneQueue, shouldTrack, type PresenceAction, type PresencePlan } from './presenceRules';
import { colors } from './theme';
import type { DayResponse, PresencePing, Station } from './types';

export const PRESENCE_TASK = 'presence';
export const PING_INTERVAL_MS = 2 * 60 * 1000;

const KEY_PLAN = 'presence:plan';
const KEY_QUEUE = 'peron_presence_queue';
const KEY_LAST = 'peron_presence_last';

export interface LastReading {
  at: string; // ISO
  lat: number;
  lon: number;
  accuracyM: number | null;
  inZone: boolean | null; // null = fără stație cunoscută
}

export type PermissionState = 'granted' | 'foreground-only' | 'denied';

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

/** Planul zilei din /day, salvat pentru task-urile din fundal. */
export async function savePlan(day: DayResponse): Promise<PresencePlan> {
  const plan = planFromDay(day);
  await writeJson(KEY_PLAN, plan);
  return plan;
}

/** Planul stocat, doar dacă e pentru ziua lui `now`; altfel null (e de cerut /day). */
export async function getStoredPlan(now = new Date()): Promise<PresencePlan | null> {
  return planFromStorage(await readJson<unknown>(KEY_PLAN), localDate(now));
}

export async function getLastReading(): Promise<LastReading | null> {
  return readJson<LastReading>(KEY_LAST);
}

export async function getQueueLength(): Promise<number> {
  return ((await readJson<PresencePing[]>(KEY_QUEUE)) ?? []).length;
}

/** La deconectare: planul, coada și ultima citire dispar odată cu token-ul. */
export async function clearPresenceStorage(): Promise<void> {
  await AsyncStorage.multiRemove([KEY_PLAN, KEY_QUEUE, KEY_LAST]);
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

/**
 * Serviciul persistent: notificare permanentă, `killServiceOnDestroy: false` ca să
 * supraviețuiască închiderii aplicației din «recente». Un singur task (`'presence'`),
 * deci ping-urile nu se dublează când aplicația e și deschisă.
 */
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
      notificationColor: colors.primary,
      killServiceOnDestroy: false,
    },
  });
}

/**
 * Singurul loc care oprește serviciul. Se cheamă DOAR din ramura «în afara ferestrei»
 * (`applyPresencePlan` → `stop`, task-ul de locație) și de la deconectare
 * (`session.ts` → logout; token lipsă în task-ul de locație). Niciodată la blur,
 * unmount sau închiderea aplicației.
 */
export async function stopTracking(): Promise<void> {
  if (await isTracking()) await Location.stopLocationUpdatesAsync(PRESENCE_TASK);
}

/**
 * Aliniază serviciul cu planul, prin `nextAction`: pornește dacă suntem în fereastră
 * (și avem «tot timpul»), oprește dacă am ieșit din ea, altfel nu atinge nimic.
 * `plan` null = nicio fereastră azi. Se cheamă la fiecare /day (ecranul zilei, cu
 * planul proaspăt) și din task-ul de re-armare (cu planul stocat).
 */
export async function applyPresencePlan(plan: PresencePlan | null, now = new Date()): Promise<PresenceAction> {
  const action = nextAction({
    inWindow: shouldTrack(localHHMM(now), plan?.window ?? null),
    tracking: await isTracking(),
    permitted: (await getPermissionState()) === 'granted',
  });
  if (action === 'start') {
    try {
      await startTracking();
    } catch (e) {
      // Android 12+ refuză pornirea unui serviciu în prim-plan din fundal dacă aplicația
      // nu e scoasă de la optimizarea bateriei — ecranul «Ultimul pas» există pentru asta.
      console.warn('[presence] nu pot porni urmărirea:', e);
      return 'keep';
    }
  } else if (action === 'stop') {
    await stopTracking();
  }
  return action;
}

/** La fiecare /day din ecranul zilei: salvează planul și aliniază serviciul. */
export async function syncPresenceTracking(day: DayResponse): Promise<PresenceAction> {
  return applyPresencePlan(await savePlan(day));
}

// ── Task-ul de locație ────────────────────────────────────────────────────────

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

  // Deconectat (token șters la 401 sau de «Deconectează») → serviciul n-are cui trimite.
  if (!(await getToken())) {
    await stopTracking();
    return;
  }

  const now = new Date();
  const plan = await getStoredPlan(now);
  const pings = locations.map(toPing);
  const last = pings[pings.length - 1];
  if (last) {
    await writeJson(KEY_LAST, { ...last, inZone: inZone(last, plan?.station ?? null) } satisfies LastReading);
  }
  await enqueue(pings);
  try {
    await flushPresenceQueue();
  } catch (e) {
    console.warn('[presence] flush a picat:', e);
  }
  // Ramura «în afara ferestrei»: fereastra s-a închis (sau planul e pentru altă zi) → oprim serviciul.
  if (!shouldTrack(localHHMM(now), plan?.window ?? null)) await stopTracking();
});
