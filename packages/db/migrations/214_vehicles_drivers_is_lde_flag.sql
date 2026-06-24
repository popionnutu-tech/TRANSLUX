-- ============================================================================
-- Izolare LDE în tabelele COMUNE vehicles/drivers (fix Critical din review 22.06)
-- Seed-ul LDE 204 a inserat ~88 mașini + 88 șoferi în vehicles/drivers (active=true),
-- care «se vedeau» în pickerele non-LDE (numarare/grafic/assignments/incasare) + botul Telegram.
-- Soluție: flag is_lde pe rândurile introduse de seed-ul LDE; listele non-LDE filtrează WHERE NOT is_lde.
--
-- is_lde = true DOAR pentru rândurile inserate de seed-ul 204:
--   created în fereastra de seed (2026-06-22) ȘI legate de LDE (norms/route_vehicles / driver_extras).
-- Cele 14 mașini preexistente legate de LDE (ex: 711CWN din 009) și cei 4 șoferi preexistenți
-- (match exact pe nume) NU sunt marcați — rămân partajați, vizibili peste tot.
-- ============================================================================

BEGIN;

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_lde boolean NOT NULL DEFAULT false;
ALTER TABLE drivers  ADD COLUMN IF NOT EXISTS is_lde boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN vehicles.is_lde IS 'true = mașină din autopark LDE (uzine), introdusă de seed-ul LDE 204. Listele/pickerele non-LDE (numarare/grafic/assignments/incasare/bot) filtrează WHERE NOT is_lde. Cele 14 mașini preexistente legate de LDE NU sunt marcate (rămân partajate).';
COMMENT ON COLUMN drivers.is_lde  IS 'true = șofer LDE (uzine), introdus de seed-ul LDE 204. Listele/pickerele non-LDE filtrează WHERE NOT is_lde. Cei 4 șoferi preexistenți (match exact pe nume) NU sunt marcați.';

UPDATE vehicles SET is_lde = true
WHERE created_at >= '2026-06-22' AND created_at < '2026-06-23'
  AND id IN (
    SELECT vehicle_id FROM lde_vehicle_norms
    UNION SELECT vehicle_id FROM lde_factory_route_vehicles
  );

UPDATE drivers SET is_lde = true
WHERE created_at >= '2026-06-22' AND created_at < '2026-06-23'
  AND id IN (SELECT driver_id FROM lde_driver_extras);

CREATE INDEX IF NOT EXISTS idx_vehicles_non_lde ON vehicles(id) WHERE NOT is_lde;
CREATE INDEX IF NOT EXISTS idx_drivers_non_lde ON drivers(id) WHERE NOT is_lde;

COMMIT;
