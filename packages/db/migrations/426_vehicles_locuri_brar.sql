-- 426_vehicles_locuri_brar.sql — Ion, 28.09.2026: «BRAR503 și BRAR504 ei sunt de 30» (locuri pentru pasageri; migr. 424 a adus coloana).
BEGIN;
DO $$
DECLARE n int;
BEGIN
  UPDATE vehicles SET passenger_seats = 30 WHERE plate_number IN ('503BRAR','504BRAR');
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 2 THEN RAISE EXCEPTION '426: rânduri %', n; END IF;
END $$;
COMMIT;
