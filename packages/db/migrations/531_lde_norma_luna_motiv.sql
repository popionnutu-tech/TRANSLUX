-- 531: motivul Clavei, descris bine — din el învață sistemul.
-- Ion, 07.10.2026: «media Clavei de fapt este un loc de îmbunătățire al sistemului, unde ea va scrie de ce e diferit și
-- sistemul va învăța»; la propunerea de a aduna lunar diferențele grupate pe motiv: «facem așa? motivul ea trebuie să îl
-- descrie bine». Deci: felul motivului dintr-o listă (se poate grupa și număra) + descrierea ei de cel puțin 20 de
-- caractere (ce s-a întâmplat, în ce zile, câți litri / km). Tabelul are 0 decizii.
ALTER TABLE lde_norma_luna ADD COLUMN IF NOT EXISTS motiv text
  CHECK (motiv IS NULL OR motiv IN ('plin_luna_vecina', 'reparatie', 'gps', 'alimentare_gresita', 'alt'));
ALTER TABLE lde_norma_luna DROP CONSTRAINT IF EXISTS lde_norma_luna_media_clava_check;
ALTER TABLE lde_norma_luna ADD CONSTRAINT lde_norma_luna_media_clava_check
  CHECK (ales <> 'media_clava' OR (motiv IS NOT NULL AND comentariu IS NOT NULL AND length(btrim(comentariu)) >= 20));
ALTER TABLE lde_norma_luna_istoric ADD COLUMN IF NOT EXISTS motiv text;
CREATE OR REPLACE FUNCTION lde_norma_luna_istoric_scrie() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO lde_norma_luna_istoric (luna, vehicle_id, norma_tip, medie3, km3, ales, norma, comentariu, decis_de, decis_la,
                                      norma_program, km, litri, motiv)
  VALUES (NEW.luna, NEW.vehicle_id, NEW.norma_tip, NEW.medie3, NEW.km3, NEW.ales, NEW.norma, NEW.comentariu, NEW.decis_de,
          NEW.decis_la, NEW.norma_program, NEW.km, NEW.litri, NEW.motiv);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION lde_norma_luna_istoric_scrie() FROM PUBLIC, anon, authenticated;
