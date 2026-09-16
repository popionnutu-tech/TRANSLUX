-- 357: Numărătoarea nu mai poate anula, tăcut, mișcările făcute după ea.
--
-- Cea mai valoroasă constatare a review-ului de arhitectură. `piese_inventory_count` scrie cantitatea ca
-- ADEVĂR ABSOLUT pe depozit — semantica ecranului vechi, unde între deschiderea foii și salvare treceau
-- minute. Aici, prin însuși scopul funcționalității („începi pe terminal, termini la calculator", migr.
-- 351), pot trece ore sau zile.
--
-- Scenariul: dimineața numeri 10 filtre în A-12-3-5. După-amiaza se eliberează 3 pe un autobuz. Seara
-- închizi → stocul se pune înapoi la 10, iar cele 3 filtre reapar în program deși fizic sunt pe mașină.
--
-- Garda nu interzice: oprește și arată ce s-a mișcat. Omul decide dacă numărătoarea lui e încă adevărată
-- (`p_force`). Nu putem decide noi — uneori chiar el a făcut mișcarea, știind ce face.
--
-- ATENȚIE la înlocuire: `piese_inv_commit` avea 4 parametri. Un `CREATE OR REPLACE` cu unul nou în plus
-- creează o SUPRAÎNCĂRCARE, iar cea veche — fără gardă — ar rămâne apelabilă. Se șterge explicit.
-- (Aceeași capcană ca la `piese_transfer_send`, migr. 355.)

-- `piese_inv_missing`: un singur SUM prin LATERAL în loc de două subinterogări corelate identice (una în
-- SELECT, una în WHERE — Postgres nu le deduplică), plus normalizarea cratimelor ca la `piese_inv_scan`.
-- Azi nu există nicio adresă nenormalizată (0 din 62, verificat), dar cele două funcții trebuie să
-- compare la fel, altfel o etichetă veche „A-12 - 3" n-ar fi găsită și piesa ar rămâne necontrolată.
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
         st.q,
         COALESCE(p.unit, 'buc')
    FROM piese_inventory_sessions s
    JOIN piese_part_locations loc ON loc.warehouse_id = s.warehouse_id
    JOIN piese_parts p ON p.id = loc.part_id AND p.active
    CROSS JOIN LATERAL (SELECT COALESCE(SUM(m.qty_delta), 0)::numeric AS q
                          FROM piese_stock_movements m
                         WHERE m.part_id = p.id AND m.warehouse_id = s.warehouse_id) st
   WHERE s.id = p_session
     AND upper(btrim(regexp_replace(loc.location_label, '\s*-\s*', '-', 'g'))) IN (
           SELECT DISTINCT location_label FROM piese_inventory_session_lines WHERE session_id = p_session)
     AND NOT EXISTS (SELECT 1 FROM piese_inventory_session_lines l
                      WHERE l.session_id = p_session AND l.part_id = p.id)
     AND st.q <> 0
   ORDER BY loc.location_label, 2;
$$;

CREATE OR REPLACE FUNCTION piese_inv_commit(
  p_session bigint, p_extra bigint[] DEFAULT '{}', p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL,
  p_force boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE s record; v_counts jsonb; v_zero jsonb; v_moved jsonb; v_adrese int; v_res jsonb;
BEGIN
  SELECT * INTO s FROM piese_inventory_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_SESSION'; END IF;
  IF s.status <> 'OPEN' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'part_id', l.part_id,
           'name', COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long)) ORDER BY l.part_id), '[]'::jsonb)
    INTO v_moved
    FROM piese_inventory_session_lines l
    JOIN piese_parts p ON p.id = l.part_id
   WHERE l.session_id = p_session
     AND EXISTS (SELECT 1 FROM piese_stock_movements m
                  WHERE m.part_id = l.part_id AND m.warehouse_id = s.warehouse_id
                    AND m.created_at > l.updated_at);
  IF jsonb_array_length(v_moved) > 0 AND NOT COALESCE(p_force, false) THEN
    RAISE EXCEPTION 'MOVED' USING DETAIL = v_moved::text;
  END IF;

  -- Adresele: NUMAI pentru rândurile cu cantitate > 0. Un rând corectat la zero înseamnă „am căutat aici
  -- și nu e" — a-i fixa totuși adresa ar agăța piesa pe hartă exact de celula în care s-a constatat că
  -- lipsește.
  INSERT INTO piese_part_locations(part_id, warehouse_id, location_label)
  SELECT l.part_id, s.warehouse_id, l.location_label
    FROM piese_inventory_session_lines l
   WHERE l.session_id = p_session AND l.counted_qty > 0
  ON CONFLICT (part_id, warehouse_id) DO UPDATE SET location_label = EXCLUDED.location_label;
  GET DIAGNOSTICS v_adrese = ROW_COUNT;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('part_id', part_id, 'counted_qty', counted_qty)), '[]'::jsonb)
    INTO v_counts FROM piese_inventory_session_lines WHERE session_id = p_session;

  -- Scurtcircuit pe cazul obișnuit (nimic bifat): altfel s-ar materializa toată lista de lipsuri ca să fie
  -- apoi filtrată cu o mulțime goală.
  IF p_extra IS NULL OR cardinality(p_extra) = 0 THEN
    v_zero := '[]'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('part_id', m.part_id, 'counted_qty', 0)), '[]'::jsonb)
      INTO v_zero FROM piese_inv_missing(p_session) m WHERE m.part_id = ANY(p_extra);
  END IF;

  v_counts := v_counts || v_zero;
  IF jsonb_array_length(v_counts) = 0 THEN RAISE EXCEPTION 'NO_LINES'; END IF;

  v_res := piese_inventory_count(s.warehouse_id, v_counts, NULL, p_admin, p_actor);

  UPDATE piese_inventory_sessions
     SET status = 'COMMITTED', committed_at = now(), document_id = (v_res->>'doc_id')::bigint
   WHERE id = p_session;

  RETURN jsonb_build_object('doc_id', (v_res->>'doc_id')::bigint, 'diffs', (v_res->>'diffs')::int,
                            'adrese', v_adrese, 'pozitii', jsonb_array_length(v_counts),
                            'zerouri', jsonb_array_length(v_zero),
                            'miscate', jsonb_array_length(v_moved));
END $$;

DROP FUNCTION IF EXISTS piese_inv_commit(bigint, bigint[], uuid, text);

-- Prefix al lui `uq_piese_inv_line (session_id, part_id)` — nu aduce nimic la citire, dar se întreține la
-- fiecare scanare, adică exact pe calea cea mai fierbinte.
DROP INDEX IF EXISTS idx_piese_inv_lines_session;

REVOKE ALL ON FUNCTION piese_inv_commit(bigint, bigint[], uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION piese_inv_missing(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_inv_commit(bigint, bigint[], uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION piese_inv_missing(bigint) TO service_role;
