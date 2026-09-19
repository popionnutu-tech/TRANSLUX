-- 379: navetă sau brambura — km-ii șoferului din afara rutei, împărțiți după casă
--
-- Ion, 19.09: «cel care e navetă e livrare, cel care e brambura e brambura». Kilometrii
-- din afara rutei (dincolo de satul care dă numele rutei) sunt ai șoferului, nu ai uzinei;
-- dar nu-s toți la fel: drumul de acasă la satul de start e NAVETĂ — dispare cu un șofer
-- din satul ăla; drumul care nu atinge nici casa, nici ruta e BRAMBURA (Vartic, 15.09:
-- 46 km la Chișinău după tura de noapte).
--
-- De aici `km_livrare` înseamnă naveta de pe AMBELE feluri de drum (plin și gol), nu doar
-- tăietura drumului plin; `km_brambura` e restul. `km_goi` rămâne golul brut, cu partea
-- lui de pe rută în `km_gol_ruta` (migr. 378).
ALTER TABLE lde_route_run
  ADD COLUMN IF NOT EXISTS km_brambura numeric(8,2);

COMMENT ON COLUMN lde_route_run.km_brambura IS
  'Km din afara rutei care nu trec nici pe la casa șoferului, nici pe rută — ocol, drum '
  'personal. Perechea lui km_livrare (naveta), amândouă în afara rutei.';
COMMENT ON COLUMN lde_route_run.km_livrare IS
  'NAVETA: km din afara rutei (dincolo de satul care dă numele rutei) care trec pe la casa '
  'șoferului — pe drumul plin și pe cel gol deopotrivă. Dispare cu un șofer din satul de start.';
