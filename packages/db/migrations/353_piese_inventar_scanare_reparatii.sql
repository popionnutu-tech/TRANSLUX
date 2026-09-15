-- 353: Reparație la 352 + închiderea numărătorii.
--
-- Două greșeli în `piese_inv_scan`, prinse înainte de prima folosire:
--
--  1. `RETURNING ... INTO s` scria peste variabila care ținea SESIUNEA, iar `to_jsonb(s)` împacheta
--     rezultatul încă o dată: ar fi ieșit {"jsonb_build_object": {...}} în loc de obiectul însuși.
--  2. `p_qty <> p_qty` ca test de NaN e COD MORT în Postgres — acolo `NaN = NaN` e adevărat. Și `p_qty < 0`
--     nu prinde NaN, fiindcă NaN se sortează peste orice număr. Aceeași capcană ca la migr. 296 și 349;
--     a treia oară. Testul corect e comparația directă cu 'NaN'::numeric.
--
-- Nu folosesc `piese_qty_ok`: acela cere strict pozitiv, iar aici zero e legitim — omul corectează cu mâna
-- un rând pe care l-a scanat din greșeală.
CREATE OR REPLACE FUNCTION piese_inv_scan(
  p_session bigint, p_part bigint, p_location text, p_qty numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE s record; v_loc text; v_out jsonb;
BEGIN
  SELECT * INTO s FROM piese_inventory_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_SESSION'; END IF;
  IF s.status <> 'OPEN' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;

  PERFORM 1 FROM piese_parts WHERE id = p_part AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;

  v_loc := upper(btrim(regexp_replace(COALESCE(p_location, ''), '\s*-\s*', '-', 'g')));
  IF v_loc = '' THEN RAISE EXCEPTION 'NO_LOCATION'; END IF;

  IF p_qty IS NOT NULL AND (p_qty = 'NaN'::numeric OR p_qty < 0) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;

  INSERT INTO piese_inventory_session_lines(session_id, part_id, location_label, counted_qty)
    VALUES(p_session, p_part, v_loc, COALESCE(p_qty, 1))
  ON CONFLICT (session_id, part_id) DO UPDATE
    SET counted_qty = CASE WHEN p_qty IS NULL THEN piese_inventory_session_lines.counted_qty + 1 ELSE p_qty END,
        location_label = v_loc,
        updated_at = now()
  RETURNING jsonb_build_object('part_id', part_id, 'qty', counted_qty, 'location', location_label)
  INTO v_out;

  RETURN v_out;
END $$;

-- ── Ștergerea unui rând scanat greșit ───────────────────────────────────────
-- Lipsea: o piesă scanată din altă celulă nu putea fi scoasă din numărătoare decât trecând-o la 0, ceea ce
-- NU e același lucru — zero înseamnă „am căutat și nu e", iar aici înseamnă „n-am numărat-o aici".
CREATE OR REPLACE FUNCTION piese_inv_unscan(p_session bigint, p_part bigint)
RETURNS void LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM piese_inventory_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_SESSION'; END IF;
  IF v_status <> 'OPEN' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;
  DELETE FROM piese_inventory_session_lines WHERE session_id = p_session AND part_id = p_part;
END $$;

-- ── Închiderea: adresele + numărătoarea, într-o singură tranzacție ──────────
--
-- Pe ecranul vechi de inventariere, adresele și cantitățile se scriu prin două apeluri separate din
-- aplicație: dacă al doilea cade, primul rămâne scris. Aici sunt într-o funcție, deci ori amândouă, ori
-- niciuna. Ordinea (întâi adresele) contează doar dacă cineva le desparte vreodată la loc.
--
-- `p_extra` = piesele pe care omul le-a bifat din lista „aici ar trebui să fie, dar nu le-ai scanat". Trec
-- la zero. Cele nebifate rămân NEATINSE — Eduard a întrebat „считать за ноль или нет", iar răspunsul e: nu
-- automat. Un raft nedeschis nu e un raft gol.
--
-- Filtrul prin `piese_inv_missing` e o gardă, nu o comoditate: se poate trece la zero DOAR ce a listat
-- programul însuși ca lipsă. Altfel o listă de id-uri venită din browser ar putea zeroi orice piesă din
-- depozit, inclusiv una pe care numărătoarea n-a atins-o.
CREATE OR REPLACE FUNCTION piese_inv_commit(
  p_session bigint, p_extra bigint[] DEFAULT '{}', p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE s record; v_counts jsonb; v_zero jsonb; v_adrese int; v_res jsonb;
BEGIN
  SELECT * INTO s FROM piese_inventory_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_SESSION'; END IF;
  IF s.status <> 'OPEN' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;

  -- (1) adresele celulelor scanate
  INSERT INTO piese_part_locations(part_id, warehouse_id, location_label)
  SELECT l.part_id, s.warehouse_id, l.location_label
    FROM piese_inventory_session_lines l WHERE l.session_id = p_session
  ON CONFLICT (part_id, warehouse_id) DO UPDATE SET location_label = EXCLUDED.location_label;
  GET DIAGNOSTICS v_adrese = ROW_COUNT;

  -- (2) cantitățile numărate
  SELECT COALESCE(jsonb_agg(jsonb_build_object('part_id', part_id, 'counted_qty', counted_qty)), '[]'::jsonb)
    INTO v_counts FROM piese_inventory_session_lines WHERE session_id = p_session;

  -- (3) zerourile bifate explicit
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('part_id', m.part_id, 'counted_qty', 0)), '[]'::jsonb)
    INTO v_zero FROM piese_inv_missing(p_session) m
   WHERE m.part_id = ANY(COALESCE(p_extra, '{}'::bigint[]));

  v_counts := v_counts || v_zero;
  IF jsonb_array_length(v_counts) = 0 THEN RAISE EXCEPTION 'NO_LINES'; END IF;

  v_res := piese_inventory_count(s.warehouse_id, v_counts, NULL, p_admin, p_actor);

  UPDATE piese_inventory_sessions
     SET status = 'COMMITTED', committed_at = now(), document_id = (v_res->>'doc_id')::bigint
   WHERE id = p_session;

  RETURN jsonb_build_object('doc_id', (v_res->>'doc_id')::bigint, 'diffs', (v_res->>'diffs')::int,
                            'adrese', v_adrese, 'pozitii', jsonb_array_length(v_counts),
                            'zerouri', jsonb_array_length(v_zero));
