-- 354: Marcajul „б/у" în foaia de numărare prin scanare.
--
-- O piesă uzată e un articol SEPARAT, cu aceeași denumire ca cea nouă (migr. 345-349). În foaia de numărare
-- ar fi apărut două rânduri identice cuvânt cu cuvânt, cu cantități diferite — iar omul, care le are pe
-- amândouă în mână, n-ar fi avut cum să spună care e care. Scanarea nimerește oricum piesa corectă (codul de
-- bare diferă); problema e strict ce CITEȘTE el pe ecran înainte de a apăsa „Închide".
--
-- Marcajul stă la ÎNCEPUT, ca peste tot (`partLabel`, lib/piese.ts): la sfârșit se pierde când se taie
-- textul. Azi nu există încă nicio piesă б/у în catalog, deci nu repară nimic vizibil — dar prima creată
-- ar fi intrat direct în confuzia asta.
CREATE OR REPLACE FUNCTION piese_inv_lines(p_session bigint)
RETURNS TABLE(part_id bigint, name text, article text, location_label text,
              counted numeric, stoc_program numeric, unit text)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT l.part_id,
         CASE WHEN p.is_used THEN 'б/у · ' ELSE '' END
           || COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long) AS name,
         COALESCE(p.article_code, '') AS article,
         l.location_label, l.counted_qty,
         COALESCE((SELECT SUM(m.qty_delta) FROM piese_stock_movements m
                    WHERE m.part_id = l.part_id AND m.warehouse_id = s.warehouse_id), 0)::numeric,
         COALESCE(p.unit, 'buc')
    FROM piese_inventory_session_lines l
    JOIN piese_inventory_sessions s ON s.id = l.session_id
    JOIN piese_parts p ON p.id = l.part_id
   WHERE l.session_id = p_session
   ORDER BY l.location_label, name;
$$;

CREATE OR REPLACE FUNCTION piese_inv_missing(p_session bigint)
RETURNS TABLE(part_id bigint, name text, article text, location_label text,
              stoc_program numeric, unit text)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p.id,
         CASE WHEN p.is_used THEN 'б/у · ' ELSE '' END
           || COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long),
         COALESCE(p.article_code, ''),
         loc.location_label,
         COALESCE((SELECT SUM(m.qty_delta) FROM piese_stock_movements m
                    WHERE m.part_id = p.id AND m.warehouse_id = s.warehouse_id), 0)::numeric,
         COALESCE(p.unit, 'buc')
    FROM piese_inventory_sessions s
    JOIN piese_part_locations loc ON loc.warehouse_id = s.warehouse_id
    JOIN piese_parts p ON p.id = loc.part_id AND p.active
   WHERE s.id = p_session
     AND upper(btrim(loc.location_label)) IN (
           SELECT DISTINCT location_label FROM piese_inventory_session_lines WHERE session_id = p_session)
     AND NOT EXISTS (SELECT 1 FROM piese_inventory_session_lines l
                      WHERE l.session_id = p_session AND l.part_id = p.id)
     AND COALESCE((SELECT SUM(m.qty_delta) FROM piese_stock_movements m
                    WHERE m.part_id = p.id AND m.warehouse_id = s.warehouse_id), 0) <> 0
   ORDER BY loc.location_label, 2;
$$;

REVOKE ALL ON FUNCTION piese_inv_lines(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION piese_inv_missing(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_inv_lines(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION piese_inv_missing(bigint) TO service_role;
