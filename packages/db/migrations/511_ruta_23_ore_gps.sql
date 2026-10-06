-- 511: ruta 23 Chișinău → Criva (retur, hour_from_chisinau) — orele din grafic după cum merge de fapt (ION-259)
--
-- Ion, 06.10.2026, pe raportul «Orele graficului vs GPS»: «aici hai să schimbăm graficul». Ora nouă = mediana trecerii
-- reale prin oprire (route_stop_passes, 28.09–05.10, 7 zile pe oprire, 6 pe tronsonul Briceni–Lipcani). Plecarea din
-- Chișinău rămâne 15:15 (GPS 15:17). Ultimele trei opriri (Drepcăuți, Criva, Criva Vama) au 1–2 zile și aceeași oră
-- 19:51 — potrivire slabă; se pun după Lipcani 19:44 cu intervalele din graficul vechi (+10, +5, +5).
-- time_chisinau «15:15 - 19:45» → «15:15 - 19:59».
--
-- Vechi (stop_order: oră): 410 15:15, 400 15:30, 390 15:35, 380 15:40, 370 15:45, 360 15:55, 350 16:00, 340 16:15,
-- 330 16:15, 320 16:20, 310 16:25, 300 16:30, 290 16:35, 280 16:40, 270 16:45, 260 16:50, 250 16:55, 240 17:00,
-- 230 17:35, 220 17:40, 210 17:50, 200 17:55, 190 17:55, 180 18:10, 170 18:10, 160 18:15, 150 18:20, 140 18:25,
-- 130 18:35, 120 18:40, 110 18:45, 100 18:50, 90 18:55, 80 19:00, 70 19:10, 60 19:15, 50 19:20, 40 19:25, 30 19:35,
-- 20 19:40, 10 19:45.

UPDATE crm_stop_fares f SET hour_from_chisinau = v.ora
FROM (VALUES
  (410, '15:15'), (400, '15:31'), (390, '15:38'), (380, '15:39'), (370, '15:48'), (360, '16:04'), (350, '16:17'),
  (340, '16:20'), (330, '16:22'), (320, '16:26'), (310, '16:33'), (300, '16:36'), (290, '16:43'), (280, '16:46'),
  (270, '16:50'), (260, '16:56'), (250, '16:59'), (240, '17:31'), (230, '17:48'), (220, '17:51'), (210, '18:01'),
  (200, '18:07'), (190, '18:07'), (180, '18:16'), (170, '18:20'), (160, '18:25'), (150, '18:31'), (140, '18:40'),
  (130, '18:49'), (120, '18:53'), (110, '18:56'), (100, '18:59'), (90, '19:00'), (80, '19:21'), (70, '19:25'),
  (60, '19:31'), (50, '19:36'), (40, '19:44'), (30, '19:54'), (20, '19:59'), (10, '20:04')
) AS v(stop_order, ora)
WHERE f.crm_route_id = 23 AND f.stop_order = v.stop_order;

UPDATE crm_routes SET time_chisinau = '15:15 - 19:59' WHERE id = 23 AND time_chisinau = '15:15 - 19:45';

-- Control: pe retur opririle se parcurg în ordinea descrescătoare a stop_order; orele trebuie să crească.
DO $$
DECLARE r record; prev time := '00:00';
BEGIN
  FOR r IN SELECT stop_order, hour_from_chisinau::time h FROM crm_stop_fares WHERE crm_route_id = 23 ORDER BY stop_order DESC LOOP
    IF r.h < prev THEN RAISE EXCEPTION 'ruta 23: oprirea % (%) e înaintea celei dinainte (%)', r.stop_order, r.h, prev; END IF;
    prev := r.h;
  END LOOP;
  IF (SELECT hour_from_chisinau FROM crm_stop_fares WHERE crm_route_id = 23 AND stop_order = 240) <> '17:31' THEN RAISE EXCEPTION 'ruta 23: Bălți neactualizat'; END IF;
END $$;
