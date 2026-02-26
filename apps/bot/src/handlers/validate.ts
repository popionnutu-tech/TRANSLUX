import type { BotContext } from '../types.js';
import { getUnvalidatedDay, validateDay } from '../services/db.js';
import { getTodayDate, formatDate } from '../utils.js';

export async function handleValidateDay(ctx: BotContext) {
  const user = ctx.dbUser;
  if (!user) {
    await ctx.reply('Acces restricționat.');
    return;
  }

  const today = getTodayDate();
  const unvalidatedDate = await getUnvalidatedDay(user.id, today);

  if (!unvalidatedDate) {
    await ctx.reply('✅ Nu ai zile nevalidate. Totul e în ordine!');
    return;
  }

  await validateDay(user.id, unvalidatedDate);
  await ctx.reply(`✅ Ziua ${formatDate(unvalidatedDate)} a fost validată.`);
}
