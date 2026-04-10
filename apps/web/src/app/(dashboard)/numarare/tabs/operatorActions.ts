'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import bcrypt from 'bcryptjs';

const { hash } = bcrypt;

// ─── Типы ───

export interface OperatorCamere {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  created_at: string;
}

// ─── Авторизация ───

const ALLOWED_ROLES = new Set(['ADMIN', 'ADMIN_CAMERE']);

async function requireCamereAdmin(): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!ALLOWED_ROLES.has(session.role)) return { error: 'Acces interzis' };
  return {};
}

// ─── Операции ───

const OPERATOR_ROLES = ['OPERATOR_CAMERE', 'ADMIN_CAMERE'] as const;
const PASSWORD_SALT_ROUNDS = 12;

export async function getOperatorsCamere(): Promise<OperatorCamere[]> {
  const auth = await requireCamereAdmin();
  if (auth.error) return [];

  const { data } = await getSupabase()
    .from('admin_accounts')
    .select('id, email, name, role, active, created_at')
    .in('role', [...OPERATOR_ROLES])
    .order('created_at', { ascending: true });

  return (data || []) as OperatorCamere[];
}

export async function createOperatorCamere(
  email: string,
  password: string,
  name: string,
): Promise<{ error?: string }> {
  const auth = await requireCamereAdmin();
  if (auth.error) return auth;

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();

  if (!trimmedEmail) return { error: 'Email-ul este obligatoriu' };
  if (!password || password.length < 6) return { error: 'Parola trebuie sa aiba minim 6 caractere' };
  if (!trimmedName) return { error: 'Numele este obligatoriu' };

  const passwordHash = await hash(password, PASSWORD_SALT_ROUNDS);

  const { error } = await getSupabase()
    .from('admin_accounts')
    .insert({
      email: trimmedEmail,
      password_hash: passwordHash,
      role: 'OPERATOR_CAMERE',
      name: trimmedName,
      active: true,
    });

  if (error) {
    if (error.code === '23505') return { error: 'Acest email exista deja' };
    return { error: error.message };
  }

  return {};
}

export async function toggleOperatorActive(
  id: string,
  active: boolean,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!ALLOWED_ROLES.has(session.role)) return { error: 'Acces interzis' };
  if (id === session.id) return { error: 'Nu poți dezactiva propriul cont' };

  const { error } = await getSupabase()
    .from('admin_accounts')
    .update({ active })
    .eq('id', id);

  if (error) return { error: error.message };
  return {};
}
