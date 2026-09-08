// Codul de conectare al aplicației de peron (docs/specs/peron-app-android.md, S02):
// 6 cifre, valabil 24 h, o singură folosire. Fișier fără 'use server' și fără importuri de
// Node (îl citește și UsersClient, componentă client) — generatorul aleator vine ca parametru.

export const LINK_CODE_MIN = 100000;
export const LINK_CODE_MAX = 999999; // randomInt e exclusiv la capătul de sus → 100000..999998
export const LINK_CODE_TTL_MS = 24 * 60 * 60 * 1000;

/** Rolul/punctul/starea cerute ca un utilizator să poată primi cod (CONTROLLER activ, Chișinău sau Bălți). */
export function canReceiveLinkCode(user: { role: string; point: string | null; active: boolean }): boolean {
  return user.active && user.role === 'CONTROLLER' && (user.point === 'CHISINAU' || user.point === 'BALTI');
}

/** Un cod nou de 6 cifre; `rand` = crypto.randomInt în server action, orice stub în teste. */
export function generateLinkCode(rand: (min: number, max: number) => number): string {
  return String(rand(LINK_CODE_MIN, LINK_CODE_MAX));
}

export function linkCodeExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + LINK_CODE_TTL_MS).toISOString();
}
