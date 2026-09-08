/**
 * Deconectarea completă (spec peron-app-tracking-always, S01): oprește serviciul de
 * locație, dez-înregistrează re-armarea din fundal, șterge planul și coada, apoi
 * șterge token-ul și duce la login (`api.ts`). Butonul «Deconectează» vine aici;
 * 401-ul din `api.ts` șterge doar token-ul — task-urile de fundal se opresc singure
 * când îl văd lipsă.
 */
import { logout as clearSession } from './api';
import { unregisterRearm } from './backgroundRearm';
import { clearPresenceStorage, stopTracking } from './presence';

export async function logout(): Promise<void> {
  await stopTracking().catch((e) => console.warn('[session] serviciul nu s-a oprit:', e));
  await unregisterRearm().catch((e) => console.warn('[session] re-armarea nu s-a dez-înregistrat:', e));
  await clearPresenceStorage().catch(() => undefined);
  await clearSession();
}
