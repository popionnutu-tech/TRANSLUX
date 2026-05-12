/**
 * IP-фильтр для офисных ролей — server-only функции.
 * Импортируется только из server components / server actions / API routes.
 *
 * Для констант/типов (которые нужны и клиенту) — см. `./ip-access-roles.ts`.
 */

import 'server-only';
import { headers } from 'next/headers';
import { getSupabase } from './supabase';
import { IP_PROTECTED_ROLES, isIpProtectedRole, type IpProtectedRole } from './ip-access-roles';

// Re-export для удобства, чтобы серверный код мог импортировать всё из одного места
export { IP_PROTECTED_ROLES, isIpProtectedRole };
export type { IpProtectedRole };

/**
 * Получить настоящий IP клиента из заголовков запроса.
 * На Vercel это `x-forwarded-for` (первый IP в списке).
 * Локально — `x-real-ip` или пусто.
 */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  const real = h.get('x-real-ip');
  if (real) return real.trim();
  return null;
}

export type IpCheckResult =
  | { allowed: true }
  | { allowed: false; reason: 'no_ip' | 'ip_not_allowed'; ip: string | null };

/**
 * Проверить, разрешён ли IP клиента для роли.
 * Если для роли нет активных правил — пропускает (fail-open).
 */
export async function checkRoleIpAccess(role: string): Promise<IpCheckResult> {
  if (!isIpProtectedRole(role)) {
    return { allowed: true };
  }

  const ip = await getClientIp();

  // В dev-режиме пропускаем localhost (IPv6 ::1 и IPv4 127.0.0.1),
  // чтобы локально можно было тестировать админку.
  if (process.env.NODE_ENV !== 'production') {
    if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('127.')) {
      return { allowed: true };
    }
  }

  if (!ip) {
    return { allowed: false, reason: 'no_ip', ip: null };
  }

  const { data, error } = await getSupabase().rpc('ip_allowed_for_role', {
    p_role: role,
    p_ip: ip,
  });

  if (error) {
    console.error('[ip-access] RPC error', error);
    return { allowed: true };
  }

  if (data === true) return { allowed: true };
  return { allowed: false, reason: 'ip_not_allowed', ip };
}
