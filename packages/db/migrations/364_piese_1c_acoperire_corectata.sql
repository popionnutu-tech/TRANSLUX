-- 364: Vederea de acoperire număra coloana greșită la mașini.
--
-- Scrisă în migr. 359, înainte de a ști că mașina intră în documentul 1C DOAR ca «вид деятельности»
-- (`ТранспортноеСредство` rămâne gol — contabila: «duc evidenta ca cost»). Vederea număra `guid_1c`,
-- adică mijlocul fix, care nu se completează niciodată — deci arăta „0 din 205" chiar după ce 157 de
-- mașini fuseseră legate corect.
--
-- Un raport care arată zero acolo unde totul e în regulă e mai rău decât niciun raport: trimite omul să
-- repare ce nu e stricat.
CREATE OR REPLACE VIEW piese_1c_acoperire AS
  SELECT 'piese'::text AS entitate,
         count(*) FILTER (WHERE guid_1c IS NOT NULL) AS cu_guid,
         count(*) AS total
    FROM piese_parts WHERE active
  UNION ALL
  -- La mașini contează `guid_1c_activitate`, nu `guid_1c`.
  SELECT 'masini', count(*) FILTER (WHERE guid_1c_activitate IS NOT NULL), count(*)
    FROM piese_vehicles WHERE active
  UNION ALL
  SELECT 'lacatusi', count(*) FILTER (WHERE guid_1c IS NOT NULL), count(*) FROM piese_mechanics
  UNION ALL
  SELECT 'depozite', count(*) FILTER (WHERE guid_1c IS NOT NULL), count(*) FROM piese_warehouses;

REVOKE ALL ON piese_1c_acoperire FROM PUBLIC, anon, authenticated;
GRANT SELECT ON piese_1c_acoperire TO service_role;
