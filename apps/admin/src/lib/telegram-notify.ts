import { getSupabase } from './supabase';

/** Отправка одного сообщения в Telegram. Никогда не бросает — возвращает успех. */
export async function sendTelegram(chatId: string | number, text: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      // Serverless: без таймаута зависший Telegram держит инвокацию до maxDuration.
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch (err) {
    console.error('sendTelegram failed:', err);
    return false;
  }
}

/** Алерт всем активным админам (users: role=ADMIN, active, telegram_id). */
export async function alertAdmins(text: string): Promise<void> {
  const supabase = getSupabase();
  const { data: admins, error } = await supabase
    .from('users')
    .select('telegram_id')
    .eq('role', 'ADMIN')
    .eq('active', true)
    .not('telegram_id', 'is', null);
  if (error) console.error('alertAdmins: admin lookup failed:', error.message);
  // sendTelegram никогда не бросает → безопасно слать параллельно.
  await Promise.all(
    (admins || []).filter(a => a.telegram_id).map(a => sendTelegram(a.telegram_id, text)),
  );
}
