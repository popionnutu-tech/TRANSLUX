-- 527: oprirea la Intersecția Vrănești (centura Sîngerei) ține loc de trecerea prin centru.
--
-- Ion, 07.10.2026: «dacă șoferii care merg pe interurban la tur sau retur au oprire la Intersecția
-- Vrănești — oprirea pe centura Sîngerei — să nu se considere că el a violat regula de trecere prin
-- Sîngerei».
--
-- vranesti_s = cea mai lungă oprire (secunde, viteza sub 8 km/h) a urmei GPS brute la ≤ 250 m de
-- intersecția centurii R6 cu L282 R6–Vrănești–Iezărenii Vechi (47.63225, 28.10694), în ±25 min de
-- trecerea pe la Sîngerei. Scrisă de lde-geo-worker/stop-times.mjs doar pe rândul Sîngerei; NULL în
-- rest. Verificarea neconformităților (lib/mejgorod/neconformitati.ts): Sîngerei e respectat dacă
-- centru_m ≤ 300 SAU vranesti_s ≥ 10. Pe 23.09–06.10: 45 de curse din 674 opresc acolo.
ALTER TABLE public.route_stop_passes ADD COLUMN IF NOT EXISTS vranesti_s integer;

COMMENT ON COLUMN public.route_stop_passes.vranesti_s IS
  'Cea mai lungă oprire (s, sub 8 km/h) a urmei GPS brute la ≤250 m de Intersecția Vrănești de pe centura Sîngerei, în ±25 min de trecere. Doar pe rândul Sîngerei. ≥10 s = regula «prin Sîngerei» respectată și fără centru (Ion, 07.10). NULL = nemăsurat. Vezi migr. 527.';
