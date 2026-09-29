import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { CAMIOANE_SCHELET_FISA } from './camioaneFisa.js';
import { currentCamioaneGroup } from './driversGroup.js';

// ION-144 — botul răspunde în grupa camioanelor cu drumul corect al cisternei (Ion, 29.09: «să faci botul să vorbească
// cu ei și să le răspundă ruta corectă în baza la prezentarea noastră, rutele optimale»).
// Răspunde doar din fișa scheletului (camioaneFisa.ts, generată din ION-69), doar la mesajele care îl cer:
// menționare @bot, răspuns la un mesaj al botului sau /traseu. În grupe, Telegram oricum îi dă botului doar acestea.

const MODEL = 'claude-sonnet-5';

const SYSTEM = `Ești asistentul de traseu al cisternelor TLX, în grupa de Telegram a șoferilor și dispecerilor.
Răspunzi DOAR din fișa scheletului ideal de mai jos. Nu inventa drumuri, km, ore, vămi sau reguli care nu sunt în fișă.

Cum răspunzi:
- În limba întrebării (română sau rusă), scurt: cel mult 8 rânduri, text simplu fără markdown; poți folosi → și •.
- Pentru o cursă: drumul (orașele cu →), vama, km și orele din fișă. La motorină dai varianta DE BAZĂ (prin baza petrolieră); varianta directă doar dacă e întrebată sau dacă omul spune că merge direct (atunci «doar cu acordul dispecerului»).
- Amintește, când e cazul, drumul de jos prin România (Măcin → podul Brăila → Galați, nu A2) și vama corectă.
- Pentru drum gol înapoi: vama și km din tabelul drumurilor goale.
- Dacă destinația, marfa sau punctul nu sunt în fișă, spune că nu sunt în schelet și să întrebe dispecerul.
- Nu răspunzi la altceva decât traseele (salarii, norme, încărcare, acte): «întrebați dispecerul».

FIȘA:
${CAMIOANE_SCHELET_FISA}`;

type MesajTg = {
  text?: string;
  entities?: { type: string; offset: number; length: number }[];
  reply_to_message?: { from?: { id: number }; text?: string; caption?: string };
};

/** Întrebarea adresată botului, sau null dacă mesajul nu e pentru el. Pur, testabil. */
export function intrebareCatreBot(m: MesajTg, botId: number, botUsername: string): string | null {
  const text = (m.text ?? '').trim();
  if (!text) return null;
  const cmd = text.match(/^\/traseu(?:@\w+)?\s*([\s\S]*)$/i);
  if (cmd) return cmd[1].trim() || null;
  const mentiune = new RegExp(`@${botUsername}\\b`, 'i');
  const eMentionat = (m.entities ?? []).some((e) => e.type === 'mention' && mentiune.test(text.slice(e.offset, e.offset + e.length)));
  const eRaspuns = m.reply_to_message?.from?.id === botId;
  if (!eMentionat && !eRaspuns) return null;
  const q = text.replace(mentiune, '').trim();
  return q || null;
}

// id-ul grupei, 5 minute în memorie (botul o leagă cu /lega_camioane în același proces, dar poate fi schimbată)
let cache: { at: number; id: string | null } | null = null;
export async function grupaCamioane(): Promise<string | null> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.id;
  const id = await currentCamioaneGroup().catch(() => null);
  cache = { at: Date.now(), id };
  return id;
}

// cel mult 40 de răspunsuri pe oră în grupă — o buclă sau un abuz nu golește creditul API
const ultimele: number[] = [];
function permis(): boolean {
  const acum = Date.now();
  while (ultimele.length && acum - ultimele[0] > 3600_000) ultimele.shift();
  if (ultimele.length >= 40) return false;
  ultimele.push(acum);
  return true;
}

let client: Anthropic | null = null;

/** Răspunsul la o întrebare de traseu. Nu aruncă: la orice eșec, un mesaj scurt care trimite la dispecer. */
export async function raspundeTraseu(intrebare: string, contextAnterior?: string): Promise<string> {
  if (!config.anthropicApiKey) return 'Asistentul de traseu nu e configurat. Traseele sunt în imaginile fixate în grupă.';
  if (!permis()) return 'Prea multe întrebări în ultima oră. Traseele sunt în imaginile fixate în grupă.';
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [
        ...(contextAnterior ? [{ role: 'assistant' as const, content: contextAnterior.slice(0, 2000) }] : []),
        { role: 'user', content: intrebare.slice(0, 1500) },
      ],
    });
    const text = res.content.find((b) => b.type === 'text')?.text?.trim();
    return text || 'Nu am găsit răspunsul în schelet. Întrebați dispecerul.';
  } catch (err) {
    console.error('[camioane-traseu] Anthropic:', (err as Error)?.message ?? err);
    return 'Nu pot răspunde acum. Traseele sunt în imaginile fixate în grupă; la nevoie, întrebați dispecerul.';
  }
}
