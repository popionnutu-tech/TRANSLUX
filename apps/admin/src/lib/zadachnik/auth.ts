import crypto from 'crypto';
import { getSupabase } from '@/lib/supabase';

// Telegram Mini App auth: validate initData (HMAC with bot token) → resolve public.users by telegram_id.
// Всегда через service-role клиент (таблицы задачника закрыты RLS deny-all). Порт логики из TLX.

export type ZRole = 'ADMIN' | 'CONTROLLER';

export interface ZUser {
  id: string;
  role: ZRole;
  username: string | null;
  point: string | null;
  operator_kind: string | null;
  telegram_id: number;
}

const USER_COLS = 'id, role, username, point, operator_kind, telegram_id';

/** Подпись пользователя для UI: username, иначе по точке/типу (у части контролёров username пустой). */
export function userLabel(u: Pick<ZUser, 'username' | 'point' | 'operator_kind'>): string {
  if (u.username) return u.username;
  const k = u.operator_kind === 'TAXI_ZONE' ? ' · taxi' : '';
  return `Controlor ${u.point ?? ''}${k}`.trim();
}

function verifyInitData(initData: string, botToken: string): number | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  params.delete('signature'); // Telegram добавляет signature (Ed25519) — НЕ входит в HMAC data-check-string
  const dataCheck = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  if (computed !== hash) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null; // ≤24h freshness
  try {
    const user = JSON.parse(params.get('user') || '{}');
    const id = Number(user?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
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
