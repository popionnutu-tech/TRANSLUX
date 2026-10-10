import { InlineKeyboard, InputFile } from 'grammy';
import QRCode from 'qrcode';
import { config } from '../config.js';
import type { BotContext, Limba } from '../types.js';
import { repoBileteClienti, STARI_ACTIVE, type BiletQr, type ComandaClient, type RepoBileteClienti } from '../services/bileteClienti.js';
import { BUTOANE, buton } from './retur-texte.js';
import { repoMesajeBilet, type RepoMesajeBilet } from '../services/bileteTelegram.js';
import { sincronizeazaFixarea } from '../services/fixareBilet.js';

// Clientul care vine din pagina biletului (ION-199, pasul E0): `/start bilet_<cod>`.
// Ramura stă ÎNAINTEA invitațiilor personalului: altfel payload-ul ajungea la validateInviteToken
// și clientul primea «Link de invitație invalid». Nu atinge `users` (rolurile personalului).
// ION-244: comanda se leagă de contul Telegram care a deschis-o primul (bilete_comenzi.telegram_id), iar sub bilet
// apare «Returnează biletul» (handlers/retur.ts). Legată de alt cont → biletul se arată, fără returnare.
// ION-251: biletul propriu, plătit = UN mesaj (imaginea + textul + butoanele), fixat în chat dacă e cel mai apropiat.

const COD_RE = /^bilet_([0-9a-f]{32})$/i;
const SITE = (process.env.SITE_URL || 'https://translux.md').replace(/\/+$/, '');

/** `bilet_<32 hex>` → codul în litere mici; altceva → null. Pur, testat. */
export function codDinPayload(payload: string | undefined | null): string | null {
  const m = COD_RE.exec(String(payload ?? '').trim());
  return m ? m[1].toLowerCase() : null;
}

const STARE: Record<string, { ro: string; ru: string }> = {
  platita: { ro: '✅ Plătit', ru: '✅ Оплачен' },
  noua: { ro: '⏳ În așteptarea plății', ru: '⏳ Ожидает оплаты' },
  platita_fara_bilet: { ro: '↩️ Plata a ajuns prea târziu: fără bilet, banii se întorc automat integral', ru: '↩️ Оплата пришла слишком поздно: без билета, деньги вернутся автоматически полностью' },
  anulata: { ro: 'Anulat', ru: 'Отменён' },
  returnata: { ro: 'Returnat', ru: 'Возвращён' },
  expirata: { ro: 'Plata nu a fost finalizată', ru: 'Оплата не завершена' },
  eroare_creare: { ro: 'Plata nu a putut fi pornită', ru: 'Не удалось начать оплату' },
};

