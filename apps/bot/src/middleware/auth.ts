import { Context, NextFunction } from 'grammy';
import { getSupabase } from '../supabase.js';
import type { User } from '@translux/db';

export interface AuthContext {
  dbUser: User | null;
}

/** Middleware: load user from DB by telegram_id */
export async function authMiddleware(ctx: Context & { dbUser?: User | null }, next: NextFunction) {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    ctx.dbUser = null;
    return next();
  }

  const { data } = await getSupabase()
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('active', true)
    .single();

  ctx.dbUser = data as User | null;
  return next();
}
