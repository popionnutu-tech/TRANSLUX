-- 331_lde_camioane_loc_liber.sql
-- Eduard (dispecer), 09.09: «эта машина поехала по заданию Нуцу Ивановича —
-- при выборе alta должно появиться что-то кроме наших точек погрузки и
-- разгрузки». Un zernovoz dus cu materiale la un șantier n-are punct în
-- nomenclator și nici nu trebuie să aibă: locul e de o singură dată.
--
-- Locul liber e TEXT lângă punct, nu în locul lui: cursa are ori punctul din
-- listă (cu GPS automat și țară), ori un loc scris de mână (fără automat —
-- starea o mută dispecerul). Niciodată amândouă goale.

alter table lde_truck_trips
  add column if not exists load_place text,
  add column if not exists unload_place text;

comment on column lde_truck_trips.load_place is
  'Loc de încărcare scris liber, când nu e în lde_dispatch_points (șantier, client ocazional). Fără coordonate: nu primește stare automată din GPS.';
comment on column lde_truck_trips.unload_place is
  'Loc de descărcare scris liber, când nu e în lde_dispatch_points. Fără coordonate: GPS-ul nu pune «la descărcare», TLX nu închide cursa.';

alter table lde_truck_trips
  drop constraint if exists lde_truck_trips_load_loc,
  add constraint lde_truck_trips_load_loc
    check (load_point_id is not null or nullif(btrim(load_place), '') is not null),
  drop constraint if exists lde_truck_trips_unload_loc,
  add constraint lde_truck_trips_unload_loc
    check (unload_point_id is not null or nullif(btrim(unload_place), '') is not null);
