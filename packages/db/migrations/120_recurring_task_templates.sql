-- Этап D-2 задачника: повторяющиеся задачи (шаблоны).
-- Генератор (бот, раз в день утром) создаёт из активного шаблона обычную obligation на сегодня,
-- если сегодня подходит по периоду (daily | mon_fri) и ещё не генерили (last_generated_date != сегодня).
create table if not exists public.recurring_task_templates (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.users(id),
  assignee_id uuid not null references public.users(id),
  title text,
  description text not null,
  points integer not null default 30 check (points >= 0),
  period text not null check (period in ('daily', 'mon_fri')),
  deadline_time text not null default '18:00',     -- 'HH:MM' Кишинёв: дедлайн задачи в день генерации
  active boolean not null default true,
  last_generated_date date,                        -- анти-дубль, переживает рестарт бота
  created_at timestamptz not null default now()
);

create index if not exists idx_recurring_active
  on public.recurring_task_templates (active) where active = true;

-- Доступ только через service-role (как obligations*). RLS включён без политик = deny-all для anon/authenticated.
alter table public.recurring_task_templates enable row level security;
