'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import type { SmmAccount, SmmPlatform } from '@translux/db';

export async function getSmmAccounts(): Promise<SmmAccount[]> {
  const { data } = await getSupabase()
    .from('smm_accounts')
    .select('*')
    .order('platform')
    .order('account_name');
  return (data || []) as SmmAccount[];
}

export async function createSmmAccount(input: {
  platform: SmmPlatform;
  account_name: string;
  platform_id: string;
  access_token: string;
  refresh_token?: string;
  token_expires_at?: string;
}) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const { error } = await getSupabase().from('smm_accounts').insert({
    platform: input.platform,
    account_name: input.account_name.trim(),
    platform_id: input.platform_id.trim(),
    access_token: input.access_token.trim(),
    refresh_token: input.refresh_token?.trim() || null,
    token_expires_at: input.token_expires_at || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/smm-accounts');
}

export async function updateSmmToken(
  id: string,
  access_token: string,
  refresh_token?: string
) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const update: Record<string, string | null> = {
    access_token: access_token.trim(),
  };
  if (refresh_token !== undefined) {
    update.refresh_token = refresh_token.trim() || null;
  }
  await getSupabase().from('smm_accounts').update(update).eq('id', id);
  revalidatePath('/smm-accounts');
}

export async function toggleSmmAccount(id: string, active: boolean) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  await getSupabase().from('smm_accounts').update({ active }).eq('id', id);
  revalidatePath('/smm-accounts');
}

export async function deleteSmmAccount(id: string) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const { error } = await getSupabase()
    .from('smm_accounts')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/smm-accounts');
}
