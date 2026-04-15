import { getSupabase } from '@/lib/supabase';
import type { FbConversation, FbMessagingConfig } from '@translux/db';
import type { ParsedFbEvent } from './webhook-parser';
import { runClaudeAgent, type AgentMessage } from './claude-agent';
import { sendMessengerMessage, replyToComment } from './sender';

const HISTORY_LIMIT = 10;

async function loadConfig(pageId: string): Promise<FbMessagingConfig | null> {
  const { data } = await getSupabase()
    .from('fb_messaging_config')
    .select('*')
    .eq('page_id', pageId)
    .maybeSingle();
  return (data as FbMessagingConfig | null) || null;
}

async function loadHistory(pageId: string, psid: string): Promise<AgentMessage[]> {
  const { data } = await getSupabase()
    .from('fb_conversations')
    .select('role, content')
    .eq('page_id', pageId)
    .eq('psid', psid)
    .eq('channel', 'dm')
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  const rows = (data as Pick<FbConversation, 'role' | 'content'>[] | null) || [];
  return rows
    .reverse()
    .map(r => ({ role: r.role, content: r.content }));
}

async function appendHistory(
  pageId: string,
  psid: string,
  channel: 'dm' | 'comment',
  role: 'user' | 'assistant',
  content: string,
  fbMessageId?: string,
) {
  await getSupabase().from('fb_conversations').insert({
    page_id: pageId,
    psid,
    channel,
    role,
    content,
    fb_message_id: fbMessageId || null,
  });
}

async function markEvent(
  eventId: string,
  fields: { reply_text?: string | null; usage?: unknown; error?: string | null },
) {
  await getSupabase()
    .from('fb_events')
    .update({
      processed_at: new Date().toISOString(),
      reply_text: fields.reply_text ?? null,
      usage: fields.usage ?? null,
      error: fields.error ?? null,
    })
    .eq('event_id', eventId);
}

export async function processEvent(event: ParsedFbEvent): Promise<void> {
  try {
    const config = await loadConfig(event.pageId);
    if (!config) {
      await markEvent(event.eventId, { error: 'No fb_messaging_config for this page' });
      return;
    }
    if (!config.enabled) {
      await markEvent(event.eventId, { error: 'Bot disabled (kill-switch)' });
      return;
    }
    if (event.senderId === config.page_id) {
      await markEvent(event.eventId, { error: 'Skipped own message (loop protection)' });
      return;
    }
    if (event.eventType === 'message' && !config.auto_reply_dm) {
      await markEvent(event.eventId, { error: 'DM auto-reply disabled' });
      return;
    }
    if (event.eventType === 'comment' && !config.auto_reply_comments) {
      await markEvent(event.eventId, { error: 'Comment auto-reply disabled' });
      return;
    }

    const history = event.eventType === 'message'
      ? await loadHistory(config.page_id, event.senderId)
      : [];

    const messages: AgentMessage[] = [...history, { role: 'user', content: event.text }];

    const agent = await runClaudeAgent({
      systemPrompt: config.system_prompt,
      messages,
    });

    const channel = event.eventType === 'message' ? 'dm' : 'comment';

    let sendResult;
    if (event.eventType === 'message') {
      sendResult = await sendMessengerMessage(config.page_access_token, event.senderId, agent.text);
    } else {
      sendResult = await replyToComment(config.page_access_token, event.commentId!, agent.text);
    }

    if (!sendResult.ok) {
      if (sendResult.expiredToken) {
        await getSupabase()
          .from('fb_messaging_config')
          .update({ enabled: false })
          .eq('page_id', config.page_id);
      }
      await markEvent(event.eventId, {
        reply_text: agent.text,
        usage: agent.usage,
        error: `Send failed: ${sendResult.error}`,
      });
      return;
    }

    if (channel === 'dm') {
      await appendHistory(config.page_id, event.senderId, 'dm', 'user', event.text, event.eventId);
      await appendHistory(config.page_id, event.senderId, 'dm', 'assistant', agent.text);
    } else {
      await appendHistory(
        config.page_id,
        event.senderId,
        'comment',
        'user',
        event.text,
        event.commentId,
      );
      await appendHistory(config.page_id, event.senderId, 'comment', 'assistant', agent.text);
    }

    await markEvent(event.eventId, {
      reply_text: agent.text,
      usage: agent.usage,
    });
  } catch (err) {
    await markEvent(event.eventId, { error: (err as Error).message });
  }
}
