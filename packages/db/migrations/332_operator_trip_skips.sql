-- 332_operator_trip_skips.sql
-- «N-am fost la cursă» în aplicația de peron (Vitalie prin Ion, 09.09.2026):
-- «Aurel dimineața vine mai târziu, 07:30. Foto la 06:55, 07:30 n-o să poată face».
-- Grila e strict secvențială: cursa 06:55 bloca tot ce urmează, iar poarta de
-- curățenie era legată de prima cursă din orar. Operatorul care n-a fost la o
-- cursă o marchează ca sărită și trece mai departe.
--
-- O linie = «operatorul n-a fost la cursa asta» (nu e «microbuz absent» — acela
-- rămâne reports.status = 'ABSENT'). Nu se scrie nimic în `reports`: tabla de
-- încărcare, scoring-ul și pivotul văd cursa ca neraportată, cum era și până acum
-- când lipsea operatorul. Cursele sărite apar doar în digestul de seară, cu numele.
-- Unic pe (zi, punct, cursă): a doua apăsare dă 23505 → 409 ALREADY_SKIPPED.

create table if not exists operator_trip_skips (
  id uuid primary key default gen_random_uuid(),
  skip_date date not null,
  point point_enum not null,
  trip_id uuid not null references trips(id),
  user_id uuid not null references users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_operator_trip_skips_unique
  on operator_trip_skips (skip_date, point, trip_id);

alter table operator_trip_skips enable row level security;
