-- 351_peron_operator_photo.sql
-- Poza operatorului de peron la deschiderea turei (Ion, 14.09.2026): «la început
-- de smenă operatorul să fie fotografiat de șofer, să se vadă că și el respectă
-- uniforma». Aceleași criterii și același model ca la poza șoferului
-- (apps/bot/src/services/driverCheck.ts), dar subiectul e operatorul, nu un
-- șofer la o cursă — de aceea tabelă separată: driver_appearance_checks cere
-- trip_id și driver_id, aici nu există niciunul.
--
-- O linie = o poză acceptată (persoana vizibilă, cadrul întreg) sau EROARE
-- (modelul n-a răspuns: verdictele null, poza rămâne pentru admin). Pozele
-- refuzate (nimeni în cadru, cadru tăiat) nu lasă rând — ca la șofer.
-- Fișierul stă în report-photos/operator/<zi>/<user>-<ts>.jpg și se șterge
-- după 30 de zile (photoRetention.ts); verdictele rămân.

create table if not exists peron_operator_checks (
  id uuid primary key default gen_random_uuid(),
  check_date date not null,
  user_id uuid not null references users(id),
  storage_key text not null,
  person_visible boolean,
  uniform_ok boolean,
  shaved_ok boolean,
  groomed_ok boolean,
  description text,
  model text,
  location_lat double precision,
  location_lon double precision,
  photo_deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_peron_operator_checks_day
  on peron_operator_checks (check_date, user_id, created_at);

alter table peron_operator_checks enable row level security;

comment on table peron_operator_checks is
  'Poza operatorului de peron la deschiderea turei (făcută de un șofer), verdictul modelului: uniformă, bărbierit, aspect. Ion, 14.09.2026.';
