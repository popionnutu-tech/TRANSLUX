import { InlineKeyboard, InputFile } from 'grammy';
import QRCode from 'qrcode';
import type { BotContext, Limba } from '../types.js';
import { repoBileteClienti, STARI_ACTIVE, type BiletQr, type ComandaClient, type RepoBileteClienti } from '../services/bileteClienti.js';
import { BUTOANE, buton, TELEFON_DISPECERAT } from './retur-texte.js';

// Clientul care vine din pagina biletului (ION-199, pasul E0): `/start bilet_<cod>`.
// Ramura stă ÎNAINTEA invitațiilor personalului: altfel payload-ul ajungea la validateInviteToken
// și clientul primea «Link de invitație invalid». Nu atinge `users` (rolurile personalului).
// ION-244: comanda se leagă de contul Telegram care a deschis-o primul (bilete_comenzi.telegram_id), iar sub bilet
// apare «Returnează biletul» (handlers/retur.ts). Legată de alt cont → biletul se arată, fără returnare.

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
  platita_fara_bilet: { ro: '⏳ Plata a sosit, biletul se emite', ru: '⏳ Оплата получена, билет оформляется' },
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
}): { text: string; url: string; buton: string } {
  const lang: 'ro' | 'ru' = c.lang === 'ru' ? 'ru' : 'ro';
  const stare = STARE[c.status]?.[lang] ?? c.status;
  const text = lang === 'ru'
    ? `🎫 Билет TRANSLUX\n${c.from_name} → ${c.to_name}\n${dataOra(c.departure_at, lang)} · мест: ${c.seats}\n${stare}`
    : `🎫 Bilet TRANSLUX\n${c.from_name} → ${c.to_name}\n${dataOra(c.departure_at, lang)} · locuri: ${c.seats}\n${stare}`;
  return {
    text,
    url: `${SITE}/${lang}/bilet/${c.cod}`,
    buton: lang === 'ru' ? 'Открыть билет (QR)' : 'Deschide biletul (QR)',
  };
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
  ro: `Biletul e legat de alt cont Telegram; returnarea o cere acel cont sau dispeceratul: ${TELEFON_DISPECERAT}.`,
  ru: `Билет привязан к другому аккаунту Telegram; возврат может запросить этот аккаунт или диспетчер: ${TELEFON_DISPECERAT}.`,
};

/** Legenda imaginii QR a unui loc (pur, testat). */
export function legendaQr(c: Pick<ComandaClient, 'from_name' | 'to_name' | 'departure_at'>, b: Pick<BiletQr, 'nr' | 'loc_nr'>, total: number, lang: Limba): string {
  const cand = new Date(c.departure_at).toLocaleString(lang === 'ru' ? 'ru-RU' : 'ro-RO', {
    timeZone: 'Europe/Chisinau', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const loc = b.loc_nr ?? b.nr;
  const dinTotal = total > 1 ? (lang === 'ru' ? ` (билет ${b.nr} из ${total})` : ` (biletul ${b.nr} din ${total})`) : '';
  return lang === 'ru'
    ? `🎫 ${c.from_name} → ${c.to_name}\n${cand}\nМесто ${loc}${dinTotal}\nПокажите этот код водителю при посадке.`
    : `🎫 ${c.from_name} → ${c.to_name}\n${cand}\nLocul ${loc}${dinTotal}\nArată acest cod șoferului la urcare.`;
}

async function trimiteQr(ctx: BotContext, c: ComandaClient, bilete: BiletQr[], lang: Limba): Promise<void> {
  const valide = bilete.filter((b) => b.status === 'valid');
  if (!valide.length) return;
  const poze = await Promise.all(valide.map(async (b) => ({
    b, png: await QRCode.toBuffer(b.cod_qr, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 600 }),
  })));
  if (poze.length === 1) {
    await ctx.replyWithPhoto(new InputFile(poze[0].png, 'bilet.png'), { caption: legendaQr(c, poze[0].b, 1, lang) });
    return;
  }
  await ctx.replyWithMediaGroup(poze.slice(0, 10).map(({ b, png }) => ({
    type: 'photo' as const, media: new InputFile(png, `bilet-${b.nr}.png`), caption: legendaQr(c, b, poze.length, lang),
  })));
}

export async function handleBiletStart(ctx: BotContext, cod: string, repo: RepoBileteClienti = repoBileteClienti): Promise<void> {
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
    const m = mesajBilet(comanda);
    const lang: Limba = comanda.lang === 'ru' ? 'ru' : 'ro';
    const kb = new InlineKeyboard().url(m.buton, m.url);
    if (aratReturnare(legare, comanda.status)) kb.row().text(buton(BUTOANE.returneaza, lang), `retur:cere:${comanda.cod}`);
    const textBilet = legare === 'alt_cont' ? `${m.text}\n\n${T_ALT_CONT[lang]}` : m.text;
    await ctx.reply(textBilet, { reply_markup: kb });
    // ION-248 (Ion, 05.10: «biletul trebuie QR codul odată cumpărat să apară și în telegram chat»): pe comanda proprie,
    // plătită, botul trimite în chat imaginea QR a fiecărui loc. Biletul altui cont — fără QR (codul e al pasagerului).
    if (aratReturnare(legare, comanda.status) && repo.bileteQr) {
      await trimiteQr(ctx, comanda, await repo.bileteQr(comanda.cod), lang).catch((e) => console.warn('[bilet/start] qr:', e instanceof Error ? e.message : e));
    }
    // Butonul de meniu (≡) implicit al botului e «Sarcini» (mini app-ul personalului, setat în BotFather; API-ul nu-l
    // poate schimba la nivel de bot). Clientul (nu personal, nu șofer) primește în chatul lui «🎫 Biletul meu», care
    // deschide pagina biletului cu QR (Ion, 05.10: «eu ca client nu am buton biletul meu»); biletul altui cont — comenzi.
    if (!ctx.dbUser && repo.esteSofer && !(await repo.esteSofer(fromId))) {
      // ION-248: «🎫 Bilete», și deschide doar biletul (`?doar=1`: cardul cu QR, fără restul paginii).
      const meniu = legare === 'alt_cont'
        ? { type: 'commands' as const }
        : { type: 'web_app' as const, text: lang === 'ru' ? '🎫 Билеты' : '🎫 Bilete', web_app: { url: `${m.url}?doar=1` } };
      await ctx.api.setChatMenuButton({ chat_id: ctx.chat.id, menu_button: meniu }).catch((e) => console.warn('[bilet/start] meniu:', e instanceof Error ? e.message : e));
    }
  } catch (e) {
    // Ramura clientului nu are voie să rupă botul personalului: jurnal + răspuns scurt.
    console.error('[bilet/start]', e instanceof Error ? e.message : e);
    await ctx.reply('Nu am putut afișa biletul acum. Încearcă peste un minut.\nНе удалось показать билет. Попробуйте через минуту.').catch(() => {});
  }
}
