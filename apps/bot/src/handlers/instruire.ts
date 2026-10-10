import { randomInt } from 'node:crypto';
import { InlineKeyboard, type Api, type Context } from 'grammy';
import { config } from '../config.js';
import { getSupabase } from '../supabase.js';
import { escapeHtml, getAdminChatIds } from '../services/adminAlert.js';
import { soferLegat } from './bilete-azi.js';

// Instruirea șoferilor la biletele online (Ion, 10.10.2026; plan docs/plans/2026-10-10-instruire-bilete-soferi.md).
// Iurie (DIGITAL) are pe claude.ai un artifact cu un card pe șofer: bifele punctelor de mai jos și codul QR al
// șoferului, `t.me/<bot>?start=instruit_<driver_id>`. Șoferul scanează codul lângă Iurie:
//  * e legat cu acest Telegram → primește punctele și «✅ Подтверждаю»; confirmarea se scrie în
//    driver_instruire_bilete (migr. 545) și pleacă la Iurie și la Ion (Ion, 10.10: «confirmarea și la mine»);
//  * nu e legat / e refuzat la legarea prin telefon / și-a schimbat Telegram-ul → cerere de legare la Iurie (Ion, 10.10:
//    «Iurie leagă singur din bot»), cu un cod de 4 cifre pe ecranul șoferului pe care Iurie îl compară cu cel din
//    cerere — numele din Telegram îl alege oricine, codul de pe telefonul din fața lui nu;
//  * e legat ca alt șofer → refuz.
// Cererea (driver_legare_cereri) expiră în 15 min, se folosește o singură dată și leagă doar dacă șoferul are încă
// Telegram-ul din momentul cererii.

/** Versiunea punctelor: crește când se schimbă textul; confirmările vechi nu mai contează (artifactul o știe și el). */
export const PUNCTE_VERSIUNE = 1;
/** Iurie (users, rol DIGITAL) — după id, nu după rol: mai sunt și alți DIGITAL. */
export const IURIE_USER_ID = '34936fff-947e-4328-bcd9-7c99ceefe176';
export const CERERE_VALABILA_MIN = 15;
export const CERERI_PE_ZI = 3;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const RE_START = new RegExp(`^instruit_(${UUID})$`, 'i');
export const RE_CONFIRMA = new RegExp(`^instr:ok:(${UUID})$`);
export const RE_DECIZIE = new RegExp(`^lg(no)?:(${UUID})$`);

/** `instruit_<uuid>` → uuid (litere mici); orice altceva → null. */
export function soferDinStartInstruit(payload: string | undefined | null): string | null {
  const m = RE_START.exec(String(payload ?? '').trim());
  return m ? m[1].toLowerCase() : null;
}

export type DecizieInstruit = 'confirma' | 'alt_sofer' | 'cerere';

/** Ce face scanarea codului șoferului `driverId` de pe Telegram-ul `fromId`. */
export function deciziaInstruit(sofer: { id: string; telegram_id: number | null }, fromId: number, fromLegatDe: string | null): DecizieInstruit {
  if (sofer.telegram_id === fromId) return 'confirma';
  if (fromLegatDe && fromLegatDe !== sofer.id) return 'alt_sofer';
  return 'cerere';
}

/** Numele din Telegram, sigur de pus în mesajul lui Iurie: fără caractere de control / bidi, scurt, escapat. */
export function numeTgSigur(s: string | null | undefined, max = 40): string {
  // eslint-disable-next-line no-control-regex
  const curat = String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, '').trim();
  return escapeHtml(curat.length > max ? `${curat.slice(0, max)}…` : curat) || '—';
}

export function codNou(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}

/** Rezultatul unui update de legare condiționat de Telegram-ul vechi (0 rânduri = s-a schimbat între timp). */
export function rezultatLegare(error: { message: string } | null, randuri: unknown[] | null): 'ok' | 'alt_sofer' | 'schimbat' | 'eroare' {
  if (error) return /drivers_telegram_id_uniq|duplicate key/i.test(error.message) ? 'alt_sofer' : 'eroare';
  return randuri && randuri.length ? 'ok' : 'schimbat';
}

