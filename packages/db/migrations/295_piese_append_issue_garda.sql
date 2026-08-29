-- 295: Garda lipsă pe `piese_append_issue` + două remedieri de concurență găsite la review.
--
-- 1. IDOR (grav). `submitIssue` primea `doc_id` DE LA CLIENT și îl trimitea la RPC nevalidat. Garda din
--    server action verifica `payload.warehouse_id` — un câmp pe care RPC-ul nici nu-l folosea: el citea
--    depozitul și mașina DIN DOCUMENT. Deci un cont legat de depozitul A putea trimite `doc_id`-ul unui
--    rashod din depozitul B și scădea stocul de acolo, pe mașina lui B. Efect IREVERSIBIL: mișcările sunt
--    append-only, iar straturile FIFO din B se consumau.
--    Reparat pe DOUĂ straturi (ca peste tot în modul): verificare în server action ȘI aici, la stratul care
--    chiar mișcă stocul. `p_wh`/`p_vehicle` devin obligatorii și trebuie să coincidă cu documentul.
--
-- 2. `FOR UPDATE` pe piesă exista în `piese_append_issue`, dar NU și în `piese_create_issue` (migr. 200) —
--    iar comentariul migrației 294 afirma că sunt identice. Un lock luat de o singură parte nu serializează
--    nimic: o creare concurentă putea aloca același strat FIFO ca o adăugare → supra-alocare și cost greșit.
--    Exact bug-ul reparat în migr. 244 pentru recepții. Îl adăugăm și la creare, ca lockul să aibă efect.
--
-- 3. Ordinea de blocare urma ordinea liniilor din payload (control client) → două eliberări simultane cu
--    aceleași piese în ordine inversă se puteau bloca reciproc. Sortăm după `part_id` înainte de buclă.
--
-- 4. `NaN` trecea de gardă: în Postgres `'NaN'::numeric` e considerat mai MARE decât orice număr, deci
--    `NaN <= 0.0000001` e fals. Ar fi consumat toate straturile și ar fi otrăvit permanent `SUM(qty_delta)`
--    pentru piesa aceea — nereparabil, jurnalul fiind append-only.
--    (Verificarea folosește `piese_qty_ok` din migr. 296: prima încercare, `v_qty <> v_qty`, NU funcționa
--     — Postgres tratează NaN::numeric ca egal cu sine, spre deosebire de IEEE.)
--
-- 5. `BAD_PART` era cod mort: `PERFORM ... FOR UPDATE` nu ridică excepție dacă piesa nu există.

DROP FUNCTION IF EXISTS piese_append_issue(bigint, jsonb, bigint);

CREATE OR REPLACE FUNCTION piese_append_issue(
  p_doc bigint, p_wh bigint, p_vehicle bigint, p_lines jsonb, p_user bigint
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE d record; v_line bigint; v_mov bigint; v_odo int; ln jsonb;
  v_part bigint; v_qty numeric; v_need numeric; v_take numeric; v_total numeric; v_unit numeric;
  lyr record; alloc jsonb; a jsonb; shortages jsonb := '[]'::jsonb; v_added int := 0;
BEGIN
  SELECT * INTO d FROM piese_stock_documents WHERE id = p_doc FOR UPDATE;
  IF NOT FOUND OR d.doc_type <> 'ISSUE' THEN RAISE EXCEPTION 'NOT_ISSUE'; END IF;
  IF d.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'NOT_CONFIRMED'; END IF;

  -- Documentul trebuie să fie EXACT cel pentru care apelantul a trecut de gardă. Fără asta, `doc_id`
  -- de la client ar fi o cheie către orice depozit.
  IF d.warehouse_id <> p_wh OR d.vehicle_id IS DISTINCT FROM p_vehicle THEN
    RAISE EXCEPTION 'DOC_MISMATCH';
  END IF;

  IF (d.created_at AT TIME ZONE 'Europe/Chisinau')::date
     <> (now() AT TIME ZONE 'Europe/Chisinau')::date THEN
    RAISE EXCEPTION 'NOT_TODAY';
  END IF;

  SELECT km_current INTO v_odo FROM piese_vehicles WHERE id = d.vehicle_id;

  -- Ordine de blocare STABILĂ (part_id crescător), nu ordinea din payload: altfel două eliberări
  -- simultane cu aceleași piese în ordine inversă se pot bloca reciproc.
  FOR ln IN SELECT e FROM jsonb_array_elements(p_lines) e ORDER BY (e->>'part_id')::bigint LOOP
    v_part := (ln->>'part_id')::bigint;
    v_qty  := abs((ln->>'qty')::numeric);
    IF v_part IS NULL THEN RAISE EXCEPTION 'BAD_PART'; END IF;
    -- `piese_qty_ok` (migr. 296) prinde și NaN — vezi acolo de ce scrierile naive nu-l prind.
    IF NOT piese_qty_ok(v_qty) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
    PERFORM 1 FROM piese_parts WHERE id = v_part FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;

    v_need := v_qty; v_total := 0; alloc := '[]'::jsonb;
    FOR lyr IN
      SELECT r.id, r.unit_cost,
        (r.qty_delta - COALESCE((SELECT SUM(x.qty) FROM piese_fifo_alloc x WHERE x.receipt_movement_id=r.id),0)) AS remaining
      FROM piese_stock_movements r
      WHERE r.part_id=v_part AND r.warehouse_id=d.warehouse_id
        AND r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS')
      ORDER BY r.created_at ASC, r.id ASC
    LOOP
      EXIT WHEN v_need <= 0.0000001;
      IF lyr.remaining <= 0 THEN CONTINUE; END IF;
      v_take := LEAST(lyr.remaining, v_need);
      alloc := alloc || jsonb_build_object('rid',lyr.id,'qty',v_take,'cost',lyr.unit_cost);
      v_total := v_total + v_take*lyr.unit_cost; v_need := v_need - v_take;
    END LOOP;
    IF v_need > 0.0000001 THEN
      shortages := shortages || to_jsonb(format('Stoc insuficient (#%s): lipsesc %s', v_part, v_need));
    END IF;
    v_unit := CASE WHEN v_qty>0 THEN v_total/v_qty ELSE 0 END;

    INSERT INTO piese_stock_document_lines(document_id,part_id,qty,unit_cost)
      VALUES(p_doc,v_part,v_qty,v_unit) RETURNING id INTO v_line;
    INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,vehicle_id,odometer_km,created_by)
      VALUES(v_part,d.warehouse_id,'ISSUE',-v_qty,v_unit,p_doc,v_line,d.vehicle_id,v_odo,p_user) RETURNING id INTO v_mov;
    FOR a IN SELECT * FROM jsonb_array_elements(alloc) LOOP
      INSERT INTO piese_fifo_alloc(issue_movement_id,receipt_movement_id,qty,unit_cost)
        VALUES(v_mov,(a->>'rid')::bigint,(a->>'qty')::numeric,(a->>'cost')::numeric);
    END LOOP;
    v_added := v_added + 1;
  END LOOP;

  IF v_added = 0 THEN RAISE EXCEPTION 'NO_LINES'; END IF;
  RETURN jsonb_build_object('doc_id',p_doc,'added',v_added,'shortages',shortages);
