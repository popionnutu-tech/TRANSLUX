-- 325_lde_camioane_asteapta_descarcare.sql
-- Starea «plin, așteaptă descărcarea» pentru cursele camioanelor (Ion, 08.09:
-- «auto uneori sunt pline și așteaptă descărcarea»).
--
-- E stare de CURSĂ, nu de zi: camionul nu e liber (are marfă în el), dar nici
-- nu rulează. Nu intră în drumul obișnuit — dispecerul o alege doar când e
-- cazul, din «la_incarcare» (stă plin la bază) sau din «spre_descarcare» (stă
-- la coadă la destinație), și iese spre descărcare. Tranzițiile le păzește
-- codul (lib/lde/camioane.ts); baza doar admite valoarea.

alter table lde_truck_trips drop constraint if exists lde_truck_trips_status_check;
alter table lde_truck_trips add constraint lde_truck_trips_status_check check (status in
  ('planificata','spre_incarcare','la_incarcare','asteapta_descarcare','spre_descarcare','la_descarcare','incheiata','anulata'));

comment on column lde_truck_trips.status is
  'planificata → spre_incarcare → la_incarcare → spre_descarcare → la_descarcare → incheiata; lateral: asteapta_descarcare (plin, stă) între încărcare și descărcare; anulata cu motiv.';
