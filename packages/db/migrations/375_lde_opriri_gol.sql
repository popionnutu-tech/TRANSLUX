-- 375: opririle de pe drumul „gol" — dovada că nu era gol
--
-- Ion, 18.09: «dacă au două rute, înseamnă că trebuie să se întoarcă în zonă ca să ridice
-- oamenii de acolo, nu?». Are dreptate, și verificarea pe cele patru cazuri de „neglijență"
-- din 17.09 o confirmă:
--   Guzun Ivan stă în Zăicani = primul sat al rutei #8, iar la 13:08 a oprit în Costești,
--     care e tot pe #8. Nu s-a plimbat — făcea a doua rută.
--   Juncu Serafim stă în Sărata Veche = primul sat al rutei #26.
--   Vleju Igor stă în Dumbrăvița = primul sat al rutelor #25 ȘI #35.
--
-- Modelul le trecea drumul la „gol" fiindcă o mașină cu două rute în același schimb
-- primește cursă doar pentru una; a doua rămâne fără, iar drumul ei plin e luat drept
-- întoarcerea goală a primei.
--
-- Opririle de urcare țin 30-40 de secunde și NU apar în lde_gps_stops (pragul e 90 s), deci
-- nici lipsa lor de acolo nu dovedea nimic. Se numără din urma brută, ca la migr. 373: câte
-- opriri scurte de pe segmentul GOL cad într-un sat al vreuneia dintre rutele mașinii.
-- Peste zero, drumul n-a fost gol — și nimeni nu are voie să fie acuzat de neglijență.
ALTER TABLE lde_route_run
  ADD COLUMN IF NOT EXISTS opriri_gol_pe_traseu int;

COMMENT ON COLUMN lde_route_run.opriri_gol_pe_traseu IS
  'Opriri scurte de pe segmentul GOL care cad într-un sat al vreuneia dintre rutele mașinii '
  'din ziua aceea. Peste zero = drumul n-a fost gol, mașina strângea oamenii celeilalte rute.';
