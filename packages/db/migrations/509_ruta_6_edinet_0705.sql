-- 509: ruta 6 Corjeuți → Chișinău (tur): Edineț 07:10 → 07:05 (ION-257)
--
-- Ion, 06.10.2026, pe raportul «Orele graficului vs GPS»: la Edineț autobuzul trece în toate cele 7 zile între 06:59 și
-- 07:08 (mediana 07:04, potrivire la 0–10 m de oprire), mereu înainte de 07:10 din grafic. Ion: «pune în grafic 7:05».
-- Vecinele rămân: Gordineștii Noi 06:50 înainte, Cupcini 07:20 după. Corjeuți 06:17 e bun (în zilele cu potrivire
-- curată pleacă la 06:21–06:23; abaterile mari sunt mașina prinsă la 500–1000 m, venind spre capăt).

UPDATE crm_stop_fares SET hour_from_nord = '07:05'
WHERE crm_route_id = 6 AND stop_order = 60 AND name_ro = 'Edineț' AND hour_from_nord = '07:10';

DO $$
BEGIN
  IF (SELECT hour_from_nord FROM crm_stop_fares WHERE crm_route_id = 6 AND stop_order = 60) <> '07:05' THEN
    RAISE EXCEPTION 'ruta 6: Edineț nu a fost actualizat';
  END IF;
END $$;
