-- 519: ruta 8 Criva → Chișinău (tur): începutul cursei, Criva Vama → Hlinaia, după GPS; time_nord 12:30 → 12:40 (ION-251)
--
-- Ion, 06.10.2026, a aprobat și porțiunea de început a rutei 8, după 517 (Edineț 14:35 → Chișinău 18:05).
-- Ora nouă = mediana trecerii reale, rotunjită la 5 min; 08.09–05.10.2026, mașina 819BXI.
--
-- Plecarea din capăt NU vine din route_stop_passes: acolo Criva Vama și Criva au același punct (centrul satului),
-- iar «trecerea» iese 11:58 (11:37–12:29), adică momentul în care mașina urcă spre vamă, nu plecarea.
-- Din urma GPS brută (scriptul de citire zz-criva-plecare.mjs pe VPS, apoi șters): rutiera stă la vamă, la ~3 km
-- vest de sat, și pornește la 12:40 (mediana, 24 de zile; p10–p90 12:33–12:43); trece prin satul Criva la 12:44
-- (26 de zile, 12:36–12:45), prin Drepcăuți la 12:49, intră în Lipcani la ~12:54 și pleacă din gară la 13:12.
-- Deci Criva Vama 12:40, Criva 12:45, Drepcăuți 12:50, Lipcani 13:10 sunt deja corecte și NU se ating.
-- Se schimbă Hlina – Hlinaia (route_stop_passes fără filtrul de ±25 min, 27–28 de zile pe oprire); Edineț rămâne 14:35.
--
-- Vechi → nou (stop_order oprire: vechi → nou [mediana GPS, p10–p90]):
--   10 Criva Vama: 12:40 → 12:40 (neschimbat) [12:40, 12:33–12:43, plecarea de la vamă]
--   20 Criva: 12:45 → 12:45 (neschimbat) [12:44, 12:36–12:45]
--   30 Drepcăuți: 12:50 → 12:50 (neschimbat) [12:49]
--   40 Lipcani: 13:10 → 13:10 (neschimbat) [13:12, 13:10–13:14, plecarea din gară]
--   50 Hlina: 13:15 → 13:20 [13:18, 13:17–13:22]
--   60 Beleavinți: 13:20 → 13:25 [13:23, 13:22–13:26]
--   70 Caracușenii Noi: 13:35 → 13:30 [13:30, 13:28–13:33]
--   80 Briceni: 13:50 → 13:55 [13:56, 13:53–13:59, plecarea din gară]
--   90 Colicăuți: 13:54 → 14:05 [14:05, 14:02–14:09]
--   100 Intersecția Tabani: 13:58 → 14:05 [14:05, 14:03–14:10]
--   110 Intersecția Trestieni: 14:00 → 14:10 [14:08, 14:06–14:13]
--   120 Halahora de Sus: 14:01 → 14:10 [14:12, 14:08–14:15]
--   130 Hlinaia: 14:09 → 14:15 [14:16, 14:12–14:19]
--   140 Edineț: 14:35 (neschimbat, migr. 517)
--
-- time_nord: primul număr = plecarea rutei din capăt (pornireRuta în căutare și în comenzile de bilete,
-- apps/admin/src/lib/bilete/comenzi.ts); era 12:30, cu 10 min înaintea opririi Criva Vama (12:40) și a plecării reale.
-- «12:30 - 18:05» → «12:40 - 18:05».

UPDATE crm_stop_fares f SET hour_from_nord = v.nou
FROM (VALUES
  (50, '13:15', '13:20'),
  (60, '13:20', '13:25'),
  (70, '13:35', '13:30'),
  (80, '13:50', '13:55'),
  (90, '13:54', '14:05'),
  (100, '13:58', '14:05'),
  (110, '14:00', '14:10'),
  (120, '14:01', '14:10'),
  (130, '14:09', '14:15')
) AS v(stop_order, vechi, nou)
WHERE f.crm_route_id = 8 AND f.stop_order = v.stop_order AND f.hour_from_nord = v.vechi;

UPDATE crm_routes SET time_nord = '12:40 - 18:05' WHERE id = 8 AND time_nord = '12:30 - 18:05';

DO $$
DECLARE r record; prev time := '00:00'; n int;
BEGIN
  SELECT count(*) INTO n FROM crm_stop_fares f JOIN (VALUES
    (50, '13:20'), (60, '13:25'), (70, '13:30'), (80, '13:55'), (90, '14:05'),
    (100, '14:05'), (110, '14:10'), (120, '14:10'), (130, '14:15')
  ) AS v(stop_order, nou) ON f.stop_order = v.stop_order WHERE f.crm_route_id = 8 AND f.hour_from_nord = v.nou;
  IF n <> 9 THEN RAISE EXCEPTION 'ruta 8: doar % din 9 opriri actualizate (alt cineva a schimbat orele între timp?)', n; END IF;
  IF (SELECT hour_from_nord FROM crm_stop_fares WHERE crm_route_id = 8 AND stop_order = 10) <> '12:40'
     OR (SELECT hour_from_nord FROM crm_stop_fares WHERE crm_route_id = 8 AND stop_order = 140) <> '14:35' THEN
    RAISE EXCEPTION 'ruta 8: Criva Vama 12:40 / Edineț 14:35 trebuiau să rămână'; END IF;
  IF (SELECT time_nord FROM crm_routes WHERE id = 8) <> '12:40 - 18:05' THEN RAISE EXCEPTION 'ruta 8: time_nord neactualizat'; END IF;
  FOR r IN SELECT stop_order, hour_from_nord::time h FROM crm_stop_fares WHERE crm_route_id = 8 ORDER BY stop_order LOOP
    IF r.h < prev THEN RAISE EXCEPTION 'ruta 8: oprirea % (%) e înaintea celei dinainte (%)', r.stop_order, r.h, prev; END IF;
    prev := r.h;
  END LOOP;
END $$;
