-- 441: ION-143 (Codex r1 C1) — publicarea atomică a parcării propuse LEAR: date.parcare în rândul săptămânii (lde_analiza_reguli) și harta
-- mașinilor (lde_harta_zi) într-o singură tranzacție. Ori se scriu amândouă, ori nimic: dacă ceva pică, harta și raportul de dinainte rămân.
-- Cheamă doar VPS-ul (publica-lear-parcare.mjs, cheia service_role); anon / authenticated n-au drept (migr. 355/356: funcțiile noi, REVOKE PUBLIC).
CREATE OR REPLACE FUNCTION lde_publica_lear_parcare(p_uzina_id text, p_uzina_nume text, p_saptamina date, p_parcare jsonb, p_harta jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF (p_uzina_id, p_uzina_nume) NOT IN (('LEAR_UNGHENI', 'LEAR Ungheni'), ('LEAR_FLORESTI', 'LEAR Florești')) THEN
    RAISE EXCEPTION 'lde_publica_lear_parcare: uzină necunoscută % / %', p_uzina_id, p_uzina_nume;
  END IF;
  IF jsonb_typeof(p_parcare) <> 'object' OR jsonb_typeof(p_parcare->'masini') <> 'array' THEN RAISE EXCEPTION 'lde_publica_lear_parcare: parcare fără masini'; END IF;
  IF jsonb_typeof(p_harta) <> 'array' OR jsonb_array_length(p_harta) = 0 THEN RAISE EXCEPTION 'lde_publica_lear_parcare: harta goală'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_harta) e WHERE e->>'uzina' IS DISTINCT FROM p_uzina_id OR (e->>'saptamina')::date IS DISTINCT FROM p_saptamina) THEN
    RAISE EXCEPTION 'lde_publica_lear_parcare: rând de hartă din altă uzină / săptămână';
  END IF;

  UPDATE lde_analiza_reguli SET date = jsonb_set(date, '{parcare}', p_parcare, true)
   WHERE uzina = p_uzina_nume AND saptamina = p_saptamina;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'lde_publica_lear_parcare: rândul % % lipsește (rulează întâi lear-analiza.mjs --write)', p_uzina_nume, p_saptamina; END IF;

  DELETE FROM lde_harta_zi WHERE uzina = p_uzina_id AND saptamina = p_saptamina;
  INSERT INTO lde_harta_zi (uzina, saptamina, m, z, sumar, date)
  SELECT e->>'uzina', (e->>'saptamina')::date, e->>'m', (e->>'z')::date, e->'sumar', e->'date' FROM jsonb_array_elements(p_harta) e;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

COMMENT ON FUNCTION lde_publica_lear_parcare(text, text, date, jsonb, jsonb) IS
  'ION-143: publică atomic parcarea propusă LEAR (date.parcare în lde_analiza_reguli + rândurile lde_harta_zi ale săptămânii). Doar service_role.';

REVOKE ALL ON FUNCTION lde_publica_lear_parcare(text, text, date, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_publica_lear_parcare(text, text, date, jsonb, jsonb) TO service_role;
