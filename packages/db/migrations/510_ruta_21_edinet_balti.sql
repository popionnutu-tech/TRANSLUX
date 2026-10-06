-- 510: ruta 21 Otaci → Chișinău (tur): Edineț 14:20, Bălți 15:45 (ION-258)
--
-- Ion, 06.10.2026, pe raportul «Orele graficului vs GPS» (8 zile, potriviri la 0–40 m): Edineț trece la 14:18–14:25,
-- Bălți la 15:45–15:54, în toate zilele. Ion: «pun atunci 14:20 și Bălți pune 15:45 în grafic».
-- Opririle Dîngeni–Slobotca (13:52–14:23) ar fi rămas DUPĂ Edineț 14:20, deci iau și ele mediana GPS (Dîngeni 13:44,
-- Mihălășeni 13:47, Grinăuți-Raia 13:52, Bîrlădeni 13:55, Paladea 13:59, Ruseni 14:04, Slobotca 14:07). Otaci rămâne
-- 12:35 (pleacă de fapt 12:00–12:12 în 6 zile din 8; decizia e a lui Ion), Ocnița 13:40, Cupcini–Corlateni neschimbate
-- (14:50–15:30 < 15:45).
-- Vechi: 30 13:52, 40 13:58, 50 14:04, 60 14:11, 70 14:17, 80 14:20, 90 14:23, 100 14:35, 200 16:00.

UPDATE crm_stop_fares f SET hour_from_nord = v.ora
FROM (VALUES (30, '13:44'), (40, '13:47'), (50, '13:52'), (60, '13:55'), (70, '13:59'), (80, '14:04'), (90, '14:07'),
             (100, '14:20'), (200, '15:45')) AS v(stop_order, ora)
WHERE f.crm_route_id = 21 AND f.stop_order = v.stop_order;

DO $$
DECLARE r record; prev time := '00:00';
BEGIN
  IF (SELECT hour_from_nord FROM crm_stop_fares WHERE crm_route_id = 21 AND name_ro = 'Edineț') <> '14:20'
     OR (SELECT hour_from_nord FROM crm_stop_fares WHERE crm_route_id = 21 AND name_ro = 'Bălți') <> '15:45' THEN
    RAISE EXCEPTION 'ruta 21: Edineț/Bălți neactualizate';
  END IF;
  FOR r IN SELECT stop_order, hour_from_nord::time h FROM crm_stop_fares WHERE crm_route_id = 21 ORDER BY stop_order LOOP
    IF r.h < prev THEN RAISE EXCEPTION 'ruta 21: oprirea % (%) e înaintea celei dinainte (%)', r.stop_order, r.h, prev; END IF;
    prev := r.h;
  END LOOP;
END $$;
