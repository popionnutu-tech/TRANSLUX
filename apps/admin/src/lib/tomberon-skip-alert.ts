import { escapeHtml } from './telegram-notify';

/**
 * Deduplicarea alertelor pentru foile pe care tomberon-sync NU le poate trimite
 * la terminal (mașină lipsă în nomenclator, șofer nemapat, insert eșuat…).
 *
 * Sync-ul rulează din 10 în 10 minute, deci o problemă nerezolvată ar genera
 * ~100 de mesaje pe zi. Regula: fiecare (foaie, motiv) alertează O SINGURĂ dată
 * pe zi, și doar dacă persistă peste GRACE_MS — dimineața devreme dispecerul
 * încă completează graficul, iar o mașină care apare la 06:00 nu e un incident.
 */
export type SkipItem = { foaie: string; sofer: string; motiv: string };
export type SkipEntry = { firstSeen: number; alerted: boolean };
export type SkipState = { ziua: string; items: Record<string, SkipEntry> };

export const GRACE_MS = 20 * 60 * 1000;

const skipKey = (s: SkipItem) => `${s.foaie}|${s.motiv}`;

export function decideAlerts(
  prev: SkipState | null,
  ziua: string,
  skips: SkipItem[],
  nowMs: number,
): { alerts: SkipItem[]; state: SkipState } {
  // Starea se poartă doar în cadrul aceleiași zile; la schimbarea zilei o luăm de la zero.
  const base = prev && prev.ziua === ziua ? prev.items : {};
  const items: Record<string, SkipEntry> = {};
  const alerts: SkipItem[] = [];

  for (const skip of skips) {
    const k = skipKey(skip);
    // Problemele rezolvate nu se copiază în starea nouă → dacă revin, cronometrul reîncepe.
    const entry = items[k] ?? base[k] ?? { firstSeen: nowMs, alerted: false };
    if (!entry.alerted && nowMs - entry.firstSeen >= GRACE_MS) {
      alerts.push(skip);
      entry.alerted = true;
    }
    items[k] = entry;
  }

  return { alerts, state: { ziua, items } };
}

export function formatSkipAlert(ziua: string, alerts: SkipItem[]): string {
  const [y, m, d] = ziua.split('-');
  const linii = alerts.map(a => `• <b>${escapeHtml(a.foaie)}</b> ${escapeHtml(a.sofer)} — ${escapeHtml(a.motiv)}`);
  return (
    `⚠️ <b>Foi care NU ajung la terminal</b> (${d}.${m}.${y})\n\n` +
    `${linii.join('\n')}\n\n` +
    `Șoferii nu vor putea introduce f/parcurs pe cursele astea până se rezolvă.`
  );
}
