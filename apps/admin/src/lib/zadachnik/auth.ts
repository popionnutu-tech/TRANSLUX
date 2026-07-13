import crypto from 'crypto';
import { getSupabase } from '@/lib/supabase';

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
  const k = u.operator_kind === 'TAXI_ZONE' ? ' · taxi' : '';
  return `Controlor ${u.point ?? ''}${k}`.trim();
}

function verifyInitData(initData: string, botToken: string): number | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  // Устойчиво к обоим вариантам клиентов Telegram: signature (Ed25519) то входит в
  // data-check-string HMAC, то нет — принимаем, если совпадает любой.
  const calc = (excludeSig: boolean): string => {
    const p = new URLSearchParams(initData);
    p.delete('hash');
    if (excludeSig) p.delete('signature');
    const dc = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    return crypto.createHmac('sha256', secret).update(dc).digest('hex');
  };
  if (calc(true) !== hash && calc(false) !== hash) return null;

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
