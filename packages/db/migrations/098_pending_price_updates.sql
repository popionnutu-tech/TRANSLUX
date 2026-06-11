-- 098_pending_price_updates.sql
-- Gate de confirmare pentru tarife ANTA: fetch-ul creează o PROPUNERE (pending),
-- iar tarifele se aplică peste tot DOAR după ce un admin apasă Confirmă în Telegram.
-- Scris/citit doar de service_role (admin lib + bot prin admin-API). RLS pornit, fără policy publică.

create table if not exists pending_price_updates (
  id uuid primary key default gen_random_uuid(),
  rate_interurban_long numeric(6,4) not null,
  rate_interurban_short numeric(6,4) not null,
  rate_suburban numeric(6,4) not null,          -- deja rezolvat (niciodată null)
  effective_date date,                           -- din „începând cu DD.MM.YYYY"
  prev_interurban_long numeric(6,4),
  prev_interurban_short numeric(6,4),
  prev_suburban numeric(6,4),
  preview jsonb,                                 -- prețuri destinații populare, pentru mesajul Telegram
  source text not null default 'cron',           -- 'cron' | 'manual'
  source_url text,
  status text not null default 'pending',        -- pending | approved | rejected | superseded
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by bigint                              -- telegram_id al adminului care a decis
);

create index if not exists idx_pending_price_updates_status
  on pending_price_updates (status, created_at desc);

alter table pending_price_updates enable row level security;
