import type { BotContext } from '../types.js';
import { getViolationsCount, sendCompactDigest } from '../services/dailyDigest.js';

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
    await sendCompactDigest();
    await ctx.reply(`📋 Digest trimis (${count} încălcări).`);
  } catch (err) {
    console.error('Manual digest error:', err);
    await ctx.reply('❌ Eroare la trimiterea digestului.');
  }
}

