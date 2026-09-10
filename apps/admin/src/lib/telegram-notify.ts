import { getSupabase } from './supabase';

/** Экранирование для Telegram parse_mode HTML — иначе '<' в тексте даёт 400 и сообщение теряется. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Отправка одного сообщения в Telegram. Никогда не бросает — возвращает успех.
 *  replyMarkup (опционально) — inline-клавиатура, напр. кнопка web_app в Mini App. */
export async function sendTelegram(chatId: string | number, text: string, replyMarkup?: unknown): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
      // Serverless: без таймаута зависший Telegram держит инвокацию до maxDuration.
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch (err) {
    console.error('sendTelegram failed:', err);
    return false;
  }
}

/** Trimite o imagine (PNG) cu subtitlu HTML. Nu aruncă niciodată.
 *  Întoarce message_id-ul din Telegram — se păstrează ca la nevoie imaginea să
 *  poată fi găsită/ștearsă mai târziu. Multipart, nu JSON: Bot API primește
 *  fișierul doar așa. Timeout mai mare decât la text — pleacă ~1 MB. */
export async function sendTelegramPhoto(
  chatId: string | number,
  png: Buffer | Uint8Array,
  caption: string,
  filename = 'image.png',
): Promise<{ ok: boolean; messageId: number | null }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return { ok: false, messageId: null };
  try {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    form.append('photo', new Blob([new Uint8Array(png)], { type: 'image/png' }), filename);
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) {
      // Textul erorii Telegram («chat not found», «bot was kicked») e singurul
      // indiciu pentru dispecer/log — fără el, un eșec arată ca «nu merge».
      const body = await resp.text().catch(() => '');
      console.error('sendTelegramPhoto failed:', resp.status, body.slice(0, 300));
      return { ok: false, messageId: null };
    }
    const json = (await resp.json().catch(() => null)) as { result?: { message_id?: number } } | null;
    return { ok: true, messageId: json?.result?.message_id ?? null };
  } catch (err) {
    console.error('sendTelegramPhoto failed:', err);
    return { ok: false, messageId: null };
  }
}

/** Алерт всем активным админам (users: role=ADMIN, active, telegram_id).
 *  Возвращает true, если сообщение приняли хотя бы у одного адресата — вызывающий
 *  код может отличить «предупредили» от «предупредить не удалось» (нет токена,
 *  ни у кого не привязан telegram_id, Telegram отверг текст). */
export async function alertAdmins(text: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data: admins, error } = await supabase
    .from('users')
    .select('telegram_id')
    .eq('role', 'ADMIN')
    .eq('active', true)
    .not('telegram_id', 'is', null);
  if (error) console.error('alertAdmins: admin lookup failed:', error.message);
  // sendTelegram никогда не бросает → безопасно слать параллельно.
  const results = await Promise.all(
    (admins || []).filter(a => a.telegram_id).map(a => sendTelegram(a.telegram_id, text)),
  );
  return results.some(Boolean);
}

/** Trimite mai multe imagini (PNG) ca un singur album, cu subtitlul HTML sub
 *  prima. Nu aruncă niciodată. Întoarce message_id-ul primei imagini. Toate
 *  fișierele pleacă ca «attach://…» în același multipart — Bot API nu primește
 *  altfel fișiere locale într-un album. Album, nu două poze: graficul de tur și
 *  cel din Chișinău sunt UN post în grupă, nu două pe care să le ia cineva
 *  drept «vechi» și «nou». */
export async function sendTelegramMediaGroup(
  chatId: string | number,
  photos: Array<{ png: Buffer | Uint8Array; filename: string }>,
  caption: string,
): Promise<{ ok: boolean; messageId: number | null }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || photos.length === 0) return { ok: false, messageId: null };
  try {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    const media = photos.map((p, i) => ({
      type: 'photo',
      media: `attach://foto${i}`,
      ...(i === 0 ? { caption, parse_mode: 'HTML' } : {}),
    }));
    form.append('media', JSON.stringify(media));
    photos.forEach((p, i) => {
      form.append(`foto${i}`, new Blob([new Uint8Array(p.png)], { type: 'image/png' }), p.filename);
    });
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error('sendTelegramMediaGroup failed:', resp.status, body.slice(0, 300));
      return { ok: false, messageId: null };
    }
    const json = (await resp.json().catch(() => null)) as { result?: Array<{ message_id?: number }> } | null;
    return { ok: true, messageId: json?.result?.[0]?.message_id ?? null };
  } catch (err) {
    console.error('sendTelegramMediaGroup failed:', err);
    return { ok: false, messageId: null };
  }
}
