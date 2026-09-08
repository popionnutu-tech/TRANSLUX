-- 328_peron_app.sql
-- Aplicația Android pentru operatorul de peron (Ion, 08.09.2026): «să nu mai
-- arunce geolocația, să lucreze în mare parte prin poze și curățenia la peron».
-- Cursele, poza șoferului, pozele de curățenie și prezența GPS pe toată tura
-- vin dintr-o aplicație Expo care vorbește cu API-ul din bot (/app/v1/...).
--
-- Ce se schimbă:
--   * reports         — de unde a venit raportul (bot / app) + coordonatele brute
--                       trimise de aplicație; location_ok rămâne calculat pe server.
--   * driver_appearance_checks — poza șoferului la cursă: verdictul modelului și
--                       cel confirmat de operator (ambele se păstrează).
--   * peron_presence_pings     — ping GPS la 2 minute pe toată tura; perioadele de
--                       lipsă/fără semnal se calculează seara, în digest.
--   * peron_cleaning_checks    — sursa pozei, coordonatele, marcajul de ștergere a
--                       fișierului după 30 de zile (linia rămâne).
--   * peron_app_link_codes     — cod de conectare (6 cifre, 24 h, o singură
--                       folosire) generat de admin pentru un CONTROLLER.
--   * peron_app_sessions       — sesiunea aplicației; token-ul stă pe telefon,
--                       aici doar sha256(token). Nu expiră, se revocă din admin.
-- Pozele (soferi/, curatenie/) se șterg din bucket după 30 de zile; verdictele rămân.

-- reports: de unde a venit raportul + coordonatele brute (aplicația le trimite)
alter table reports add column if not exists source text not null default 'bot'
  check (source in ('bot', 'app'));
alter table reports add column if not exists location_lat double precision;
alter table reports add column if not exists location_lon double precision;
alter table reports add column if not exists location_accuracy_m integer;

-- Poza șoferului la cursă: verdictul modelului și cel confirmat de operator
create table if not exists driver_appearance_checks (
  id uuid primary key default gen_random_uuid(),
  check_date date not null,
  trip_id uuid not null references trips(id),
  driver_id uuid references drivers(id),
  storage_key text not null,
  person_visible boolean,
  uniform_ok_model boolean,
  groomed_ok_model boolean,
  uniform_ok boolean,          -- confirmat de operator
  groomed_ok boolean,          -- confirmat de operator
  description text,
  model text,
  location_lat double precision,
  location_lon double precision,
  photo_deleted_at timestamptz,
  created_by_user uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_driver_appearance_checks_day
  on driver_appearance_checks (check_date, trip_id);
alter table driver_appearance_checks enable row level security;
alter table reports add column if not exists driver_check_id uuid references driver_appearance_checks(id);

-- Prezență GPS pe toată tura (ping la 2 minute din aplicație)
create table if not exists peron_presence_pings (
  id bigserial primary key,
  user_id uuid not null references users(id),
  point point_enum not null,
  at timestamptz not null,
  lat double precision not null,
  lon double precision not null,
  accuracy_m integer,
  in_zone boolean not null
);
create index if not exists idx_peron_presence_pings_user_at on peron_presence_pings (user_id, at);
alter table peron_presence_pings enable row level security;

-- peron_cleaning_checks: sursa, coordonatele, ștergerea pozei după 30 de zile
alter table peron_cleaning_checks add column if not exists source text not null default 'bot'
  check (source in ('bot', 'app'));
alter table peron_cleaning_checks add column if not exists location_lat double precision;
alter table peron_cleaning_checks add column if not exists location_lon double precision;
alter table peron_cleaning_checks add column if not exists photo_deleted_at timestamptz;

-- Cod de conectare (6 cifre, 24 h, o singură folosire), generat de admin
create table if not exists peron_app_link_codes (
  code text primary key,
  user_id uuid not null references users(id),
  created_by uuid references admin_accounts(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Sesiune de aplicație (token-ul stă pe telefon; aici doar hash-ul)
create table if not exists peron_app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  token_hash text not null unique,
  device_label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
create index if not exists idx_peron_app_sessions_user on peron_app_sessions (user_id);
alter table peron_app_link_codes enable row level security;
alter table peron_app_sessions enable row level security;
