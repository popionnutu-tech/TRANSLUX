-- 326_peron_curatenie.sql
-- Verificarea curățeniei la peronul Chișinău prin poze (Ion, 08.09):
-- «zilnic operatorul de peron trebuie să introducă 3 poze dimineața înainte
-- de deschiderea turei și pe la 15:00 încă o dată; la 16:25 fără poze nu
-- poate introduce cursa; murdar = atenționat că se stochează și se penalizează».
--
-- O linie = o poză trimisă. Zona e completă pe (zi, tură) când ultima poză a
-- zonei are verdict CURAT sau MURDAR (ALT_LOC cere refacere; EROARE = modelul
-- n-a răspuns, poza rămâne pentru verificare manuală și nu blochează operatorul).
-- Verdictul îl dă Claude (vision) din bot; poza stă în bucket-ul report-photos.

create table if not exists peron_cleaning_checks (
  id uuid primary key default gen_random_uuid(),
  check_date date not null,
  slot text not null check (slot in ('DIMINEATA', 'ZIUA')),
  zone text not null check (zone in ('PERON', 'PIETONI', 'VECEU')),
  storage_key text not null,
  telegram_file_id text not null,
  verdict text not null check (verdict in ('CURAT', 'MURDAR', 'ALT_LOC', 'EROARE')),
  problems text[] not null default '{}',
  description text,
  model text,
  created_by_user uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_peron_cleaning_checks_day
  on peron_cleaning_checks (check_date, slot, zone, created_at desc);

alter table peron_cleaning_checks enable row level security;
