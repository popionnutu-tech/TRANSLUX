-- 352: Motorul numărătorii prin scanare.
--
-- Fluxul descris de Eduard: „я беру стелаж, ряд, полку, ячейку сканирую все запчасти этой ячейки
-- (одновременно ставится адресс для запчастей и фактическое количество), адрес ячейки не меняется
-- пока я не изменю." Adică: adresa se pune O DATĂ, apoi ține până o schimbi el, iar fiecare scanare
-- adaugă o bucată. Toată logica de mai jos vine din fraza asta.

-- Deschiderea e IDEMPOTENTĂ, și ăsta e tot mecanismul de „am început pe terminal, termin la
-- calculator": ambele aparate cer sesiunea aceluiași om în același depozit și primesc același id.
CREATE OR REPLACE FUNCTION piese_inv_session_open(p_wh bigint, p_admin uuid, p_actor text)
RETURNS bigint LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_id bigint;
BEGIN
  IF p_wh IS NULL THEN RAISE EXCEPTION 'BAD_WAREHOUSE'; END IF;
  SELECT id INTO v_id FROM piese_inventory_sessions
   WHERE warehouse_id = p_wh AND admin_id IS NOT DISTINCT FROM p_admin AND status = 'OPEN';
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO piese_inventory_sessions(warehouse_id, admin_id, actor_label)
    VALUES(p_wh, p_admin, p_actor) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- `p_qty` NULL = „încă una" (+1), scanarea obișnuită. O valoare = cantitate absolută, pentru când omul
-- corectează un rând cu mâna.
--
-- Adresa se REscrie la fiecare scanare, nu se păstrează prima. Dacă aceeași piesă apare în două celule,
-- adevărul e ULTIMA celulă în care a fost găsită: acolo stă marfa acum.
CREATE OR REPLACE FUNCTION piese_inv_scan(
  p_session bigint, p_part bigint, p_location text, p_qty numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE s record; v_loc text;
BEGIN
  SELECT * INTO s FROM piese_inventory_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_SESSION'; END IF;
  IF s.status <> 'OPEN' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;

  PERFORM 1 FROM piese_parts WHERE id = p_part AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;

  v_loc := upper(btrim(regexp_replace(COALESCE(p_location, ''), '\s*-\s*', '-', 'g')));
  IF v_loc = '' THEN RAISE EXCEPTION 'NO_LOCATION'; END IF;

  IF p_qty IS NOT NULL AND (p_qty < 0 OR p_qty <> p_qty) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;

  INSERT INTO piese_inventory_session_lines(session_id, part_id, location_label, counted_qty)
    VALUES(p_session, p_part, v_loc, COALESCE(p_qty, 1))
  ON CONFLICT (session_id, part_id) DO UPDATE
    SET counted_qty = CASE WHEN p_qty IS NULL THEN piese_inventory_session_lines.counted_qty + 1 ELSE p_qty END,
        location_label = v_loc,
        updated_at = now()
  RETURNING jsonb_build_object('part_id', part_id, 'qty', counted_qty, 'location', location_label) INTO s;

  RETURN to_jsonb(s);
END $$;

-- `stoc_program` se întoarce ÎNTOTDEAUNA; ecranul decide când îl arată. Eduard cere explicit ca cifra
-- programului să apară abia după „заполнить по остаткам" — dacă o vede în timp ce numără, numără spre ea.
CREATE OR REPLACE FUNCTION piese_inv_lines(p_session bigint)
RETURNS TABLE(part_id bigint, name text, article text, location_label text,
              counted numeric, stoc_program numeric, unit text)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT l.part_id,
         COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long) AS name,
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

-- Piesele pe care programul le crede în celulele CHIAR SCANATE, dar care n-au fost scanate.
--
-- Restricția la celulele atinse e esențială: dacă ai făcut A-12-3-5, nu înseamnă că ai văzut tot
-- stelajul A. Altfel lista ar acuza de lipsă marfa din rafturi la care omul nici n-a ajuns.
CREATE OR REPLACE FUNCTION piese_inv_missing(p_session bigint)
RETURNS TABLE(part_id bigint, name text, article text, location_label text,
              stoc_program numeric, unit text)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p.id,
         COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long),
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

REVOKE ALL ON FUNCTION piese_inv_session_open(bigint, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION piese_inv_scan(bigint, bigint, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION piese_inv_lines(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION piese_inv_missing(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_inv_session_open(bigint, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION piese_inv_scan(bigint, bigint, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION piese_inv_lines(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION piese_inv_missing(bigint) TO service_role;
