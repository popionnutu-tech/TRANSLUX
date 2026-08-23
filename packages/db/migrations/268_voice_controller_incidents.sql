-- Контролёр голосового агента: журнал расхождений и самолечений.
-- Ион (23.08.2026): контролёр не шлёт алерты — фиксит сам; журнал вместо пушей.
create table if not exists voice_controller_incidents (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  conversation_id text,
  kind text not null, -- 'config_drift' | 'spoken_time_mismatch' | 'prompt_drift'
  details jsonb not null default '{}'::jsonb,
  healed boolean not null default false
);

create index if not exists idx_vci_created on voice_controller_incidents (created_at desc);
-- Дедуп повторных находок по одному звонку между прогонами.
create unique index if not exists idx_vci_dedupe
  on voice_controller_incidents (conversation_id, kind, (details->>'spoken'))
  where conversation_id is not null;
