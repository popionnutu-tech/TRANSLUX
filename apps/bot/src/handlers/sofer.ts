import type { Context } from 'grammy';
import { normalizeDriverPhone, PhoneError } from '@translux/db';
import { getSupabase } from '../supabase.js';

// ION-234 (Ion, 05.10.2026): «trebuie să unim șoferul din Telegram cu șoferul de pe Mejgorod (grafic)».
// Legarea se face prin telefon: șoferul deschide `t.me/<bot>?start=sofer`, apasă «Отправить мой номер»
// și botul potrivește contactul PROPRIU (contact.user_id === from.id — telefoanele șoferilor sunt publice pe
// site, deci oricine ar putea trimite numărul altuia ca «contact») cu `drivers.phone` (canonic 373XXXXXXXX,
// aceeași regulă ca în admin). Reușita scrie `drivers.telegram_id`; refuzurile se jurnalizează în
// `drivers_telegram_incercari`, de unde adminul leagă de mână (planul ION-190, pasul 7). Mini app-ul
// biletelor (ION-190) va găsi cursa zilei după acest telegram_id.

export const START_SOFER = 'sofer';

export function esteStartSofer(payload: string | undefined | null): boolean {
  return String(payload ?? '').trim().toLowerCase() === START_SOFER;
}

export interface SoferCandidat { id: string; full_name: string; telegram_id: number | null }
export type MotivRefuz = 'contact_strain' | 'telefon_invalid' | 'nepotrivit' | 'multiplu' | 'deja_legat';
export type Decizie =
  | { ok: true; sofer: SoferCandidat; telefon: string; dejaAcelasi: boolean }
  | { ok: false; motiv: MotivRefuz; telefon: string | null };

/**
 * Decizia legării, fără bază (testabilă): contactul e al expeditorului? telefonul e valid? câți șoferi
 * activi au acest telefon? șoferul are deja alt Telegram?
 */
export function deciziaLegarii(
  contact: { phone_number: string; user_id?: number | null },
  fromId: number,
  candidati: SoferCandidat[],
): Decizie {
  if (contact.user_id == null || contact.user_id !== fromId) return { ok: false, motiv: 'contact_strain', telefon: null };
  let telefon: string;
  try {
    telefon = normalizeDriverPhone(contact.phone_number);
  } catch (e) {
    if (e instanceof PhoneError) return { ok: false, motiv: 'telefon_invalid', telefon: contact.phone_number };
    throw e;
  }
  if (candidati.length === 0) return { ok: false, motiv: 'nepotrivit', telefon };
  if (candidati.length > 1) return { ok: false, motiv: 'multiplu', telefon };
  const sofer = candidati[0];
  if (sofer.telegram_id != null && sofer.telegram_id !== fromId) return { ok: false, motiv: 'deja_legat', telefon };
  return { ok: true, sofer, telefon, dejaAcelasi: sofer.telegram_id === fromId };
}

