-- 091_bot_storage.sql
-- Persistent key-value store for the grammY Telegram bot's session AND conversation
-- state. Previously sessions/conversations lived only in memory, so every Railway
-- restart/redeploy wiped an operator's in-progress report. The bot now reads/writes
-- this table (keys: "sess:<chatId>" for session, "conv:<chatId>" for conversation
-- state), so in-progress reports survive restarts.
-- Accessed ONLY via the Supabase service role; RLS is enabled with no policies so
-- anon/authenticated clients cannot read the stored state.

create table if not exists public.bot_storage (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.bot_storage enable row level security;

comment on table public.bot_storage is 'grammY bot session + conversation state (key-value). Service-role only.';