END $$;

-- Renunțarea la o numărătoare — fără ea, o sesiune deschisă din greșeală ar bloca la nesfârșit deschiderea
-- alteia în același depozit (indicele unic parțial).
CREATE OR REPLACE FUNCTION piese_inv_cancel(p_session bigint)
RETURNS void LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  UPDATE piese_inventory_sessions SET status = 'CANCELLED' WHERE id = p_session AND status = 'OPEN';
$$;

REVOKE ALL ON FUNCTION piese_inv_scan(bigint, bigint, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION piese_inv_unscan(bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION piese_inv_commit(bigint, bigint[], uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION piese_inv_cancel(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_inv_scan(bigint, bigint, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION piese_inv_unscan(bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION piese_inv_commit(bigint, bigint[], uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION piese_inv_cancel(bigint) TO service_role;

-- Migr. 351 a revocat drepturile pe TABELE, dar nu și pe secvențele lor: `ALTER DEFAULT PRIVILEGES` le-a dat
-- lui anon/authenticated `rwU`. Fără acces la tabel nu se poate citi nimic prin ele, dar se pot arde id-uri
-- sau muta contorul cu `setval`. Aceeași scurgere de drepturi implicite ca la migr. 289/342 — de închis la
-- rădăcină, cu Ion.
REVOKE ALL ON SEQUENCE piese_inventory_sessions_id_seq, piese_inventory_session_lines_id_seq
  FROM PUBLIC, anon, authenticated;
