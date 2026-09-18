-- 373: opririle FĂCUTE PE TRASEUL RUTEI — dovada cea mai tare că mașina a avut pasageri
-- (aplicată în bază pe 18.09 sub numele `371_lde_opriri_pe_traseu`, înainte ca o sesiune
--  paralelă să folosească același număr 371 pentru `status_uzina_nu_a_lucrat`. Fișierul e
--  renumerotat aici ca să nu rămână două migrații cu același număr; în bază NU se rerulează.)
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
