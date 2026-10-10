import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Bot } from 'grammy';
import type { Update } from 'grammy/types';
import type { BotContext } from '../types.js';
import { initSocial } from './comun.js';
import { trateazaCallbackSocial, trateazaMesajSocial } from './primire.js';
import { trecerePublicare } from './publicare.js';
import { rulareFaraSuprapunere } from '../scheduler.js';

// Clipurile bloggerilor pe TikTok / Facebook / Instagram (plan 09.10, doc claude.ai 2MSfo943spWNgcxhwNTiux).
// Aici se leagă cele trei capete: handlerele grammY ale botului Translux, releul botului TLX și publicatorul.

export const RELEU_TLX = '/social/v1/tlx';
const CORP_MAX = 1024 * 1024;

/** Handlerele botului Translux: înaintea celor de grup, ca un clip dintr-un topic legat să nu fie înghițit. */
export function inregistreazaSocial(bot: Bot<BotContext>): void {
  initSocial(bot.api);
  bot.callbackQuery(/^soc:/, async (ctx, next) => {
    if (!(await trateazaCallbackSocial('translux', ctx.callbackQuery))) return next();
  });
  bot.on('message', async (ctx, next) => {
    if (ctx.chat.type !== 'supergroup') return next();
    let al_nostru = false;
    try { al_nostru = await trateazaMesajSocial('translux', ctx.message); } catch (err) { console.error('social mesaj:', err); }
    if (!al_nostru) return next();
  });
}

function cheieCorecta(primita: string | string[] | undefined): boolean {
  const asteptata = process.env.SOCIAL_RELAY_KEY ?? '';
  const p = Array.isArray(primita) ? primita[0] : (primita ?? '');
  if (asteptata.length < 16 || p.length !== asteptata.length) return false;
  return timingSafeEqual(Buffer.from(p), Buffer.from(asteptata));
}

/**
 * Releul botului TLX: serverul lui (Render) trimite aici, cu cheia SOCIAL_RELAY_KEY, actualizările din supergrupul
 * clipurilor (clipuri, comenzile /lega_social… /blogger, butoanele «soc:»). Răspunde imediat 200; lucrul se face după.
 * false = cererea nu e pentru releu.
 */
export async function handleSocialRelay(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!req.url || req.url.split('?')[0] !== RELEU_TLX) return false;
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return true; }
  if (!cheieCorecta(req.headers['x-social-key'])) { res.writeHead(401); res.end(); return true; }
  const bucati: Buffer[] = [];
  let marime = 0;
  let update: Update;
  try {
    // O conexiune întreruptă (releul TLX are 15 s) face citirea să arunce: prinsă aici, nu cade procesul botului.
    for await (const b of req) {
      marime += (b as Buffer).length;
      if (marime > CORP_MAX) { res.writeHead(413); res.end(); return true; }
      bucati.push(b as Buffer);
    }
    update = JSON.parse(Buffer.concat(bucati).toString('utf8')) as Update;
  } catch {
    if (!res.headersSent) { res.writeHead(400); res.end(); }
    return true;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end('{"ok":true}');
  try {
    if (update.callback_query) await trateazaCallbackSocial('tlx', update.callback_query);
    else if (update.message) await trateazaMesajSocial('tlx', update.message);
  } catch (err) {
    console.error('social releu tlx:', err);
  }
  return true;
}

export function scheduleSocial(): void {
  console.log('Social: publicatorul clipurilor la fiecare minut');
  rulareFaraSuprapunere('social-publicare', 60_000, trecerePublicare);
}
