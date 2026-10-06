-- 514: ruta 30 Ocnița → Chișinău (tur, hour_from_nord) — orele după GPS, plecarea din Ocnița rămâne 17:05 (ION-261)
--
-- Ion, 06.10.2026: «Ocnița lasă 17:05, restul schimbă». Ora nouă = mediana trecerii reale (route_stop_passes,
-- 28.09–05.10, 7 zile pe oprire). Otaci–Bîrnova n-au GPS (mașina pornește de la Ocnița): rămân cum erau.
-- time_nord «16:25 - 21:30» → «16:25 - 21:12».
--
-- Vechi (stop_order: oră): 30 17:30, 40 17:35, 50 17:40, 60 17:45, 70 17:50, 80 17:53, 90 17:55, 100 18:05, 110 18:20,
-- 120 18:25, 130 18:35, 140 18:40, 150 18:40, 160 18:42, 170 18:50, 180 18:57, 190 19:00, 200 19:30, 210 19:35,
-- 220 19:40, 230 19:50, 240 19:55, 250 20:00, 260 20:10, 270 20:15, 280 20:17, 290 20:20, 300 20:22, 310 20:25,
-- 320 20:40, 330 20:50, 340 21:05, 350 21:10, 360 21:15, 370 21:30.

UPDATE crm_stop_fares f SET hour_from_nord = v.ora
FROM (VALUES
  (30, '17:24'), (40, '17:27'), (50, '17:32'), (60, '17:35'), (70, '17:38'), (80, '17:42'), (90, '17:45'),
  (100, '17:59'), (110, '18:06'), (120, '18:11'), (130, '18:17'), (140, '18:20'), (150, '18:27'), (160, '18:27'),
  (170, '18:34'), (180, '18:43'), (190, '18:46'), (200, '19:16'), (210, '19:29'), (220, '19:33'), (230, '19:39'),
  (240, '19:44'), (250, '19:46'), (260, '19:53'), (270, '19:57'), (280, '20:04'), (290, '20:08'), (300, '20:10'),
  (310, '20:14'), (320, '20:29'), (330, '20:45'), (340, '20:54'), (350, '20:56'), (360, '21:01'), (370, '21:12')
) AS v(stop_order, ora)
WHERE f.crm_route_id = 30 AND f.stop_order = v.stop_order;

UPDATE crm_routes SET time_nord = '16:25 - 21:12' WHERE id = 30 AND time_nord = '16:25 - 21:30';

DO $$
DECLARE r record; prev time := '00:00';
BEGIN
  IF (SELECT hour_from_nord FROM crm_stop_fares WHERE crm_route_id = 30 AND stop_order = 20) <> '17:05' THEN RAISE EXCEPTION 'ruta 30: Ocnița trebuia să rămână 17:05'; END IF;
  FOR r IN SELECT stop_order, hour_from_nord::time h FROM crm_stop_fares WHERE crm_route_id = 30 ORDER BY stop_order LOOP
    IF r.h < prev THEN RAISE EXCEPTION 'ruta 30 tur: oprirea % (%) e înaintea celei dinainte (%)', r.stop_order, r.h, prev; END IF;
    prev := r.h;
  END LOOP;
END $$;
