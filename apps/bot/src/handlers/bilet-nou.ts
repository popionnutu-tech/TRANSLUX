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
// pe prima, id-ul primului mesaj pe comandă, fixat sus, butonul de meniu «🎫 Bilete».
//
// ION-274 («Telegram ultrafast» P10): livrarea pleacă la EVENIMENT (panoul cheamă /bilete/v1/livreaza după plată; jobul
// rămâne plasa de siguranță) și NU se dublează: comanda se revendică atomic în bază înainte de trimitere
// (telegram_livrare_la, migr. 516), iar după trimitere se scrie telegram_livrat_la — separat de telegram_mesaj_id, pe care
// botul îl golește când clientul șterge mesajul (biletul șters NU se retrimite automat). Un singur helper, `livreazaBiletul`,
// folosit de job, de endpoint și de /start.

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

export interface BilantBiletNou { trimise: number; erori: number; sarite: number }

/** Comanda e de livrat automat: plătită, cu cont legat, nelivrată încă (ambele marcaje goale în fereastra de tranziție 516). Pur. */
export function esteDeLivrat(c: Pick<ComandaClient, 'status' | 'telegram_id'> & { telegram_livrat_la?: string | null; telegram_mesaj_id?: number | null }): boolean {
  return c.status === 'platita' && Boolean(c.telegram_id) && !c.telegram_livrat_la && c.telegram_mesaj_id == null;
}

export interface RezultatTrimitere { mesajId: number; esuate: number }

/**
 * Biletul propriu, plătit, trimis prin API (fără context de chat). Câte o poză pe loc; dacă PRIMA pică se aruncă (nimic în
 * chat); dacă pică una din următoarele, se reîncearcă o dată pe loc și se întoarce numărul locurilor rămase netrimise —
 * biletul E în chat (primul mesaj), clientul primește restul la /start.
 */
export async function trimiteBiletulPrinApi(api: ApiBiletNou, chatId: number, c: ComandaClient, lang: Limba, repo: RepoBileteClienti): Promise<RezultatTrimitere> {
  const tastatura = tastaturaBiletPropriu(c.cod, lang);
  const poze = await pozeleLocurilor(c.cod, repo);
  if (!poze.length) return { mesajId: (await api.sendMessage(chatId, legendaBilet(c, null, 0, lang), { reply_markup: tastatura })).message_id, esuate: 0 };
  let primul: number | null = null;
  let esuate = 0;
  for (const { b, fisier } of poze) {
    const extra: { caption: string; reply_markup?: InlineKeyboard } = { caption: legendaBilet(c, b, poze.length, lang), ...(primul == null ? { reply_markup: tastatura } : {}) };
    try {
      const id = (await api.sendPhoto(chatId, fisier, extra)).message_id;
      primul ??= id;
    } catch (e) {
      if (primul == null) throw e; // nimic în chat încă: eșec întreg, revendicarea se anulează
      try { await api.sendPhoto(chatId, fisier, extra); } catch { esuate++; }
    }
  }
  return { mesajId: primul as number, esuate };
}

export type RezultatLivrare = 'livrat' | 'in_curs' | 'fara_cont' | 'deja_livrat';

/**
 * Livrarea automată a unui bilet: revendică → trimite → marchează livrat (sau anulează revendicarea). «in_curs» = altcineva
 * (jobul, endpoint-ul, altă instanță) o trimite chiar acum; «deja_livrat» = telegram_livrat_la e pus.
 */
export async function livreazaBiletul(c: ComandaClient, deps: DepsBiletNou): Promise<RezultatLivrare> {
  const jurnal = deps.jurnal ?? ((m: string) => console.warn(m));
  if (!c.telegram_id) return 'fara_cont';
  if (c.telegram_livrat_la) return 'deja_livrat';
  const chatId = c.telegram_id;
  const lang: Limba = c.lang === 'ru' ? 'ru' : 'ro';
  if (!(await deps.mesaje.revendicaLivrarea(c.cod, deps.nowMs))) return 'in_curs';
  let r: RezultatTrimitere;
  try {
    r = await trimiteBiletulPrinApi(deps.api, chatId, c, lang, deps.repo);
  } catch (e) {
    await deps.mesaje.anuleazaRevendicarea(c.cod).catch(() => undefined);
    throw e;
  }
  await deps.mesaje.marcheazaLivrat(c.cod, chatId, r.mesajId);
  if (r.esuate) jurnal(`[bilete/noi] ${c.cod.slice(0, 8)}: ${r.esuate} loc(uri) netrimise după reîncercare — clientul le primește la /start`);
  // Pinul și meniul nu au voie să rupă livrarea: biletul a plecat, restul doar în jurnal.
  await sincronizeazaFixarea(chatId, { repo: deps.mesaje, api: deps.api, nowMs: deps.nowMs })
    .catch((e) => jurnal(`[bilete/noi] ${c.cod.slice(0, 8)} pin: ${e instanceof Error ? e.message : String(e)}`));
  if (!deps.repo.esteSofer || !(await deps.repo.esteSofer(chatId).catch(() => false))) {
    await deps.api.setChatMenuButton({ chat_id: chatId, menu_button: { type: 'web_app', text: lang === 'ru' ? '🎫 Билеты' : '🎫 Bilete', web_app: { url: urlMiniAppClient(lang) } } })
      .catch((e) => jurnal(`[bilete/noi] ${c.cod.slice(0, 8)} meniu: ${e instanceof Error ? e.message : String(e)}`));
  }
  return 'livrat';
}

/** Jobul «Bilete noi» (și endpoint-ul livreaza, prin același zăvor): toate comenzile de livrat, una după alta. */
export async function trimiteBileteleNoi(deps: DepsBiletNou): Promise<BilantBiletNou> {
  const jurnal = deps.jurnal ?? ((m: string) => console.warn(m));
  const bilant: BilantBiletNou = { trimise: 0, erori: 0, sarite: 0 };
  const lista = deps.repo.comenziPlatiteFaraMesaj ? await deps.repo.comenziPlatiteFaraMesaj(deps.nowMs) : [];
  for (const c of lista) {
    if (!esteDeLivrat(c)) { bilant.sarite++; continue; }
    try {
      const r = await livreazaBiletul(c, deps);
      if (r === 'livrat') bilant.trimise++; else bilant.sarite++;
    } catch (e) {
      bilant.erori++;
      jurnal(`[bilete/noi] ${c.cod.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return bilant;
}
