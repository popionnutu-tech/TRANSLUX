import type { NextFunction } from 'grammy';
import type { BotContext, Limba, PlangereSesiune } from '../types.js';
import { panouPlangeri, PLANGERE_TEXT_MAX, type PanouPlangeri, type RaspunsPlangere } from '../services/panouPlangeri.js';
import { textDupaCursa } from './dupa-cursa-texte.js';

// ION-252 / ION-247 (Ion: «călătorul poate să lase plângere în Telegram bot»). Două intrări în același flux: butonul
// «👎 Am o plângere» de sub mesajul de după cursă și textul liber pe care AI-ul (returAi) îl înțelege ca plângere. Botul
// ține în sesiune «aștept plângerea» (ca «aștept cifrele» din ION-244); următorul mesaj privat — text, opțional cu
// poză — e plângerea și pleacă la panou. O comandă (/start, /cancel) iese din așteptare.

/** Cât așteaptă botul plângerea după ce a cerut-o. */
export const PLANGERE_ASTEPTARE_MS = 30 * 60_000;

export interface PlangereDeps {
  panou: PanouPlangeri;
  now: () => number;
}

export const depsPlangere: PlangereDeps = { panou: panouPlangeri, now: Date.now };

// ── Reguli pure (testate în plangere.test.ts) ────────────────────────────────────────────────────

export type RutaPlangere = 'mai_departe' | 'iesire' | 'plangere';

/** Unde merge un mesaj: plângerea așteptată, ieșirea din așteptare (expirată sau comandă), sau mai departe. */
export function rutaPlangere(p: { privat: boolean; asteptare: PlangereSesiune | undefined; text: string | null; nowMs: number }): RutaPlangere {
  if (!p.privat || !p.asteptare) return 'mai_departe';
  if (p.asteptare.expiraLa < p.nowMs) return 'iesire';
  if (p.text?.trim().startsWith('/')) return 'iesire';
  return 'plangere';
}

export type CitirePlangere =
  | { tip: 'trimite'; text: string; fotoFileId: string | null }
  | { tip: 'asteapta_text'; fotoFileId: string }
  | { tip: 'nesuportat' };

/**
 * Mesajul clientului cât botul așteaptă plângerea: textul (sau subtitlul pozei) e plângerea, tăiat la 2000 de
 * caractere; poza fără text se păstrează până vine textul; altceva (sticker, vocal) → i se cere textul.
 */
export function citestePlangerea(m: { text: string | null; fotoFileId: string | null }, fotoSalvata?: string): CitirePlangere {
  const text = (m.text ?? '').trim();
  const foto = m.fotoFileId ?? fotoSalvata ?? null;
  if (text) return { tip: 'trimite', text: text.slice(0, PLANGERE_TEXT_MAX), fotoFileId: foto };
  if (m.fotoFileId) return { tip: 'asteapta_text', fotoFileId: m.fotoFileId };
  return { tip: 'nesuportat' };
}

const TEXT_RASPUNS: Record<RaspunsPlangere['tip'], Parameters<typeof textDupaCursa>[0]> = {
  primita: 'plangerePrimita',
  plafon: 'plangerePlafon',
  text_invalid: 'doarTextSauPoza',
};

// ── Fluxul ───────────────────────────────────────────────────────────────────────────────────────

/** Intrarea în flux: botul ține minte comanda și cere plângerea. */
export async function incepePlangerea(ctx: BotContext, p: { cod: string | null; lang: Limba }, nowMs: number): Promise<void> {
  ctx.session.plangere = { cod: p.cod, lang: p.lang, expiraLa: nowMs + PLANGERE_ASTEPTARE_MS };
  await ctx.reply(textDupaCursa('cerePlangere', p.lang));
}

/** Cea mai mare variantă a pozei din mesaj (Telegram le trimite de la mică la mare). */
function fotoDinMesaj(ctx: BotContext): string | null {
  const poze = ctx.message?.photo;
  return poze?.length ? poze[poze.length - 1].file_id : null;
}

async function trimiteLaPanou(
  ctx: BotContext,
  deps: PlangereDeps,
  p: { fromId: number; asteptare: PlangereSesiune; text: string; fotoFileId: string | null; mesajId: number },
): Promise<void> {
  const r = await deps.panou.plangere({
    telegramId: p.fromId, cod: p.asteptare.cod, text: p.text, fotoFileId: p.fotoFileId, mesajId: p.mesajId,
  });
  if (r.tip === 'eroare') {
    // Așteptarea rămâne: clientul poate retrimite mesajul (alt message_id = altă încercare, fără dublură).
    console.error(`[plangere] panou: ${r.eroare}${r.status ? ` (${r.status})` : ''}`);
    await ctx.reply(textDupaCursa('plangereEsuata', p.asteptare.lang));
    return;
  }
  ctx.session.plangere = r.raspuns.tip === 'text_invalid' ? p.asteptare : undefined;
  await ctx.reply(textDupaCursa(TEXT_RASPUNS[r.raspuns.tip], p.asteptare.lang));
}

async function primestePlangerea(ctx: BotContext, deps: PlangereDeps, fromId: number, asteptare: PlangereSesiune): Promise<void> {
  const mesaj = ctx.message;
  if (!mesaj) return;
  const citire = citestePlangerea({ text: mesaj.text ?? mesaj.caption ?? null, fotoFileId: fotoDinMesaj(ctx) }, asteptare.fotoFileId);
  if (citire.tip === 'nesuportat') {
    await ctx.reply(textDupaCursa('doarTextSauPoza', asteptare.lang));
    return;
  }
  if (citire.tip === 'asteapta_text') {
    ctx.session.plangere = { ...asteptare, fotoFileId: citire.fotoFileId };
    await ctx.reply(textDupaCursa('cereText', asteptare.lang));
    return;
  }
  await trimiteLaPanou(ctx, deps, { fromId, asteptare, text: citire.text, fotoFileId: citire.fotoFileId, mesajId: mesaj.message_id });
}

/**
 * Mesajele private cât botul așteaptă plângerea — ÎNAINTEA handlerului clienților (ION-244) și a răspunsului implicit.
 * Fără așteptare (sau în grupuri) mesajul merge mai departe neatins.
 */
export function creeazaHandlerPlangere(deps: PlangereDeps = depsPlangere) {
  return async (ctx: BotContext, next: NextFunction): Promise<void> => {
    const fromId = ctx.from?.id;
    const asteptare = ctx.session?.plangere;
    const ruta = rutaPlangere({
      privat: ctx.chat?.type === 'private' && Boolean(fromId) && Boolean(ctx.message),
      asteptare,
      text: ctx.message?.text ?? ctx.message?.caption ?? null,
      nowMs: deps.now(),
    });
    if (ruta === 'mai_departe' || !fromId || !asteptare) return next();
    if (ruta === 'iesire') {
      ctx.session.plangere = undefined;
      return next();
    }
    try {
      await primestePlangerea(ctx, deps, fromId, asteptare);
    } catch (e) {
      console.error('[plangere/mesaj]', e instanceof Error ? e.message : e);
      await ctx.reply(textDupaCursa('plangereEsuata', asteptare.lang)).catch(() => {});
    }
  };
}
