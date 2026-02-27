import type { BotContext } from '../types.js';
import { collectSmmData, aggregateDailyStats, getSmmDailyReport } from '../services/smm.js';
import { getTodayDate, formatDate } from '../utils.js';
import { SMM_PLATFORM_LABELS } from '@translux/db';

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
