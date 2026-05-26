-- 080_drepcauti_briceni_37km.sql
-- Drepcăuți → Briceni = 37 km pe toate 3 cursele Criva (Direct, via Larga, via Corjeuți)
-- Tarif suburban 1,17 lei/km → preț unic 43 lei pentru perechea Drepcăuți↔Briceni
-- Plan aprobat: /Users/ionpop/.claude/plans/ce-tarif-acum-folosim-clever-bentley.md
--
-- Briceni mutat la km 44,5 (= 7,5 + 37) pe toate 3 tarifele și ambele branches (main + grimancauti la T1).
-- Opririle intermediare Drepcăuți→Briceni redistribuite proporțional.
-- Opririle de după Briceni decalate cu delta (+4 / -6 / -16).
-- Total cursă: 282,5 km pe toate 3 tarifele.

-- Backup înainte de modificări
CREATE TABLE IF NOT EXISTS interurban_v2_stops_backup_080 AS
  SELECT * FROM interurban_v2_stops WHERE tariff_id IN (1, 2, 3);

CREATE TABLE IF NOT EXISTS interurban_v2_tariffs_backup_080 AS
  SELECT * FROM interurban_v2_tariffs WHERE id IN (1, 2, 3);

BEGIN;

-- ============================================================================
-- Tariff 1 "Criva Direct" — branch 'main' (Drepcăuți→Briceni: 33→37 km, delta +4)
-- ============================================================================
UPDATE interurban_v2_stops SET km_from_start = 20.4 WHERE id = 5;   -- Hlina
UPDATE interurban_v2_stops SET km_from_start = 27.2 WHERE id = 6;   -- Beleavinți
UPDATE interurban_v2_stops SET km_from_start = 36.4 WHERE id = 7;   -- Caracușenii Noi
UPDATE interurban_v2_stops SET km_from_start = 44.5 WHERE id = 8;   -- Briceni
-- Cascadă +4 km pentru stop_order 9..41 (Colicăuți → Chișinău)
UPDATE interurban_v2_stops SET km_from_start = km_from_start + 4
  WHERE tariff_id = 1 AND branch = 'main' AND stop_order BETWEEN 9 AND 41;

-- ============================================================================
-- Tariff 1 "Criva Direct" — branch 'grimancauti' (Drepcăuți→Briceni: 33→37 km, delta +4)
-- ============================================================================
UPDATE interurban_v2_stops SET km_from_start = 20.4 WHERE id = 298;  -- Hlina
UPDATE interurban_v2_stops SET km_from_start = 27.2 WHERE id = 299;  -- Beleavinți
UPDATE interurban_v2_stops SET km_from_start = 36.4 WHERE id = 334;  -- Caracușenii Noi
UPDATE interurban_v2_stops SET km_from_start = 39.3 WHERE id = 335;  -- Grimăncăuți (intermediar)
UPDATE interurban_v2_stops SET km_from_start = 44.5 WHERE id = 333;  -- Briceni
-- Cascadă +4 km pentru stop_order 10..42 (Colicăuți → Chișinău)
UPDATE interurban_v2_stops SET km_from_start = km_from_start + 4
  WHERE tariff_id = 1 AND branch = 'grimancauti' AND stop_order BETWEEN 10 AND 42;

-- ============================================================================
-- Tariff 2 "Criva via Corjeuți" (Drepcăuți→Briceni: 53→37 km, delta -16)
-- ============================================================================
UPDATE interurban_v2_stops SET km_from_start = 16.1 WHERE id = 46;  -- Șărăuți
UPDATE interurban_v2_stops SET km_from_start = 17.3 WHERE id = 47;  -- Slobozia Șărăuți
UPDATE interurban_v2_stops SET km_from_start = 20.8 WHERE id = 48;  -- Pererita
UPDATE interurban_v2_stops SET km_from_start = 24.7 WHERE id = 49;  -- Tețcani
UPDATE interurban_v2_stops SET km_from_start = 31.3 WHERE id = 50;  -- Corjeuți
UPDATE interurban_v2_stops SET km_from_start = 36.6 WHERE id = 51;  -- Caracușenii Vechi
UPDATE interurban_v2_stops SET km_from_start = 39.9 WHERE id = 52;  -- Tabani
UPDATE interurban_v2_stops SET km_from_start = 44.5 WHERE id = 53;  -- Briceni
-- Cascadă -16 km pentru stop_order 13..45 (Colicăuți → Chișinău)
UPDATE interurban_v2_stops SET km_from_start = km_from_start - 16
  WHERE tariff_id = 2 AND branch = 'main' AND stop_order BETWEEN 13 AND 45;

-- ============================================================================
-- Tariff 3 "Criva via Larga" (Drepcăuți→Briceni: 43→37 km, delta -6)
-- ============================================================================
UPDATE interurban_v2_stops SET km_from_start = 18.5 WHERE id = 91;  -- Hlina
UPDATE interurban_v2_stops SET km_from_start = 22.7 WHERE id = 92;  -- Coteala
UPDATE interurban_v2_stops SET km_from_start = 27.7 WHERE id = 93;  -- Larga
UPDATE interurban_v2_stops SET km_from_start = 34.4 WHERE id = 94;  -- Cotiujeni
UPDATE interurban_v2_stops SET km_from_start = 44.5 WHERE id = 95;  -- Briceni
-- Cascadă -6 km pentru stop_order 10..42 (Colicăuți → Chișinău)
UPDATE interurban_v2_stops SET km_from_start = km_from_start - 6
  WHERE tariff_id = 3 AND branch = 'main' AND stop_order BETWEEN 10 AND 42;

-- ============================================================================
-- Actualizare total_km pentru cele 3 tarife (toate ajung la 282,5 km Criva Vama → Chișinău)
-- ============================================================================
UPDATE interurban_v2_tariffs SET total_km = 282.5 WHERE id IN (1, 2, 3);

-- ============================================================================
-- Verificare: toate perechile Drepcăuți↔Briceni trebuie să aibă km = 37
-- (DO block — se evaluează la commit, dacă nu trece → ROLLBACK automat)
-- ============================================================================
DO $$
DECLARE
  v_bad_rows INT;
BEGIN
  SELECT COUNT(*) INTO v_bad_rows
  FROM v_interurban_v2_km_pairs
  WHERE ((from_stop = 'drepcauti' AND to_stop = 'briceni')
      OR (from_stop = 'briceni' AND to_stop = 'drepcauti'))
    AND ABS(km - 37) > 0.01;

  IF v_bad_rows > 0 THEN
    RAISE EXCEPTION 'Validare eșuată: % perechi Drepcăuți↔Briceni au km ≠ 37', v_bad_rows;
  END IF;
END $$;

COMMIT;
