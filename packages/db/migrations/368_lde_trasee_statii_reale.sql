-- ============================================================================
-- 368: Ruta începe la prima OPRIRE STABILĂ cu pasageri, nu la primul punct al zilei.
--
-- Ion, 17.09.2026: «unde se începe și se termină ruta după ultima și prima oprire
-- stabilă față locul de trai la șofer».
--
-- Defectul reparat: capetele traseului se luau din geometria etalonului, iar segmentul
-- de dus începe acolo unde începe ziua — adică ACASĂ LA ȘOFER. Măsurat: în 730 din
-- 1.099 de cazuri (66%) „prima stație" era la sub 1 km de locul unde doarme mașina,
-- distanța medie 4,46 km. Costul unei perechi șofer↔rută compara deci casa unui om cu
-- casa altuia, nu cu locul unde urcă primii pasageri.
--
-- Capetele se iau acum din opririle detectate (clustere de viteză mică ≥90 s), sărind
-- oprirea de bază (`lde_gps_stops.is_base`). Sunt scrise pe fiecare cursă și agregate
-- median în etalon — o singură zi nu stabilește unde e stația.
-- ============================================================================
ALTER TABLE lde_route_run
  ADD COLUMN IF NOT EXISTS prima_statie  jsonb,
  ADD COLUMN IF NOT EXISTS ultima_statie jsonb;

ALTER TABLE lde_route_etalon
  ADD COLUMN IF NOT EXISTS prima_statie  jsonb,
  ADD COLUMN IF NOT EXISTS ultima_statie jsonb;

COMMENT ON COLUMN lde_route_run.prima_statie IS
  '{lat, lon, locality} — prima oprire stabilă a cursei care NU e baza. Nu primul punct '
  'al urmei: acela e casa șoferului, iar km-ii de acolo până aici sunt tocmai livrarea.';
COMMENT ON COLUMN lde_route_etalon.prima_statie IS
  'Mediana pe curse. NU se ia dintr-o singură zi: o dimineață în care mașina a oprit '
  'undeva în plus ar muta stația.';