// Punctele, aceleași ca în artifactul lui Iurie (versiunea PUNCTE_VERSIUNE). RU pentru șofer, RO în italic.
export const PUNCTE: ReadonlyArray<[ru: string, ro: string]> = [
  ['Смартфон с интернетом и Telegram.', 'Smartphone cu internet și Telegram.'],
  ['Telegram привязан: без этого рейс не продаётся онлайн. Пассажиры видны только водителю из графика — если диспетчер поменял водителя, список переходит к новому. «Нет пассажиров» → звоните диспетчеру.',
    'Telegram legat: fără el cursa nu se vinde online. Pasagerii apar doar la șoferul din grafic; «nu-mi apar pasagerii» → sună dispecerul.'],
  ['«🎫 Мои билеты» — кнопка меню или /bilete.', '«🎫 Biletele mele» — butonul de meniu sau /bilete.'],
  ['Список: рейсы дня, пассажиры по остановкам, место, телефон (нажать = позвонить).', 'Lista: cursele zilei, pasagerii pe opriri, locul, telefonul (apăsat = sună).'],
  ['Сканирование: «Сканировать» → камера на QR-код (можно с бумаги или скриншота).', 'Scanarea: «Scanează» → camera pe codul QR (merge și de pe hârtie sau captură).'],
  ['Зелёный — садится. Красный — нет (уже сканирован / другой рейс / отменён / неизвестный код). Оранжевый — кода нет в скачанном списке и нет интернета: садится, проверка потом. Откройте приложение с интернетом после закрытия продажи (за 2 часа до отправления). Красная строка позже = билет отклонён → скажите диспетчеру.',
    'Verde = urcă. Roșu = nu urcă. Portocaliu = codul nu e în lista descărcată și nu e internet: urcă, se verifică după. Deschide aplicația cu internet la 2 h înainte de plecare. Rând roșu mai târziu = respins → spune dispecerului.'],
  ['Место онлайн-пассажира забронировано: при посадке продавайте только свободные места на схеме «Места». У каждого места свой код — семья из 3 = 3 сканирования.',
    'Locul pasagerului online e rezervat: vinde doar ce harta «Locuri» arată liber. Fiecare loc are codul lui — 3 locuri = 3 scanări.'],
  ['Билет оплачен заранее: денег не берёте; чек на TIKI — «онлайн / другой способ оплаты».', 'Biletul e plătit dinainte: nu iei bani; bon pe TIKI «online / altă metodă de plată».'],
  ['Без QR-кода по онлайн-билету не садится (может купить билет у водителя). Несканированный остаётся в «К посадке» на своей остановке — позвоните ему.',
    'Fără QR nu urcă pe biletul online (poate cumpăra de la șofer). Nescanatul rămâne în «De urcat» la oprirea lui — sună-l.'],
  ['Возвращённый билет исчезает из списка; при сканировании — «отменён».', 'Biletul returnat dispare din listă; la scanare iese «anulat».'],
];

export function textPuncte(nume: string): string {
  return [
    `📋 <b>${escapeHtml(nume)}</b>, онлайн-билеты — что нужно знать (v${PUNCTE_VERSIUNE}):`,
    '',
    ...PUNCTE.map(([ru, ro], i) => `${i + 1}. ${ru}\n<i>${ro}</i>`),
    '',
    'Если Юрий всё это вам показал — нажмите кнопку ниже.',
    '<i>Dacă Iurie ți-a arătat toate acestea — apasă butonul de jos.</i>',
  ].join('\n');
}

