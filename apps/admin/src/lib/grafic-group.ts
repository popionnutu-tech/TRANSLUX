import { getSupabase } from './supabase';
import { escapeHtml } from './telegram-notify';
import { GRAFIC_GROUP_CONFIG_KEY } from '@translux/db';

// Grupa «Mejgorod» — șoferii de interurban (Ion, 07.09.2026): «după ce a
// introdus toată informația să apară graficul, imaginea vizuală, toate cursele
// în grupa Telegram Mejgorod, ca fiecare șofer să cunoască mâine pe ce cursă
// va fi».
//
// Grupa se leagă din bot cu /lega_grafic, scrisă ÎN grupă de un administrator —
// același tipar ca /lega_reclamatii. Cheie SEPARATĂ de grupa reclamațiilor:
// nu e sigur că e același chat, iar un grafic postat în grupa greșită nu se
// mai retrage.

export { GRAFIC_GROUP_CONFIG_KEY } from '@translux/db';

// Fără cache: se citește o dată pe trimitere, iar trimiterea e un click al
// dispecerului, nu o cale fierbinte. Un TTL ar fi ascuns legarea grupei
// timp de minute bune — exact când Ion o încearcă prima dată.
export async function graficGroupChatId(): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from('app_config')
    .select('value')
    .eq('key', GRAFIC_GROUP_CONFIG_KEY)
    .maybeSingle();
  if (error) {
    console.error('graficGroupChatId:', error.message);
    return null;
  }
  return (data?.value ?? '').trim() || null;
}

const ZILE_RO = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];

