-- 355: Garda „nu e pe stoc" și la MUTĂRI, nu doar la eliberări.
--
-- Promis lui Eduard pe 14.09 („проверку «нет на остатке» надо поставить и на перемещение"). Până acum
-- `piese_transfer_send` calcula FIFO, iar dacă straturile nu ajungeau scria oricum ieșirea pe TOATĂ
-- cantitatea, cu un cost mediu diluat peste bucățile inexistente. Nimeni nu era întrebat nimic.
--
-- Așa a apărut, în producție, `Магазин −1` la piesa 21068: Eduard a retrimis din magazin o piesă care se
-- întorsese doar la Briceni. La eliberare ar fi fost oprit; la mutare, nu.
--
-- Măsurăm lipsa ca la eliberări (migr. 330-332), pe MAXIMUL dintre cele două citiri:
--   * cât n-a găsit FIFO în straturi, și
--   * cât depășește registrul (suma mișcărilor).
-- Cele două diverg definitiv după prima ieșire în minus — o ieșire scurtă nu creează rânduri de alocare,
-- deci FIFO „uită" datoria, în timp ce registrul o ține. Dacă am măsura doar FIFO, garda ar prinde prima
-- abatere și apoi ar tăcea pentru totdeauna.
--
-- ATENȚIE la înlocuire: funcția veche are 8 parametri. Un `CREATE OR REPLACE` cu un parametru nou în plus
-- NU o înlocuiește — creează o supraîncărcare, iar cea veche, fără gardă, ar rămâne apelabilă. De aceea
-- se creează cea nouă și se ȘTERGE explicit semnătura veche.
CREATE OR REPLACE FUNCTION piese_transfer_send(
  p_from bigint, p_to bigint, p_lines jsonb, p_user bigint,
  p_vehicle bigint DEFAULT NULL, p_mechanic bigint DEFAULT NULL,
  p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL,
  p_allow_short boolean DEFAULT false
) RETURNS bigint LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_doc bigint; v_line bigint; v_mov bigint; ln jsonb; v_part bigint; v_qty numeric;
        v_need numeric; v_take numeric; v_total numeric; v_unit numeric; lyr record; alloc jsonb; a jsonb;
        v_to_kind text; v_ledger numeric; v_short numeric; shortages jsonb := '[]'::jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN RAISE EXCEPTION 'BAD_WAREHOUSE'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'SAME_WAREHOUSE'; END IF;
  IF p_vehicle IS NOT NULL THEN
    PERFORM 1 FROM piese_vehicles WHERE id = p_vehicle;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_VEHICLE'; END IF;
    SELECT kind INTO v_to_kind FROM piese_warehouses WHERE id = p_to;
    IF v_to_kind IS DISTINCT FROM 'INTERNAL' THEN RAISE EXCEPTION 'DEST_NOT_INTERNAL'; END IF;
  END IF;
  IF p_mechanic IS NOT NULL THEN
    PERFORM 1 FROM piese_mechanics WHERE id = p_mechanic;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_MECHANIC'; END IF;
  END IF;
  IF p_vehicle IS NULL AND p_mechanic IS NOT NULL THEN RAISE EXCEPTION 'MECHANIC_WITHOUT_VEHICLE'; END IF;

  INSERT INTO piese_stock_documents(doc_type, status, warehouse_id, to_warehouse_id, vehicle_id, mechanic_id, created_by)
    VALUES('TRANSFER', 'IN_TRANSIT', p_from, p_to, p_vehicle, p_mechanic, p_user) RETURNING id INTO v_doc;

  FOR ln IN SELECT e FROM jsonb_array_elements(p_lines) e ORDER BY (e->>'part_id')::bigint LOOP
    v_part := (ln->>'part_id')::bigint;
    v_qty := abs((ln->>'qty')::numeric);
    IF NOT piese_qty_ok(v_qty) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
    PERFORM 1 FROM piese_parts WHERE id = v_part FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;

    -- Registrul citit DIRECT din mișcări, nu din `piese_current_stock`: vederea aceea filtrează piesele
    -- inactive, iar o piesă scoasă din catalog poate avea în continuare marfă pe raft (lecția migr. 332).
    SELECT COALESCE(SUM(m.qty_delta), 0)::numeric INTO v_ledger
      FROM piese_stock_movements m WHERE m.part_id = v_part AND m.warehouse_id = p_from;

    v_need := v_qty; v_total := 0; alloc := '[]'::jsonb;
    FOR lyr IN
      SELECT r.id, r.unit_cost,
             (r.qty_delta - COALESCE((SELECT SUM(x.qty) FROM piese_fifo_alloc x WHERE x.receipt_movement_id = r.id), 0)) AS remaining
        FROM piese_stock_movements r
       WHERE r.part_id = v_part AND r.warehouse_id = p_from
         AND r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS')
       ORDER BY r.created_at, r.id
    LOOP
      EXIT WHEN v_need <= 0.0000001;
      IF lyr.remaining <= 0 THEN CONTINUE; END IF;
      v_take := LEAST(lyr.remaining, v_need);
      alloc := alloc || jsonb_build_object('rid', lyr.id, 'qty', v_take, 'cost', lyr.unit_cost);
      v_total := v_total + v_take * lyr.unit_cost;
      v_need := v_need - v_take;
    END LOOP;

    v_short := GREATEST(v_need, v_qty - GREATEST(COALESCE(v_ledger, 0), 0));
    IF v_short > 0.0000001 THEN
      shortages := shortages || to_jsonb(format('Stoc insuficient (#%s): lipsesc %s', v_part, v_short));
    END IF;

    v_unit := CASE WHEN v_qty > 0 THEN v_total / v_qty ELSE 0 END;
    INSERT INTO piese_stock_document_lines(document_id, part_id, qty, unit_cost)
      VALUES(v_doc, v_part, v_qty, v_unit) RETURNING id INTO v_line;
    INSERT INTO piese_stock_movements(part_id, warehouse_id, movement_type, qty_delta, unit_cost, document_id, line_id, created_by)
      VALUES(v_part, p_from, 'TRANSFER_OUT', -v_qty, v_unit, v_doc, v_line, p_user) RETURNING id INTO v_mov;
    FOR a IN SELECT * FROM jsonb_array_elements(alloc) LOOP
      INSERT INTO piese_fifo_alloc(issue_movement_id, receipt_movement_id, qty, unit_cost)
        VALUES(v_mov, (a->>'rid')::bigint, (a->>'qty')::numeric, (a->>'cost')::numeric);
    END LOOP;
  END LOOP;

  -- Verificarea e la SFÂRȘIT, ca la eliberări: omul vede TOATE piesele care lipsesc dintr-o dată, nu una
  -- pe document. Excepția anulează tranzacția, deci documentul scris mai sus dispare cu ea.
  IF jsonb_array_length(shortages) > 0 AND NOT COALESCE(p_allow_short, false) THEN
    RAISE EXCEPTION 'SHORTAGE' USING DETAIL = shortages::text;
  END IF;

  INSERT INTO piese_audit_log(user_id, admin_id, actor_label, action, entity, entity_id, detail)
    VALUES(p_user, p_admin, p_actor, 'CREATE', 'transfer', v_doc,
           CASE WHEN p_vehicle IS NULL THEN 'Mutare trimisă'
                ELSE 'Mutare trimisă pentru mașina #' || p_vehicle END
           || CASE WHEN jsonb_array_length(shortages) > 0
                   THEN ' — PESTE STOC: ' || shortages::text ELSE '' END);
  RETURN v_doc;
END $$;

-- Semnătura veche, fără gardă, ar fi rămas apelabilă în paralel. O ștergem.
DROP FUNCTION IF EXISTS piese_transfer_send(bigint, bigint, jsonb, bigint, bigint, bigint, uuid, text);

REVOKE ALL ON FUNCTION piese_transfer_send(bigint, bigint, jsonb, bigint, bigint, bigint, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_transfer_send(bigint, bigint, jsonb, bigint, bigint, bigint, uuid, text, boolean)
  TO service_role;
