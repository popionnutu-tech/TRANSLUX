-- 512: ruta 28 Chișinău → Criva (retur, hour_from_chisinau) — orele după GPS, plecarea rămâne 16:25 (ION-260)
--
-- Ion, 06.10.2026: «schimbă ora în grafic de la Chișinău în jos, Chișinău lași cum este». Ora nouă = mediana trecerii
-- reale (route_stop_passes, 3 zile pe oprire, 2 pe Caracușenii Noi–Lipcani). GPS-ul arată Stăuceni la 16:59, deci
-- de fapt mașina pleacă din Chișinău pe la 16:45, nu 16:25 — dar Chișinău rămâne 16:25 la cererea lui Ion.
-- Caracușenii Noi (20:34, 2 zile) ieșea înaintea Briceniului (20:35): se pun Caracușenii Noi 20:38 și Beleavinți 20:41
-- între Briceni și Hlina 20:44. De la Drepcăuți în jos nu e GPS: Lipcani 20:49 + intervalele vechi (+5, +5, +5).
-- time_chisinau «16:25 - 20:30» → «16:25 - 20:59».
--
-- Vechi (stop_order: oră): 410 16:25, 400 16:35, 390 16:40, 380 16:45, 370 16:50, 360 17:10, 350 17:15, 340 17:20,
-- 330 17:25, 320 17:30, 310 17:35, 300 17:45, 290 17:55, 280 18:00, 270 18:05, 260 18:10, 250 18:10, 240 18:20,
-- 230 18:25, 220 18:30, 210 18:35, 200 18:45, 190 18:50, 180 18:55, 170 19:00, 160 19:05, 150 19:10, 140 19:20,
-- 130 19:25, 120 19:25, 110 19:30, 100 19:35, 90 19:35, 80 19:50, 70 20:00, 60 20:05, 50 20:10, 40 20:15, 30 20:20,
-- 20 20:25, 10 20:30.

UPDATE crm_stop_fares f SET hour_from_chisinau = v.ora
FROM (VALUES
  (400, '16:59'), (390, '17:04'), (380, '17:05'), (370, '17:16'), (360, '17:32'), (350, '17:45'), (340, '17:48'),
  (330, '17:50'), (320, '17:55'), (310, '18:03'), (300, '18:06'), (290, '18:13'), (280, '18:17'), (270, '18:21'),
  (260, '18:27'), (250, '18:30'), (240, '18:51'), (230, '19:06'), (220, '19:09'), (210, '19:19'), (200, '19:26'),
  (190, '19:26'), (180, '19:36'), (170, '19:39'), (160, '19:44'), (150, '19:49'), (140, '19:58'), (130, '20:06'),
  (120, '20:13'), (110, '20:15'), (100, '20:19'), (90, '20:20'), (80, '20:35'), (70, '20:38'), (60, '20:41'),
  (50, '20:44'), (40, '20:49'), (30, '20:54'), (20, '20:59'), (10, '21:04')
) AS v(stop_order, ora)
WHERE f.crm_route_id = 28 AND f.stop_order = v.stop_order;

UPDATE crm_routes SET time_chisinau = '16:25 - 20:59' WHERE id = 28 AND time_chisinau = '16:25 - 20:30';

DO $$
DECLARE r record; prev time := '00:00';
BEGIN
  IF (SELECT hour_from_chisinau FROM crm_stop_fares WHERE crm_route_id = 28 AND stop_order = 410) <> '16:25' THEN RAISE EXCEPTION 'ruta 28: Chișinău trebuia să rămână 16:25'; END IF;
  FOR r IN SELECT stop_order, hour_from_chisinau::time h FROM crm_stop_fares WHERE crm_route_id = 28 ORDER BY stop_order DESC LOOP
    IF r.h < prev THEN RAISE EXCEPTION 'ruta 28: oprirea % (%) e înaintea celei dinainte (%)', r.stop_order, r.h, prev; END IF;
    prev := r.h;
  END LOOP;
END $$;
