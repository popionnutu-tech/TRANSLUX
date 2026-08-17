-- ============================================================================
-- Șoferi — telefonul obligatoriu doar pentru INTERURBAN (decizie Ion, 15.08.2026).
--
-- Migrația 254 a pus regula pe tot autoparcul. Tăierea reală a datelor:
--   interurban (is_lde = false): 66 activi, 3 fără telefon  ← ei apar pe translux.md
--   LDE (is_lde = true):        110 activi, 109 fără telefon ← nu apar niciodată public
-- Deci regula rămâne acolo unde chiar rezolvă ceva, iar listele de șoferi LDE se pot
-- adăuga mai departe din migrații (204/241), fără telefoane pe care nimeni nu le are.
--
-- Al doilea trigger închide portița deschisă de primul: `is_lde` e o coloană
-- obișnuită, deci un șofer LDE mutat pe interurban ar reproduce exact bug-ul
-- „Otaci 16:25" (cursă ascunsă pe site fiindcă șoferul zilei n-are număr).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION drivers_require_phone() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- doar interurbanul: acolo lipsa numărului ascunde cursa de pe translux.md
  IF COALESCE(NEW.is_lde, false) = false
     AND (NEW.phone IS NULL OR btrim(NEW.phone) = '') THEN
    RAISE EXCEPTION 'Telefonul este obligatoriu la șoferii de interurban (fără el cursa nu apare pe translux.md)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION drivers_require_phone() IS 'Blochează adăugarea unui șofer de interurban fără telefon. Șoferii LDE (is_lde) sunt scutiți — nu apar pe site.';

-- trecerea LDE → interurban cere telefonul, altfel regula de mai sus s-ar ocoli
CREATE OR REPLACE FUNCTION drivers_require_phone_on_switch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(OLD.is_lde, false) = true
     AND COALESCE(NEW.is_lde, false) = false
     AND (NEW.phone IS NULL OR btrim(NEW.phone) = '') THEN
    RAISE EXCEPTION 'Șoferul trece pe interurban — completați întâi telefonul (fără el cursa nu apare pe translux.md)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drivers_require_phone_on_switch ON drivers;
CREATE TRIGGER trg_drivers_require_phone_on_switch
  BEFORE UPDATE OF is_lde ON drivers
  FOR EACH ROW EXECUTE FUNCTION drivers_require_phone_on_switch();

COMMENT ON FUNCTION drivers_require_phone_on_switch() IS 'La mutarea unui șofer din LDE pe interurban cere telefonul; restul actualizărilor rămân libere.';

COMMIT;
