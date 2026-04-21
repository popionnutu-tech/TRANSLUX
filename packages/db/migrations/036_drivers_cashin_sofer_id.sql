-- 036_drivers_cashin_sofer_id.sql
-- Mapping intre nomenclatorul TRANSLUX (drivers) si cash-in (sofer_id).
-- sofer_id in cash-in e un cod numeric de 7 cifre tip '0945024',
-- iar pentru fiecare sofer din drivers admin il va seta o data manual.

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS cashin_sofer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_cashin_sofer_id
  ON drivers(cashin_sofer_id)
  WHERE cashin_sofer_id IS NOT NULL;

COMMENT ON COLUMN drivers.cashin_sofer_id IS
  'ID-ul soferului in casa automata cash-in (ex: "0945024"). Folosit pentru a lega tomberon.transactions.sofer_id cu driverul din TRANSLUX.';
