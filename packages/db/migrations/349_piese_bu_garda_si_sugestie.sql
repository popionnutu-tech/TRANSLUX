-- 349: Garda de origine nu mai poate bloca redenumirile, iar sugestia ignoră documentele anulate.
--
-- (1) Triggerul se declanșa la ORICE scriere pe `piese_parts` și re-valida legătura pe date nemodificate.
--     Dacă o piesă-origine ajungea marcată uzată, orice UPDATE ulterior pe „copiii" ei eșua cu
--     `ORIGIN_MUST_BE_NEW` — inclusiv o simplă redenumire. Iar `piese_rename_lookup` (migr. 317) face un
--     UPDATE peste TOT catalogul: un singur rând în starea aia ar fi oprit contopirea unui producător,
--     cu un cod brut afișat omului. `OF is_used, origin_part_id` restrânge declanșarea la scrierile care
--     chiar ating cele două câmpuri — redenumirile în masă nici nu mai intră în funcție.
--
--     `FOR SHARE` pe rândul-origine închide și cursa: fără el, o tranzacție care leagă B→A și una care
--     marchează A ca uzată puteau reuși amândouă, lăsând exact lanțul pe care garda îl interzice.
CREATE OR REPLACE FUNCTION piese_part_origin_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.origin_part_id IS NOT NULL THEN
    IF NEW.origin_part_id = NEW.id THEN RAISE EXCEPTION 'ORIGIN_SELF'; END IF;
    IF NOT NEW.is_used THEN RAISE EXCEPTION 'ORIGIN_ONLY_USED'; END IF;
    PERFORM 1 FROM piese_parts o WHERE o.id = NEW.origin_part_id AND NOT o.is_used FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ORIGIN_MUST_BE_NEW'; END IF;
  END IF;
  IF NEW.is_used AND TG_OP = 'UPDATE' AND NOT OLD.is_used THEN
    PERFORM 1 FROM piese_parts c WHERE c.origin_part_id = NEW.id;
    IF FOUND THEN RAISE EXCEPTION 'ORIGIN_HAS_CHILDREN'; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_piese_part_origin ON piese_parts;
CREATE TRIGGER trg_piese_part_origin
  BEFORE INSERT OR UPDATE OF is_used, origin_part_id ON piese_parts
  FOR EACH ROW WHEN (NEW.origin_part_id IS NOT NULL OR NEW.is_used)
  EXECUTE FUNCTION piese_part_origin_guard();

REVOKE ALL ON FUNCTION piese_part_origin_guard() FROM PUBLIC, anon, authenticated;

-- Indexul pe coloana care REFERĂ: fără el, garda „originea are copii" face un scan complet al catalogului
-- la fiecare bifare, iar verificarea de integritate a cheii străine la fel.
CREATE INDEX IF NOT EXISTS idx_pparts_origin ON piese_parts (origin_part_id) WHERE origin_part_id IS NOT NULL;

-- (2) Sugestia de valoare ignora documentele ANULATE. Toate celelalte calcule de cost mediu din modul le
--     exclud (migr. 318): o recepție greșită, cu prețul de zece ori mai mare, corectată prin „modificare
--     document", lasă documentul vechi CANCELLED — dar mișcările lui rămân, fiindcă jurnalul e append-only.
--     Sugestia le lua în calcul, iar ecranul o completează AUTOMAT în câmpul de valoare: omul o accepta și
--     devenea strat de cost FIFO real. Verificat: 552 → 1545,60 cu o recepție greșită, înapoi la 552 după
--     anulare. `unit_cost > 0` din același motiv ca în migr. 318 — o intrare cu cost zero nu e un preț de
--     piață, ci o piesă intrată în gol.
CREATE OR REPLACE FUNCTION piese_used_value_hint(p_part bigint)
RETURNS numeric LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT round((AVG(m.unit_cost) * g.used_pct / 100.0)::numeric, 2)
    FROM piese_parts u
    JOIN piese_part_groups g ON g.id = u.group_id
    JOIN piese_stock_movements m ON m.part_id = u.origin_part_id
     AND m.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS')
     AND m.unit_cost > 0
     AND NOT EXISTS (SELECT 1 FROM piese_stock_documents dd
                      WHERE dd.id = m.document_id AND dd.status = 'CANCELLED')
   WHERE u.id = p_part AND u.is_used AND u.origin_part_id IS NOT NULL
   GROUP BY g.used_pct;
$$;

REVOKE ALL ON FUNCTION piese_used_value_hint(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_used_value_hint(bigint) TO service_role;
