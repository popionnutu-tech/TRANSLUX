import { createHmac, timingSafeEqual } from 'crypto';

export interface ParsedFbEvent {
  eventId: string;
  eventType: 'message' | 'comment';
  pageId: string;
  senderId: string;
  text: string;
  commentId?: string;
  raw: unknown;
}

interface MessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
  };
}

interface FeedChange {
  field?: string;
  value?: {
    item?: string;
    verb?: string;
    comment_id?: string;
    message?: string;
    from?: { id?: string; name?: string };
    post_id?: string;
    created_time?: number;
  };
}

interface FbEntry {
  id?: string;
  time?: number;
  messaging?: MessagingEvent[];
  changes?: FeedChange[];
}

interface FbWebhookPayload {
  object?: string;
  entry?: FbEntry[];
}

export function verifySignature(rawBody: string, headerSig: string | null, appSecret: string): boolean {
  if (!headerSig || !headerSig.startsWith('sha256=')) return false;
  const provided = headerSig.slice('sha256='.length);
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(provided, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function parseWebhookPayload(payload: FbWebhookPayload): ParsedFbEvent[] {
  const events: ParsedFbEvent[] = [];
  if (!payload || !Array.isArray(payload.entry)) return events;

  for (const entry of payload.entry) {
    const pageId = entry.id || '';

    if (Array.isArray(entry.messaging)) {
      for (const m of entry.messaging) {
        if (!m.message?.text) continue;
        if (m.message.is_echo) continue;
        const senderId = m.sender?.id;
        if (!senderId) continue;
        if (senderId === pageId) continue;
        events.push({
          eventId: m.message.mid || `dm-${pageId}-${senderId}-${m.timestamp || Date.now()}`,
          eventType: 'message',
          pageId,
          senderId,
          text: m.message.text,
          raw: m,
        });
      }
    }

    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        if (change.field !== 'feed') continue;
        const v = change.value;
        if (!v) continue;
        if (v.item !== 'comment') continue;
        if (v.verb !== 'add') continue;
        if (!v.comment_id || !v.message) continue;
        if (!v.from?.id) continue;
        if (v.from.id === pageId) continue;
        events.push({
          eventId: v.comment_id,
          eventType: 'comment',
          pageId,
          senderId: v.from.id,
          text: v.message,
          commentId: v.comment_id,
          raw: change,
        });
      }
    }
  }

  return events;
}
