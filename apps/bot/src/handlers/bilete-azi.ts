import type { Context } from 'grammy';
import { getSupabase } from '../supabase.js';
import { handleSoferStart, tastaturaMiniApp, T_MINI_APP } from './sofer.js';

// ION-241 (Ion, 05.10.2026, «deploy» — ION-190 pașii 7–8): intrarea șoferului în mini app-ul biletelor.
// Două uși: `/start bilete_azi` (butonul «🎫 Мои билеты» din anunțul zilnic al grupei — în grupă nu merge
// `web_app`, deci linkul duce în privat) și comanda `/bilete` în chat privat. Dacă Telegram-ul e legat de un
// șofer activ (`drivers.telegram_id`, ION-234) → mesaj scurt cu butonul `web_app` spre mini app; dacă nu →
// același răspuns ca `/start sofer`: cere contactul propriu. Nu atinge `users` (personalul).

export const START_BILETE_AZI = 'bilete_azi';

/** Doar payload-ul «bilete_azi», indiferent de spații/majuscule. Pur, testat. */
export function esteStartBileteAzi(payload: string | undefined | null): boolean {
  return String(payload ?? '').trim().toLowerCase() === START_BILETE_AZI;
}

/** Șoferul activ legat de acest Telegram, sau null. */
export async function soferLegat(telegramId: number): Promise<{ id: string; full_name: string } | null> {
  const { data } = await getSupabase()
    .from('drivers')
    .select('id, full_name')
    .eq('telegram_id', telegramId)
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  return (data as { id: string; full_name: string } | null) ?? null;
}

/** `/start bilete_azi` și `/bilete`: butonul spre mini app pentru șoferul legat; altfel cere contactul. */
export async function handleBileteAzi(ctx: Context): Promise<void> {
  if (ctx.chat?.type !== 'private') return;
  const fromId = ctx.from?.id;
  if (!fromId) return;
  const sofer = await soferLegat(fromId);
  if (!sofer) {
    await handleSoferStart(ctx);
    return;
  }
  await ctx.reply(T_MINI_APP.deschide(sofer.full_name), { parse_mode: 'HTML', reply_markup: tastaturaMiniApp() });
}
