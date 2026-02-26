import { Context, NextFunction } from 'grammy';
import { config } from '../config.js';

const userCounts = new Map<number, { count: number; resetAt: number }>();

/** Rate limiter: max N messages per minute per user */
export async function rateLimitMiddleware(ctx: Context, next: NextFunction) {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const now = Date.now();
  let entry = userCounts.get(userId);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + 60_000 };
    userCounts.set(userId, entry);
  }

  entry.count++;

  if (entry.count > config.rateLimitPerMinute) {
    await ctx.reply('Prea multe mesaje. Așteaptă un minut.');
    return;
  }

  return next();
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of userCounts) {
    if (now >= entry.resetAt) userCounts.delete(id);
  }
}, 5 * 60_000);
