'use server';

import { revalidatePath } from 'next/cache';
import { verifySession } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';
import { getClientIp, IP_PROTECTED_ROLES, type IpProtectedRole } from '@/lib/ip-access';

async function requireAdmin() {
  const session = await verifySession();
  if (!session || session.role !== 'ADMIN') {
    throw new Error('Acces interzis');
  }
  return session;
}

export interface IpRule {
  id: number;
  cidr: string;
  label: string;
  active: boolean;
  created_at: string;
}

export async function listIpsByRole(): Promise<Record<IpProtectedRole, IpRule[]>> {
  await requireAdmin();
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('role_allowed_ips')
    .select('id, role, cidr, label, active, created_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const grouped = {
    OPERATOR_CAMERE: [] as IpRule[],
    ADMIN_CAMERE: [] as IpRule[],
    EVALUATOR_INCASARI: [] as IpRule[],
  };
  for (const row of (data || []) as Array<{ id: number; role: IpProtectedRole; cidr: string; label: string; active: boolean; created_at: string }>) {
    if (IP_PROTECTED_ROLES.includes(row.role)) {
      grouped[row.role].push({
        id: row.id,
        cidr: row.cidr,
        label: row.label,
        active: row.active,
        created_at: row.created_at,
      });
    }
  }
  return grouped;
}

export async function getMyCurrentIp(): Promise<string | null> {
  await requireAdmin();
  return getClientIp();
}

function normalizeCidr(input: string): string {
  const trimmed = input.trim();
  // Если пользователь ввёл просто IP без маски — добавляем /32
  if (/^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) return `${trimmed}/32`;
  return trimmed;
}

export async function addIpRule(role: IpProtectedRole, cidrRaw: string, label: string) {
  const session = await requireAdmin();
  if (!IP_PROTECTED_ROLES.includes(role)) throw new Error('Rol invalid');
  if (!cidrRaw.trim() || !label.trim()) throw new Error('Completati IP si eticheta');

  const cidr = normalizeCidr(cidrRaw);

  const { error } = await getSupabase()
    .from('role_allowed_ips')
    .insert({ role, cidr, label: label.trim(), active: true, created_by: session.email });

  if (error) throw new Error(`Eroare baza date: ${error.message}`);
  revalidatePath('/users/ip-access');
}

export async function toggleIpRule(id: number, active: boolean) {
  await requireAdmin();
  const { error } = await getSupabase()
    .from('role_allowed_ips')
    .update({ active })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users/ip-access');
}

export async function deleteIpRule(id: number) {
  await requireAdmin();
  const { error } = await getSupabase()
    .from('role_allowed_ips')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users/ip-access');
}
