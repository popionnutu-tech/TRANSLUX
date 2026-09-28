-- 422_lde_vehicle_types_locuri.sql — locurile pentru pasageri pe tip de mașină (Ion, 28.09.2026: «daf big bus, rest is 20-30 seats, mercedes 518 is 30 seats»).
-- DAF = autobuz mare (50, clasa cea mai mare din actul Drăxlmaier KW24); Sprinter 518 = 30; celelalte tipuri de microbuz: 20–30, fără cifră exactă → rămân NULL.
-- Folosit de regula 2 «rute împărțite altfel» (§8.7, ION-120/ION-123): mașina poate lua o linie dacă locurile ei ≥ clasa liniei sau dacă duce deja o linie de acea clasă.
BEGIN;
DO $$
DECLARE n int;
BEGIN
  UPDATE lde_vehicle_types SET passenger_seats = 50 WHERE display_name = 'DAF' AND passenger_seats IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION '422: DAF, rânduri %', n; END IF;
  UPDATE lde_vehicle_types SET passenger_seats = 30 WHERE display_name = 'Sprinter 518' AND passenger_seats IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION '422: Sprinter 518, rânduri %', n; END IF;
END $$;
COMMIT;
