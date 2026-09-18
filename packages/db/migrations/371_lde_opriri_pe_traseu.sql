-- 371: opririle FĂCUTE PE TRASEUL RUTEI — dovada cea mai tare că mașina a avut pasageri
--
-- Ion, 18.09.2026: «dacă auto repetă opririle cum este pe rută — auto a avut pasageri».
--
-- Migrația 369 a adus numărul de opriri din sate. E un semnal, dar slab: o mașină care
-- merge acasă trece și ea prin sate și poate opri la magazin. Măsurat pe 16.09: 1,75
-- opriri în sat pe segmentele pline față de 0,81 pe cele goale — desparte, dar nu decide.
--
-- Regula lui Ion e mai tare, fiindcă leagă oprirea de RUTA ANUME: nu „a oprit undeva",
-- ci „a oprit acolo unde oprește ruta asta de obicei". Satele etalonului sunt exact lista
-- aceea, dedusă din cursele ei neambigue. O oprire la magazinul din drum nu nimerește în
-- ea; una la a treia stație a rutei, da.
ALTER TABLE lde_route_run
  ADD COLUMN IF NOT EXISTS opriri_pe_traseu int;

COMMENT ON COLUMN lde_route_run.opriri_pe_traseu IS
  'Câte dintre opririle scurte ale segmentului cu pasageri cad într-un sat al ETALONULUI '
  'rutei. Ion, 18.09: «dacă auto repetă opririle cum este pe rută — auto a avut pasageri». '
  'Mai tare decât opriri_plin: acela numără orice oprire din orice sat, inclusiv magazinul '
  'de pe drumul spre casă.';
