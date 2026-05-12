/**
 * Константы IP-фильтра — без серверных импортов.
 * Импортируется как с сервера, так и с клиента (UI компоненты).
 */

export const IP_PROTECTED_ROLES = [
  'OPERATOR_CAMERE',
  'ADMIN_CAMERE',
  'EVALUATOR_INCASARI',
] as const;

export type IpProtectedRole = (typeof IP_PROTECTED_ROLES)[number];

export function isIpProtectedRole(role: string): role is IpProtectedRole {
  return (IP_PROTECTED_ROLES as readonly string[]).includes(role);
}
