import type { InlineKeyboardMarkup } from 'grammy/types';
import type { BotContext, Limba } from '../types.js';
import { repoDupaCursa, type ComandaFinal, type FeedbackClient, type RepoDupaCursa } from '../services/dupaCursa.js';
import { BUTOANE_DUPA_CURSA, textDupaCursa, textMultumire } from './dupa-cursa-texte.js';
import { incepePlangerea } from './plangere.js';
import { limbaDin } from './retur.js';

// ION-252 (Ion, 05.10: «2. super»): la sfârșitul cursei (sosirea din grafic + 30 min) clientul primește O DATĂ
// «Mulțumim că ai călătorit cu TRANSLUX!» cu «👍 Totul a fost bine» / «👎 Am o plângere». 👍 → mulțumim + feedback-ul pe
// comandă; 👎 → feedback-ul + «scrie-ne ce s-a întâmplat» (plangere.ts). `telegram_id` la butoane se ia DOAR din
// `ctx.from` (callbackQuery.from), iar comanda din callback_data trebuie să fie legată de acest cont.

const PLATITA = 'platita';
const COD_RE = /^[0-9a-f]{32}$/;

// ── Mesajul de după cursă (tick) ─────────────────────────────────────────────────────────────────

/** Butoanele de sub mesaj: `final:bine:<cod>` / `final:plangere:<cod>` (47 de octeți, sub limita de 64). */
export function tastaturaDupaCursa(cod: string, lang: Limba): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: BUTOANE_DUPA_CURSA.bine[lang], callback_data: `final:bine:${cod}` }],
      [{ text: BUTOANE_DUPA_CURSA.plangere[lang], callback_data: `final:plangere:${cod}` }],
    ],
  };
}

/** Mesajul de după cursă al unei comenzi: textul în limba comenzii și butoanele. Pur, testat. */
export function mesajDupaCursa(c: Pick<ComandaFinal, 'cod' | 'lang' | 'from_name' | 'to_name' | 'departure_at'>): { text: string; reply_markup: InlineKeyboardMarkup } {
  const lang: Limba = c.lang === 'ru' ? 'ru' : 'ro';
  return { text: textMultumire(c, lang), reply_markup: tastaturaDupaCursa(c.cod, lang) };
}

/** Partea din Bot API de care are nevoie mesajul (grammY `Api` o satisface). */
export interface ApiDupaCursa {
  sendMessage(chatId: number, text: string, other?: { reply_markup?: InlineKeyboardMarkup }): Promise<unknown>;
}

export interface DepsDupaCursa {
  repo: RepoDupaCursa;
  api: ApiDupaCursa;
  nowMs: number;
  /** După trimitere: pinul contului se aduce la regulă pe loc (biletul încheiat nu mai stă fixat 15 minute). */
  dupaTrimitere?: (telegramId: number) => Promise<unknown>;
  jurnal?: (mesaj: string) => void;
}

export interface BilantDupaCursa { trimise: number; erori: number }

/**
 * Tickul: comenzile cu cursa încheiată, fiecare cu mesajul ei; marcajul în bază abia după trimiterea reușită. O comandă
 * căzută (botul blocat de client) nu le oprește pe celelalte.
 */
export async function trimiteMesajeleDupaCursa(deps: DepsDupaCursa): Promise<BilantDupaCursa> {
  const jurnal = deps.jurnal ?? ((m: string) => console.warn(m));
  const bilant: BilantDupaCursa = { trimise: 0, erori: 0 };
  for (const c of await deps.repo.comenziPentruFinal(deps.nowMs)) {
    try {
      const m = mesajDupaCursa(c);
      await deps.api.sendMessage(c.telegram_id, m.text, { reply_markup: m.reply_markup });
      await deps.repo.marcheazaFinalTrimis(c.cod);
      bilant.trimise++;
    } catch (e) {
      bilant.erori++;
      jurnal(`[bilete/dupa-cursa] ${c.cod.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (deps.dupaTrimitere) {
      await deps.dupaTrimitere(c.telegram_id)
        .catch((e) => jurnal(`[bilete/dupa-cursa] pin ${c.telegram_id}: ${e instanceof Error ? e.message : String(e)}`));
    }
  }
  return bilant;
}

// ── Butoanele 👍 / 👎 ─────────────────────────────────────────────────────────────────────────────

export interface CallbackDupaCursa { actiune: FeedbackClient; cod: string }

/** `final:bine:<cod>` / `final:plangere:<cod>` → acțiunea; orice altă formă → null. Pur, testat. */
export function parseazaCallbackDupaCursa(data: string | undefined): CallbackDupaCursa | null {
  const m = /^final:(bine|plangere):(.+)$/.exec(data ?? '');
  if (!m || !COD_RE.test(m[2])) return null;
  return { actiune: m[1] as FeedbackClient, cod: m[2] };
}

export interface DepsCallbackDupaCursa {
  repo: RepoDupaCursa;
  now: () => number;
}

export const depsCallbackDupaCursa: DepsCallbackDupaCursa = { repo: repoDupaCursa, now: Date.now };

async function scoateButoanele(ctx: BotContext): Promise<void> {
  await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => {});
}

/** Feedback-ul e o informație în plus: o bază căzută nu oprește răspunsul clientului (doar se scrie în jurnal). */
async function scrieFeedbackFaraBlocare(deps: DepsCallbackDupaCursa, p: { cod: string; fromId: number; feedback: FeedbackClient }): Promise<void> {
  await deps.repo.scrieFeedback(p.cod, p.fromId, p.feedback)
    .catch((e) => console.error(`[dupa-cursa] feedback ${p.cod.slice(0, 8)}: ${e instanceof Error ? e.message : e}`));
}

async function laButon(ctx: BotContext, deps: DepsCallbackDupaCursa, fromId: number, cb: CallbackDupaCursa): Promise<void> {
  const comanda = await deps.repo.comandaPentruFeedback(cb.cod);
  const lang = limbaDin(comanda?.lang, ctx.from?.language_code);
  if (!comanda || Number(comanda.telegram_id) !== fromId || comanda.status !== PLATITA) {
    await ctx.answerCallbackQuery({ text: textDupaCursa('nuEBiletulTau', lang) });
    return;
  }
  await ctx.answerCallbackQuery();
  await scoateButoanele(ctx);
  await scrieFeedbackFaraBlocare(deps, { cod: cb.cod, fromId, feedback: cb.actiune });
  if (cb.actiune === 'bine') {
    await ctx.reply(textDupaCursa('bine', lang));
    return;
  }
  await incepePlangerea(ctx, { cod: cb.cod, lang }, deps.now());
}

export function creeazaHandlerCallbackDupaCursa(deps: DepsCallbackDupaCursa = depsCallbackDupaCursa) {
  return async (ctx: BotContext): Promise<void> => {
    const cb = parseazaCallbackDupaCursa(ctx.callbackQuery?.data);
    const fromId = ctx.from?.id;
    if (!cb || !fromId) {
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }
    try {
      await laButon(ctx, deps, fromId, cb);
    } catch (e) {
      console.error('[dupa-cursa/callback]', e instanceof Error ? e.message : e);
      await ctx.answerCallbackQuery().catch(() => {});
      // 👍 nu cere nimic de la client: mulțumim oricum. 👎 fără bază → clientul află că plângerea n-a putut fi primită.
      const cheie = cb.actiune === 'bine' ? 'bine' : 'plangereEsuata';
      await ctx.reply(textDupaCursa(cheie, limbaDin(ctx.from?.language_code))).catch(() => {});
    }
  };
}
