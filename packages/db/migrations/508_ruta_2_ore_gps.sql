-- 508: ruta 2 Briceni → Chișinău (tur, hour_from_nord) — orele din grafic după cum merge de fapt (ION-256)
--
-- Ion, 06.10.2026, pe raportul «Orele graficului vs GPS» (7 zile, 28.09–05.10): «aici schimbă orele așa cum merge
-- factic». Ora nouă = mediana trecerii reale prin oprire (route_stop_passes, 7 zile pe fiecare oprire), pe toate
-- opririle cu date, vizibile sau nu în căutare, ca secvența să rămână consecventă. Briceni rămâne 05:45 (GPS 05:44).
-- Cele 3 opriri de dinainte de Lipcani n-au GPS (mașina nu trece pe acolo în fereastra potrivirii): se mută cu −25 min,
-- cât e abaterea la Lipcani, ca să nu ajungă după Lipcani. time_nord «05:45 - 08:20» era oricum greșit (sosirea
-- reală 09:30); mini app-ul șoferului ia plecarea/sosirea din el.
--
-- Vechi (stop_order: oră): 2 04:25, 3 04:30, 4 04:35, 5 04:55, 6 05:00, 7 05:10, 8 05:15, 9 05:25, 10 05:45, 20 05:50,
-- 30 05:53, 40 05:55, 50 05:56, 60 06:00, 70 06:23, 80 06:33, 90 06:38, 100 06:41, 110 06:45, 120 06:53, 130 06:53,
-- 140 07:00, 150 07:13, 160 07:16, 170 07:35, 180 07:45, 190 07:47, 200 08:00, 210 08:05, 220 08:10, 230 08:15,
-- 240 08:20, 250 08:25, 260 08:28, 270 08:30, 280 08:32, 290 08:50, 300 09:05, 310 09:10, 320 09:15, 330 09:25, 340 09:50.

UPDATE crm_stop_fares f SET hour_from_nord = v.ora
FROM (VALUES
  (2, '04:00'), (3, '04:05'), (4, '04:10'),
  (5, '04:30'), (6, '04:35'), (7, '04:41'), (8, '04:50'), (9, '05:01'),
  (10, '05:45'), (20, '05:53'), (30, '05:54'), (40, '05:57'), (50, '06:00'), (60, '06:05'),
  (70, '06:17'), (80, '06:28'), (90, '06:31'), (100, '06:37'), (110, '06:40'), (120, '06:50'), (130, '06:50'),
  (140, '06:58'), (150, '07:08'), (160, '07:10'), (170, '07:36'), (180, '07:47'), (190, '07:50'),
  (200, '07:56'), (210, '08:01'), (220, '08:04'), (230, '08:10'), (240, '08:12'), (250, '08:19'), (260, '08:22'),
  (270, '08:23'), (280, '08:26'), (290, '08:40'), (300, '08:55'), (310, '09:03'), (320, '09:05'), (330, '09:10'), (340, '09:30')
) AS v(stop_order, ora)
WHERE f.crm_route_id = 2 AND f.stop_order = v.stop_order;

UPDATE crm_routes SET time_nord = '05:45 - 09:30' WHERE id = 2 AND time_nord = '05:45 - 08:20';

-- Control: secvența crescătoare pe toată ruta.
DO $$
DECLARE r record; prev time := '00:00';
BEGIN
  FOR r IN SELECT stop_order, hour_from_nord::time h FROM crm_stop_fares WHERE crm_route_id = 2 ORDER BY stop_order LOOP
    IF r.h < prev THEN RAISE EXCEPTION 'ruta 2: oprirea % (%) e înaintea celei dinainte (%)', r.stop_order, r.h, prev; END IF;
    prev := r.h;
  END LOOP;
END $$;
