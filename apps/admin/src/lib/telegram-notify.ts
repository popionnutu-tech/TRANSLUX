import { getSupabase } from './supabase';

/** Экранирование для Telegram parse_mode HTML — иначе '<' в тексте даёт 400 и сообщение теряется. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Grupa devenită supergrupă (Telegram: «group chat was upgraded to a supergroup chat», cu migrate_to_chat_id). Pe 05.10
 * grupa Mejgorod a trecut așa și imaginea de uniformă de luni + graficul au picat pe id-ul vechi. Aici: din răspunsul de
 * eroare se ia id-ul nou, se mută în app_config orice setare care ținea id-ul vechi și se întoarce id-ul nou (apelantul
 * retrimite o dată). Pur pe text + o scriere; nu aruncă.
 */
export function idDupaMigrare(corpEroare: string): string | null {
  try {
    const j = JSON.parse(corpEroare) as { parameters?: { migrate_to_chat_id?: number } };
    const nou = j.parameters?.migrate_to_chat_id;
    return typeof nou === 'number' && Number.isFinite(nou) ? String(nou) : null;
  } catch {
    return null;
  }
}

async function mutaGrupa(vechi: string | number, corpEroare: string): Promise<string | null> {
  const nou = idDupaMigrare(corpEroare);
  if (!nou) return null;
  try {
    const { data } = await getSupabase().from('app_config').update({ value: nou, updated_at: new Date().toISOString() })
      .eq('value', String(vechi)).select('key');
    console.warn(`Telegram: grupa ${vechi} a devenit supergrupa ${nou}; setări mutate: ${(data ?? []).map((r: { key: string }) => r.key).join(', ') || '—'}`);
  } catch (err) {
    console.error('mutaGrupa: app_config nu s-a actualizat:', err);
  }
  return nou;
}

/** Отправка одного сообщения в Telegram. Никогда не бросает — возвращает успех.
 *  replyMarkup (опционально) — inline-клавиатура, напр. кнопка web_app в Mini App. */
export async function sendTelegram(chatId: string | number, text: string, replyMarkup?: unknown,
  /** tabul (topicul) dintr-o grupă-forum; lipsă = chatul întreg */ threadId?: number | null): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        ...(threadId ? { message_thread_id: threadId } : {}) }),
      // Serverless: без таймаута зависший Telegram держит инвокацию до maxDuration.
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok && resp.status === 400) {
      const nou = await mutaGrupa(chatId, await resp.text().catch(() => ''));
      if (nou) return sendTelegram(nou, text, replyMarkup, threadId);
    }
    return resp.ok;
  } catch (err) {
    console.error('sendTelegram failed:', err);
    return false;
  }
}

/** Trimite o poză deja aflată la Telegram (file_id primit de același bot, ION-252) cu subtitlu HTML. Nu aruncă. */
export async function sendTelegramPhotoId(chatId: string | number, fileId: string, caption: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo: fileId, caption, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) console.error('sendTelegramPhotoId failed:', resp.status, (await resp.text().catch(() => '')).slice(0, 300));
    return resp.ok;
  } catch (err) {
    console.error('sendTelegramPhotoId failed:', err);
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
  /** tabul (topicul) dintr-o grupă-forum; lipsă = chatul întreg */
  threadId?: number | null,
): Promise<{ ok: boolean; messageId: number | null }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return { ok: false, messageId: null };
  try {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    if (threadId) form.append('message_thread_id', String(threadId));
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
      const nou = resp.status === 400 ? await mutaGrupa(chatId, body) : null;
      if (nou) return sendTelegramPhoto(nou, png, caption, filename, threadId);
      return { ok: false, messageId: null };
    }
    const json = (await resp.json().catch(() => null)) as { result?: { message_id?: number } } | null;
    return { ok: true, messageId: json?.result?.message_id ?? null };
  } catch (err) {
    console.error('sendTelegramPhoto failed:', err);
    return { ok: false, messageId: null };
  }
}

/** Trimite 2–10 imagini ca O SINGURĂ postare (album, sendMediaGroup). Ion, 29.09: «trimite toate 8 poze ca o
 *  postare cu mai multe poze». Fiecare poză își poate păstra subtitlul (se vede la deschidere). Nu aruncă niciodată;
 *  întoarce message_id-urile pozelor, în ordine. Peste 10 poze Telegram refuză — se împart de cel care cheamă. */
export async function sendTelegramAlbum(
  chatId: string | number,
  poze: { png: Buffer | Uint8Array; caption?: string; filename?: string }[],
  threadId?: number | null,
): Promise<{ ok: boolean; messageIds: number[] }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || poze.length < 2 || poze.length > 10) return { ok: false, messageIds: [] };
  try {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (threadId) form.append('message_thread_id', String(threadId));
    form.append('media', JSON.stringify(poze.map((p, i) => ({
      type: 'photo', media: `attach://poza${i}`, ...(p.caption ? { caption: p.caption, parse_mode: 'HTML' } : {}),
    }))));
    poze.forEach((p, i) => form.append(`poza${i}`, new Blob([new Uint8Array(p.png)], { type: 'image/png' }), p.filename ?? `poza${i}.png`));
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
      method: 'POST', body: form, signal: AbortSignal.timeout(60000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error('sendTelegramAlbum failed:', resp.status, body.slice(0, 300));
      const nou = resp.status === 400 ? await mutaGrupa(chatId, body) : null;
      if (nou) return sendTelegramAlbum(nou, poze, threadId);
      return { ok: false, messageIds: [] };
    }
    const json = (await resp.json().catch(() => null)) as { result?: { message_id?: number }[] } | null;
    return { ok: true, messageIds: (json?.result ?? []).map((m) => m.message_id ?? 0).filter(Boolean) };
  } catch (err) {
    console.error('sendTelegramAlbum failed:', err);
    return { ok: false, messageIds: [] };
  }
}

/** Text HTML cu message_id înapoi (pentru fixare). Nu aruncă niciodată. */
export async function sendTelegramText(chatId: string | number, text: string, threadId?: number | null): Promise<number | null> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return null;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...(threadId ? { message_thread_id: threadId } : {}) }),
      signal: AbortSignal.timeout(10000),
    });
    const corp = await resp.text().catch(() => '');
    const json = (() => { try { return JSON.parse(corp) as { ok?: boolean; result?: { message_id?: number } }; } catch { return null; } })();
    if (!json?.ok && resp.status === 400) {
      const nou = await mutaGrupa(chatId, corp);
      if (nou) return sendTelegramText(nou, text, threadId);
    }
    return json?.ok ? json.result?.message_id ?? null : null;
  } catch (err) {
    console.error('sendTelegramText failed:', err);
    return null;
  }
}

/** Fixează un mesaj fără notificare (botul are nevoie de dreptul «Pin messages»). Nu aruncă niciodată. */
export async function pinTelegramMessage(chatId: string | number, messageId: number): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/pinChatMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, disable_notification: true }),
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch (err) {
    console.error('pinTelegramMessage failed:', err);
    return false;
  }
}

/** Șterge un mesaj trimis de bot (ex. graficul precedent din grupa Mejgorod,
 *  când pleacă unul nou pe aceeași zi). Nu aruncă niciodată. Telegram lasă
 *  botul să-și șteargă propriile mesaje doar în 48 h — după, întoarce false și
 *  mesajul vechi rămâne; cel nou e deja în grupă, deci nu e o pierdere. */
export async function deleteTelegramMessage(chatId: string | number, messageId: number): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error('deleteTelegramMessage failed:', resp.status, body.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('deleteTelegramMessage failed:', err);
    return false;
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

