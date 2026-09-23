// Conversațiile asistentului de pe site (migr. 389). Istoria pe care o citește
// modelul vine DE AICI, nu din browser: un client care și-ar trimite singur
// «rezultatul unui tool» ar face modelul să creadă ce vrea el.

import type Anthropic from '@anthropic-ai/sdk';
import { getSupabase } from '@/lib/supabase';

export const CONV_ID_RE = /^conv_site_[0-9a-f-]{36}$/;

export interface SiteConversation {
  id: string;
  locale: 'ro' | 'ru';
  messages: Anthropic.MessageParam[];
  turns: number;
  tools_used: string[];
}

export async function loadConversation(id: string): Promise<SiteConversation | null> {
  if (!CONV_ID_RE.test(id)) return null;
  const { data, error } = await getSupabase()
    .from('site_chat_conversations')
    .select('id, locale, messages, turns, tools_used')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`site_chat_conversations read: ${error.message}`);
  return (data as SiteConversation | null) ?? null;
}

export async function saveConversation(
  conv: SiteConversation, ipHash: string | null, isNew: boolean,
): Promise<void> {
  const row = {
    locale: conv.locale,
    messages: conv.messages,
    turns: conv.turns,
    tools_used: conv.tools_used,
    updated_at: new Date().toISOString(),
  };
  const { error } = isNew
    ? await getSupabase().from('site_chat_conversations').insert({ id: conv.id, ip_hash: ipHash, ...row })
    : await getSupabase().from('site_chat_conversations').update(row).eq('id', conv.id);
  if (error) throw new Error(`site_chat_conversations write: ${error.message}`);
}

/** Cât a vorbit sursa în ultima oră: conversații începute și ture în total. */
export async function usageLastHour(ipHash: string): Promise<{ conversations: number; turns: number }> {
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data, error } = await getSupabase()
    .from('site_chat_conversations')
    .select('turns, created_at')
    .eq('ip_hash', ipHash)
    .gte('updated_at', since)
    .limit(200);
  // Baza nu răspunde: nu blocăm omul pe o citire de statistică.
  if (error || !data) return { conversations: 0, turns: 0 };
  return {
    conversations: data.filter((r) => r.created_at >= since).length,
    turns: data.reduce((s, r) => s + (r.turns ?? 0), 0),
  };
}
