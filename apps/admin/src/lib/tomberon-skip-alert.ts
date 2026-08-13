import { escapeHtml } from './telegram-notify';

/**
 * Deduplicarea alertelor pentru foile pe care tomberon-sync NU le poate trimite
 * la terminal (mașină lipsă în nomenclator, șofer nemapat, insert eșuat…).
 *
 * Sync-ul rulează din 10 în 10 minute, deci o problemă nerezolvată ar genera
 * ~100 de mesaje pe zi. Regula: fiecare (foaie, cod) alertează O SINGURĂ dată
 * pe zi, și doar dacă persistă peste GRACE_MS — dimineața devreme dispecerul
 * încă completează graficul, iar o mașină care apare la 06:00 nu e un incident.
 *
 * Cheia de deduplicare folosește `cod` (mulțime închisă), NU textul `motiv`:
 * motivul conține plăcuța sau mesajul MS SQL, care se schimbă de la o rulare la
 * alta — cu el în cheie cronometrul s-ar reseta mereu și alerta n-ar pleca NICIODATĂ.
 */
export const SKIP_CODES = ['nemapat', 'fara_masina', 'auto_lipsa', 'insert_esuat', 'foaie_nenumerica'] as const;
export type SkipCode = (typeof SKIP_CODES)[number];

export type SkipItem = { foaie: string; sofer: string; cod: SkipCode; motiv: string };
export type SkipEntry = { firstSeen: number; alerted: boolean };
/** Stare per zi: sync-ul trimite AZI și MÂINE (curse de noapte — șoferul vine cu
 *  foaia de mâine din ajun), iar zilele care nu mai apar în payload cad singure. */
export type SkipState = { zile: Record<string, Record<string, SkipEntry>> };

export const GRACE_MS = 20 * 60 * 1000;
/** Telegram respinge mesajele peste 4096 de caractere — o zi neagră (toate
 *  insert-urile eșuate) ar depăși limita și mesajul s-ar pierde ÎNTREG. */
const TELEGRAM_LIMIT = 4096;
const MAX_LINII = 25;

const skipKey = (s: SkipItem) => `${s.foaie}|${s.cod}`;

export type ZiSkips = { ziua: string; skips: SkipItem[] };
export type Alerta = { ziua: string; items: SkipItem[] };

export function decideAlerts(
  prev: SkipState | null,
  zile: ZiSkips[],
  nowMs: number,
): { alerts: Alerta[]; state: SkipState } {
  const state: SkipState = { zile: {} };
  const alerts: Alerta[] = [];

  for (const { ziua, skips } of zile) {
    const base = prev?.zile?.[ziua] ?? {};
    const items: Record<string, SkipEntry> = {};
    const deAlertat: SkipItem[] = [];

    for (const skip of skips) {
      const k = skipKey(skip);
      // Problemele rezolvate nu se copiază în starea nouă → dacă revin, cronometrul reîncepe.
      const entry = items[k] ?? base[k] ?? { firstSeen: nowMs, alerted: false };
      if (!entry.alerted && nowMs - entry.firstSeen >= GRACE_MS) {
        deAlertat.push(skip);
        entry.alerted = true;
      }
      items[k] = entry;
    }

    state.zile[ziua] = items;
    if (deAlertat.length) alerts.push({ ziua, items: deAlertat });
  }

  return { alerts, state };
}

/** Anulează marcajul «alertat» când Telegram n-a acceptat mesajul, ca următoarea
 *  rulare (peste 10 min) să reîncerce. Altfel o singură livrare eșuată ar face
 *  problema să tacă toată ziua — exact eșecul pe care featureul îl vânează. */
export function marcheazaNetrimis(state: SkipState, alerta: Alerta): SkipState {
  const items = state.zile[alerta.ziua];
  if (!items) return state;
  for (const item of alerta.items) {
    const entry = items[skipKey(item)];
    if (entry) entry.alerted = false;
  }
  return state;
}

export function formatSkipAlert(ziua: string, alerts: SkipItem[]): string {
  const [y, m, d] = ziua.split('-');
  const antet = `⚠️ <b>Foi care NU ajung la terminal</b> (${d}.${m}.${y})\n\n`;
  const subsol = `\n\nȘoferii nu vor putea introduce f/parcurs pe cursele astea până se rezolvă.`;
  // Numărul de linii nu ajunge ca plafon: un `motiv` lung (mesaj MS SQL, 160 de
  // caractere) umflă linia, deci măsurăm caracterele. 90 = loc pentru coadă.
  const buget = TELEGRAM_LIMIT - antet.length - subsol.length - 90;

  const linii: string[] = [];
  let lungime = 0;
  for (const a of alerts) {
    const linie = `• <b>${escapeHtml(a.foaie)}</b> ${escapeHtml(a.sofer)} — ${escapeHtml(a.motiv)}`;
    if (linii.length >= MAX_LINII || lungime + linie.length + 1 > buget) break;
    linii.push(linie);
    lungime += linie.length + 1;
  }
  const rest = alerts.length - linii.length;
  if (rest > 0) linii.push(`…și încă ${rest} ${rest === 1 ? 'foaie' : 'foi'} (vezi tomberon-sync.log)`);
  return antet + linii.join('\n') + subsol;
}