const T = {
  codInvalid: '⚠️ Код не действителен. / <i>Codul nu e valabil.</i>',
  altSofer: '⚠️ Этот код для другого водителя. / <i>Codul e pentru alt șofer.</i>',
  prea: '⚠️ Слишком много запросов сегодня. Обратитесь к Юрию завтра. / <i>Prea multe cereri azi.</i>',
  dejaCerere: '⏳ Запрос уже у Юрия — покажите ему код из прошлого сообщения. / <i>Cererea e deja la Iurie — arată-i codul din mesajul de mai sus.</i>',
  arataCod: (cod: string) => `🔐 Покажите Юрию код: <b>${cod}</b>\n<i>Arată-i lui Iurie codul: <b>${cod}</b></i>`,
  butonConfirma: '✅ Подтверждаю: меня обучили / Confirm',
  multumim: '✅ Спасибо! Подтверждение отправлено. / <i>Mulțumim! Confirmarea a plecat.</i>',
  dejaConfirmat: '✅ Уже подтверждено. / <i>Deja confirmat.</i>',
  nuPentruTine: 'Эта кнопка не для вас.',
  refuzat: '⚠️ Юрий отклонил привязку. / <i>Iurie a refuzat legarea.</i>',
  legat: (nume: string) => `✅ <b>${escapeHtml(nume)}</b>, ваш Telegram привязан. / <i>Telegram-ul tău e legat.</i>`,
  vechi: (nume: string) => `⚠️ Этот Telegram больше не привязан к водителю ${escapeHtml(nume)}. Если это не вы просили — звоните диспетчеру.\n<i>Telegram-ul tău nu mai e legat de ${escapeHtml(nume)}. Dacă nu tu ai cerut, sună dispecerul.</i>`,
  reincearca: '⚠️ Данные изменились, попробуйте ещё раз. / <i>S-a schimbat ceva între timp, încearcă din nou.</i>',
};

function tastaturaConfirma(driverId: string): InlineKeyboard {
  return new InlineKeyboard().text(T.butonConfirma, `instr:ok:${driverId}`);
}

async function telegramIurie(): Promise<number | null> {
  const { data } = await getSupabase().from('users').select('telegram_id').eq('id', IURIE_USER_ID).eq('active', true).maybeSingle();
  return (data?.telegram_id as number | null | undefined) ?? null;
}

/** Iurie + adminii activi: cei care pot aproba legarea și primesc confirmările. */
async function aprobatori(): Promise<Set<number>> {
  const s = await getAdminChatIds();
  const iurie = await telegramIurie();
  if (iurie) s.add(Number(iurie));
  return s;
}

async function trimite(api: Api, chat: number, text: string, extra: Record<string, unknown> = {}): Promise<void> {
  try {
    await api.sendMessage(chat, text, { parse_mode: 'HTML', ...extra });
  } catch (e) {
    console.error(`[instruire] trimitere la ${chat}:`, e);
  }
}

async function puneMeniulPe(api: Api, chat: number): Promise<void> {
  try {
    await api.setChatMenuButton({ chat_id: chat, menu_button: { type: 'web_app', text: '🎫 Билеты', web_app: { url: config.miniAppBileteUrl } } });
  } catch (e) {
    console.error('[instruire] setChatMenuButton:', e);
  }
}

interface SoferRand { id: string; full_name: string; telegram_id: number | null; active: boolean }

async function soferul(id: string): Promise<SoferRand | null> {
  const { data } = await getSupabase().from('drivers').select('id, full_name, telegram_id, active').eq('id', id).maybeSingle();
  return (data as SoferRand | null) ?? null;
}

