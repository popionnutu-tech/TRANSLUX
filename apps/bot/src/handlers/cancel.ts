import type { BotContext } from '../types.js';
import {
  getLastReportByUser,
  cancelReport,
  getLastTaxiZoneReportByUser,
  cancelTaxiZoneReport,
} from '../services/db.js';
import { config } from '../config.js';

export async function handleCancelLastReport(ctx: BotContext) {
  if (!ctx.dbUser) {
    await ctx.reply('Acces restricționat.');
    return;
  }

  // Taxi-zone operator cancels his last taxi-zone report.
  if (ctx.dbUser.operator_kind === 'TAXI_ZONE') {
    const last = await getLastTaxiZoneReportByUser(ctx.dbUser.id);
    if (!last) {
      await ctx.reply('Nu ai niciun raport activ.');
      return;
    }
    if (Date.now() - new Date(last.created_at).getTime() > config.reportCancelWindowMs) {
      const minutes = Math.round(config.reportCancelWindowMs / 60_000);
      await ctx.reply(`Nu poți anula. Au trecut mai mult de ${minutes} minute de la trimitere.`);
      return;
    }
    await cancelTaxiZoneReport(last.id, ctx.dbUser.id);
    await ctx.reply('✓ Raportul a fost anulat. Poți retrimite.');
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
