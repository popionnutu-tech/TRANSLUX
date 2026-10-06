-- 520: primul număr din time_nord = plecarea REALĂ din primul capăt (GPS), pe rutele unde nu se potrivea (ION-251)
--
-- Ion, 06.10.2026: «da» — după 519 (ruta 8), aliniază primul număr din time_nord la plecarea reală din capăt
-- pentru rutele 10, 27, 22, 20, 16, 19, 11, 15 și orice altă rută cu aceeași nepotrivire.
-- time_nord «HH:MM - HH:MM»: primul număr = plecarea rutei din capăt (pornireRuta în căutare și în comenzile de bilete).
--
-- Plecarea reală = mediana pe 22.09–05.10.2026, din urma GPS brută (scripturi de citire pe VPS, apoi șterse):
--   * rutele din Criva: rutiera stă la vamă, ~3 km vest de sat; plecare = ultimul punct la vamă înainte de sat;
--     route_stop_passes NU e bun aici (Criva Vama și Criva au punctul în centrul satului → «trecerea» la urcarea spre vamă);
--   * celelalte: ultimul punct lângă oprirea-capăt înainte de prima trecere prin oprirea următoare.
-- Opririle se schimbă doar când abaterea medianei e ≥ 5 min (ora nouă rotunjită la 5), plus Corjeuți pe 26 (ar fi rămas
-- înaintea Tețcanilor). Ruta 22: Criva Vama 4,5 min (06:14,5), se aliniază ca să fie aceeași oră cu time_nord.
--
-- ruta: time_nord vechi → nou | plecarea reală (p10–p90, zile) | opriri schimbate
--   2  Briceni→Chișinău:   05:45 → 04:30 | Lipcani 04:31 (04:29–04:35, 13) | — (Criva Vama–Drepcăuți 04:00–04:10 nu se deservesc)
--   6  Corjeuți→Chișinău:  06:17 → 06:15 | Tețcani 06:16 (06:13–06:21, 14) | Tețcani 06:10 → 06:15
--   10 Lipcani→Chișinău:   14:10 → 13:40 | vama 13:41 (13:40–13:42, 7), sat 13:45 | —
--   11 Criva→Chișinău:     13:20 (rămâne) | vama 13:21 (13:18–13:24, 12), sat 13:25, Drepcăuți 13:32 |
--                          Criva Vama 13:15 → 13:20, Criva 13:20 → 13:25, Drepcăuți 13:25 → 13:30
--   15 Criva→Chișinău:     17:30 → 17:25 | vama 17:27 (17:20–17:30, 8), sat 17:28 | —
--   16 Lipcani→Chișinău:   02:35 → 03:00 | vama 03:02 (03:00–03:07, 12), sat 03:05 | —
--   19 Lipcani→Chișinău:   06:10 → 06:00 | vama 06:00 (05:59–06:03, 13), sat 06:04 | —
--   22 Lipcani→Chișinău:   06:35 → 06:15 | vama 06:14,5 (06:13–06:16, 12), sat 06:17 | Criva Vama 06:10 → 06:15
--   25 Caracușenii Vechi:  07:00 → 06:50 | Caracușenii Vechi 06:52 (06:49–06:55, 14) | Caracușenii Vechi 06:45 → 06:50
--   26 Corjeuți (Briceni): 08:00 → 08:05 | Tețcani 08:07 (08:01–08:10, 13), Corjeuți 08:11 | Tețcani 07:45 → 08:05, Corjeuți 08:00 → 08:10
--   27 Lipcani→Chișinău:   09:15 → 08:40 | vama 08:42 (08:40–08:43, 12), sat 08:46 | —
--   29 (SCOASĂ, de confirmat de Ion: porțiunea Briceni → Ocnița cu pasageri?) Ocnița→Chișinău:    09:50 → 08:45 | Briceni 08:44 (08:42–08:47, 14), apoi Ocnița pleacă 09:52 | Briceni 08:30 → 08:45
-- Neschimbate, deși primul număr ≠ prima oprire din listă: 1 (Grimăncăuți 03:00, real 03:04; Criva Vama–Caracușenii Noi
-- 02:05–02:55 nu se deservesc), 20 (Lipcani 06:00, real 06:03; Criva Vama–Drepcăuți 05:30–05:40 nu se deservesc).

UPDATE crm_stop_fares f SET hour_from_nord = v.nou
FROM (VALUES
  (6, 10, '06:10', '06:15'),
  (11, 10, '13:15', '13:20'),
  (11, 20, '13:20', '13:25'),
  (11, 30, '13:25', '13:30'),
  (22, 10, '06:10', '06:15'),
  (25, 10, '06:45', '06:50'),
  (26, 9, '07:45', '08:05'),
  (26, 10, '08:00', '08:10')
) AS v(crm_route_id, stop_order, vechi, nou)
WHERE f.crm_route_id = v.crm_route_id AND f.stop_order = v.stop_order AND f.hour_from_nord = v.vechi;

