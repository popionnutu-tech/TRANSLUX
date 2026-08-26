-- 285_voice_lessons.sql
-- Очередь уроков самообучения голосового агента (план 26.08): ночной майнер пишет
-- pending, Ион решает ✓/✗ кнопками в Telegram (бот). kind='alias' — пограничные
-- алиасы, прошедшие барьер Левенштейна, но не прошедшие авто-verify; kind='prompt_lesson' —
-- явные поправки клиента (время, дата, ложный отказ по маршруту, телефон, имя).
-- В payload цитаты клиентов → RLS deny-all, как voice_calls (миграция 226).
create table if not exists voice_lessons (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  conversation_id text,
  kind text not null check (kind in ('alias', 'prompt_lesson')),
  payload jsonb not null default '{}'::jsonb,
  summary text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notified_at timestamptz,  -- claim рассылки: идемпотентность при рестартах бота
  decided_at timestamptz,
  decided_by bigint         -- telegram_id решившего админа, как в pending_price_updates
);

create index if not exists idx_voice_lessons_status
  on voice_lessons (status, created_at desc);
-- Одно живое предложение на heard (повторные прогоны не плодят дубли).
create unique index if not exists idx_voice_lessons_alias_pending
  on voice_lessons (kind, (payload->>'heard')) where kind = 'alias' and status = 'pending';
-- История решений по heard (отклонённое не предлагается снова).
create index if not exists idx_voice_lessons_heard
  on voice_lessons (kind, (payload->>'heard'));

alter table voice_lessons enable row level security;
do $$ begin create policy voice_lessons_deny on voice_lessons using (false) with check (false);
exception when duplicate_object then null; end $$;