END $$;

REVOKE ALL ON FUNCTION piese_append_issue(bigint, bigint, bigint, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_append_issue(bigint, bigint, bigint, jsonb, bigint) TO service_role;

-- `FOR UPDATE` și la CREARE, ca lockul din adăugare să aibă cu ce se serializa.
-- Restul funcției rămâne neschimbat față de migr. 200.
CREATE OR REPLACE FUNCTION piese_create_issue(p_wh bigint, p_vehicle bigint, p_mechanic bigint, p_reason bigint, p_lines jsonb, p_user bigint)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_doc bigint; v_line bigint; v_mov bigint; v_odo int; ln jsonb;
  v_part bigint; v_qty numeric; v_need numeric; v_take numeric; v_total numeric; v_unit numeric;
  lyr record; alloc jsonb; a jsonb; shortages jsonb := '[]'::jsonb;
BEGIN
  SELECT km_current INTO v_odo FROM piese_vehicles WHERE id = p_vehicle;
  INSERT INTO piese_stock_documents(doc_type,status,warehouse_id,vehicle_id,mechanic_id,breakdown_reason_id,created_by,confirmed_by,confirmed_at)
    VALUES('ISSUE','CONFIRMED',p_wh,p_vehicle,p_mechanic,p_reason,p_user,p_user,now()) RETURNING id INTO v_doc;
  FOR ln IN SELECT e FROM jsonb_array_elements(p_lines) e ORDER BY (e->>'part_id')::bigint LOOP
    v_part := (ln->>'part_id')::bigint; v_qty := abs((ln->>'qty')::numeric);
    IF v_part IS NULL THEN RAISE EXCEPTION 'BAD_PART'; END IF;
    IF NOT piese_qty_ok(v_qty) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
    PERFORM 1 FROM piese_parts WHERE id = v_part FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;
    v_need := v_qty; v_total := 0; alloc := '[]'::jsonb;
    FOR lyr IN
      SELECT r.id, r.unit_cost,
        (r.qty_delta - COALESCE((SELECT SUM(x.qty) FROM piese_fifo_alloc x WHERE x.receipt_movement_id=r.id),0)) AS remaining
      FROM piese_stock_movements r
      WHERE r.part_id=v_part AND r.warehouse_id=p_wh AND r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS')
      ORDER BY r.created_at ASC, r.id ASC
    LOOP
      EXIT WHEN v_need <= 0.0000001;
      IF lyr.remaining <= 0 THEN CONTINUE; END IF;
      v_take := LEAST(lyr.remaining, v_need);
      alloc := alloc || jsonb_build_object('rid',lyr.id,'qty',v_take,'cost',lyr.unit_cost);
      v_total := v_total + v_take*lyr.unit_cost; v_need := v_need - v_take;
    END LOOP;
    IF v_need > 0.0000001 THEN shortages := shortages || to_jsonb(format('Stoc insuficient (#%s): lipsesc %s', v_part, v_need)); END IF;
    v_unit := CASE WHEN v_qty>0 THEN v_total/v_qty ELSE 0 END;
    INSERT INTO piese_stock_document_lines(document_id,part_id,qty,unit_cost) VALUES(v_doc,v_part,v_qty,v_unit) RETURNING id INTO v_line;
    INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,vehicle_id,odometer_km,created_by)
      VALUES(v_part,p_wh,'ISSUE',-v_qty,v_unit,v_doc,v_line,p_vehicle,v_odo,p_user) RETURNING id INTO v_mov;
    FOR a IN SELECT * FROM jsonb_array_elements(alloc) LOOP
      INSERT INTO piese_fifo_alloc(issue_movement_id,receipt_movement_id,qty,unit_cost)
        VALUES(v_mov,(a->>'rid')::bigint,(a->>'qty')::numeric,(a->>'cost')::numeric);
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('doc_id',v_doc,'shortages',shortages);
END $$;

REVOKE ALL ON FUNCTION piese_create_issue(bigint, bigint, bigint, bigint, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_create_issue(bigint, bigint, bigint, bigint, jsonb, bigint) TO service_role;

-- (Indexul pentru alerta „schimbat prea des" e în migr. 298 — forma creată aici era greșită.)
