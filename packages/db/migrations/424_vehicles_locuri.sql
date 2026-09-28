-- 424_vehicles_locuri.sql — locurile pentru pasageri PE MAȘINĂ (Ion, 28.09.2026: «27 locuri 043/041/917/302/457/912, restul 20 locuri, daf-urile 50»).
-- Coloana nouă vehicles.passenger_seats (NULL = nu se știe). Flota Drăxlmaier: 27 la 043BRAU, 041BRAU, 917FTI, 302YEK, 457BRAX, 912RNK; 50 la toate DAF-urile
-- (tipul din lde_vehicle_norms); 20 la celelalte mașini cu tip cunoscut ale flotei. Mașinile fără tip în bază (186OMM, 293QVT, 390ASB, 402VKV, 518MHD, 763LYY,
-- 925FTI) rămân NULL până spune Ion care sunt DAF. Tipul Sprinter 518 = 27 (ambele 518 ale flotei sunt pe lista de 27; înlocuiește 30 din migr. 422).
BEGIN;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS passenger_seats integer CHECK (passenger_seats > 0);
COMMENT ON COLUMN vehicles.passenger_seats IS 'locuri pentru pasageri ale mașinii (Ion, 28.09.2026); NULL = necunoscut';
DO $$
DECLARE n int;
BEGIN
  UPDATE vehicles SET passenger_seats = 27 WHERE plate_number IN ('043BRAU','041BRAU','917FTI','302YEK','457BRAX','912RNK');
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 6 THEN RAISE EXCEPTION '424: 27 locuri, rânduri %', n; END IF;
  UPDATE vehicles v SET passenger_seats = 50 FROM lde_vehicle_norms nm JOIN lde_vehicle_types t ON t.id = nm.vehicle_type_id
   WHERE nm.vehicle_id = v.id AND t.display_name = 'DAF' AND v.passenger_seats IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; IF n < 12 THEN RAISE EXCEPTION '424: DAF, rânduri %', n; END IF;
  UPDATE vehicles SET passenger_seats = 20 WHERE plate_number IN ('024XKY','144BRAZ','146BRAZ','206BZP','224BZP','345KAJ','346KAJ','350KAJ','386PKP','549RNK','710CWN','725CWN','727CWN','744ARF','760BXI') AND passenger_seats IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 15 THEN RAISE EXCEPTION '424: 20 locuri, rânduri %', n; END IF;
  UPDATE lde_vehicle_types SET passenger_seats = 27 WHERE display_name = 'Sprinter 518';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION '424: Sprinter 518, rânduri %', n; END IF;
END $$;
COMMIT;
