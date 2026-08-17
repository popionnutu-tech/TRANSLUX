-- ============================================================================
-- Graficul interurban — schimbarea șoferului cere telefon (regula la sursă).
--
-- Site-ul ascunde complet cursa dacă șoferul zilei n-are număr
-- (apps/web/src/app/(public)/actions.ts:490) — așa a stat nevăzută cursa
-- Otaci 16:25. Verificările din cod acoperă ecranele web (/assignments, /grafic,
-- mini app «Atribuiri»), dar botul schimbă șoferul direct
-- (apps/bot/src/services/db.ts, updateAssignmentDriverVehicle) și n-are nicio
-- verificare. Aici regula stă într-un singur loc, pentru toți scriitorii.
--
-- DOAR pe UPDATE OF driver_id, intenționat:
--   • cronul de copiere pe ziua următoare (api/cron/copy-assignments) și butoanele
--     «Copiază» fac INSERT în bloc, cu toate rândurile zilei într-un singur statement
--     — un rând refuzat ar lăsa ziua ÎNTREAGĂ fără grafic. Ele copiază oricum rânduri
--     care au trecut deja pe la verificările de mai sus;
--   • rândurile istorice rămân intacte (4 rânduri, toate ale lui «Oglasevici A.»,
--     șofer dezactivat) — nu se atinge nimic până când cineva chiar schimbă șoferul.
--
-- Șoferii LDE sunt scutiți de telefon (migrația 256), dar pe o cursă din orar nu au
-- ce căuta fără număr: acolo contează cursa publică, nu autoparcul din care vine omul.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION daily_assignments_sofer_cu_telefon() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_nume text;
  v_tel  text;
BEGIN
  SELECT full_name, phone INTO v_nume, v_tel FROM drivers WHERE id = NEW.driver_id;
  IF v_tel IS NULL OR btrim(v_tel) = '' THEN
    RAISE EXCEPTION '% n-are telefon în bază — completează-l întâi, altfel cursa dispare de pe translux.md', COALESCE(v_nume, 'Șoferul')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_assignments_sofer_cu_telefon ON daily_assignments;
CREATE TRIGGER trg_daily_assignments_sofer_cu_telefon
  BEFORE UPDATE OF driver_id ON daily_assignments
  FOR EACH ROW EXECUTE FUNCTION daily_assignments_sofer_cu_telefon();

COMMENT ON FUNCTION daily_assignments_sofer_cu_telefon() IS 'Refuză schimbarea șoferului pe o cursă din grafic dacă noul șofer n-are telefon. Doar pe UPDATE — inserările în bloc (cron de copiere, butoanele «Copiază») rămân libere.';

COMMIT;
