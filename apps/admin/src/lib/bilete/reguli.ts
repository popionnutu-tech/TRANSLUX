/**
 * Regulile PURE ale comenzii de bilete au trecut în @translux/db (ION-197), ca site-ul să calculeze `sale_open`
 * cu exact aceleași funcții ca API-ul comenzii. Aici rămâne doar re-exportul (testele din reguli.test.ts le acoperă).
 */
export { calculeazaDepartureAt, vanzareDeschisa, ziuaUrmatoare } from '@translux/db';

/**
 * Data de pornire a vânzării publice (Ion, 09.10.2026: «începând de 12.10» = vânzarea pornește pe 12.10):
 * `app_config.bilete_online_de_la`. Deschisă = steagul `bilete_online_activ` ȘI ziua Chișinăului ≥ data. Lipsă/gol =
 * fără dată (doar steagul); formă stricată = închisă (nu vindem pe orb).
 */
export function vanzareaAPornit(steag: boolean, deLa: string | null | undefined, aziChisinau: string): boolean {
  if (!steag) return false;
  const d = String(deLa ?? '').trim();
  if (!d) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return aziChisinau >= d;
}
