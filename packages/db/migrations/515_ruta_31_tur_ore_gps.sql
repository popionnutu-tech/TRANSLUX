-- 515: ruta 31 Ocnița → Chișinău (tur, hour_from_nord) — orele după GPS, plecarea rămâne 05:30 (ION-262)
--
-- Ion, 06.10.2026: «Ocnița ora lasă cum este, în rest ajustează». Ora nouă = mediana trecerii reale
-- (route_stop_passes, 28.09–05.10, 8 zile pe oprire). Edineț are o singură zi (06:20, cât Slobotca): se pune
-- Cupcini − 9 min = 06:27, intervalul din graficul vechi. time_nord «05:30 - 10:25» → «05:30 - 10:01».
--
-- Vechi (stop_order: oră): 20 05:47, 30 05:51, 40 05:57, 50 06:00, 60 06:03, 70 06:11, 80 06:15, 90 06:40, 100 06:49,
-- 110 06:56, 120 07:10, 130 07:17, 140 07:30, 150 07:30, 160 07:42, 170 08:00, 180 08:07, 190 08:15, 200 08:24,
-- 210 08:29, 220 08:41, 230 08:44, 240 08:46, 250 08:55, 260 08:59, 270 09:07, 280 09:13, 290 09:18, 300 09:32,
-- 310 09:38, 320 09:57, 330 10:07, 340 10:10, 350 10:16, 360 10:25.

UPDATE crm_stop_fares f SET hour_from_nord = v.ora
FROM (VALUES
  (20, '05:55'), (30, '05:58'), (40, '06:03'), (50, '06:08'), (60, '06:12'), (70, '06:16'), (80, '06:20'),
  (90, '06:27'), (100, '06:36'), (110, '06:42'), (120, '06:47'), (130, '06:50'), (140, '06:58'), (150, '06:58'),
  (160, '07:05'), (170, '07:13'), (180, '07:16'), (190, '08:05'), (200, '08:15'), (210, '08:18'), (220, '08:25'),
  (230, '08:29'), (240, '08:32'), (250, '08:39'), (260, '08:43'), (270, '08:50'), (280, '08:54'), (290, '08:56'),
  (300, '09:00'), (310, '09:13'), (320, '09:29'), (330, '09:38'), (340, '09:40'), (350, '09:46'), (360, '10:01')
) AS v(stop_order, ora)
WHERE f.crm_route_id = 31 AND f.stop_order = v.stop_order;

UPDATE crm_routes SET time_nord = '05:30 - 10:01' WHERE id = 31 AND time_nord = '05:30 - 10:25';

DO $$
DECLARE r record; prev time := '00:00';
BEGIN
  IF (SELECT hour_from_nord FROM crm_stop_fares WHERE crm_route_id = 31 AND stop_order = 10) <> '05:30' THEN RAISE EXCEPTION 'ruta 31: Ocnița trebuia să rămână 05:30'; END IF;
  FOR r IN SELECT stop_order, hour_from_nord::time h FROM crm_stop_fares WHERE crm_route_id = 31 ORDER BY stop_order LOOP
    IF r.h < prev THEN RAISE EXCEPTION 'ruta 31: oprirea % (%) e înaintea celei dinainte (%)', r.stop_order, r.h, prev; END IF;
    prev := r.h;
  END LOOP;
END $$;
