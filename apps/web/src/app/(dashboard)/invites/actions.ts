'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import type { InviteToken, PointEnum } from '@translux/db';
import crypto from 'crypto';

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
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
  });

  if (error) throw new Error(error.message);

  // Bot link — the admin needs to set BOT_USERNAME env var or we use a placeholder
  const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || 'TransluxBot';
  const botLink = `https://t.me/${botUsername}?start=${token}`;

  revalidatePath('/invites');
  return { token, botLink };
}

export async function deleteInvite(token: string) {
  await getSupabase().from('invite_tokens').delete().eq('token', token);
  revalidatePath('/invites');
}
