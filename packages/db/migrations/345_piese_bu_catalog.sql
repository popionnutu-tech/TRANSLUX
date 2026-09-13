-- 345: Piese б/у — identitate proprie în catalog.
--
-- Cerut de Eduard: piesele scoase de pe o mașină casată să poată fi puse pe raft și vândute la nevoie.
--
-- MODELUL. Piesa uzată e o INTRARE PROPRIE în catalog, nu un fel de a marca stratul de cost. În sistemul
-- ăsta piesa e unitatea de preț, de adaos, de cod de bare și de stoc — un disc de frână uzat are alt preț
-- decât unul nou, deci chiar E alt articol de vânzare. Varianta cu straturi marcate ar fi făcut condiționale
-- toate ecranele de stoc, toate prețurile și fiecare interogare FIFO, pentru un caz rar.
--
-- `origin_part_id` leagă uzata de piesa nouă corespunzătoare: de acolo vine sugestia de valoare.
ALTER TABLE piese_parts
  ADD COLUMN IF NOT EXISTS is_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origin_part_id bigint REFERENCES piese_parts(id);

-- O piesă uzată nu poate fi originea altei piese uzate: lanțul n-ar avea sens, iar sugestia de preț s-ar
-- calcula din altă sugestie. Se verifică la scriere, nu doar în aplicație.
CREATE OR REPLACE FUNCTION piese_part_origin_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.origin_part_id IS NOT NULL THEN
    IF NEW.origin_part_id = NEW.id THEN RAISE EXCEPTION 'ORIGIN_SELF'; END IF;
    IF NOT NEW.is_used THEN RAISE EXCEPTION 'ORIGIN_ONLY_USED'; END IF;
    PERFORM 1 FROM piese_parts o WHERE o.id = NEW.origin_part_id AND NOT o.is_used;
    IF NOT FOUND THEN RAISE EXCEPTION 'ORIGIN_MUST_BE_NEW'; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_piese_part_origin ON piese_parts;
CREATE TRIGGER trg_piese_part_origin BEFORE INSERT OR UPDATE ON piese_parts
  FOR EACH ROW EXECUTE FUNCTION piese_part_origin_guard();

REVOKE ALL ON FUNCTION piese_part_origin_guard() FROM PUBLIC, anon, authenticated;

-- Procentul sugerat pentru o piesă uzată, pe grupă — ca adaosul. Nu e o regulă automată: omul scrie suma,
-- programul doar propune. Decizia Marianei, 12.09: „suma o scrie omul, cu sugestie din procentul grupei".
ALTER TABLE piese_part_groups
  ADD COLUMN IF NOT EXISTS used_pct real NOT NULL DEFAULT 40
  CONSTRAINT piese_group_used_pct_range CHECK (used_pct >= 0 AND used_pct <= 100);

-- Catalogul expune starea, ca ecranele să poată marca piesa vizibil. Fără asta, un depozitar ar putea
-- elibera un alternator uzat crezând că e nou — iar diferența se vede abia pe autobuz.
CREATE OR REPLACE VIEW piese_catalog_rows AS
  SELECT p.id, p.group_id, p.name_long, p.manufacturer, p.model, p.article_code, p.oem_code,
    p.barcode, p.unit, p.is_for_sale, p.active, p.created_at,
    g.name_ro AS group_name, p.name_ro, p.barcodes_all, p.markup_pct,
    p.is_used, p.origin_part_id
  FROM piese_parts p
  JOIN piese_part_groups g ON g.id = p.group_id
  WHERE p.active;

-- Valoarea propusă pentru o piesă uzată: costul mediu al piesei-origine × procentul grupei ei.
-- `NULL` dacă nu se poate calcula (fără origine sau fără recepții) — atunci omul scrie de la zero, iar
-- ecranul o spune. O sugestie inventată ar fi mai rea decât lipsa ei.
CREATE OR REPLACE FUNCTION piese_used_value_hint(p_part bigint)
RETURNS numeric LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT round((AVG(m.unit_cost) * g.used_pct / 100.0)::numeric, 2)
    FROM piese_parts u
    JOIN piese_part_groups g ON g.id = u.group_id
    JOIN piese_stock_movements m ON m.part_id = u.origin_part_id
     AND m.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS')
   WHERE u.id = p_part AND u.is_used AND u.origin_part_id IS NOT NULL
   GROUP BY g.used_pct;
$$;

REVOKE ALL ON FUNCTION piese_used_value_hint(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_used_value_hint(bigint) TO service_role;
