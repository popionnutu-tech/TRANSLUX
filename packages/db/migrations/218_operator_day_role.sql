-- 218: rol de operator pe zi (override peste users.operator_kind).
-- Ex: Aurel lucrează o zi zona taxi, altă zi la peron Chișinău — alege singur în bot.
-- Rolul efectiv azi = rândul de azi DACĂ există, altfel users.operator_kind (primarul/fallback).
create table if not exists public.operator_day_role (
  user_id   uuid not null references public.users(id) on delete cascade,
  work_date date not null,                                   -- ziua Chișinău
  role      text not null check (role in ('MAIN', 'TAXI_ZONE')),
  set_at    timestamptz not null default now(),
  primary key (user_id, work_date)
);

create index if not exists idx_operator_day_role_date on public.operator_day_role (work_date);

-- Acces doar prin service_role (ca restul tabelelor botului). RLS on fără politici = deny-all.
alter table public.operator_day_role enable row level security;

comment on table public.operator_day_role is
  'Rolul de operator ales pe zi (override peste users.operator_kind). Aurel: zona taxi vs peron, pe zi.';
