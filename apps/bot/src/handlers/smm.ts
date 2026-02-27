import type { BotContext } from '../types.js';
import { collectSmmData, aggregateDailyStats, getSmmDailyReport, getSmmWeeklyReport } from '../services/smm.js';
import { getTodayDate, formatDate } from '../utils.js';
import { SMM_PLATFORM_LABELS } from '@translux/db';

/**
 * /smmweekly [YYYY-MM-DD YYYY-MM-DD]
 * Without args — current week. With two dates — custom range.
 */
export async function handleSmmWeekly(ctx: BotContext) {
  const args = (ctx.message?.text || '').split(/\s+/).slice(1);
  let dateFrom: string;
  let dateTo: string;

  if (args.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(args[0]) && /^\d{4}-\d{2}-\d{2}$/.test(args[1])) {
    dateFrom = args[0];
    dateTo = args[1];
  } else {
    // default: previous week Mon-Sun
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' }));
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday - 7); // previous week
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    dateFrom = monday.toISOString().slice(0, 10);
    dateTo = sunday.toISOString().slice(0, 10);
  }

  const msg = await ctx.reply(`⏳ Se generează raportul SMM săptămânal (${formatDate(dateFrom)} — ${formatDate(dateTo)})...`);

  try {
    await collectSmmData();

    const d = new Date(dateFrom + 'T12:00:00');
    const end = new Date(dateTo + 'T12:00:00');
    while (d <= end) {
      await aggregateDailyStats(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }

    const stats = await getSmmWeeklyReport(dateFrom, dateTo);
    const period = `${formatDate(dateFrom)} — ${formatDate(dateTo)}`;

    let text = `📊 <b>SMM RAPORT SĂPTĂMÂNAL</b>\n`;
    text += `📅 ${period}\n`;
    text += `${'─'.repeat(28)}\n\n`;

    if (stats.length === 0) {
      text += 'Nu există date SMM pentru această perioadă.\n';
    } else {
      for (const s of stats) {
        const icon = s.platform === 'TIKTOK' ? '🎵' : '📘';
        text += `${icon} <b>${s.account_name}</b>\n`;
        text += `  Postări: ${s.posts_count}\n`;
        text += `  👁 ${s.total_views.toLocaleString()} vizualizări\n`;
        text += `  ❤️ ${s.total_likes.toLocaleString()} like\n`;
        text += `  💬 ${s.total_comments} comentarii\n`;
        text += `  🔄 ${s.total_shares} distribuiri\n\n`;
      }
    }

    await ctx.api.editMessageText(msg.chat.id, msg.message_id, text, {
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error('SMM weekly report error:', err);
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      '❌ Eroare la generarea raportului SMM săptămânal.'
    );
  }
}

export async function handleDaily(ctx: BotContext) {
  const msg = await ctx.reply('Se colectează datele SMM...');

  const today = getTodayDate();

  try {
    await collectSmmData();
    await aggregateDailyStats(today);

    const stats = await getSmmDailyReport(today);

    if (stats.length === 0) {
      await ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        `📊 SMM ${formatDate(today)}\n\nNu există date pentru azi.`
      );
      return;
    }

    let text = `📊 <b>SMM ZILNIC — ${formatDate(today)}</b>\n`;
    text += `${'─'.repeat(28)}\n\n`;

    for (const s of stats) {
      const icon = s.platform === 'TIKTOK' ? '🎵' : '📘';
      text += `${icon} <b>${s.account_name}</b> (${SMM_PLATFORM_LABELS[s.platform]})\n`;
      text += `  Postări noi: ${s.posts_count}\n`;
      text += `  👁 Vizualizări: ${s.total_views.toLocaleString()}\n`;
      text += `  ❤️ Like: ${s.total_likes.toLocaleString()}\n`;
      text += `  💬 Comentarii: ${s.total_comments}\n`;
      text += `  🔄 Distribuiri: ${s.total_shares}\n\n`;
    }

    await ctx.api.editMessageText(msg.chat.id, msg.message_id, text, {
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error('Daily SMM report error:', err);
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      'Eroare la colectarea datelor SMM.'
    );
  }
}
