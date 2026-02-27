import { collectSmmData, aggregateDailyStats, getSmmWeeklyReport } from './smm.js';
import { sendAdminAlert } from './adminAlert.js';
import { formatDate } from '../utils.js';
import { config } from '../config.js';
import { SMM_PLATFORM_LABELS } from '@translux/db';

function getCurrentWeekRange(): { dateFrom: string; dateTo: string } {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: config.timezone })
  );
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    dateFrom: monday.toISOString().slice(0, 10),
    dateTo: sunday.toISOString().slice(0, 10),
  };
}

export async function sendSmmWeeklyReport(): Promise<void> {
  const { dateFrom, dateTo } = getCurrentWeekRange();

  await collectSmmData();

  const d = new Date(dateFrom + 'T12:00:00');
  const end = new Date(dateTo + 'T12:00:00');
  while (d <= end) {
    await aggregateDailyStats(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }

  const stats = await getSmmWeeklyReport(dateFrom, dateTo);
  const period = `${formatDate(dateFrom)} — ${formatDate(dateTo)}`;

  let msg = `📊 <b>SMM RAPORT SĂPTĂMÂNAL</b>\n`;
  msg += `📅 ${period}\n`;
  msg += `${'─'.repeat(28)}\n\n`;

  if (stats.length === 0) {
    msg += 'Nu există date SMM pentru această perioadă.\n';
  } else {
    for (const s of stats) {
      const icon = s.platform === 'TIKTOK' ? '🎵' : '📘';
      msg += `${icon} <b>${s.account_name}</b>\n`;
      msg += `  Postări: ${s.posts_count}\n`;
      msg += `  👁 ${s.total_views.toLocaleString()} vizualizări\n`;
      msg += `  ❤️ ${s.total_likes.toLocaleString()} like\n`;
      msg += `  💬 ${s.total_comments} comentarii\n`;
      msg += `  🔄 ${s.total_shares} distribuiri\n\n`;
    }
  }

  await sendAdminAlert(msg);
  console.log(`SMM weekly report sent for ${period}`);
}
