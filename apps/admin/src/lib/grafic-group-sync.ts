import { getSupabase } from './supabase';
import { loadGraficPages } from './grafic-data';
import { generateScheduleImage } from './schedule-image';
import { sendTelegramPhoto } from './telegram-notify';
import {
  graficGroupChatId, graficGroupCaption, graficSnapshot, diffGraficSnapshots, type GraficSnapshot,
} from './grafic-group';

// Trimiterea graficului în grupa Mejgorod + urmărirea schimbărilor (Ion, 07.09).
//
// Două intrări, un singur drum:
//  - bifa dispecerului (manual=true): trimite imaginea și pornește urmărirea;
//  - notifyGraficChanged(date): chemată după ORICE scriere în programările zilei
//    (grafic, /assignments, mini-app atribuiri). Dacă ziua a fost deja trimisă
//    și ceva ce vede șoferul s-a schimbat, pleacă imaginea nouă cu schimbarea
//    scrisă sub ea. Dacă nu s-a schimbat nimic vizibil (ex. doar foaia de
//    parcurs), nu pleacă nimic — grupa nu e un jurnal de click-uri.

export interface SendGraficOptions {
  chatId?: string | null;
  sentBy?: string | null;
  /** true = bifa dispecerului; false = trimitere automată după o schimbare */
  manual: boolean;
}

export async function sendGraficImageToGroup(
  date: string,
  opts: SendGraficOptions,
): Promise<{ error?: string; changes?: string[] }> {
  const chatId = opts.chatId ?? (await graficGroupChatId());
  if (!chatId) return { error: 'Grupa Mejgorod nu e legată.' };

  const db = getSupabase();
  const [data, existing] = await Promise.all([
    loadGraficPages(date, false),
    db.from('grafic_group_posts').select('send_count, snapshot, sent_by').eq('ziua', date).maybeSingle(),
  ]);
  const toate = data.pages.flat();
  // Cursa anulată nu apare pe imaginea din grupă: imaginea spune «mergi», iar
  // anularea spune «nu mergi». La descărcare rămâne cum era.
  const rows = toate.filter(r => r.driver_id && !r.cancelled);

  const prev = existing.data as { send_count?: number; snapshot?: GraficSnapshot | null; sent_by?: string | null } | null;
  const prevCount = prev?.send_count ?? 0;
  const nextSnap = graficSnapshot(toate);
  const changes = prev?.snapshot ? diffGraficSnapshots(prev.snapshot, nextSnap) : [];

  if (!opts.manual) {
    if (!prev) return {}; // ziua n-a fost bifată — nu urmărim
    if (changes.length === 0) return { changes: [] };
  }
  if (rows.length === 0 && opts.manual) return { error: 'Nicio cursă cu șofer pe această zi — nu e ce trimite.' };

  let png: Buffer;
  try {
    png = await generateScheduleImage(rows, date, { forDrivers: true });
  } catch (err) {
    console.error('sendGraficImageToGroup: image failed:', err);
    return { error: 'Nu s-a putut genera imaginea graficului.' };
  }

  const [y, m, d] = date.split('-');
  const sent = await sendTelegramPhoto(
    chatId, png,
    graficGroupCaption(date, rows.length, prevCount > 0, changes),
    `grafic-${d}.${m}.${y}.png`,
  );
  if (!sent.ok) {
    return { error: 'Telegram nu a primit imaginea. Verificați că botul e în grupa Mejgorod și încercați din nou.' };
  }

  const { error } = await db.from('grafic_group_posts').upsert(
    {
      ziua: date,
      sent_at: new Date().toISOString(),
      // Trimiterea automată păstrează omul care a bifat: el a pornit urmărirea.
      sent_by: opts.sentBy ?? prev?.sent_by ?? null,
      rows_count: rows.length,
      telegram_message_id: sent.messageId,
      send_count: prevCount + 1,
      snapshot: nextSnap,
    },
    { onConflict: 'ziua' },
  );
  // Imaginea a plecat: un eșec la evidență nu e motiv să-i spunem dispecerului
  // «n-a mers» — ar retrimite și grupa ar primi două grafice.
  if (error) console.error('sendGraficImageToGroup: post log failed:', error.message);
  return { changes };
}

/**
 * De chemat după orice scriere în programările unei zile. Nu aruncă niciodată
 * și nu întoarce nimic: scrierea a reușit deja, iar un eșec aici se vede în log,
 * nu în fața dispecerului.
 */
export async function notifyGraficChanged(date: string | null | undefined): Promise<void> {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  try {
    const res = await sendGraficImageToGroup(date, { manual: false });
    if (res.error) console.error(`notifyGraficChanged ${date}:`, res.error);
  } catch (err) {
    console.error(`notifyGraficChanged ${date}:`, err);
  }
}
