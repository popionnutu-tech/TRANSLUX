import type { BotContext } from '../types.js';
import { sendWeeklyReport } from '../services/weeklyReport.js';
import { getViolationsCount, updateDailyDigest } from '../services/dailyDigest.js';

/** Manual trigger for daily digest */
export async function handleDigest(ctx: BotContext) {
  if (!ctx.dbUser || ctx.dbUser.role !== 'ADMIN') {
    await ctx.reply('⛔ Acces restricționat. Doar administratorii pot folosi această comandă.');
    return;
  }
  const count = await getViolationsCount();
  if (count === 0) {
    await ctx.reply('✅ Azi nu sunt încălcări înregistrate.');
    return;
  }
  try {
    await updateDailyDigest();
    await ctx.reply(`📋 Digest trimis (${count} încălcări).`);
  } catch (err) {
    console.error('Manual digest error:', err);
    await ctx.reply('❌ Eroare la trimiterea digestului.');
  }
}

/** Manual trigger for weekly report (admin only) */
export async function handleWeeklyReport(ctx: BotContext) {
  if (!ctx.dbUser || ctx.dbUser.role !== 'ADMIN') {
    await ctx.reply('⛔ Acces restricționat. Doar administratorii pot folosi această comandă.');
    return;
  }
  await ctx.reply('⏳ Se generează raportul săptămânal...');
  try {
    await sendWeeklyReport();
    await ctx.reply('✅ Raportul a fost trimis.');
  } catch (err) {
    console.error('Manual weekly report error:', err);
    await ctx.reply('❌ Eroare la generarea raportului.');
  }
}
