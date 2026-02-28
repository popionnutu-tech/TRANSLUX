import type { BotContext } from '../types.js';
import { registerAdmin, unregisterAdmin, getAdminCount } from '../services/adminAlert.js';
import { sendWeeklyReport } from '../services/weeklyReport.js';
import { getViolationsCount, updateDailyDigest } from '../services/dailyDigest.js';

export async function handleAdmin(ctx: BotContext) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  registerAdmin(chatId);
  await ctx.reply(
    `✅ Admin mod activat.\n` +
    `Chat ID: ${chatId}\n\n` +
    `Vei primi notificări când operatorii trimit rapoarte din afara zonei de lucru.\n\n` +
    `Admini activi: ${getAdminCount()}\n` +
    `Folosește /stopadmin pentru a opri notificările.`
  );
}

export async function handleStopAdmin(ctx: BotContext) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  unregisterAdmin(chatId);
  await ctx.reply('🔕 Notificările admin au fost dezactivate.');
}

/** Manual trigger for daily digest */
export async function handleDigest(ctx: BotContext) {
  const count = getViolationsCount();
  if (count === 0) {
    await ctx.reply('✅ Azi nu sunt încălcări înregistrate (sau botul a fost repornit).');
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
  await ctx.reply('⏳ Se generează raportul săptămânal...');
  try {
    await sendWeeklyReport();
    await ctx.reply('✅ Raportul a fost trimis.');
  } catch (err) {
    console.error('Manual weekly report error:', err);
    await ctx.reply('❌ Eroare la generarea raportului.');
  }
}
