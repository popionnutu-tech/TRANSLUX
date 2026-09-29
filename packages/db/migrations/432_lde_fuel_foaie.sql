-- 432: litrii scriși pe foaia de parcurs LDE, pe mașină și zi (ION-132)
--
-- Ion, 29.09.2026: «din LDE să scoatem toate alimentările legate cu auto noastre, și zilnic noapte cron» + «introdu
-- istoricul». Baza LDE (raznareadca, MySQL) ține pe foile de parcurs pz_* două coloane de litri:
--   litri_a — alimentarea la stațiile proprii, scrisă de programul benzol (benzol_log) = ce avem deja în
--             lde_fuel_alimentari din fuel-worker → NU se importă aici;
--   litri   — litri introduși de operator; Chișinău (pz_c) și Ungheni (pz_u) aproape numai așa, ~70.000 l/lună
--             care lipsesc din benzol.
-- Rândul n-are oră, deci nu intră în lde_fuel_alimentari: sebn-liber, lear-analiza și lanțul Drăxlmaier citesc de
-- acolo ORA alimentării ca să recunoască ocolul spre stație, iar o oră inventată le-ar păcăli. Raportul /lde/km-zilnic
-- adună ambele tabele. Scris de lde-geo-worker/lde-alim-worker.mjs (noaptea, run-nightly.sh).

CREATE TABLE IF NOT EXISTS lde_fuel_foaie (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id   uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  zi           date NOT NULL,                 -- ziua foii (ora locală Chișinău)
  litri        numeric(8,2) NOT NULL,
  foaie        text NOT NULL,                 -- tabelul LDE: 'pz_c', 'pz_u', 'pz_i'...
  external_id  text NOT NULL,                 -- '<foaie>:<id>' — dedup la re-import
  sofer        text,
  km_total     numeric(9,2),
  imported_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_id)
);

CREATE INDEX IF NOT EXISTS idx_lde_fuel_foaie_zi ON lde_fuel_foaie (zi);
CREATE INDEX IF NOT EXISTS idx_lde_fuel_foaie_vehicle_zi ON lde_fuel_foaie (vehicle_id, zi DESC);

COMMENT ON TABLE lde_fuel_foaie IS
  'Litri introduși de operator pe foaia de parcurs LDE (coloana litri din pz_*), pe mașină și zi, fără oră (ION-132). '
  'Alimentările benzol (litri_a) stau în lde_fuel_alimentari. Import: lde-geo-worker/lde-alim-worker.mjs.';

ALTER TABLE lde_fuel_foaie ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lde_fuel_foaie FROM anon, authenticated;
