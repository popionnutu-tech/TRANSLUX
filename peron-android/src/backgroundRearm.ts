/**
 * Re-armarea urmăririi fără aplicație (spec peron-app-tracking-always, S01): un task
 * `expo-background-fetch` (WorkManager pe Android) la cel puțin 15 minute, care rulează
 * și după închiderea aplicației din «recente» (`stopOnTerminate: false`) și după
 * repornirea telefonului (pornire la boot; permisiunea RECEIVE_BOOT_COMPLETED e în
 * app.json). E plasa de siguranță — mecanismul principal rămâne serviciul de locație
 * persistent din presence.ts.
 *
 * La fiecare rulare: dacă suntem în fereastră și serviciul nu e pornit, îl pornește;
 * dacă am ieșit din fereastră și e pornit, îl oprește; golește coada de ping-uri.
 * Planul se citește din AsyncStorage (`presence:plan`); dacă lipsește sau e pentru altă
 * zi, cere /day cu token-ul din SecureStore (fără navigare la login din fundal).
 *
 * `TaskManager.defineTask` rulează la nivel de modul — importat din `index.ts` și
 * `app/_layout.tsx`.
 */
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { getToken, request } from './api';
import { applyPresencePlan, flushPresenceQueue, getStoredPlan, savePlan } from './presence';
import type { PresencePlan } from './presenceRules';
import type { DayResponse } from './types';

export const REARM_TASK = 'presence-rearm';
export const REARM_INTERVAL_S = 15 * 60;

/** /day din fundal: fără token → null (deconectat); eroare de rețea → null. */
async function fetchPlan(): Promise<PresencePlan | null> {
  try {
    const day = await request<DayResponse>('day', { keepSessionOn401: true });
    return await savePlan(day);
  } catch (e) {
    console.warn('[presence-rearm] /day a picat:', e);
    return null;
  }
}

/**
 * Corpul task-ului, separat ca să poată fi chemat și direct. Când planul zilei nu se
 * poate afla (offline, fără plan stocat) nu se atinge serviciul — doar se golește coada.
 */
export async function rearmPresence(now = new Date()): Promise<BackgroundFetch.BackgroundFetchResult> {
  const connected = !!(await getToken());
  let action: 'start' | 'stop' | 'keep' = 'keep';
  if (!connected) {
    action = await applyPresencePlan(null, now); // deconectat → oprește dacă mai merge
  } else {
    const plan = (await getStoredPlan(now)) ?? (await fetchPlan());
    if (plan) action = await applyPresencePlan(plan, now);
  }
  let sent = 0;
  try {
    sent = (await flushPresenceQueue()).sent;
  } catch (e) {
    console.warn('[presence-rearm] flush a picat:', e);
  }
  return action !== 'keep' || sent > 0 ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
}

TaskManager.defineTask(REARM_TASK, async () => {
  try {
    return await rearmPresence();
  } catch (e) {
    console.warn('[presence-rearm] task error:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/** La login și la fiecare deschidere a zilei (idempotent). */
export async function registerRearm(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(REARM_TASK)) return;
  await BackgroundFetch.registerTaskAsync(REARM_TASK, {
    minimumInterval: REARM_INTERVAL_S,
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

/** La deconectare. */
export async function unregisterRearm(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(REARM_TASK)) await BackgroundFetch.unregisterTaskAsync(REARM_TASK);
}