/** «marți, 08.09.2026» — ziua din data ISO, fără fus orar (data e calendaristică). */
export function ziuaRo(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${ZILE_RO[dow]}, ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

/* ── Instantaneul trimis + diferența în cuvinte (Ion, 07.09) ──
 * «Dacă după ce a fost făcut tick în box este vreo schimbare — vine imaginea
 * nouă, iar sub imagine vine schimbarea produsă.» Ca să spunem CE s-a
 * schimbat, ținem minte ce a văzut grupa: un instantaneu al curselor la
 * fiecare trimitere, în grafic_group_posts.snapshot. */

export interface GraficSnapRow {
  /** ora plecării din nord, ex. «05:00» */
  t: string;
  /** destinația, ex. «Chișinău - Briceni» */
  d: string;
  /** ora returului din Chișinău */
  r: string;
  drv: string | null;
  name: string | null;
  plate: string | null;
  plateRet: string | null;
  /** cursă anulată */
  x: boolean;
}
export type GraficSnapshot = Record<string, GraficSnapRow>;

export interface GraficSnapSource {
  crm_route_id: number;
  time_nord: string;
  dest_to: string;
  time_chisinau: string;
  driver_id: string | null;
  driver_full_name: string | null;
  driver_name: string | null;
  vehicle_plate: string | null;
  vehicle_plate_retur: string | null;
  cancelled: boolean;
}

export function graficSnapshot(rows: GraficSnapSource[]): GraficSnapshot {
  const out: GraficSnapshot = {};
  for (const r of rows) {
    out[String(r.crm_route_id)] = {
      t: r.time_nord, d: r.dest_to, r: r.time_chisinau,
      drv: r.driver_id, name: r.driver_full_name || r.driver_name,
      plate: r.vehicle_plate, plateRet: r.vehicle_plate_retur, x: r.cancelled,
    };
  }
  return out;
}

/** «Briceni», din «Chișinău - Briceni» — numele scurt al cursei, ca pe imagine. */
function cursaScurt(r: GraficSnapRow): string {
  const dest = r.d.replace(/^Chi[sș]in[aă]u\s*[-–]\s*/i, '');
  return `${r.t} ${dest}`.trim();
}

const GOL: GraficSnapRow = { t: '', d: '', r: '', drv: null, name: null, plate: null, plateRet: null, x: false };

/**
 * Ce s-a schimbat față de imaginea pe care a văzut-o grupa — un rând pe cursă,
 * în ordinea orelor. Contează doar ce vede sau îl privește pe șofer: cine e pe
 * cursă, anulată sau nu, ora returului, mașina. Foaia de parcurs nu intră: nu e
 * pe imagine și nu-l privește pe șofer.
 */
export function diffGraficSnapshots(prev: GraficSnapshot, next: GraficSnapshot): string[] {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const linii: Array<{ sort: string; text: string }> = [];
  for (const k of keys) {
    const a = prev[k] ?? GOL;
    const b = next[k] ?? GOL;
    const cur = b.t ? b : a;
    const numeCursa = cursaScurt(cur);
    const aVizibil = !!a.drv && !a.x;
    const bVizibil = !!b.drv && !b.x;
    const schimbari: string[] = [];

    if (!aVizibil && !bVizibil) continue; // n-a fost și nu e pe imagine

    if (a.x !== b.x && b.x) {
      schimbari.push(`cursa ANULATĂ${a.name ? ` (era ${a.name})` : ''}`);
    } else if (a.x !== b.x && !b.x) {
      schimbari.push(`cursa REPUSĂ în grafic${b.name ? ` — ${b.name}` : ''}`);
    } else if (!a.drv && b.drv) {
      schimbari.push(`șofer nou — ${b.name ?? '?'}`);
    } else if (a.drv && !b.drv) {
      schimbari.push(`fără șofer${a.name ? ` (era ${a.name})` : ''}`);
    } else if (a.drv !== b.drv) {
      schimbari.push(`șofer schimbat — ${b.name ?? '?'}${a.name ? ` (era ${a.name})` : ''}`);
    }

    if (bVizibil) {
      if (a.drv && a.r !== b.r && b.r) schimbari.push(`retur din Chișinău ${b.r}${a.r ? ` (era ${a.r})` : ''}`);
      if (a.drv && a.plate !== b.plate && b.plate) schimbari.push(`mașina ${b.plate}${a.plate ? ` (era ${a.plate})` : ''}`);
      if (a.drv && a.plateRet !== b.plateRet && b.plateRet) schimbari.push(`mașina la retur ${b.plateRet}${a.plateRet ? ` (era ${a.plateRet})` : ''}`);
    }

    if (schimbari.length) linii.push({ sort: cur.t, text: `• ${numeCursa}: ${schimbari.join('; ')}` });
  }
  linii.sort((x, y) => x.sort.localeCompare(y.sort));
  return linii.map((l) => l.text);
}

// Telegram: subtitlul unei fotografii are cel mult 1024 de caractere; peste,
// sendPhoto respinge TOT mesajul și grupa nu primește nici imaginea.
const CAPTION_MAX = 1024;

/**
 * Subtitlul imaginii din grupă. Scurt: imaginea spune tot; textul doar
 * spune CE zi e (ca șoferul care deschide grupa peste două zile să nu ia
 * graficul de ieri drept cel de azi) și dacă e o retrimitere după corectare.
 */
export function graficGroupCaption(
  dateIso: string,
  rowsCount: number,
  resend: boolean,
  changes: string[] = [],
): string {
  const curse = rowsCount === 1 ? '1 cursă' : `${rowsCount} curse`;
  const cap = [
    `📋 <b>Grafic interurban — ${ziuaRo(dateIso)}</b>`,
    `${curse} cu șofer. Fiecare își găsește numele în coloana din dreapta.`,
  ];
  if (changes.length) {
    cap.push('🔁 <b>Grafic actualizat — ce s-a schimbat:</b>');
    const esc = changes.map(escapeHtml);
    let folosite = 0;
    for (const linie of esc) {
      const ramase = esc.length - folosite - 1;
      const coada = ramase > 0 ? `\n… și încă ${ramase}` : '';
      if ([...cap, linie].join('\n').length + coada.length > CAPTION_MAX) break;
      cap.push(linie);
      folosite++;
    }
    if (folosite < esc.length) cap.push(`… și încă ${esc.length - folosite} ${esc.length - folosite === 1 ? 'schimbare' : 'schimbări'}`);
  } else if (resend) {
    cap.push('🔁 <i>Grafic corectat — înlocuiește imaginea trimisă mai devreme pentru această zi.</i>');
  }
  return cap.join('\n');
}
