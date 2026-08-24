-- 274_retur_uzina.sql
-- Retur cu ALTĂ mașină pe cursele de uzină (Ion, 24.08): când rutiera se strică pe rută,
-- Alexei pune alt auto pe întoarcere. Un rând rămâne o tură; returul e coloană, nu rând nou.
-- NULL = returul îl face aceeași mașină / același șofer ca turul (ca daily_assignments,
-- unde mecanismul există din migrația 014 pentru interurban).
-- Spec: docs/superpowers/specs/2026-08-24-retur-auto-curse-uzina-design.md

ALTER TABLE lde_atribuiri_zilnice
  ADD COLUMN IF NOT EXISTS vehicle_id_retur uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_id_retur  uuid REFERENCES drivers(id)  ON DELETE SET NULL;

-- Invariantul turului («mașina merge mereu cu șofer») se traduce pe retur în: un șofer de
-- retur fără mașină de retur n-are sens. Mașină fără șofer e permisă — atunci conduce
-- șoferul turului, exact ca `driver_id_retur ?? driver_id` la interurban.
ALTER TABLE lde_atribuiri_zilnice
  DROP CONSTRAINT IF EXISTS lde_atribuiri_retur_sofer_fara_masina;
ALTER TABLE lde_atribuiri_zilnice
  ADD CONSTRAINT lde_atribuiri_retur_sofer_fara_masina
  CHECK (driver_id_retur IS NULL OR vehicle_id_retur IS NOT NULL);

COMMENT ON COLUMN lde_atribuiri_zilnice.vehicle_id_retur IS
  'Mașina care face DOAR returul (defecțiune pe rută). NULL = returul îl face vehicle_id.';
COMMENT ON COLUMN lde_atribuiri_zilnice.driver_id_retur IS
  'Șoferul de pe mașina de retur. NULL = returul îl face driver_id. Cere vehicle_id_retur.';

-- Fără indexuri noi: coloanele se citesc în feliile deja acoperite de
-- uq_lde_atribuiri_date_key (date, route_key) și idx_lde_atribuiri_date_dir (date, direction).
