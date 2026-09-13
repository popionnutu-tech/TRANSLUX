-- 346: Intrarea pieselor б/у în stoc — documentul „Donor".
--
-- Tipul de document și mișcarea `DONOR_IN` există în model din migr. 200 și sunt de atunci recunoscute ca
-- strat de cost FIFO, dar n-au avut niciodată o funcție care să le creeze. Aici o capătă.
--
-- Mașina-donor se reține (`vehicle_id`): peste un an, întrebarea „de unde a apărut alternatorul ăsta pe
-- raft" trebuie să aibă răspuns. Nu e o mișcare pe mașina aceea — marfa vine DE PE ea, nu pleacă spre ea.
--
-- Valoarea o scrie omul, linie cu linie. Ecranul propune (`piese_used_value_hint`), dar nu impune: o piesă
-- scoasă de pe un autobuz casat poate fi ca nouă sau bună de aruncat, iar diferența n-o știe programul.
-- Zero e permis explicit — o piesă fără valoare intră cu zero, nu se refuză.
CREATE OR REPLACE FUNCTION piese_donor_intake(
  p_wh bigint, p_vehicle bigint, p_note text, p_lines jsonb, p_user bigint,
  p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_doc bigint; v_line bigint; ln jsonb;
  v_part bigint; v_qty numeric; v_cost numeric; v_n int := 0; v_total numeric := 0;
BEGIN
  IF p_wh IS NULL THEN RAISE EXCEPTION 'BAD_WAREHOUSE'; END IF;
  PERFORM 1 FROM piese_warehouses WHERE id = p_wh;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAD_WAREHOUSE'; END IF;
  IF p_vehicle IS NOT NULL THEN
    PERFORM 1 FROM piese_vehicles WHERE id = p_vehicle;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_VEHICLE'; END IF;
  END IF;

  INSERT INTO piese_stock_documents(doc_type, status, warehouse_id, vehicle_id, note,
                                    created_by, created_by_admin, confirmed_by, confirmed_at)
    VALUES('DONOR', 'CONFIRMED', p_wh, p_vehicle, NULLIF(btrim(COALESCE(p_note, '')), ''),
           p_user, p_admin, p_user, now())
    RETURNING id INTO v_doc;

  -- `ORDER BY part_id`: ordine de blocare sortată, ca la migr. 295. Lock-ul e pe rândul din CATALOG, deci
  -- două documente care ating aceleași piese în ordine diferită s-ar bloca reciproc.
  FOR ln IN SELECT e FROM jsonb_array_elements(p_lines) e ORDER BY (e->>'part_id')::bigint LOOP
    v_part := (ln->>'part_id')::bigint;
    v_qty  := abs((ln->>'qty')::numeric);
    v_cost := COALESCE((ln->>'unit_cost')::numeric, 0);
    IF v_part IS NULL THEN RAISE EXCEPTION 'BAD_PART'; END IF;
    IF NOT piese_qty_ok(v_qty) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
    IF v_cost IS NULL OR v_cost < 0 OR v_cost <> v_cost THEN RAISE EXCEPTION 'BAD_COST'; END IF;

    -- Numai piese marcate uzate. Fără garda asta, documentul „Donor" ar fi devenit o a doua cale de a băga
    -- marfă nouă în stoc, fără furnizor și fără factură — adică exact în afara evidenței pe care o ține
    -- recepția.
    PERFORM 1 FROM piese_parts WHERE id = v_part AND active AND is_used FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_USED_PART'; END IF;

    INSERT INTO piese_stock_document_lines(document_id, part_id, qty, unit_cost)
      VALUES(v_doc, v_part, v_qty, v_cost) RETURNING id INTO v_line;
    INSERT INTO piese_stock_movements(part_id, warehouse_id, movement_type, qty_delta, unit_cost,
                                      document_id, line_id, vehicle_id, created_by)
      VALUES(v_part, p_wh, 'DONOR_IN', v_qty, v_cost, v_doc, v_line, p_vehicle, p_user);
    v_n := v_n + 1; v_total := v_total + v_qty * v_cost;
  END LOOP;

  IF v_n = 0 THEN RAISE EXCEPTION 'NO_LINES'; END IF;

  INSERT INTO piese_audit_log(user_id, admin_id, actor_label, action, entity, entity_id, detail)
    VALUES(p_user, p_admin, p_actor, 'CREATE', 'donor', v_doc,
           'Piese b/u primite: ' || v_n || ' poziții, ' || round(v_total, 2) || ' lei' ||
           CASE WHEN p_vehicle IS NULL THEN '' ELSE ' (de pe mașina #' || p_vehicle || ')' END);

  RETURN jsonb_build_object('doc_id', v_doc, 'lines', v_n, 'total', v_total);
END $$;

REVOKE ALL ON FUNCTION piese_donor_intake(bigint, bigint, text, jsonb, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_donor_intake(bigint, bigint, text, jsonb, bigint, uuid, text) TO service_role;