UPDATE crm_routes r SET time_nord = v.nou
FROM (VALUES
  (2, '05:45 - 09:30', '04:30 - 09:30'),
  (6, '06:17 - 10:20', '06:15 - 10:20'),
  (10, '14:10 - 19:05', '13:40 - 19:05'),
  (15, '17:30 - 22:25', '17:25 - 22:25'),
  (16, '02:35 - 07:00', '03:00 - 07:00'),
  (19, '06:10 - 10:40', '06:00 - 10:40'),
  (22, '06:35 - 10:50', '06:15 - 10:50'),
  (25, '07:00 - 10:45', '06:50 - 10:45'),
  (26, '08:00 - 17:15', '08:05 - 17:15'),
  (27, '09:15 - 13:45', '08:40 - 13:45')
) AS v(id, vechi, nou)
WHERE r.id = v.id AND r.time_nord = v.vechi;

DO $$
DECLARE r record; rid int; prev time; n int;
BEGIN
  SELECT count(*) INTO n FROM crm_stop_fares f JOIN (VALUES
    (6, 10, '06:15'), (11, 10, '13:20'), (11, 20, '13:25'), (11, 30, '13:30'), (22, 10, '06:15'),
    (25, 10, '06:50'), (26, 9, '08:05'), (26, 10, '08:10')
  ) AS v(crm_route_id, stop_order, nou) ON f.crm_route_id = v.crm_route_id AND f.stop_order = v.stop_order AND f.hour_from_nord = v.nou;
  IF n <> 8 THEN RAISE EXCEPTION 'opriri: doar % din 8 actualizate (alt cineva a schimbat orele între timp?)', n; END IF;

  SELECT count(*) INTO n FROM crm_routes cr JOIN (VALUES
    (2, '04:30 - 09:30'), (6, '06:15 - 10:20'), (10, '13:40 - 19:05'), (15, '17:25 - 22:25'), (16, '03:00 - 07:00'),
    (19, '06:00 - 10:40'), (22, '06:15 - 10:50'), (25, '06:50 - 10:45'), (26, '08:05 - 17:15'), (27, '08:40 - 13:45')
  ) AS v(id, nou) ON cr.id = v.id AND cr.time_nord = v.nou;
  IF n <> 10 THEN RAISE EXCEPTION 'time_nord: doar % din 10 actualizate', n; END IF;

  -- ruta 11 își păstrează time_nord, acum egal cu Criva Vama
  IF (SELECT time_nord FROM crm_routes WHERE id = 11) <> '13:20 - 17:40' THEN RAISE EXCEPTION 'ruta 11: time_nord schimbat de altcineva'; END IF;

  -- primul număr = ora opririi-capăt reale
  FOR r IN SELECT * FROM (VALUES (2, 5), (6, 10), (10, 10), (11, 10), (15, 10), (16, 10), (19, 10), (22, 10), (25, 10), (26, 9), (27, 10)) AS c(id, so) LOOP
    IF (SELECT split_part(time_nord, ' - ', 1) FROM crm_routes WHERE id = r.id)
       <> (SELECT lpad(hour_from_nord, 5, '0') FROM crm_stop_fares WHERE crm_route_id = r.id AND stop_order = r.so) THEN
      RAISE EXCEPTION 'ruta %: time_nord nu e egal cu ora capătului (stop_order %)', r.id, r.so;
    END IF;
  END LOOP;

  -- orele cresc pe toată ruta, de la capătul real încolo (opririle nedeservite dinainte rămân cum erau)
  FOR rid IN SELECT unnest(ARRAY[2, 6, 10, 11, 15, 16, 19, 22, 25, 26, 27]) LOOP
    prev := '00:00';
    FOR r IN SELECT stop_order, hour_from_nord::time h FROM crm_stop_fares
             WHERE crm_route_id = rid AND hour_from_nord IS NOT NULL AND hour_from_nord !~ '^0?0:00$'
               AND stop_order >= CASE rid WHEN 2 THEN 5 WHEN 26 THEN 9 ELSE 10 END
             ORDER BY stop_order LOOP
      IF r.h < prev THEN RAISE EXCEPTION 'ruta %: oprirea % (%) e înaintea celei dinainte (%)', rid, r.stop_order, r.h, prev; END IF;
      prev := r.h;
    END LOOP;
  END LOOP;
END $$;
