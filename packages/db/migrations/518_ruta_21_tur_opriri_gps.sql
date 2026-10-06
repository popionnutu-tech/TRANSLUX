-- 518: ruta 21 Otaci → Chișinău (tur): opririle Cupcini–Chișinău după GPS (Edineț 14:20 și Bălți 15:45 rămân, decizia lui Ion din migr. 510)
--
-- Ion, 06.10.2026, pe căutarea Edineț → Chișinău: «2 mașini merg la 14:20 de la Edineț la Chișinău, corectează după graficul real cum merg».
-- Ora nouă = mediana trecerii reale prin oprire, rotunjită la 5 min. Sursa: stop-times.mjs (logica route_stop_passes, migr. 393)
-- rulat fără scriere pe 08.09–05.10.2026, cu filtrul «plecare din capăt ±25 min» scos (ruta 8 pleacă din Criva Vama 11:30–12:45,
-- așa că route_stop_passes are doar 8 zile din 28). 27 de zile pe oprire. Plecarea din capăt nu se atinge.
-- Vechi → nou (stop_order oprire: vechi → nou [mediana GPS, p10–p90]):
--   110 Cupcini: 14:50 → 14:30 [14:31, 14:27–14:35]
--   120 Brătușeni: 14:55 → 14:35 [14:37, 14:32–14:41]
--   130 Brătușenii Noi: 15:05 → 14:45 [14:43, 14:38–14:47]
--   140 Mihailenii Noi: 15:10 → 14:45 [14:46, 14:42–14:50]
--   150 Petrom Rîșcani: 15:10 → 14:55 [14:56, 14:51–15:00]
--   160 Intersecția Rîșcani: 15:12 → 14:55 [14:56, 14:51–15:00]
--   170 Recea: 15:20 → 15:05 [15:03, 14:57–15:06]
--   180 Intersecția Pelenia: 15:27 → 15:10 [15:12, 15:06–15:15]
--   190 Corlateni: 15:30 → 15:15 [15:15, 15:09–15:19]
--   210 Bilicenii Noi: 16:04 → 16:00 [16:00, 15:56–16:05]
--   220 Bilicenii Vechi: 16:08 → 16:05 [16:03, 16:00–16:08]
--   230 Sîngerei: 16:17 → 16:10 [16:10, 16:06–16:15]
--   240 Grigorăuca: 16:21 → 16:15 [16:14, 16:10–16:19]
--   250 Copăceni: 16:25 → 16:15 [16:17, 16:13–16:21]
--   260 Prepelița: 16:33 → 16:25 [16:24, 16:20–16:29]
--   270 Bănești: 16:38 → 16:25 [16:26, 16:23–16:31]
--   280 Ratuș: 16:39 → 16:35 [16:33, 16:30–16:37]
--   290 Intersecția Soroca: 16:42 → 16:35 [16:36, 16:34–16:41]
--   300 Zăhăreuca: 16:43 → 16:40 [16:39, 16:36–16:43]
--   310 Ciocîlteni: 16:46 → 16:40 [16:42, 16:39–16:46]
--   320 Orhei: 16:58 → 16:55 [16:55, 16:51–16:59]
--   330 Peresecina: 17:07 → 17:10 [17:09, 17:06–17:15]
--   340 Pașcani: 17:19 → 17:15 [17:17, 17:14–17:26]
--   350 Măgdăcești: 17:23 → 17:20 [17:19, 17:16–17:29]
--   360 Stăuceni: 17:28 → 17:25 [17:24, 17:21–17:33]
--   370 Chișinău: 17:40 → 17:40 [17:42, 17:37–17:54] (neschimbat)

UPDATE crm_stop_fares f SET hour_from_nord = v.nou
FROM (VALUES
  (110, '14:50', '14:30'),
  (120, '14:55', '14:35'),
  (130, '15:05', '14:45'),
  (140, '15:10', '14:45'),
  (150, '15:10', '14:55'),
  (160, '15:12', '14:55'),
  (170, '15:20', '15:05'),
  (180, '15:27', '15:10'),
  (190, '15:30', '15:15'),
  (210, '16:04', '16:00'),
  (220, '16:08', '16:05'),
  (230, '16:17', '16:10'),
  (240, '16:21', '16:15'),
  (250, '16:25', '16:15'),
  (260, '16:33', '16:25'),
  (270, '16:38', '16:25'),
  (280, '16:39', '16:35'),
  (290, '16:42', '16:35'),
  (300, '16:43', '16:40'),
  (310, '16:46', '16:40'),
  (320, '16:58', '16:55'),
  (330, '17:07', '17:10'),
  (340, '17:19', '17:15'),
  (350, '17:23', '17:20'),
  (360, '17:28', '17:25')
) AS v(stop_order, vechi, nou)
WHERE f.crm_route_id = 21 AND f.stop_order = v.stop_order AND f.hour_from_nord = v.vechi;

DO $$
DECLARE r record; prev time := '00:00'; n int;
BEGIN
  SELECT count(*) INTO n FROM crm_stop_fares f JOIN (VALUES
    (110, '14:30'),
    (120, '14:35'),
    (130, '14:45'),
    (140, '14:45'),
    (150, '14:55'),
    (160, '14:55'),
    (170, '15:05'),
    (180, '15:10'),
    (190, '15:15'),
    (210, '16:00'),
    (220, '16:05'),
    (230, '16:10'),
    (240, '16:15'),
    (250, '16:15'),
    (260, '16:25'),
    (270, '16:25'),
    (280, '16:35'),
    (290, '16:35'),
    (300, '16:40'),
    (310, '16:40'),
    (320, '16:55'),
    (330, '17:10'),
    (340, '17:15'),
    (350, '17:20'),
    (360, '17:25')
  ) AS v(stop_order, nou) ON f.stop_order = v.stop_order WHERE f.crm_route_id = 21 AND f.hour_from_nord = v.nou;
  IF n <> 25 THEN RAISE EXCEPTION 'ruta 21: doar % din 25 opriri actualizate (alt cineva a schimbat orele între timp?)', n; END IF;
  IF (SELECT hour_from_nord FROM crm_stop_fares WHERE crm_route_id = 21 AND stop_order = 100) <> '14:20'
     OR (SELECT hour_from_nord FROM crm_stop_fares WHERE crm_route_id = 21 AND stop_order = 200) <> '15:45' THEN
    RAISE EXCEPTION 'ruta 21: Edineț 14:20 / Bălți 15:45 trebuiau să rămână'; END IF;
  FOR r IN SELECT stop_order, hour_from_nord::time h FROM crm_stop_fares WHERE crm_route_id = 21 ORDER BY stop_order LOOP
    IF r.h < prev THEN RAISE EXCEPTION 'ruta 21: oprirea % (%) e înaintea celei dinainte (%)', r.stop_order, r.h, prev; END IF;
    prev := r.h;
  END LOOP;
END $$;
