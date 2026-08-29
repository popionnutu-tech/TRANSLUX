-- 294: Rashod pe mașină — un document deschis pe zi, la care se adaugă piese pe parcurs.
--
-- Cerut de Eduard, ca în programul precedent: „расход по автомобилям, чтобы можно было до конца дня
-- добавлять запчасти на одну и ту же машину".
--
-- Situația de până acum: `submitIssue` trimitea o SINGURĂ piesă, deci fiecare piesă eliberată devenea un
-- document separat. O reparație cu opt piese producea opt documente — imposibil de citit și de verificat.
-- (RPC-ul `piese_create_issue` accepta deja `p_lines jsonb`; doar aplicația îi dădea un singur element.)
--
-- Ce adaugă migrația: `piese_append_issue`, care pune linii NOI pe un document de rashod EXISTENT.
-- Stocul se mișcă la fiecare adăugare, nu la sfârșitul zilei: depozitul trebuie să spună adevărul în
-- fiecare moment, altfel altcineva ar vinde o piesă care fizic a plecat deja la mecanic.
--
-- Logica FIFO e IDENTICĂ cu cea din `piese_create_issue` (migr. 200) — aceleași tipuri de strat sursă,
-- aceeași ordine, același `FOR UPDATE` pe piesă pentru serializare. Nu e o variantă „mai simplă":
-- orice abatere ar face ca o piesă adăugată la document să fie evaluată altfel decât una din prima tură.

CREATE OR REPLACE FUNCTION piese_append_issue(p_doc bigint, p_lines jsonb, p_user bigint)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE d record; v_line bigint; v_mov bigint; v_odo int; ln jsonb;
  v_part bigint; v_qty numeric; v_need numeric; v_take numeric; v_total numeric; v_unit numeric;
  lyr record; alloc jsonb; a jsonb; shortages jsonb := '[]'::jsonb; v_added int := 0;
BEGIN
  SELECT * INTO d FROM piese_stock_documents WHERE id = p_doc FOR UPDATE;
  IF NOT FOUND OR d.doc_type <> 'ISSUE' THEN RAISE EXCEPTION 'NOT_ISSUE'; END IF;
  IF d.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'NOT_CONFIRMED'; END IF;

  -- Doar documentul ZILEI CURENTE primește linii noi. Fără asta, o eroare de selecție ar putea adăuga
  -- marfă pe reparația de săptămâna trecută, iar costul pe mașină ar migra în altă lună.
  -- Ziua se socotește în ora Chișinău, ca peste tot în aplicație.
  IF (d.created_at AT TIME ZONE 'Europe/Chisinau')::date
     <> (now() AT TIME ZONE 'Europe/Chisinau')::date THEN
    RAISE EXCEPTION 'NOT_TODAY';
  END IF;

  SELECT km_current INTO v_odo FROM piese_vehicles WHERE id = d.vehicle_id;

  FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_part := (ln->>'part_id')::bigint;
    v_qty  := abs((ln->>'qty')::numeric);
    IF v_part IS NULL THEN RAISE EXCEPTION 'BAD_PART'; END IF;
    IF v_qty IS NULL OR v_qty <= 0.0000001 THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
    PERFORM 1 FROM piese_parts WHERE id = v_part FOR UPDATE; -- serializare pe piesă, ca în restul motorului

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

  INSERT INTO piese_audit_log(user_id,action,entity,entity_id,detail)
    VALUES(p_user,'APPEND','issue',p_doc,'Adăugat '||v_added||' poziții la rashod');
  RETURN jsonb_build_object('doc_id',p_doc,'added',v_added,'shortages',shortages);
END $$;

-- Apărare în adâncime, ca la restul RPC-urilor modulului (migr. 289).
REVOKE ALL ON FUNCTION piese_append_issue(bigint, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_append_issue(bigint, jsonb, bigint) TO service_role;

-- Căutarea „documentul de azi al mașinii X în depozitul Y" — altfel seq scan la fiecare deschidere de ecran.
CREATE INDEX IF NOT EXISTS idx_pdoc_issue_vehicle_day
  ON piese_stock_documents (vehicle_id, warehouse_id, created_at DESC)
  WHERE doc_type = 'ISSUE' AND status = 'CONFIRMED';