const T = {
  cere: [
    '🚌 <b>Привязка водителя</b>',
    'Нажмите кнопку ниже и отправьте <b>свой</b> номер телефона — тот, который записан у диспетчера.',
    'Это нужно один раз. Потом здесь, в боте, будут пассажиры с онлайн-билетами и сканирование.',
    '',
    '<i>Apasă butonul de jos și trimite numărul TĂU de telefon — cel pe care îl are dispecerul. O singură dată.</i>',
  ].join('\n'),
  buton: '📱 Отправить мой номер / Trimite numărul meu',
  reusit: (nume: string) => [
    `✅ <b>Готово, ${nume}.</b>`,
    'Ваш Telegram привязан. Пассажиры с онлайн-билетами и сканирование будут здесь, в боте.',
    '',
    `<i>Gata, ${nume}. Telegram-ul tău e legat; biletele online și scanarea vor fi aici, în bot.</i>`,
  ].join('\n'),
  dejaAcelasi: (nume: string) => `✅ ${nume}, ваш Telegram уже привязан. / Telegram-ul tău e deja legat.`,
  refuz: {
    contact_strain: '⚠️ Нужен <b>ваш собственный</b> номер: нажмите кнопку «Отправить мой номер», не пересылайте чужой контакт.\n<i>Trimite numărul tău, prin buton — nu contactul altcuiva.</i>',
    telefon_invalid: '⚠️ Номер не распознан. Обратитесь к диспетчеру.\n<i>Numărul nu e recunoscut. Spune dispecerului.</i>',
    nepotrivit: '⚠️ Этого номера нет в списке водителей. Обратитесь к диспетчеру — он проверит номер и привяжет вас вручную.\n<i>Numărul nu e în lista șoferilor. Dispecerul verifică și te leagă de mână.</i>',
    multiplu: '⚠️ Этот номер записан у нескольких водителей. Обратитесь к диспетчеру.\n<i>Numărul e la mai mulți șoferi. Spune dispecerului.</i>',
    deja_legat: '⚠️ К этому водителю уже привязан другой Telegram. Обратитесь к диспетчеру.\n<i>La acest șofer e legat deja alt Telegram. Spune dispecerului.</i>',
    alt_sofer: '⚠️ Этот Telegram уже привязан к другому водителю. Обратитесь к диспетчеру.\n<i>Acest Telegram e deja legat de alt șofer. Spune dispecerului.</i>',
  } as Record<MotivRefuz | 'alt_sofer', string>,
};

/** `/start sofer`: cere contactul propriu. Doar în chat privat. */
export async function handleSoferStart(ctx: Context): Promise<void> {
  if (ctx.chat?.type !== 'private') return;
  await ctx.reply(T.cere, {
    parse_mode: 'HTML',
    reply_markup: { keyboard: [[{ text: T.buton, request_contact: true }]], one_time_keyboard: true, resize_keyboard: true },
  });
}

/** Contactul trimis botului (doar privat): potrivește și leagă. */
export async function handleSoferContact(ctx: Context): Promise<void> {
  if (ctx.chat?.type !== 'private') return;
  const contact = ctx.message?.contact;
  const fromId = ctx.from?.id;
  if (!contact || !fromId) return;
  const sb = getSupabase();
  const numeTelegram = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || ctx.from?.username || null;

  let telefonCanonic: string | null = null;
  try { telefonCanonic = normalizeDriverPhone(contact.phone_number); } catch { /* decizia dă telefon_invalid */ }
  const candidati: SoferCandidat[] = telefonCanonic
    ? (((await sb.from('drivers').select('id, full_name, telegram_id').eq('active', true).eq('phone', telefonCanonic)).data ?? []) as SoferCandidat[])
    : [];
  const d = deciziaLegarii(contact, fromId, candidati);

  if (!d.ok) {
    await sb.from('drivers_telegram_incercari').insert({ telegram_id: fromId, nume_telegram: numeTelegram, telefon_trimis: d.telefon, motiv: d.motiv });
    await ctx.reply(T.refuz[d.motiv], { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } });
    return;
  }
  if (d.dejaAcelasi) {
    await ctx.reply(T.dejaAcelasi(d.sofer.full_name), { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } });
    return;
  }
  const { error } = await sb
    .from('drivers')
    .update({ telegram_id: fromId, telegram_legat_la: new Date().toISOString(), telegram_legat_prin: 'telefon' })
    .eq('id', d.sofer.id);
  if (error) {
    // indexul unic drivers_telegram_id_uniq: același Telegram e deja pe alt șofer
    const altSofer = /drivers_telegram_id_uniq|duplicate key/i.test(error.message);
    await sb.from('drivers_telegram_incercari').insert({ telegram_id: fromId, nume_telegram: numeTelegram, telefon_trimis: d.telefon, motiv: altSofer ? 'deja_legat' : 'nepotrivit' });
    console.error('[sofer] legare eșuată:', error.message);
    await ctx.reply(altSofer ? T.refuz.alt_sofer : T.refuz.telefon_invalid, { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } });
    return;
  }
  await ctx.reply(T.reusit(d.sofer.full_name), { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } });
}
