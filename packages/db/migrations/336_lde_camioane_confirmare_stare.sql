-- 336_lde_camioane_confirmare_stare.sql
-- Dispecerul nu mai pune stări, le CONFIRMĂ (Ion, 10.09: «acum tot ce face
-- dispecerul — confirmă starea, dacă e corect sau nu corect identificat de AI»).
-- Starea pusă de automat (status_source gps/tlx) așteaptă un «corect» sau un
-- «greșit»; «corect» scrie aici cine și când, «greșit» duce la o corectură
-- manuală (status_source = manual, care e confirmată prin definiție).
-- Automatul golește confirmarea la fiecare stare nouă pe care o pune.

alter table lde_truck_trips
  add column if not exists status_confirmed_at timestamptz,
  add column if not exists status_confirmed_by text;
comment on column lde_truck_trips.status_confirmed_at is
  'Dispecerul a confirmat starea pusă de automat («corect»). NULL = neconfirmată sau pusă manual (manualul e confirmat prin definiție). Se golește la fiecare stare nouă pusă de automat.';
create index if not exists idx_lde_truck_trips_neconfirmate
  on lde_truck_trips (status_changed_at) where status_source <> 'manual' and status_confirmed_at is null and status not in ('anulata');
