import type { Api } from 'grammy';
import { getSupabase } from '../supabase.js';

let botApi: Api | null = null;

export function initAdminAlert(api: Api) {
  botApi = api;
}

export function getBotApi(): Api | null {
  return botApi;
}

/** Load admin Telegram chat IDs from DB (users with role=ADMIN and telegram_id set) */
export async function getAdminChatIds(): Promise<Set<number>> {
  try {
    const { data } = await getSupabase()
      .from('users')
      .select('telegram_id')
      .eq('role', 'ADMIN')
      .eq('active', true)
      .not('telegram_id', 'is', null);
    const ids = new Set<number>();
    for (const u of data || []) {
      if (u.telegram_id) ids.add(u.telegram_id);
    }
    return ids;
  } catch (err) {
    console.error('Failed to load admin chat IDs:', err);
    return new Set();
  }
}

export async function sendAdminAlert(message: string) {
  if (!botApi) return;
  const adminChatIds = await getAdminChatIds();
  if (adminChatIds.size === 0) return;
  for (const chatId of adminChatIds) {
    try {
      await botApi.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (err) {
      console.error(`Failed to send alert to admin ${chatId}:`, err);
    }
  }
}
