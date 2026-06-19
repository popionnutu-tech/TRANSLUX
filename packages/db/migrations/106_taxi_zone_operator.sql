-- 106_taxi_zone_operator.sql
-- Новый тип оператора Кишинёва — «зона такси». Он ПЕРВЫМ вводит число приведённых
-- с зоны такси пассажиров на рейс (+гео), основной оператор это видит и
-- подтверждает/исправляет своим итогом. Числа НЕ сливаются.
--
-- users.operator_kind: 'MAIN' (по умолчанию, все текущие операторы) | 'TAXI_ZONE'.
-- taxi_zone_reports: отдельная таблица — чтобы основной отчёт, доска загрузки и
--   уникальность (report_date, point, trip) остались нетронуты. Такси-число живёт ТОЛЬКО тут.
-- reports.taxi_zone_skipped: основной сдал отчёт без сверки с зоной такси (такси-оператор не на смене).

alter table users add column if not exists operator_kind text not null default 'MAIN';
alter table users drop constraint if exists users_operator_kind_check;
alter table users add constraint users_operator_kind_check check (operator_kind in ('MAIN','TAXI_ZONE'));

create table if not exists taxi_zone_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  trip_id uuid not null references trips(id),
  status text not null default 'OK' check (status in ('OK','ABSENT')),
  passengers_count integer,            -- null when status='ABSENT'
  location_ok boolean,
  created_by_user uuid not null references users(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references users(id)
);
create unique index if not exists idx_taxi_zone_reports_unique_active
  on taxi_zone_reports(report_date, trip_id) where cancelled_at is null;
create index if not exists idx_taxi_zone_reports_date
  on taxi_zone_reports(report_date) where cancelled_at is null;

alter table reports add column if not exists taxi_zone_skipped boolean not null default false;
