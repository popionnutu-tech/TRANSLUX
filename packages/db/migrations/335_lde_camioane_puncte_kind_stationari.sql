-- 335_lde_camioane_puncte_kind_stationari.sql
-- Stările camioanelor se pun MAXIMAL automat, dispecerul minimal (Ion, 10.09.2026:
-- «scopul final este ca AI maximal să pună starea la auto și dispecerul minimal»).
-- Spec: docs/specs/camioane-stari-automate.md.
--
-- Trei lucruri:
--  1. `kind` pe puncte — automatul decide după TIPUL punctului, nu după nume:
--     camion oprit ≥ prag la «încărcare biodiesel» = a încărcat biodiesel; oprit la
--     «descărcare diesel» cu diesel în el = descarcă; oprit la «tranzit acte» /
--     «vamă» = nimic, doar scena. Descărcarea cere potrivirea marfă ↔ tip de punct
--     (D4): biodieselul parcat 31 h la Bază Briceni (MOW214, 05–07.09) e tranzit.
--  2. Patru puncte noi găsite în GPS: vama/terminalul de la nord de Berdichev
--     (toate cele 9 cisterne de biodiesel, ~7 h), ZEL Ungheni (parcarea de lângă
--     stație, unde se schimbă actele), vama Otaci, vama Giurgiulești.
--  3. `lde_truck_gps_stationari` — unde STĂ fiecare camion acum și unde a stat
--     ultima dată, ținut minte între rulările worker-ului (la 5 minute). Din el se
--     numără minutele la punct și se vede plecarea (≥15 km, ≥60 min fără întoarcere).
--     Un rând pe camion; istoricul rămâne în lde_gps_stops.
--  4. `lde_truck_auto_alerte` — ce n-a putut decide automatul și trebuie să vadă
--     dispecerul de camioane (D7); trimiterea pe Telegram e separată.

alter table lde_dispatch_points
  add column if not exists kind text
    check (kind in ('incarcare_biodiesel','descarcare_biodiesel','incarcare_diesel','descarcare_diesel',
                    'baza','tranzit_acte','vama','parcare'));
comment on column lde_dispatch_points.kind is
  'Tipul punctului pentru automatul de stări: incarcare_*/descarcare_* pe marfă, baza (Briceni/Bălți — descarcă doar diesel, prag lung), tranzit_acte/vama/parcare (nu schimbă starea). NULL = automatul nu decide nimic la acest punct.';

update lde_dispatch_points set kind = v.kind
from (values
  ('69338ee3-30bb-434a-bac4-e4ce3fe9c0b0'::uuid, 'incarcare_biodiesel'),  -- Bază Berdichev
  ('028af6e6-d1cd-41ab-a8ca-c68834c4a5a4'::uuid, 'descarcare_biodiesel'), -- Ruse
  ('68087292-e05c-47b9-abe7-e4c61dee2cc1'::uuid, 'descarcare_biodiesel'), -- Sofia
  ('e81b27ec-5f68-4568-af8e-d08c29ece694'::uuid, 'incarcare_diesel'),     -- Port Constanța
  ('26cd90a0-c8e8-429a-8f0c-47b1c7f3112c'::uuid, 'incarcare_diesel'),     -- Petromidia
  ('aa4f4c4f-da2b-4317-9c4a-7f1e96ab2ca8'::uuid, 'descarcare_diesel'),    -- TLX Bălți
  ('c9c22536-48b5-400c-83f4-fa9a5bfd2b65'::uuid, 'descarcare_diesel'),    -- TLX Orhei
  ('aef61a49-9417-4f69-b86e-82b5f009dbf2'::uuid, 'descarcare_diesel'),    -- TLX Peresecina
  ('f834edbc-d2e2-49b7-88dd-608d35a33e14'::uuid, 'descarcare_diesel'),    -- TLX Petricani
  ('7e6b406e-e37b-437b-abfb-8f3a2da8ddfd'::uuid, 'descarcare_diesel'),    -- TLX Sîngerei
  ('86371799-b881-4a44-a386-6f0e4098c18d'::uuid, 'descarcare_diesel'),    -- TLX Ungheni
  ('0737f98d-d4f0-41ad-acb9-d9a226497a90'::uuid, 'descarcare_diesel'),    -- Bază Chișinău — Bacioi
  ('d913d13a-522f-42de-8022-84df1236ea93'::uuid, 'descarcare_diesel'),    -- Bază Chișinău — Meșterul Manole
  ('bc36e3e6-46ca-4b71-b813-297b230a0cc6'::uuid, 'baza'),                 -- Bază Briceni
  ('3c1075d8-f42f-421b-ac9e-64ca4d4133b9'::uuid, 'baza')                  -- Bază Bălți
) as v(id, kind)
where lde_dispatch_points.id = v.id and lde_dispatch_points.kind is null;

-- Punctele noi. Numele celui de la nord de Berdichev e provizoriu (Ion: «vamă / acte / terminal»).
insert into lde_dispatch_points (name, country, lat, lng, radius_m, active, kind, created_by)
select v.name, v.country, v.lat, v.lng, v.radius_m, true, v.kind, 'auto:spec-335'
from (values
  ('Vamă/terminal nord Berdichev', 'Ucraina', 50.61, 27.59, 1500, 'tranzit_acte'),
  ('ZEL Ungheni — acte',           'Moldova', 47.2229, 27.8018, 300, 'tranzit_acte'),
  ('Vama Otaci',                    'Moldova', 48.478, 27.770, 1000, 'vama'),
  ('Vama Giurgiulești',             'Moldova', 45.470, 28.190, 1000, 'vama')
) as v(name, country, lat, lng, radius_m, kind)
where not exists (select 1 from lde_dispatch_points p where p.name = v.name);

-- Unde stă camionul acum și unde a stat ultima dată (memoria worker-ului între rulări).
create table if not exists lde_truck_gps_stationari (
  vehicle_id      uuid primary key references vehicles(id) on delete cascade,
  point_id        uuid references lde_dispatch_points(id) on delete set null,
  since           timestamptz,
  last_seen_at    timestamptz,
  prev_point_id   uuid references lde_dispatch_points(id) on delete set null,
  prev_since      timestamptz,
  prev_until      timestamptz,
  last_lat        double precision,
  last_lng        double precision,
  last_at         timestamptz,
  updated_at      timestamptz not null default now()
);
comment on table lde_truck_gps_stationari is
  'Un rând pe camion: în raza cărui punct stă acum (point_id, since, last_seen_at) și ultimul punct din care a plecat (prev_*). Scris de trip-live-worker la 5 minute; din el se numără minutele la punct și plecarea.';
alter table lde_truck_gps_stationari enable row level security;

-- Ce n-a putut decide automatul — de văzut de dispecerul de camioane.
create table if not exists lde_truck_auto_alerte (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references vehicles(id) on delete cascade,
  trip_id     uuid references lde_truck_trips(id) on delete set null,
  fel         text not null,
  mesaj       text not null,
  cheie       text not null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  resolved_at timestamptz
);
comment on table lde_truck_auto_alerte is
  'Alertele automatului de stări (D7): camion plin plecat în altă direcție, oprit >12 h nicăieri, la descărcare fără bon >6 h, bon fără urmă GPS. `cheie` = fel + cursă/zi, ca aceeași alertă să nu se repete la fiecare 5 minute.';
create unique index if not exists uq_lde_truck_auto_alerte_cheie on lde_truck_auto_alerte (cheie);
create index if not exists idx_lde_truck_auto_alerte_netrimise on lde_truck_auto_alerte (created_at) where sent_at is null;
alter table lde_truck_auto_alerte enable row level security;
