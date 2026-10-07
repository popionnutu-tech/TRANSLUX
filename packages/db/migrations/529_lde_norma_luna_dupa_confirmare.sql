-- 529: după confirmarea lui Ion, normele lunii nu se mai schimbă decât de un ADMIN (revizia de securitate a lui a2657029).
-- Acțiunea decide() verifică deja confirmarea, dar între verificare și scriere Ion putea confirma (cursă): regula stă și
-- în bază. decis_de = emailul din sesiune, scris de server.
CREATE OR REPLACE FUNCTION lde_norma_luna_paza_confirmare() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM lde_norma_luna_confirmare c WHERE c.luna = NEW.luna)
     AND NOT EXISTS (SELECT 1 FROM admin_accounts a WHERE a.email = NEW.decis_de AND a.role = 'ADMIN' AND a.active) THEN
    RAISE EXCEPTION 'Luna % e confirmată de Ion — schimbarea o face doar el', to_char(NEW.luna, 'YYYY-MM') USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION lde_norma_luna_paza_confirmare() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_lde_norma_luna_paza ON lde_norma_luna;
CREATE TRIGGER trg_lde_norma_luna_paza BEFORE INSERT OR UPDATE ON lde_norma_luna
  FOR EACH ROW EXECUTE FUNCTION lde_norma_luna_paza_confirmare();
