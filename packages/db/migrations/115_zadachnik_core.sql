-- 115_zadachnik_core.sql
-- Порт задачника (zadachnik) из TLX 1:1 — ЯДРО (этап A). Поток задач между ADMIN (постановщик)
-- и CONTROLLER (исполнитель). Имена таблиц/enum сохранены как в TLX, чтобы lib/API переносились дословно.
-- FK creator_id/assignee_id → TRANSLUX users(id). organization_id — заглушка (одна организация).
-- Recurring (recurring_templates/instances) — отдельной миграцией на этапе D.
-- Enum-значения взяты из ФИНАЛЬНОЙ живой схемы TLX (включая overdue/ignored/failed и поздние действия крона).

-- ── ENUMS ──
do $$ begin
  create type obligation_state as enum (
    'created','sent','delivered','accepted','in_progress','report_pending',
    'resolved','rejected','cancelled','overdue','overdue_responded','ignored','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type obligation_event_type as enum (
    'created','sent','delivered','accepted_by_user','auto_accepted','started','report_submitted',
    'approved','rejected','rework_requested','cancelled','cron_heartbeat','overdue','overdue_responded',
    'ignored','failed','extension_approved','extension_rejected','retry_created','auto_approved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attempt_verdict as enum ('pending','accepted','rejected','rework');
exception when duplicate_object then null; end $$;

do $$ begin
  create type scheduled_action_type as enum (
    'auto_accept','reminder_acceptance','reminder_deadline_tomorrow','reminder_report_pending_long',
    'overdue_check','ignore_check','extension_auto_approve','report_auto_approve');
exception when duplicate_object then null; end $$;

-- ── obligations (главная: задача-обязательство) ──
create table if not exists obligations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,

  creator_id uuid not null references users(id) on delete restrict,
  assignee_id uuid not null references users(id) on delete restrict,

  title text,
  description text not null,
  points integer not null default 30 check (points >= 0),

  original_deadline timestamptz not null,   -- неизменяемый
  current_deadline timestamptz not null,    -- меняется при rework

  current_state obligation_state not null default 'created',
  rework_used boolean not null default false,

  retry_number integer not null default 1,
  root_task_id uuid references obligations(id) on delete set null,

  year integer,   -- заполняется триггером (Chișinău TZ); GENERATED не immutable на timestamptz
  month integer,

  attachments jsonb not null default '[]'::jsonb,   -- [{url,name,type,size}]

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_obligations_assignee_state on obligations(assignee_id, current_state);
create index if not exists idx_obligations_creator on obligations(creator_id);
create index if not exists idx_obligations_state_deadline on obligations(current_state, current_deadline);

-- ── obligation_attempts (история отчётов/попыток) ──
create table if not exists obligation_attempts (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references obligations(id) on delete cascade,
  number integer not null check (number >= 1),
  report_text text,
  verdict attempt_verdict not null default 'pending',
  manager_comment text,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (obligation_id, number)
);

create index if not exists idx_attempts_obligation on obligation_attempts(obligation_id);
create index if not exists idx_attempts_pending on obligation_attempts(verdict) where verdict = 'pending';

-- ── obligation_events (append-only журнал событий) ──
create table if not exists obligation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  obligation_id uuid references obligations(id) on delete cascade,  -- nullable для cron_heartbeat
  event_type obligation_event_type not null,
  actor_id uuid references users(id) on delete set null,  -- null = system
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_events_obligation on obligation_events(obligation_id, created_at desc);
create index if not exists idx_events_type_time on obligation_events(event_type, created_at desc);

create or replace function obligation_events_prevent_modify()
returns trigger language plpgsql as $$
begin
  raise exception 'obligation_events is append-only; UPDATE/DELETE forbidden';
end;
$$;

drop trigger if exists trg_obligation_events_no_update on obligation_events;
create trigger trg_obligation_events_no_update
  before update on obligation_events
  for each row execute function obligation_events_prevent_modify();

drop trigger if exists trg_obligation_events_no_delete on obligation_events;
create trigger trg_obligation_events_no_delete
  before delete on obligation_events
  for each row execute function obligation_events_prevent_modify();

-- ── obligation_scheduled_actions (будильники крона) ──
create table if not exists obligation_scheduled_actions (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references obligations(id) on delete cascade,
  action_type scheduled_action_type not null,
  scheduled_at timestamptz not null,
  executed_at timestamptz,  -- null = ждёт исполнения
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_scheduled_actions_pending
  on obligation_scheduled_actions(scheduled_at) where executed_at is null;
create index if not exists idx_scheduled_actions_obligation
  on obligation_scheduled_actions(obligation_id, action_type);

-- ── computed (year/month из current_deadline в Chișinău TZ) + updated_at ──
create or replace function obligations_set_computed()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  new.year := extract(year from (new.current_deadline at time zone 'Europe/Chisinau'))::int;
  new.month := extract(month from (new.current_deadline at time zone 'Europe/Chisinau'))::int;
  return new;
end;
$$;

drop trigger if exists trg_obligations_before_write on obligations;
create trigger trg_obligations_before_write
  before insert or update on obligations
  for each row execute function obligations_set_computed();

-- ── RLS: deny all (всё через service_role в API, как в TLX) ──
alter table obligations enable row level security;
do $$ begin create policy obligations_deny on obligations using (false) with check (false);
exception when duplicate_object then null; end $$;

alter table obligation_attempts enable row level security;
do $$ begin create policy obligation_attempts_deny on obligation_attempts using (false) with check (false);
exception when duplicate_object then null; end $$;

alter table obligation_events enable row level security;
do $$ begin create policy obligation_events_deny on obligation_events using (false) with check (false);
exception when duplicate_object then null; end $$;

alter table obligation_scheduled_actions enable row level security;
do $$ begin create policy obligation_scheduled_actions_deny on obligation_scheduled_actions using (false) with check (false);
exception when duplicate_object then null; end $$;

comment on table obligations is 'Zadachnik (порт из TLX): задачи между ADMIN (постановщик) и CONTROLLER (исполнитель).';
comment on table obligation_events is 'Append-only журнал. UPDATE/DELETE запрещены триггерами.';
comment on table obligation_scheduled_actions is 'Будильники крона. executed_at IS NULL = ждёт. Воркер берёт через FOR UPDATE SKIP LOCKED.';