/** `/start instruit_<driver_id>` (doar privat). */
export async function handleInstruitStart(ctx: Context, driverId: string): Promise<void> {
  if (ctx.chat?.type !== 'private') return;
  const fromId = ctx.from?.id;
  if (!fromId) return;
  const sofer = await soferul(driverId);
  if (!sofer || !sofer.active) {
    await ctx.reply(T.codInvalid, { parse_mode: 'HTML' });
    return;
  }
  const legatDe = await soferLegat(fromId);
  const d = deciziaInstruit({ id: sofer.id, telegram_id: sofer.telegram_id == null ? null : Number(sofer.telegram_id) }, fromId, legatDe?.id ?? null);
  if (d === 'confirma') {
    await ctx.reply(textPuncte(sofer.full_name), { parse_mode: 'HTML', reply_markup: tastaturaConfirma(sofer.id) });
    return;
  }
  if (d === 'alt_sofer') {
    await ctx.reply(T.altSofer, { parse_mode: 'HTML' });
    return;
  }

  const sb = getSupabase();
  const acum = new Date();
  // Cererile vechi ale acestui șofer și ale acestui Telegram ies din «asteapta»; jurnalul rămâne.
  await sb.from('driver_legare_cereri').update({ stare: 'expirat' })
    .eq('stare', 'asteapta').lt('expira_la', acum.toISOString()).or(`driver_id.eq.${sofer.id},telegram_id.eq.${fromId}`);
  const { count } = await sb.from('driver_legare_cereri').select('id', { count: 'exact', head: true })
    .eq('telegram_id', fromId).gte('creat_la', new Date(acum.getTime() - 24 * 3600_000).toISOString());
  if ((count ?? 0) >= CERERI_PE_ZI) {
    await ctx.reply(T.prea, { parse_mode: 'HTML' });
    return;
  }
  const cod = codNou();
  const numeTg = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') + (ctx.from?.username ? ` @${ctx.from.username}` : '');
  const { data: cerere, error } = await sb.from('driver_legare_cereri').insert({
    driver_id: sofer.id,
    telegram_id: fromId,
    telegram_vechi: sofer.telegram_id,
    nume_tg: numeTg.slice(0, 100),
    cod,
    expira_la: new Date(acum.getTime() + CERERE_VALABILA_MIN * 60_000).toISOString(),
  }).select('id').single();
  if (error || !cerere) {
    if (error?.code === '23505') await ctx.reply(T.dejaCerere, { parse_mode: 'HTML' });
    else {
      console.error('[instruire] cerere:', error?.message);
      await ctx.reply(T.reincearca, { parse_mode: 'HTML' });
    }
    return;
  }
  await ctx.reply(T.arataCod(cod), { parse_mode: 'HTML' });

  const iurie = (await telegramIurie()) ?? null;
  const catre = iurie ? [Number(iurie)] : [...(await getAdminChatIds())];
  const text = [
    `🔗 <b>Leagă ${escapeHtml(sofer.full_name)}</b> de acest Telegram?`,
    `Telegram: ${numeTgSigur(numeTg)}`,
    `Cod pe ecranul șoferului: <b>${cod}</b> — verifică-l pe telefonul din fața ta.`,
    ...(sofer.telegram_id != null ? ['⚠️ <b>ÎNLOCUIEȘTE Telegram-ul legat acum</b> de acest șofer.'] : []),
    `<i>Valabil ${CERERE_VALABILA_MIN} min.</i>`,
  ].join('\n');
  const kb = new InlineKeyboard().text('✅ Leagă', `lg:${cerere.id}`).text('✖️ Refuză', `lgno:${cerere.id}`);
  for (const chat of catre) await trimite(ctx.api, chat, text, { reply_markup: kb });
}

interface CerereRand { id: string; driver_id: string; telegram_id: number; telegram_vechi: number | null; stare: string; expira_la: string }

