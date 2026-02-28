import { getSupabase } from '../supabase.js';
import { getBotApi, getAdminChatIds } from './adminAlert.js';
import { formatDate, formatTime } from '../utils.js';

// Track sent message IDs per chat for today, so we can edit instead of resend
let digestDate = '';
const digestMessageIds = new Map<number, number>(); // chatId → messageId

/**
 * Query today's violation reports and send/edit a single digest message to admins.
 * Called after each report with a violation (wrong location or late >10 min).
 */
export async function updateDailyDigest(reportDate: string): Promise<void> {
  const botApi = getBotApi();
  const adminChatIds = getAdminChatIds();
  if (!botApi || adminChatIds.size === 0) return;

  // Reset message IDs on date change
  if (digestDate !== reportDate) {
    digestDate = reportDate;
    digestMessageIds.clear();
  }

  const db = getSupabase();

  // Fetch all today's violations (location_ok=false OR minutes_late>10)
  const { data: violations, error } = await db
    .from('reports')
    .select(`
      id, point, location_ok, location_distance_m, minutes_late,
      trips!inner ( departure_time ),
      users!reports_created_by_user_fkey ( username, telegram_id )
    `)
    .eq('report_date', reportDate)
    .is('cancelled_at', null)
    .or('location_ok.eq.false,minutes_late.gt.10');

  if (error) {
    console.error('Daily digest query error:', error);
    return;
  }

  if (!violations || violations.length === 0) return;

  // Count total reports today
  const { count: totalReports } = await db
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('report_date', reportDate)
    .is('cancelled_at', null);

  // Build message lines
  const lines: string[] = [];
  for (const v of violations) {
    const trip = v.trips as any;
    const user = v.users as any;
    const time = formatTime(trip.departure_time);
    const pointLabel = v.point === 'CHISINAU' ? 'Chișinău' : 'Bălți';
    const name = user?.username ? `@${user.username}` : `#${user?.telegram_id || '?'}`;

    const icons: string[] = [];
    const details: string[] = [];

    if (v.location_ok === false) {
      icons.push('📍');
      details.push(`${v.location_distance_m || '?'}m`);
    }
    if (v.minutes_late != null && v.minutes_late > 10) {
      icons.push('⏰');
      details.push(`+${v.minutes_late} min`);
    }

    lines.push(`${icons.join('')} ${time} ${pointLabel} — ${name} (${details.join(', ')})`);
  }

  // Sort by time
  lines.sort();

  const msg =
    `📋 <b>RAPORT ZILNIC — ${formatDate(reportDate)}</b>\n\n` +
    `⚠️ Încălcări:\n\n` +
    lines.join('\n') +
    `\n\n` +
    `Total: <b>${violations.length}</b> încălcări din <b>${totalReports || 0}</b> rapoarte`;

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
