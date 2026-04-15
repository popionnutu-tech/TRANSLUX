-- ============================================================
-- 030: Facebook auto-reply bot (Messenger DM + page comments)
-- ============================================================

-- Configuration for one connected Facebook page.
-- Long-lived page access token, system prompt for Claude, and kill-switches.
CREATE TABLE fb_messaging_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT NOT NULL UNIQUE,
  page_name TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  system_prompt TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  auto_reply_comments BOOLEAN NOT NULL DEFAULT true,
  auto_reply_dm BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversation history per page + per user (psid for DM, author id for comments).
-- Used to feed the last N messages back into Claude for multi-turn context.
CREATE TABLE fb_conversations (
  id BIGSERIAL PRIMARY KEY,
  page_id TEXT NOT NULL,
  psid TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('dm', 'comment')),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  fb_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fb_conversations_lookup
  ON fb_conversations (page_id, psid, created_at DESC);

-- Raw webhook events (for idempotency + audit + cost tracking).
CREATE TABLE fb_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  page_id TEXT,
  sender_id TEXT,
  payload JSONB NOT NULL,
  reply_text TEXT,
  usage JSONB,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fb_events_created ON fb_events (created_at DESC);
CREATE INDEX idx_fb_events_page ON fb_events (page_id, created_at DESC);
