-- 082_interurban_v2_baseline.sql
-- Fixează starea actuală a nomenclator-ului interurban v2 ca nou standard oficial.
--
-- Modificările din 26 mai 2026 (migrațiile 080-081 + fix-urile de search):
--   1. Drepcăuți↔Lipcani: 6 → 10 km (+4 km, segment real corectat)
--   2. Toate stațiile de după Lipcani pe tarifele 1, 2, 3 decalate +4 km
--   3. Total cursă: Criva Direct 282,5 / via Larga 292,5 / via Corjeuți 302,5 km
--   4. Cod: eliminat alias greșit 'coteala'→'cotelea'
--   5. Cod: ascuns cursele care nu trec fizic prin ambele stații
--
-- Această migrație doar fixează ca standard ce există deja în baza de date.

-- 1. Creez snapshot curat al stării actuale (referință stabilă)
CREATE TABLE IF NOT EXISTS interurban_v2_stops_baseline_20260526 AS
  SELECT * FROM interurban_v2_stops;

CREATE TABLE IF NOT EXISTS interurban_v2_tariffs_baseline_20260526 AS
  SELECT * FROM interurban_v2_tariffs;

-- 2. Documentez baseline-ul pe tabele
COMMENT ON TABLE interurban_v2_stops IS
  'Standard interurban v2 — baseline 26 mai 2026. Tarifele 1-3 (Criva Direct/via Larga/via Corjeuți) au segmentul Drepcăuți-Lipcani = 10 km. Snapshot complet în interurban_v2_stops_baseline_20260526.';

COMMENT ON TABLE interurban_v2_tariffs IS
  'Standard interurban v2 — baseline 26 mai 2026. Total km: T1=282,5 / T2=302,5 / T3=292,5. Snapshot în interurban_v2_tariffs_baseline_20260526.';

-- 3. Șterg backup-urile temporare 080 și 081 (intermediare, nu mai sunt utile)
DROP TABLE IF EXISTS interurban_v2_stops_backup_080;
DROP TABLE IF EXISTS interurban_v2_tariffs_backup_080;
DROP TABLE IF EXISTS interurban_v2_stops_backup_081;
DROP TABLE IF EXISTS interurban_v2_tariffs_backup_081;

-- 4. Validare: snapshot-ul trebuie să conțină exact aceleași date ca tabelele live
DO $$
DECLARE
  v_diff INT;
BEGIN
  SELECT COUNT(*) INTO v_diff
  FROM (
    SELECT id, km_from_start FROM interurban_v2_stops
    EXCEPT
    SELECT id, km_from_start FROM interurban_v2_stops_baseline_20260526
  ) x;
  IF v_diff > 0 THEN
    RAISE EXCEPTION 'Snapshot-ul baseline nu se potrivește cu interurban_v2_stops (% diferențe)', v_diff;
  END IF;

  SELECT COUNT(*) INTO v_diff
  FROM (
    SELECT id, total_km FROM interurban_v2_tariffs
    EXCEPT
    SELECT id, total_km FROM interurban_v2_tariffs_baseline_20260526
  ) x;
  IF v_diff > 0 THEN
    RAISE EXCEPTION 'Snapshot-ul baseline tarifs nu se potrivește (% diferențe)', v_diff;
  END IF;
END $$;
