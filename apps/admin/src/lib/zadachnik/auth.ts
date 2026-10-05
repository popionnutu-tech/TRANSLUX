import { getSupabase } from '@/lib/supabase';
import { verifyInitData as verificaInitData } from '@/lib/telegram/init-data';

// Telegram Mini App auth: validate initData (HMAC with bot token) → resolve public.users by telegram_id.
// Всегда через service-role клиент (таблицы задачника закрыты RLS deny-all). Порт логики из TLX.

export type ZRole = 'ADMIN' | 'CONTROLLER' | 'DIGITAL' | 'MANAGER_LDE';

export interface ZUser {
  id: string;
  role: ZRole;
  name: string | null;
  username: string | null;
  point: string | null;
  operator_kind: string | null;
  telegram_id: number;
}

const USER_COLS = 'id, role, name, username, point, operator_kind, telegram_id';

/** Подпись пользователя для UI: имя → username → по точке/типу. */
export function userLabel(u: Pick<ZUser, 'name' | 'username' | 'point' | 'operator_kind'>): string {
  if (u.name) return u.name;
  if (u.username) return u.username;
  return `Controlor ${u.point ?? ''}`.trim();
}

// ION-239: verificarea HMAC (semnătura, ±signature, ≤24 h, user.id) e funcția pură din lib/telegram/init-data.ts,
// comună cu mini app-ul șoferului; aici rămân doar ocolul `__dev__` și căutarea în `users`.
function verifyInitData(initData: string, botToken: string): number | null {
  const v = verificaInitData(initData, botToken);
  return v.ok ? v.telegramId : null;
}

/** Резолв пользователя Mini App из заголовка x-telegram-init-data. null = неавторизован. */
export async function authFromInitData(initData: string | null): Promise<ZUser | null> {
  const db = getSupabase();

  // dev-обход для локальной разработки
  if (process.env.ALLOW_DEV_AUTH === '1' && initData === '__dev__') {
    const { data } = await db
      .from('users')
      .select(USER_COLS)
      .eq('role', 'ADMIN')
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    return (data as ZUser) ?? null;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !initData) return null;
  const telegramId = verifyInitData(initData, token);
  if (!telegramId) return null;

  const { data } = await db
    .from('users')
    .select(USER_COLS)
    .eq('telegram_id', telegramId)
    .eq('active', true)
    .maybeSingle();
  return (data as ZUser) ?? null;
}
