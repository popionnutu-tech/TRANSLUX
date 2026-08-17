-- ============================================================================
-- Șoferi — telefonul devine OBLIGATORIU la adăugare (decizie Ion, 15.08.2026).
--
-- De ce: site-ul public ascunde complet cursa dacă șoferul zilei n-are telefon
-- (apps/web/src/app/(public)/actions.ts — `hasDriver = driver && phone`).
-- Cursa Otaci 16:25 circula, dar pasagerul vedea „1 cursă găsită" în loc de 2,
-- pentru că Oglasevici A. era în bază fără număr.
--
-- Doar la INSERT, intenționat: în bază sunt 112 șoferi activi fără telefon, iar
-- un CHECK obișnuit ar bloca și simpla dezactivare sau redenumire a lor. Regula
-- oprește intrările NOI; cele vechi se completează pe măsură ce sunt folosite.
--
-- De reținut pentru migrațiile viitoare: în proiect există obiceiul de a semăna
-- șoferi direct din SQL fără telefon (204_lde_seed_data.sql, 241_lde_camioane...).
-- Orice INSERT nou de acest fel va pica acum — puneți telefonul în seed.
-- La fel, un `upsert` pe drivers declanșează trigger-ul chiar și pentru rândurile
-- care ajung pe ramura UPDATE (conflictul se rezolvă după BEFORE INSERT).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION drivers_require_phone() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.phone IS NULL OR btrim(NEW.phone) = '' THEN
    RAISE EXCEPTION 'Telefonul este obligatoriu la șoferi (fără el cursa nu apare pe translux.md)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drivers_require_phone ON drivers;
CREATE TRIGGER trg_drivers_require_phone
  BEFORE INSERT ON drivers
  FOR EACH ROW EXECUTE FUNCTION drivers_require_phone();

COMMENT ON FUNCTION drivers_require_phone() IS 'Blochează adăugarea unui șofer fără telefon. Doar pe INSERT — șoferii vechi fără număr rămân editabili.';

COMMIT;
