import type { BotContext } from '../types.js';
import { getLastReportByUser, cancelReport } from '../services/db.js';
import { config } from '../config.js';

export async function handleCancelLastReport(ctx: BotContext) {
  if (!ctx.dbUser) {
    await ctx.reply('Acces restricționat.');
    return;
  }

  const lastReport = await getLastReportByUser(ctx.dbUser.id);
  if (!lastReport) {
    await ctx.reply('Nu ai niciun raport activ.');
    return;
  }

  const createdAt = new Date(lastReport.created_at).getTime();
  const now = Date.now();
  const windowMs = config.reportCancelWindowMs;

  if (now - createdAt > windowMs) {
    const minutes = Math.round(windowMs / 60_000);
    await ctx.reply(
      `Nu poți anula. Au trecut mai mult de ${minutes} minute de la trimitere.`
    );
    return;
  }

  await cancelReport(lastReport.id, ctx.dbUser.id);
  await ctx.reply('✓ Raportul a fost anulat. Poți retrimite.');
}
