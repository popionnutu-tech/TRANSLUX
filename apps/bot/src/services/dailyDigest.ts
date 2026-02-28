import { getBotApi, getAdminChatIds } from './adminAlert.js';
import { formatDate, formatTime, getTodayDate } from '../utils.js';
import { getSupabase } from '../supabase.js';

// ── In-memory violation store ──────────────────────────
export interface Violation {
  time: string;        // HH:MM
  point: string;       // 'Chișinău' | 'Bălți'
  operator: string;    // @username or #telegram_id
  locationBad: boolean;
  distanceM: number | null;
  late: boolean;
  minutesLate: number;
}

let violationDate = '';
const violations: Violation[] = [];

// Track sent message IDs per chat, so we can edit instead of resend
const digestMessageIds = new Map<number, number>(); // chatId → messageId

/** Register a new violation (called from report.ts after saving report) */
export function addViolation(v: Violation): void {
  const today = getTodayDate();
  if (violationDate !== today) {
    violationDate = today;
    violations.length = 0;
    digestMessageIds.clear();
  }
  violations.push(v);
}

/**
 * Build and send/edit the daily digest message to all admins.
 * Called after addViolation().
 */
export async function updateDailyDigest(): Promise<void> {
  const botApi = getBotApi();
  const adminChatIds = getAdminChatIds();
  if (!botApi || adminChatIds.size === 0) return;
  if (violations.length === 0) return;

  const today = getTodayDate();

  // Count total reports today from DB
  let totalReports = 0;
  try {
    const db = getSupabase();
    const { count } = await db
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('report_date', today)
      .is('cancelled_at', null);
    totalReports = count || 0;
  } catch {
    totalReports = violations.length; // fallback
  }

  // Build message lines
  const lines: string[] = [];
  for (const v of violations) {
    const icons: string[] = [];
    const details: string[] = [];

    if (v.locationBad) {
      icons.push('📍');
      details.push(`${v.distanceM || '?'}m`);
    }
    if (v.late) {
      icons.push('⏰');
      details.push(`+${v.minutesLate} min`);
    }

    lines.push(`${icons.join('')} ${v.time} ${v.point} — ${v.operator} (${details.join(', ')})`);
  }

  lines.sort();

  const msg =
    `📋 <b>RAPORT ZILNIC — ${formatDate(today)}</b>\n\n` +
    `⚠️ Încălcări:\n\n` +
    lines.join('\n') +
    `\n\n` +
    `Total: <b>${violations.length}</b> încălcări din <b>${totalReports}</b> rapoarte`;

  // Send or edit for each admin chat
  for (const chatId of adminChatIds) {
    try {
      const existingMsgId = digestMessageIds.get(chatId);
      if (existingMsgId) {
        await botApi.editMessageText(chatId, existingMsgId, msg, { parse_mode: 'HTML' });
      } else {
        const sent = await botApi.sendMessage(chatId, msg, { parse_mode: 'HTML' });
        digestMessageIds.set(chatId, sent.message_id);
      }
    } catch (err: any) {
      if (err?.description?.includes('message is not modified')) {
        // Same content, nothing to do
      } else {
        console.error(`Daily digest error for chat ${chatId}:`, err?.description || err);
        try {
          const sent = await botApi.sendMessage(chatId, msg, { parse_mode: 'HTML' });
          digestMessageIds.set(chatId, sent.message_id);
        } catch (e) {
          console.error(`Daily digest fallback send failed:`, e);
        }
      }
    }
  }
}
