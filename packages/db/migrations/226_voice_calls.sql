-- 226_voice_calls.sql
-- Голосовой агент ElevenLabs: журнал звонков (post-call webhook) и запросы обратного звонка
-- (tool request_callback). Данные персональные (телефон, транскрипт) → RLS deny-all,
-- запись только через service_role из apps/admin.

create table if not exists voice_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null unique,
  direction text not null default 'in',
  caller_phone text,
  transcript jsonb,
  summary text,
  analysis jsonb,
  duration_secs integer,
  cost numeric,
  status text,
  callback_requested boolean not null default false,
  raw_webhook_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists voice_callback_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id text,
  caller_phone text,
  reason text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_voice_calls_created_at on voice_calls (created_at desc);
create index if not exists idx_voice_callback_requests_conversation
  on voice_callback_requests (conversation_id);

alter table voice_calls enable row level security;
do $$ begin create policy voice_calls_deny on voice_calls using (false) with check (false);
exception when duplicate_object then null; end $$;

alter table voice_callback_requests enable row level security;
do $$ begin create policy voice_callback_requests_deny on voice_callback_requests using (false) with check (false);
exception when duplicate_object then null; end $$;
