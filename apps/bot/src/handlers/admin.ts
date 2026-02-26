import type { BotContext } from '../types.js';
import { registerAdmin, unregisterAdmin, getAdminCount } from '../services/adminAlert.js';
import { sendWeeklyReport } from '../services/weeklyReport.js';

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
