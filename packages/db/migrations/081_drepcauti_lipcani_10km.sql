-- 081_drepcauti_lipcani_10km.sql
-- Corectează segmentul Drepcăuți → Lipcani: 6 → 10 km (real, +4 km)
-- Acest segment fizic este același pe toate 3 tarifele (Direct, via Larga, via Corjeuți),
-- deci corecția se aplică uniform pe toate.
--
-- Anulează migrația 080 (din backup) — care distribuia greșit cei 4 km pe segmentul
-- Caracușenii Noi → Briceni — și aplică corecția corectă pe Drepcăuți → Lipcani.
--
-- Rezultat:
--   Drepcăuți↔Lipcani: 6 → 10 km (toate tarifele) → 12 lei (era 7)
--   Drepcăuți↔Briceni: 33/43/53 → 37/47/57 km (diferit pe cursă, km real)
--   Lipcani↔Briceni: 27/37/47 km (NESCHIMBAT, km real)
--   Total cursă: 282,5 / 292,5 / 302,5 km (fiecare +4 vs original)

BEGIN;

-- Backup adițional pentru migrația 081 (înainte de modificări)
CREATE TABLE IF NOT EXISTS interurban_v2_stops_backup_081 AS
  SELECT * FROM interurban_v2_stops WHERE tariff_id IN (1, 2, 3);

CREATE TABLE IF NOT EXISTS interurban_v2_tariffs_backup_081 AS
  SELECT * FROM interurban_v2_tariffs WHERE id IN (1, 2, 3);

-- 1. Restaurez stările originale (anulează 080) din backup-ul _080
UPDATE interurban_v2_stops s
SET km_from_start = b.km_from_start
FROM interurban_v2_stops_backup_080 b
WHERE s.id = b.id;

UPDATE interurban_v2_tariffs t
SET total_km = b.total_km
FROM interurban_v2_tariffs_backup_080 b
WHERE t.id = b.id;

-- 2. Shift +4 km pe Lipcani și toate opririle de după (stop_order >= 4)
--    stop_order = 4 corespunde Lipcani pe toate cele 3 tarife și ambele branches
UPDATE interurban_v2_stops
SET km_from_start = km_from_start + 4
WHERE tariff_id IN (1, 2, 3) AND stop_order >= 4;

-- 3. Update total_km (fiecare tarif +4)
UPDATE interurban_v2_tariffs
SET total_km = total_km + 4
WHERE id IN (1, 2, 3);

-- 4. Validare
DO $$
DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM v_interurban_v2_km_pairs
  WHERE ((from_stop='drepcauti' AND to_stop='lipcani')
      OR (from_stop='lipcani' AND to_stop='drepcauti'))
    AND tariff_v2_id IN (1,2,3) AND ABS(km-10)>0.01;
  IF v>0 THEN RAISE EXCEPTION 'Drepcăuți↔Lipcani nu e 10 km pe toate tarifele (% perechi diferă)', v; END IF;

  IF (SELECT total_km FROM interurban_v2_tariffs WHERE id=1) != 282.5 THEN
    RAISE EXCEPTION 'Criva Direct: total_km != 282.5'; END IF;
  IF (SELECT total_km FROM interurban_v2_tariffs WHERE id=2) != 302.5 THEN
    RAISE EXCEPTION 'Criva via Corjeuți: total_km != 302.5'; END IF;
  IF (SELECT total_km FROM interurban_v2_tariffs WHERE id=3) != 292.5 THEN
    RAISE EXCEPTION 'Criva via Larga: total_km != 292.5'; END IF;
END $$;

COMMIT;
