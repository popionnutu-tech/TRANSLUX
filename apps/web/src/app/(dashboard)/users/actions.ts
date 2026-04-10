'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import type { User, UserRole, InviteToken, PointEnum } from '@translux/db';
import crypto from 'crypto';

// ── Users ────────────────────────────────────────────

export async function getUsers(): Promise<User[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data } = await getSupabase()
    .from('users')
    .select('*')
    .order('role')
    .order('username');
  return (data || []) as User[];
}

export async function updateUserRole(id: string, role: UserRole) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  if (session.role !== 'ADMIN') throw new Error('Acces interzis');
  const { error } = await getSupabase()
    .from('users')
    .update({ role })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

export async function updateUserPoint(id: string, point: PointEnum | null) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  if (session.role !== 'ADMIN') throw new Error('Acces interzis');
  const { error } = await getSupabase()
    .from('users')
    .update({ point })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

export async function toggleUser(id: string, active: boolean) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  if (session.role !== 'ADMIN') throw new Error('Acces interzis');
  await getSupabase().from('users').update({ active }).eq('id', id);
  revalidatePath('/users');
}

export async function deleteUser(id: string) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  if (session.role !== 'ADMIN') throw new Error('Acces interzis');
  const { error } = await getSupabase().from('users').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

// ── Admin Accounts ──────────────────────────────────

export interface AdminAccountInfo {
  id: string;
  email: string;
  role: string;
}

export async function getAdminAccounts(): Promise<AdminAccountInfo[]> {
  const session = await verifySession();
  if (!session || session.role !== 'ADMIN') return [];
  const { data } = await getSupabase()
    .from('admin_accounts')
    .select('id, email, role')
    .order('role')
    .order('email');
  return (data || []) as AdminAccountInfo[];
}

// ── Account Passwords (server-side only) ────────────

export async function getAccountPasswords(): Promise<Record<string, string>> {
  const session = await verifySession();
  if (!session || session.role !== 'ADMIN') return {};
  return {
    'admin@translux.md': 'admin123',
    'dispecer@translux.md': 'dispecer2026',
    'grafic@translux.md': 'grafic2026',
    'camere@translux.md': 'camere2026',
  };
}

// ── Invites ──────────────────────────────────────────

export interface InviteWithAdmin extends InviteToken {
  admin_accounts?: { email: string };
  users?: { telegram_id: number; username: string } | null;
}

export async function getInvites(): Promise<InviteWithAdmin[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data } = await getSupabase()
    .from('invite_tokens')
    .select('*, admin_accounts:created_by(email), users:used_by_user(telegram_id, username)')
    .order('created_at', { ascending: false });
  return (data || []) as InviteWithAdmin[];
}

export async function createInvite(point: PointEnum): Promise<{ token: string; botLink: string }> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  if (session.role !== 'ADMIN') throw new Error('Acces interzis');

  const token = crypto.randomBytes(24).toString('base64url');

  const { error } = await getSupabase().from('invite_tokens').insert({
    token,
    role: 'CONTROLLER',
    point,
    created_by: session.id,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  if (error) throw new Error(error.message);

  const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || 'TransluxBot';
  const botLink = `https://t.me/${botUsername}?start=${token}`;

  revalidatePath('/users');
  return { token, botLink };
}

export async function deleteInvite(token: string) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  if (session.role !== 'ADMIN') throw new Error('Acces interzis');
  await getSupabase().from('invite_tokens').delete().eq('token', token);
  revalidatePath('/users');
}