function dataOra(iso: string, lang: 'ro' | 'ru'): string {
  return new Date(iso).toLocaleString(lang === 'ru' ? 'ru-RU' : 'ro-RO', {
    timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** Mesajul pentru client, pur (testat): textul și linkul paginii biletului. */
export function mesajBilet(c: {
  cod: string; status: string; lang: string | null; from_name: string; to_name: string; departure_at: string; seats: number;
  test?: boolean | null;
}): { text: string; url: string; buton: string } {
  const lang: 'ro' | 'ru' = c.lang === 'ru' ? 'ru' : 'ro';
  const stare = STARE[c.status]?.[lang] ?? c.status;
  const text = lang === 'ru'
    ? `🎫 Билет TRANSLUX\n${c.from_name} → ${c.to_name}\n${dataOra(c.departure_at, lang)} · мест: ${c.seats}\n${stare}`
    : `🎫 Bilet TRANSLUX\n${c.from_name} → ${c.to_name}\n${dataOra(c.departure_at, lang)} · locuri: ${c.seats}\n${stare}`;
  // Proba fizică (migr. 532): biletul de probă se vede din prima linie.
  const proba = c.test === true ? (lang === 'ru' ? '⚠️ ТЕСТОВЫЙ БИЛЕТ — НЕ ДЕЙСТВИТЕЛЕН ДЛЯ ПОСАДКИ\n' : '⚠️ BILET DE PROBĂ — NU E VALABIL LA URCARE\n') : '';
  return {
    text: proba + text,
    url: `${SITE}/${lang}/bilet/${c.cod}`,
    buton: lang === 'ru' ? 'Открыть билет (QR)' : 'Deschide biletul (QR)',
  };
}

/**
 * Mini app-ul clientului pe translux.md (ION-249): biletele contului, harta autobuzului, căutarea unui bilet nou.
 * URL stabil, fără cod: identitatea o dă initData-ul Telegram, verificat de panou. Pur, testat.
 */
export function urlMiniAppClient(lang: Limba): string {
  return `${SITE}/${lang}/telegram`;
}

export type Legare = 'al_meu' | 'alt_cont';

/** După legarea atomică: comanda e a acestui cont sau a altuia (atunci fără returnare). Pur, testat. */
export function decizieLegare(legatDe: number | null, fromId: number): Legare {
  return legatDe === fromId ? 'al_meu' : 'alt_cont';
}

/** Butonul «Returnează» apare doar pe comanda proprie, plătită (panoul hotărăște apoi suma sau refuzul). */
export function aratReturnare(legare: Legare, status: string): boolean {
  return legare === 'al_meu' && (STARI_ACTIVE as readonly string[]).includes(status);
}

const T_ALT_CONT = {
  ro: 'Biletul e legat de alt cont Telegram; returnarea o poate cere doar acel cont.',
  ru: 'Билет привязан к другому аккаунту Telegram; вернуть его может только этот аккаунт.',
};

/** Legenda imaginii unui loc: textul biletului (mesajBilet) + locul + îndemnul pentru urcare. Pur, testat. */
export function legendaBilet(
  c: Parameters<typeof mesajBilet>[0] & { going_north?: boolean },
  b: Pick<BiletQr, 'nr' | 'loc_nr'> | null,
  total: number,
  lang: Limba,
): string {
  const text = mesajBilet(c).text;
  if (!b) return text;
  // Ion, 10.10.2026: «de la nord la Chișinău să nu fie numerotarea locurilor în bilete, doar din Chișinău».
  const cuLoc = c.going_north === true && b.loc_nr != null;
  const dinTotal = total > 1 ? (lang === 'ru' ? `Билет ${b.nr} из ${total}` : `Biletul ${b.nr} din ${total}`) : '';
  const rand = cuLoc ? (lang === 'ru' ? `Место ${b.loc_nr}` : `Locul ${b.loc_nr}`) + (dinTotal ? ` (${dinTotal.toLowerCase()})` : '') : dinTotal;
  const jos = lang === 'ru' ? 'Покажите этот код водителю при посадке.' : 'Arată acest cod șoferului la urcare.';
  return [text, rand || null, jos].filter(Boolean).join('\n');
}

/** Butoanele biletului propriu, plătit: returnarea și harta autobuzului din mini app (ION-251). */
export function tastaturaBiletPropriu(cod: string, lang: Limba): InlineKeyboard {
  return new InlineKeyboard()
    .text(buton(BUTOANE.returneaza, lang), `retur:cere:${cod}`)
    .row()
    .webApp(buton(BUTOANE.undeAutobuz, lang), urlMiniAppClient(lang));
}

async function imagineDinPanou(cod: string, nr: number): Promise<Buffer | null> {
  try {
    const r = await fetch(`${config.adminBaseUrl}/api/bilete/public/${cod}/imagine?nr=${nr}`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/png')) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

/** ION-248: imaginea întreagă a biletului, desenată de panou; dacă panoul nu răspunde — doar QR-ul. */
export async function pozaLocului(cod: string, b: BiletQr): Promise<Buffer> {
  return (await imagineDinPanou(cod, b.nr))
    ?? QRCode.toBuffer(b.cod_qr, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 600 });
}

export async function locuriValabile(cod: string, repo: RepoBileteClienti): Promise<BiletQr[]> {
  if (!repo.bileteQr) return [];
  try {
    return (await repo.bileteQr(cod)).filter((b) => b.status === 'valid');
  } catch (e) {
    // Fără locuri citite biletul tot pleacă, ca text cu butoanele (rezerva de mai jos).
    console.warn('[bilet/start] locuri:', e instanceof Error ? e.message : e);
    return [];
  }
}

/** ION-266: pozele locurilor valabile, gata de trimis (fișier + locul), în ordinea locurilor; goală = fără loc valabil. */
export async function pozeleLocurilor(cod: string, repo: RepoBileteClienti): Promise<Array<{ b: BiletQr; fisier: InputFile }>> {
  const locuri = await locuriValabile(cod, repo);
  return Promise.all(locuri.map(async (b) => ({ b, fisier: new InputFile(await pozaLocului(cod, b), `bilet-${b.nr}.png`) })));
}

/**
 * ION-251 (Ion, 05.10: «biletul foto cu qr codul și returnează să fie tot un mesaj»): câte o imagine pe loc, legenda =
 * textul biletului, butoanele DOAR pe prima. Albumul nu poate avea butoane, deci imaginile pleacă una câte una.
 * Fără loc valabil (biletul se emite / locurile urcate) — textul biletului cu aceleași butoane. Întoarce id-ul primului
 * mesaj (cel care se fixează).
 */
async function trimiteBiletulPropriu(ctx: BotContext, c: ComandaClient, lang: Limba, repo: RepoBileteClienti): Promise<number> {
  const tastatura = tastaturaBiletPropriu(c.cod, lang);
  const locuri = await locuriValabile(c.cod, repo);
  if (!locuri.length) return (await ctx.reply(legendaBilet(c, null, 0, lang), { reply_markup: tastatura })).message_id;
  const poze = await Promise.all(locuri.map(async (b) => ({ b, png: await pozaLocului(c.cod, b) })));
  let primul: number | null = null;
  for (const { b, png } of poze) {
    const trimis = await ctx.replyWithPhoto(new InputFile(png, `bilet-${b.nr}.png`), {
      caption: legendaBilet(c, b, poze.length, lang),
      ...(primul == null ? { reply_markup: tastatura } : {}),
    });
    primul ??= trimis.message_id;
  }
  return primul as number;
}

/** Biletul altui cont sau neplătit: textul cu linkul paginii, fără QR și fără returnare (ca înainte de ION-251). */
async function trimiteBiletulInformativ(ctx: BotContext, c: ComandaClient, legare: Legare, lang: Limba): Promise<void> {
  const m = mesajBilet(c);
  const textBilet = legare === 'alt_cont' ? `${m.text}\n\n${T_ALT_CONT[lang]}` : m.text;
  await ctx.reply(textBilet, { reply_markup: new InlineKeyboard().url(m.buton, m.url) });
}

/** Mesajul nou devine al comenzii, apoi pinul contului se aduce la regulă. Nu rupe trimiterea biletului. */
async function inregistreazaSiFixeaza(ctx: BotContext, cod: string, telegramId: number, mesajId: number, mesaje: RepoMesajeBilet): Promise<void> {
  try {
    await mesaje.salveazaMesaj(cod, telegramId, mesajId);
    await sincronizeazaFixarea(telegramId, { repo: mesaje, api: ctx.api, nowMs: Date.now() });
  } catch (e) {
    console.warn('[bilet/start] pin:', e instanceof Error ? e.message : e);
  }
}

/** Butonul de meniu (≡) al clientului; personalul și șoferii își păstrează «Sarcini» / «🎫 Билеты». */
async function seteazaMeniulClientului(ctx: BotContext, fromId: number, legare: Legare, lang: Limba, repo: RepoBileteClienti): Promise<void> {
  // Butonul de meniu implicit al botului e «Sarcini» (mini app-ul personalului, setat în BotFather; API-ul nu-l poate
  // schimba la nivel de bot). ION-249 (Ion, 05.10: «ecran complet, harta cu unde e șoferul meu, căutare noi bilete»):
  // «🎫 Bilete» deschide mini app-ul clientului (toate biletele contului); biletul altui cont — comenzi.
  if (ctx.dbUser || !repo.esteSofer || (await repo.esteSofer(fromId)) || !ctx.chat) return;
  const meniu = legare === 'alt_cont'
    ? { type: 'commands' as const }
    : { type: 'web_app' as const, text: lang === 'ru' ? '🎫 Билеты' : '🎫 Bilete', web_app: { url: urlMiniAppClient(lang) } };
  await ctx.api.setChatMenuButton({ chat_id: ctx.chat.id, menu_button: meniu }).catch((e) => console.warn('[bilet/start] meniu:', e instanceof Error ? e.message : e));
}

export async function handleBiletStart(
  ctx: BotContext,
  cod: string,
  repo: RepoBileteClienti = repoBileteClienti,
  mesaje: RepoMesajeBilet = repoMesajeBilet,
): Promise<void> {
  if (ctx.chat?.type !== 'private') return;
  const fromId = ctx.from?.id;
  if (!fromId) return;
  try {
    const comanda = await repo.comandaDupaCod(cod);
    if (!comanda) {
      await ctx.reply('Biletul nu a fost găsit. Verifică linkul din pagina biletului.\nБилет не найден. Проверьте ссылку со страницы билета.');
      return;
    }
    // ION-244, pasul 1: linkul cu codul (secret) e dovada; «primul venit» leagă comanda de contul lui.
    const legatDe = comanda.telegram_id ?? (await repo.leagaComanda(cod, fromId));
    const legare = decizieLegare(legatDe, fromId);
    const lang: Limba = comanda.lang === 'ru' ? 'ru' : 'ro';
    if (aratReturnare(legare, comanda.status)) {
      const mesajId = await trimiteBiletulPropriu(ctx, comanda, lang, repo);
      await inregistreazaSiFixeaza(ctx, comanda.cod, fromId, mesajId, mesaje);
    } else {
      await trimiteBiletulInformativ(ctx, comanda, legare, lang);
    }
    await seteazaMeniulClientului(ctx, fromId, legare, lang, repo);
  } catch (e) {
    // Ramura clientului nu are voie să rupă botul personalului: jurnal + răspuns scurt.
    console.error('[bilet/start]', e instanceof Error ? e.message : e);
    await ctx.reply('Nu am putut afișa biletul acum. Încearcă peste un minut.\nНе удалось показать билет. Попробуйте через минуту.').catch(() => {});
  }
}