/** `lg:<cerere>` / `lgno:<cerere>`: doar Iurie sau un admin. */
export async function handleDecizieLegare(ctx: Context): Promise<void> {
  const m = RE_DECIZIE.exec(ctx.callbackQuery?.data ?? '');
  await ctx.answerCallbackQuery().catch(() => {});
  const fromId = ctx.from?.id;
  if (!m || !fromId) return;
  if (!(await aprobatori()).has(fromId)) return;
  const refuza = m[1] === 'no';
  const sb = getSupabase();
  const { data: c } = await sb.from('driver_legare_cereri')
    .select('id, driver_id, telegram_id, telegram_vechi, stare, expira_la').eq('id', m[2]).maybeSingle();
  const cerere = c as CerereRand | null;
  const base = ctx.callbackQuery?.message?.text ?? '';
  const inchide = (verdict: string) => ctx.editMessageText(`${escapeHtml(base)}\n\n${verdict}`, { parse_mode: 'HTML' }).catch(() => {});
  if (!cerere || cerere.stare !== 'asteapta' || new Date(cerere.expira_la) < new Date()) {
    await inchide('⌛ Cererea nu mai e valabilă.');
    return;
  }
  // Folosire o singură dată: cine schimbă primul starea câștigă.
  const { data: luat } = await sb.from('driver_legare_cereri')
    .update({ stare: refuza ? 'refuzat' : 'legat', decis_de: fromId, decis_la: new Date().toISOString() })
    .eq('id', cerere.id).eq('stare', 'asteapta').gt('expira_la', new Date().toISOString()).select('id');
  if (!luat?.length) {
    await inchide('⌛ Cererea a fost deja decisă sau a expirat.');
    return;
  }
  const tg = Number(cerere.telegram_id);
  if (refuza) {
    await trimite(ctx.api, tg, T.refuzat);
    await inchide('✖️ Refuzat.');
    return;
  }
  let q = sb.from('drivers')
    .update({ telegram_id: tg, telegram_legat_la: new Date().toISOString(), telegram_legat_prin: 'admin' })
    .eq('id', cerere.driver_id);
  q = cerere.telegram_vechi == null ? q.is('telegram_id', null) : q.eq('telegram_id', cerere.telegram_vechi);
  const { data: randuri, error } = await q.select('id, full_name');
  const r = rezultatLegare(error, randuri);
  if (r !== 'ok') {
    await sb.from('driver_legare_cereri').update({ stare: 'expirat' }).eq('id', cerere.id);
    await inchide(r === 'alt_sofer' ? '⚠️ Acest Telegram e deja legat de alt șofer — nu s-a legat.'
      : r === 'schimbat' ? '⚠️ Șoferul s-a legat între timp — nu s-a schimbat nimic.' : '⚠️ Eroare — nu s-a legat.');
    if (error && r === 'eroare') console.error('[instruire] legare:', error.message);
    return;
  }
  const nume = (randuri![0] as { full_name: string }).full_name;
  await inchide('✅ Legat.');
  await puneMeniulPe(ctx.api, tg);
  await trimite(ctx.api, tg, T.legat(nume));
  await trimite(ctx.api, tg, textPuncte(nume), { reply_markup: tastaturaConfirma(cerere.driver_id) });
  if (cerere.telegram_vechi != null && Number(cerere.telegram_vechi) !== tg) await trimite(ctx.api, Number(cerere.telegram_vechi), T.vechi(nume));
  const cine = (ctx as Context & { dbUser?: { name?: string | null } | null }).dbUser?.name ?? 'Iurie';
  const anunt = `🔗 ${escapeHtml(cine)} a legat <b>${escapeHtml(nume)}</b> de Telegram${cerere.telegram_vechi != null ? ' (⚠️ a înlocuit Telegram-ul vechi)' : ''}.`;
  for (const chat of await getAdminChatIds()) if (chat !== fromId) await trimite(ctx.api, chat, anunt);
}

/** `instr:ok:<driver_id>`: doar Telegram-ul acestui șofer. */
export async function handleConfirmaInstruire(ctx: Context): Promise<void> {
  const m = RE_CONFIRMA.exec(ctx.callbackQuery?.data ?? '');
  const fromId = ctx.from?.id;
  if (!m || !fromId) {
    await ctx.answerCallbackQuery().catch(() => {});
    return;
  }
  const sofer = await soferul(m[1]);
  if (!sofer || !sofer.active || Number(sofer.telegram_id) !== fromId) {
    await ctx.answerCallbackQuery({ text: T.nuPentruTine, show_alert: true }).catch(() => {});
    return;
  }
  await ctx.answerCallbackQuery().catch(() => {});
  const { data, error } = await getSupabase().from('driver_instruire_bilete')
    .upsert({ driver_id: sofer.id, versiune: PUNCTE_VERSIUNE, telegram_id: fromId }, { onConflict: 'driver_id,versiune', ignoreDuplicates: true })
    .select('confirmat_la');
  if (error) {
    console.error('[instruire] confirmare:', error.message);
    await ctx.reply(T.reincearca, { parse_mode: 'HTML' });
    return;
  }
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  if (!data?.length) {
    await ctx.reply(T.dejaConfirmat, { parse_mode: 'HTML' });
    return;
  }
  await ctx.reply(T.multumim, { parse_mode: 'HTML' });
  const ora = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit' }).format(new Date());
  const text = `✅ <b>${escapeHtml(sofer.full_name)}</b> a confirmat instruirea biletelor online (v${PUNCTE_VERSIUNE}) — ${ora}`;
  for (const chat of await aprobatori()) await trimite(ctx.api, chat, text);
}
