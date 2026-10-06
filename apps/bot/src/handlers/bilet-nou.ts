import type { InlineKeyboardMarkup, MenuButton } from 'grammy/types';
import type { InlineKeyboard, InputFile } from 'grammy';
import type { Limba } from '../types.js';
import { type ComandaClient, type RepoBileteClienti } from '../services/bileteClienti.js';
import type { RepoMesajeBilet } from '../services/bileteTelegram.js';
import { sincronizeazaFixarea, type ApiFixare } from '../services/fixareBilet.js';
import { pozeleLocurilor, legendaBilet, tastaturaBiletPropriu, urlMiniAppClient } from './bilet.js';

// ION-266 (Ion, 06.10: «cum ar fi să fi fost cumpărat din Telegram — în așa caz biletul deodată trebuia să apară»).
// Comanda cumpărată din mini app (ION-249) e legată de cont din prima clipă, dar biletul ajungea în chat doar la
// `/start bilet_<cod>`. Jobul de un minut trimite singur biletul plătit, exact ca la /start: câte o poză pe loc, butoanele
// pe prima, id-ul primului mesaj pe comandă, fixat sus, butonul de meniu «🎫 Bilete». Tot el reia trimiterea picată la
// /start (telegram_id pus, mesaj lipsă).

export interface ApiBiletNou extends ApiFixare {
  sendPhoto(chatId: number, photo: InputFile, other?: { caption?: string; reply_markup?: InlineKeyboardMarkup | InlineKeyboard }): Promise<{ message_id: number }>;
  sendMessage(chatId: number, text: string, other?: { reply_markup?: InlineKeyboardMarkup | InlineKeyboard }): Promise<{ message_id: number }>;
  setChatMenuButton(other: { chat_id: number; menu_button: MenuButton }): Promise<unknown>;
}

export interface DepsBiletNou {
  repo: RepoBileteClienti;
  mesaje: RepoMesajeBilet;
  api: ApiBiletNou;
  nowMs: number;
  jurnal?: (mesaj: string) => void;
}

export interface BilantBiletNou { trimise: number; erori: number }

/** Biletul propriu, plătit, trimis prin API (fără context de chat): întoarce id-ul primului mesaj. */
export async function trimiteBiletulPrinApi(api: ApiBiletNou, chatId: number, c: ComandaClient, lang: Limba, repo: RepoBileteClienti): Promise<number> {
  const tastatura = tastaturaBiletPropriu(c.cod, lang);
  const poze = await pozeleLocurilor(c.cod, repo);
  if (!poze.length) return (await api.sendMessage(chatId, legendaBilet(c, null, 0, lang), { reply_markup: tastatura })).message_id;
  let primul: number | null = null;
  for (const { b, fisier } of poze) {
    const trimis = await api.sendPhoto(chatId, fisier, {
      caption: legendaBilet(c, b, poze.length, lang),
      ...(primul == null ? { reply_markup: tastatura } : {}),
    });
    primul ??= trimis.message_id;
  }
  return primul as number;
}

export async function trimiteBileteleNoi(deps: DepsBiletNou): Promise<BilantBiletNou> {
  const jurnal = deps.jurnal ?? ((m: string) => console.warn(m));
  const bilant: BilantBiletNou = { trimise: 0, erori: 0 };
  const lista = deps.repo.comenziPlatiteFaraMesaj ? await deps.repo.comenziPlatiteFaraMesaj(deps.nowMs) : [];
  for (const c of lista) {
    if (!c.telegram_id) continue;
    const chatId = c.telegram_id;
    const lang: Limba = c.lang === 'ru' ? 'ru' : 'ro';
    try {
      const mesajId = await trimiteBiletulPrinApi(deps.api, chatId, c, lang, deps.repo);
      await deps.mesaje.salveazaMesaj(c.cod, chatId, mesajId);
      bilant.trimise++;
      // Pinul și meniul nu au voie să rupă trimiterea: biletul a plecat, restul doar în jurnal.
      await sincronizeazaFixarea(chatId, { repo: deps.mesaje, api: deps.api, nowMs: deps.nowMs })
        .catch((e) => jurnal(`[bilete/noi] ${c.cod.slice(0, 8)} pin: ${e instanceof Error ? e.message : String(e)}`));
      if (!deps.repo.esteSofer || !(await deps.repo.esteSofer(chatId).catch(() => false))) {
        await deps.api.setChatMenuButton({ chat_id: chatId, menu_button: { type: 'web_app', text: lang === 'ru' ? '🎫 Билеты' : '🎫 Bilete', web_app: { url: urlMiniAppClient(lang) } } })
          .catch((e) => jurnal(`[bilete/noi] ${c.cod.slice(0, 8)} meniu: ${e instanceof Error ? e.message : String(e)}`));
      }
    } catch (e) {
      bilant.erori++;
      jurnal(`[bilete/noi] ${c.cod.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return bilant;
}
