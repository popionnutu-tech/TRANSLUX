'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import type { User, UserRole, InviteToken, PointEnum } from '@translux/db';
import crypto from 'crypto';

// ── Users ────────────────────────────────────────────

export async function getUsers(): Promise<User[]> {
  const { data } = await getSupabase()
    .from('users')
    .select('*')
    .order('role')
    .order('username');
  return (data || []) as User[];
}

export async function updateUserRole(id: string, role: UserRole) {
  const { error } = await getSupabase()
    .from('users')
    .update({ role })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

export async function updateUserPoint(id: string, point: PointEnum | null) {
  const { error } = await getSupabase()
    .from('users')
    .update({ point })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

export async function toggleUser(id: string, active: boolean) {
  await getSupabase().from('users').update({ active }).eq('id', id);
  revalidatePath('/users');
}

export async function deleteUser(id: string) {
  const { error } = await getSupabase().from('users').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

// ── Invites ──────────────────────────────────────────

export interface InviteWithAdmin extends InviteToken {
  admin_accounts?: { email: string };
  users?: { telegram_id: number; username: string } | null;
}

export async function getInvites(): Promise<InviteWithAdmin[]> {
  const { data } = await getSupabase()
    .from('invite_tokens')
    .select('*, admin_accounts:created_by(email), users:used_by_user(telegram_id, username)')
    .order('created_at', { ascending: false });
  return (data || []) as InviteWithAdmin[];
}

export async function createInvite(point: PointEnum): Promise<{ token: string; botLink: string }> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');

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
  await getSupabase().from('invite_tokens').delete().eq('token', token);
  revalidatePath('/users');
}
