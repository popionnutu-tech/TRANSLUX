-- 330: Eliberarea peste stoc se confirmă explicit, nu mai trece tăcut.
--
-- Decizia lui Eduard, 08.09: „Списание со склада: давай по твоему попробуем" — varianta din mijloc,
-- confirmarea, dintre interzicere / confirmare / avertisment mai tare.
--
-- Contextul e incidentul 417/418. Marfa plecase din magazin spre Briceni printr-o mutare neconfirmată, iar
-- de la Briceni s-a eliberat manual o piesă care încă nu ajunsese. Motorul a scris-o: stoc −1, cost 0, fără
-- niciun strat FIFO în spate. `shortages` exista și atunci — se întorcea DUPĂ scriere, ca un rând galben
-- lângă un document deja înregistrat. Un avertisment care vine după fapt nu e o gardă, e o notă de subsol.
--
-- De ce nu interzicere completă: se întâmplă real ca piesa să fie fizic pe raft iar recepția să nu fie încă
-- introdusă. Interzicerea ar opri munca pentru o problemă de hârtii. Confirmarea păstrează ambele adevăruri:
-- omul poate continua, dar nu mai poate spune că n-a știut.

-- ── Cât lipsește, ÎNAINTE de scriere ─────────────────────────────────────────
-- Alimentează textul întrebării („lipsesc 35 din 200"). Citire pură — garda adevărată e în RPC-urile de mai
-- jos, sub lock.
--
-- Se GRUPEAZĂ pe piesă înainte de comparație. Același rashod poate avea aceeași piesă pe două rânduri, iar
-- verificarea rând-cu-rând ar fi comparat fiecare cerere cu stocul ÎNTREG — două rânduri de câte 100 ar fi
-- trecut amândouă cu 165 în stoc. Motorul consumă straturile secvențial; aici trebuie aceeași aritmetică.
--
-- `GREATEST(..., 0)` pe fiecare strat: un strat cu alocări peste cantitatea lui (date vechi stricate) ar
-- scădea din disponibilul celorlalte și ar inventa o lipsă acolo unde marfa există.
CREATE OR REPLACE FUNCTION piese_issue_shortages(p_wh bigint, p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE rec record; v_avail numeric; v_name text; v_out jsonb := '[]'::jsonb;
BEGIN
  IF p_wh IS NULL THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;
  FOR rec IN
    SELECT (e->>'part_id')::bigint AS part_id, SUM(abs(COALESCE((e->>'qty')::numeric, 0))) AS qty
      FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) e
     WHERE (e->>'part_id') IS NOT NULL
     GROUP BY 1
  LOOP
    CONTINUE WHEN rec.part_id IS NULL OR rec.qty <= 0.0000001;
    SELECT COALESCE(SUM(GREATEST(
             r.qty_delta - COALESCE((SELECT SUM(x.qty) FROM piese_fifo_alloc x
                                      WHERE x.receipt_movement_id = r.id), 0), 0)), 0)
      INTO v_avail
      FROM piese_stock_movements r
     WHERE r.part_id = rec.part_id AND r.warehouse_id = p_wh
       AND r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS');
    IF rec.qty > v_avail + 0.0000001 THEN
      SELECT COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long) INTO v_name
        FROM piese_parts p WHERE p.id = rec.part_id;
      v_out := v_out || jsonb_build_object(
        'part_id', rec.part_id, 'name', COALESCE(v_name, '#' || rec.part_id),
        'cerut', rec.qty, 'disponibil', v_avail, 'lipsa', rec.qty - v_avail);
    END IF;
  END LOOP;
  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION piese_issue_shortages(bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_issue_shortages(bigint, jsonb) TO service_role;

-- ── Garda propriu-zisă, sub lock ─────────────────────────────────────────────
-- `p_allow_short` implicit `false`: cine nu cere explicit trecerea peste stoc, nu o primește. Verificarea de
-- mai sus e doar pentru textul întrebării — între ea și scriere stocul se poate mișca, deci decizia finală
-- se ia AICI, în aceeași tranzacție și sub aceleași lock-uri pe piese care consumă straturile FIFO.
--
-- Se ridică la SFÂRȘITUL buclei, nu la primul rând lipsă: așa `DETAIL` poartă toate piesele deodată în logul
-- serverului. Rândurile deja inserate se anulează cu tranzacția — jurnalul de stoc rămâne append-only,
-- fiindcă nimic nu s-a comis.
--
-- `piese_transfer_receive_to_vehicle` (migr. 319) cheamă funcția cu 6 argumente, deci cade pe `false`.
-- Rămâne așa intenționat, și e inofensiv: acolo se eliberează exact cantitatea intrată în aceeași
-- tranzacție, deci disponibilul include mereu marfa tocmai sosită și lipsa e aritmetic imposibilă.
DROP FUNCTION IF EXISTS piese_create_issue(bigint, bigint, bigint, bigint, jsonb, bigint);

CREATE OR REPLACE FUNCTION piese_create_issue(
  p_wh bigint, p_vehicle bigint, p_mechanic bigint, p_reason bigint, p_lines jsonb, p_user bigint,
  p_allow_short boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_doc bigint; v_line bigint; v_mov bigint; v_odo int; ln jsonb;
  v_part bigint; v_qty numeric; v_need numeric; v_take numeric; v_total numeric; v_unit numeric;
  lyr record; alloc jsonb; a jsonb; shortages jsonb := '[]'::jsonb;
BEGIN
  IF p_wh IS NULL THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;
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
  IF jsonb_array_length(shortages) > 0 AND NOT COALESCE(p_allow_short, false) THEN
    RAISE EXCEPTION 'SHORTAGE' USING DETAIL = shortages::text;
  END IF;
  RETURN jsonb_build_object('doc_id',v_doc,'shortages',shortages);
END $$;

REVOKE ALL ON FUNCTION piese_create_issue(bigint, bigint, bigint, bigint, jsonb, bigint, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_create_issue(bigint, bigint, bigint, bigint, jsonb, bigint, boolean) TO service_role;

-- Aceeași gardă la ADĂUGAREA pe rashodul zilei. Fără ea, interdicția s-ar fi ocolit singură: prima piesă a
-- zilei ar fi cerut confirmare, iar a doua — care intră pe documentul deja creat — ar fi trecut tăcut.
-- Restul funcției e identic cu migr. 311.
DROP FUNCTION IF EXISTS piese_append_issue(bigint, bigint, bigint, jsonb, bigint);

CREATE OR REPLACE FUNCTION piese_append_issue(
  p_doc bigint, p_wh bigint, p_vehicle bigint, p_lines jsonb, p_user bigint,
  p_allow_short boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE d record; v_line bigint; v_mov bigint; v_odo int; ln jsonb;
  v_part bigint; v_qty numeric; v_need numeric; v_take numeric; v_total numeric; v_unit numeric;
  lyr record; alloc jsonb; a jsonb; shortages jsonb := '[]'::jsonb; v_added int := 0;
BEGIN
  IF p_doc IS NULL OR p_wh IS NULL OR p_vehicle IS NULL THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;
  SELECT * INTO d FROM piese_stock_documents WHERE id = p_doc FOR UPDATE;
  IF NOT FOUND OR d.doc_type <> 'ISSUE' THEN RAISE EXCEPTION 'NOT_ISSUE'; END IF;
  IF d.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'NOT_CONFIRMED'; END IF;
  IF d.warehouse_id IS DISTINCT FROM p_wh OR d.vehicle_id IS DISTINCT FROM p_vehicle THEN
    RAISE EXCEPTION 'DOC_MISMATCH';
  END IF;
  IF (d.created_at AT TIME ZONE 'Europe/Chisinau')::date
     <> (now() AT TIME ZONE 'Europe/Chisinau')::date THEN
    RAISE EXCEPTION 'NOT_TODAY';
  END IF;
  SELECT km_current INTO v_odo FROM piese_vehicles WHERE id = d.vehicle_id;
  FOR ln IN SELECT e FROM jsonb_array_elements(p_lines) e ORDER BY (e->>'part_id')::bigint LOOP
    v_part := (ln->>'part_id')::bigint;
    v_qty  := abs((ln->>'qty')::numeric);
    IF v_part IS NULL THEN RAISE EXCEPTION 'BAD_PART'; END IF;
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
  IF jsonb_array_length(shortages) > 0 AND NOT COALESCE(p_allow_short, false) THEN
    RAISE EXCEPTION 'SHORTAGE' USING DETAIL = shortages::text;
  END IF;
  RETURN jsonb_build_object('doc_id',p_doc,'added',v_added,'shortages',shortages);
END $$;

REVOKE ALL ON FUNCTION piese_append_issue(bigint, bigint, bigint, jsonb, bigint, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_append_issue(bigint, bigint, bigint, jsonb, bigint, boolean) TO service_role;
