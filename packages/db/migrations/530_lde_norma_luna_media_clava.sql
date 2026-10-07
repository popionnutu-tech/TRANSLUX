-- 530: Clava nu alege între cifre — CONFIRMĂ media lunii socotită de soft sau pune media ei (cu motiv).
-- Ion, 07.10.2026: «Clava nu alege, le confirmă sau infirmă pe cele socotite în program»; «media o face softul după legea
-- pusă de Clava și la camioane legea noastră»; «Clava se uită la media făcută de AI pe lună și pune media ei dacă e
-- diferită»; «Clava a scris din fișier Word» (interviul din 07.10: litrii mașinii pe lună ÷ km GPS, împărțiți pe șoferi
-- după km); «în octombrie face septembrie». Camioanele: luna = cursele pornite în lună până la plinul următor (ION-162).
-- Tabelul era gol (0 decizii, 0 confirmări) — se schimbă doar regulile.
ALTER TABLE lde_norma_luna ADD COLUMN IF NOT EXISTS norma_program numeric;   -- media softului, înghețată la decizie
ALTER TABLE lde_norma_luna ADD COLUMN IF NOT EXISTS km numeric;
ALTER TABLE lde_norma_luna ADD COLUMN IF NOT EXISTS litri numeric;
ALTER TABLE lde_norma_luna DROP CONSTRAINT IF EXISTS lde_norma_luna_ales_check;
ALTER TABLE lde_norma_luna DROP CONSTRAINT IF EXISTS lde_norma_luna_check;
ALTER TABLE lde_norma_luna DROP CONSTRAINT IF EXISTS lde_norma_luna_check1;
ALTER TABLE lde_norma_luna DROP CONSTRAINT IF EXISTS lde_norma_luna_check2;
ALTER TABLE lde_norma_luna ADD CONSTRAINT lde_norma_luna_ales_check CHECK (ales IN ('confirmat', 'media_clava'));
ALTER TABLE lde_norma_luna ADD CONSTRAINT lde_norma_luna_confirmat_check CHECK (ales <> 'confirmat' OR norma = norma_program);
ALTER TABLE lde_norma_luna ADD CONSTRAINT lde_norma_luna_media_clava_check
  CHECK (ales <> 'media_clava' OR (comentariu IS NOT NULL AND length(btrim(comentariu)) >= 5));
COMMENT ON TABLE lde_norma_luna IS
  'Media lunii pe mașină: socotită de soft (autobuze: litri ÷ km GPS în lună; camioane: pe curse, ION-162) și confirmată de '
  'Clava, sau media ei + motiv (/lde/agreare/norme). Posterul lunii pleacă după confirmarea lui Ion (lde_norma_luna_confirmare).';

ALTER TABLE lde_norma_luna_istoric ADD COLUMN IF NOT EXISTS norma_program numeric;
ALTER TABLE lde_norma_luna_istoric ADD COLUMN IF NOT EXISTS km numeric;
ALTER TABLE lde_norma_luna_istoric ADD COLUMN IF NOT EXISTS litri numeric;
CREATE OR REPLACE FUNCTION lde_norma_luna_istoric_scrie() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO lde_norma_luna_istoric (luna, vehicle_id, norma_tip, medie3, km3, ales, norma, comentariu, decis_de, decis_la, norma_program, km, litri)
  VALUES (NEW.luna, NEW.vehicle_id, NEW.norma_tip, NEW.medie3, NEW.km3, NEW.ales, NEW.norma, NEW.comentariu, NEW.decis_de, NEW.decis_la,
          NEW.norma_program, NEW.km, NEW.litri);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION lde_norma_luna_istoric_scrie() FROM PUBLIC, anon, authenticated;
