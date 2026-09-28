-- 427_lde_tip_si_locuri_sapte_masini.sql — tipul și locurile celor 7 mașini Drăxlmaier fără tip în bază (Ion, 28.09.2026: «186 e daf, 390asb daf, 402vkv daf,
-- 293QVT Sprinter 315, 518MHD Sprinter 315, 763LYY Sprinter 315, 925FTI Crafter»). Tipul intră în lde_vehicle_norms (rând nou, fără consum măsurat — norma
-- vine din tip, §9.1); locurile: DAF 50, restul 20 (Ion: «restul 20 locuri, daf-urile 50»; 925FTI nu e pe lista de 27).
BEGIN;
DO $$
DECLARE n int;
BEGIN
  INSERT INTO lde_vehicle_norms (vehicle_id, vehicle_type_id, in_repair, updated_at, override_notes)
  SELECT v.id, x.tip, false, now(), 'tip de la Ion, 28.09.2026 (ION-123)'
    FROM (VALUES ('186OMM','DAF'), ('390ASB','DAF'), ('402VKV','DAF'), ('293QVT','SPRINTER_315'), ('518MHD','SPRINTER_315'), ('763LYY','SPRINTER_315'), ('925FTI','CRAFTER')) AS x(placa, tip)
    JOIN vehicles v ON v.plate_number = x.placa
   WHERE NOT EXISTS (SELECT 1 FROM lde_vehicle_norms n2 WHERE n2.vehicle_id = v.id);
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 7 THEN RAISE EXCEPTION '427: tipuri, rânduri %', n; END IF;
  UPDATE vehicles SET passenger_seats = 50 WHERE plate_number IN ('186OMM','390ASB','402VKV') AND passenger_seats IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 3 THEN RAISE EXCEPTION '427: 50 locuri, rânduri %', n; END IF;
  UPDATE vehicles SET passenger_seats = 20 WHERE plate_number IN ('293QVT','518MHD','763LYY','925FTI') AND passenger_seats IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 4 THEN RAISE EXCEPTION '427: 20 locuri, rânduri %', n; END IF;
END $$;
COMMIT;
