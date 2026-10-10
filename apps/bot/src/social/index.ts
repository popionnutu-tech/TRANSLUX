import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Bot } from 'grammy';
import type { Update } from 'grammy/types';
import type { BotContext } from '../types.js';
import { initSocial } from './comun.js';
import { trateazaCallbackSocial, trateazaMesajSocial } from './primire.js';
import { trecerePublicare } from './publicare.js';
import { golesteTemporar } from './descarcare.js';
import { rulareFaraSuprapunere } from '../scheduler.js';

// Clipurile bloggerilor pe TikTok / Facebook / Instagram (plan 09.10, doc claude.ai 2MSfo943spWNgcxhwNTiux).
// Aici se leagă cele trei capete: handlerele grammY ale botului Translux, releul botului TLX și publicatorul.

export const RELEU_TLX = '/social/v1/tlx';
const CORP_MAX = 1024 * 1024;

/** Handlerele botului Translux: înaintea celor de grup, ca un clip dintr-un topic legat să nu fie înghițit. */
export function inregistreazaSocial(bot: Bot<BotContext>): void {
  initSocial(bot.api);
  bot.callbackQuery(/^soc:/, async (ctx, next) => {
    let al_nostru = false;
    try { al_nostru = await trateazaCallbackSocial('translux', ctx.callbackQuery); } catch (err) {
      console.error('social buton:', err);
      await ctx.answerCallbackQuery({ text: 'Nu am putut face asta acum. Încercați din nou peste un minut.', show_alert: true }).catch(() => {});
      return;
    }
    if (!al_nostru) return next();
  });
  bot.on('message', async (ctx, next) => {
    if (ctx.chat.type !== 'supergroup') return next();
    let al_nostru = false;
    try { al_nostru = await trateazaMesajSocial('translux', ctx.message); } catch (err) { console.error('social mesaj:', err); }
    if (!al_nostru) return next();
  });
}

/**
 * Cheia releului. SEC-1 (dezbaterea 10.10): lungimile se compară pe OCTEȚI, nu pe caractere — un antet cu caractere
 * non-ASCII are aceeași lungime în caractere și mai mulți octeți, iar `timingSafeEqual` ar arunca și ar opri procesul.
 * Pur, testat.
 */
export function cheieCorecta(primita: string | string[] | undefined, asteptata = process.env.SOCIAL_RELAY_KEY ?? ''): boolean {
  const a = Buffer.from(Array.isArray(primita) ? (primita[0] ?? '') : (primita ?? ''), 'utf8');
  const b = Buffer.from(asteptata, 'utf8');
  if (b.length < 16 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Releul botului TLX: serverul lui (Render) trimite aici, cu cheia SOCIAL_RELAY_KEY, actualizările din supergrupul
 * clipurilor (clipuri, comenzile /lega_social… /blogger, butoanele «soc:»). Răspunde imediat 200; lucrul se face după.
 * false = cererea nu e pentru releu.
 */
export async function handleSocialRelay(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!req.url || req.url.split('?')[0] !== RELEU_TLX) return false;
  try {
    await releu(req, res);
  } catch (err) {
    // Nimic din releu nu are voie să scape ca respingere netratată (ar opri tot botul, cu operatorii și biletele).
    console.error('social releu:', err);
    if (!res.headersSent) { res.writeHead(500); res.end(); }
  }
  return true;
}

/**
 * C10: releul TLX retrimite actualizarea când răspunsul HTTP se pierde. Aceeași `update_id` se lucrează o singură dată
 * (memoria procesului: ultimele 2000; o repornire o poate lăsa să treacă încă o dată, de aceea comenzile sunt și
 * ele idempotente — /social_oprit și /social_porneste, nu un comutator). Pur, testat.
 */
const vazute = new Set<number>();
export function dejaVazuta(updateId: unknown): boolean {
  if (typeof updateId !== 'number') return false;
  if (vazute.has(updateId)) return true;
  vazute.add(updateId);
  if (vazute.size > 2000) vazute.delete(vazute.values().next().value as number);
  return false;
}

async function releu(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
  if (!cheieCorecta(req.headers['x-social-key'])) { res.writeHead(401); res.end(); return; }
  const bucati: Buffer[] = [];
  let marime = 0;
  let update: Update;
  try {
    // O conexiune întreruptă (releul TLX are 15 s) face citirea să arunce: prinsă aici, nu cade procesul botului.
    for await (const b of req) {
      marime += (b as Buffer).length;
      if (marime > CORP_MAX) { res.writeHead(413); res.end(); return; }
      bucati.push(b as Buffer);
    }
    update = JSON.parse(Buffer.concat(bucati).toString('utf8')) as Update;
  } catch {
    if (!res.headersSent) { res.writeHead(400); res.end(); }
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end('{"ok":true}');
  if (dejaVazuta(update.update_id)) return;
  try {
    if (update.callback_query) await trateazaCallbackSocial('tlx', update.callback_query);
    else if (update.message) await trateazaMesajSocial('tlx', update.message);
  } catch (err) {
    console.error('social releu tlx:', err);
  }
  return;
}

export function scheduleSocial(): void {
  console.log('Social: publicatorul clipurilor la fiecare minut');
  // SBE-8: resturile unei căderi (clipuri pe jumătate descărcate) nu rămân pe disc.
  void golesteTemporar().then(() => rulareFaraSuprapunere('social-publicare', 60_000, trecerePublicare));
}
