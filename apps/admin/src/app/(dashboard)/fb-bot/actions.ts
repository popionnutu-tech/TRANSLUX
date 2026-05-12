'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import type { FbEvent, FbMessagingConfig } from '@translux/db';

export async function getFbConfigs(): Promise<FbMessagingConfig[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data } = await getSupabase()
    .from('fb_messaging_config')
    .select('*')
    .order('created_at', { ascending: false });
  return (data || []) as FbMessagingConfig[];
}

export async function getRecentFbEvents(limit = 50): Promise<FbEvent[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data } = await getSupabase()
    .from('fb_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []) as FbEvent[];
}

export async function updateSystemPrompt(pageId: string, systemPrompt: string) {
  requireRole(await verifySession(), 'ADMIN');
  const { error } = await getSupabase()
    .from('fb_messaging_config')
    .update({ system_prompt: systemPrompt, updated_at: new Date().toISOString() })
    .eq('page_id', pageId);
  if (error) throw new Error(error.message);
  revalidatePath('/fb-bot');
}

export async function setBotEnabled(pageId: string, enabled: boolean) {
  requireRole(await verifySession(), 'ADMIN');
  await getSupabase()
    .from('fb_messaging_config')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('page_id', pageId);
  revalidatePath('/fb-bot');
}

export async function setAutoReplyFlags(
  pageId: string,
  flags: { auto_reply_dm?: boolean; auto_reply_comments?: boolean },
) {
  requireRole(await verifySession(), 'ADMIN');
  await getSupabase()
    .from('fb_messaging_config')
    .update({ ...flags, updated_at: new Date().toISOString() })
    .eq('page_id', pageId);
  revalidatePath('/fb-bot');
}

export async function deleteFbConfig(pageId: string) {
  requireRole(await verifySession(), 'ADMIN');
  await getSupabase().from('fb_messaging_config').delete().eq('page_id', pageId);
  revalidatePath('/fb-bot');
}
