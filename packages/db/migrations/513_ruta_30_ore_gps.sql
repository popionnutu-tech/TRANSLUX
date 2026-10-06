-- 513: ruta 30 Chișinău → Otaci (hour_from_chisinau) — orele după GPS, plecarea rămâne 11:00 (ION-261)
--
-- Ion, 06.10.2026: «din Chișinău lasă 11, în rest schimbă». Ora nouă = mediana trecerii reale (route_stop_passes,
-- 28.09–05.10, 8 zile pe oprire). Ocnița: mediana 15:43 e mașina deja oprită în Ocnița (cel mai devreme +17, Dîngeni
-- 15:04), deci se pune 15:20 (Dîngeni + intervalul vechi). De la Bîrnova la Otaci nu e GPS (în 7 zile din 8 mașina nu
-- trece de Ocnița): orele vechi +20 min. time_chisinau «11:00 - 15:20» → «11:00 - 15:40».
--
-- Vechi (stop_order: oră): 360 11:10, 350 11:15, 340 11:17, 330 11:35, 320 11:50, 310 12:05, 300 12:10, 290 12:12,
-- 280 12:15, 270 12:20, 260 12:25, 250 12:35, 240 12:40, 230 12:40, 220 12:45, 210 12:55, 200 13:05, 190 13:15,
-- 180 13:18, 170 13:25, 160 13:35, 150 13:35, 140 13:40, 130 13:50, 120 13:52, 110 13:57, 100 14:05, 90 14:13,
-- 80 14:20, 70 14:25, 60 14:30, 50 14:35, 40 14:40, 30 14:45, 20 15:00, 15 15:04, 14 15:08, 13 15:11, 12 15:13,
-- 11 15:17, 10 15:20.

UPDATE crm_stop_fares f SET hour_from_chisinau = v.ora
FROM (VALUES
  (360, '11:21'), (350, '11:26'), (340, '11:27'), (330, '11:38'), (320, '11:54'), (310, '12:07'), (300, '12:10'),
  (290, '12:13'), (280, '12:16'), (270, '12:23'), (260, '12:26'), (250, '12:33'), (240, '12:36'), (230, '12:40'),
  (220, '12:46'), (210, '12:49'), (200, '13:22'), (190, '13:38'), (180, '13:41'), (170, '13:50'), (160, '13:56'),
  (150, '13:56'), (140, '14:04'), (130, '14:08'), (120, '14:15'), (110, '14:19'), (100, '14:32'), (90, '14:43'),
  (80, '14:47'), (70, '14:52'), (60, '14:54'), (50, '14:58'), (40, '15:02'), (30, '15:04'), (20, '15:20'),
  (15, '15:24'), (14, '15:28'), (13, '15:31'), (12, '15:33'), (11, '15:37'), (10, '15:40')
) AS v(stop_order, ora)
WHERE f.crm_route_id = 30 AND f.stop_order = v.stop_order;

UPDATE crm_routes SET time_chisinau = '11:00 - 15:40' WHERE id = 30 AND time_chisinau = '11:00 - 15:20';

DO $$
DECLARE r record; prev time := '00:00';
BEGIN
  IF (SELECT hour_from_chisinau FROM crm_stop_fares WHERE crm_route_id = 30 AND stop_order = 370) <> '11:00' THEN RAISE EXCEPTION 'ruta 30: Chișinău trebuia să rămână 11:00'; END IF;
  FOR r IN SELECT stop_order, hour_from_chisinau::time h FROM crm_stop_fares WHERE crm_route_id = 30 ORDER BY stop_order DESC LOOP
    IF r.h < prev THEN RAISE EXCEPTION 'ruta 30: oprirea % (%) e înaintea celei dinainte (%)', r.stop_order, r.h, prev; END IF;
    prev := r.h;
  END LOOP;
END $$;
