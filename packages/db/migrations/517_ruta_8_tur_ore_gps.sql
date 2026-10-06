-- 517: ruta 8 Criva → Chișinău (tur): Edineț 14:20 → 14:35, opririle până la Chișinău și sosirea 18:10 → 18:05 după GPS
--
-- Ion, 06.10.2026, pe căutarea Edineț → Chișinău: «2 mașini merg la 14:20 de la Edineț la Chișinău, corectează după graficul real cum merg».
-- Ora nouă = mediana trecerii reale prin oprire, rotunjită la 5 min. Sursa: stop-times.mjs (logica route_stop_passes, migr. 393)
-- rulat fără scriere pe 08.09–05.10.2026, cu filtrul «plecare din capăt ±25 min» scos (ruta 8 pleacă din Criva Vama 11:30–12:45,
-- așa că route_stop_passes are doar 8 zile din 28). 27–28 de zile pe oprire. Plecarea din capăt nu se atinge.
-- Vechi → nou (stop_order oprire: vechi → nou [mediana GPS, p10–p90]):
--   140 Edineț: 14:20 → 14:35 [14:35, 14:33–14:38]
--   150 Cupcini: 14:29 → 14:45 [14:45, 14:43–14:51]
--   160 Brătușeni: 14:33 → 14:55 [14:53, 14:48–14:56]
--   170 Brătușenii Noi: 14:38 → 15:00 [14:58, 14:53–15:02]
--   180 Mihailenii Noi: 14:42 → 15:00 [15:01, 14:56–15:05]
--   190 Petrom Rîșcani: 14:51 → 15:10 [15:09, 15:05–15:13]
--   200 Intersecția Rîșcani: 14:51 → 15:10 [15:09, 15:05–15:13]
--   210 Recea: 15:00 → 15:15 [15:16, 15:11–15:21]
--   220 Intersecția Pelenia: 15:04 → 15:25 [15:24, 15:20–15:30]
--   230 Corlateni: 15:09 → 15:25 [15:27, 15:23–15:33]
--   240 Bălți: 15:40 → 16:10 [16:08, 16:01–16:12]
--   250 Bilicenii Noi: 15:57 → 16:20 [16:18, 16:13–16:23]
--   260 Bilicenii Vechi: 15:57 → 16:20 [16:21, 16:16–16:26]
--   270 Sîngerei: 16:09 → 16:25 [16:27, 16:21–16:32]
--   280 Grigorăuca: 16:09 → 16:30 [16:31, 16:25–16:36]
--   290 Copăceni: 16:15 → 16:35 [16:35, 16:28–16:39]
--   300 Prepelița: 16:26 → 16:40 [16:41, 16:35–16:47]
--   310 Bănești: 16:32 → 16:45 [16:44, 16:38–16:49]
--   320 Ratuș: 16:38 → 16:50 [16:51, 16:44–16:56]
--   330 Intersecția Soroca: 16:49 → 16:55 [16:54, 16:47–17:00]
--   340 Zăhăreuca: 16:49 → 16:55 [16:57, 16:49–17:02]
--   350 Ciocîlteni: 16:55 → 17:00 [16:59, 16:52–17:04]
--   360 Orhei: 17:07 → 17:10 [17:12, 17:06–17:19]
--   370 Peresecina: 17:18 → 17:25 [17:27, 17:22–17:34]
--   380 Pașcani: 17:30 → 17:35 [17:36, 17:31–17:44]
--   390 Măgdăcești: 17:35 → 17:35 [17:37, 17:33–17:45] (neschimbat)
--   400 Stăuceni: 17:41 → 17:40 [17:42, 17:38–17:51]
--   410 Chișinău: 18:10 → 18:05 [18:04, 17:50–18:10]

UPDATE crm_stop_fares f SET hour_from_nord = v.nou
FROM (VALUES
  (140, '14:20', '14:35'),
  (150, '14:29', '14:45'),
  (160, '14:33', '14:55'),
  (170, '14:38', '15:00'),
  (180, '14:42', '15:00'),
  (190, '14:51', '15:10'),
  (200, '14:51', '15:10'),
  (210, '15:00', '15:15'),
  (220, '15:04', '15:25'),
  (230, '15:09', '15:25'),
  (240, '15:40', '16:10'),
  (250, '15:57', '16:20'),
  (260, '15:57', '16:20'),
  (270, '16:09', '16:25'),
  (280, '16:09', '16:30'),
  (290, '16:15', '16:35'),
  (300, '16:26', '16:40'),
  (310, '16:32', '16:45'),
  (320, '16:38', '16:50'),
  (330, '16:49', '16:55'),
  (340, '16:49', '16:55'),
  (350, '16:55', '17:00'),
  (360, '17:07', '17:10'),
  (370, '17:18', '17:25'),
  (380, '17:30', '17:35'),
  (400, '17:41', '17:40'),
  (410, '18:10', '18:05')
) AS v(stop_order, vechi, nou)
WHERE f.crm_route_id = 8 AND f.stop_order = v.stop_order AND f.hour_from_nord = v.vechi;

UPDATE crm_routes SET time_nord = '12:30 - 18:05' WHERE id = 8 AND time_nord = '12:30 - 17:40';

DO $$
DECLARE r record; prev time := '00:00'; n int;
BEGIN
  SELECT count(*) INTO n FROM crm_stop_fares f JOIN (VALUES
    (140, '14:35'),
    (150, '14:45'),
    (160, '14:55'),
    (170, '15:00'),
    (180, '15:00'),
    (190, '15:10'),
    (200, '15:10'),
    (210, '15:15'),
    (220, '15:25'),
    (230, '15:25'),
    (240, '16:10'),
    (250, '16:20'),
    (260, '16:20'),
    (270, '16:25'),
    (280, '16:30'),
    (290, '16:35'),
    (300, '16:40'),
    (310, '16:45'),
    (320, '16:50'),
    (330, '16:55'),
    (340, '16:55'),
    (350, '17:00'),
    (360, '17:10'),
    (370, '17:25'),
    (380, '17:35'),
    (400, '17:40'),
    (410, '18:05')
  ) AS v(stop_order, nou) ON f.stop_order = v.stop_order WHERE f.crm_route_id = 8 AND f.hour_from_nord = v.nou;
  IF n <> 27 THEN RAISE EXCEPTION 'ruta 8: doar % din 27 opriri actualizate (alt cineva a schimbat orele între timp?)', n; END IF;
  IF (SELECT time_nord FROM crm_routes WHERE id = 8) <> '12:30 - 18:05' THEN RAISE EXCEPTION 'ruta 8: time_nord neactualizat'; END IF;
  FOR r IN SELECT stop_order, hour_from_nord::time h FROM crm_stop_fares WHERE crm_route_id = 8 ORDER BY stop_order LOOP
    IF r.h < prev THEN RAISE EXCEPTION 'ruta 8: oprirea % (%) e înaintea celei dinainte (%)', r.stop_order, r.h, prev; END IF;
    prev := r.h;
  END LOOP;
END $$;
