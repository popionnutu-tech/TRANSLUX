-- 090_trim_otaci_ocnita_grafic_stops.sql
-- În Grafic, string-ul de opriri se construiește din crm_stop_fares WHERE is_visible=true
-- (apps/admin/.../grafic/actions.ts). Rutele Otaci (58) și Ocnița (59) aveau TOATE oprirele
-- is_visible=true (migrările 084/087), deci în Grafic apăreau toate satele, spre deosebire
-- de restul rutelor care arată doar oprirele principale.
--
-- Fix: aliniem vizibilitatea oprirelor de pe rutele 58 și 59 la ruta comparabilă crm 3
-- (Chișinău–Ocnița) — adică doar oprirele principale rămân is_visible=true. Otaci (originea
-- rutei 58, care nu există pe ruta 3) rămâne vizibil.
--
-- NOTĂ IMPORTANTĂ: is_visible e folosit DOAR de Grafic (admin). NU afectează site-ul public
-- (care se bazează pe tabela `localities`) și nici numărarea (care folosește interurban_v2_stops).
-- Deci toate stațiile rămân căutabile pe site — se schimbă doar lista din Grafic.

BEGIN;

UPDATE crm_stop_fares t
   SET is_visible = r3.is_visible
  FROM (SELECT name_ro, is_visible FROM crm_stop_fares WHERE crm_route_id = 3) r3
 WHERE t.crm_route_id IN (58, 59)
   AND t.name_ro = r3.name_ro;

COMMIT;
