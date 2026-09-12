-- 332: Două regresii ale migr. 331, prinse la review înainte să ajungă la depozitari.
--
-- (1) Registrul se citea din `piese_current_stock`, care filtrează `p.active = true`. Pentru o piesă scoasă
--     din catalog dar cu marfă încă pe raft, vederea n-are rând → registru 0 → orice eliberare devine
--     „peste stoc". Verificat: piesa 3 la Briceni, 153 bucăți reale, blocată fals după dezactivare.
--     Registrul se calculează acum direct din mișcări. Cantitatea fizică nu depinde de starea din catalog.
--
-- (2) Confirmarea unei mutări pe mașină se bloca definitiv pentru orice piesă cu registru negativ. Migr. 330
--     susținea că acolo lipsa e „aritmetic imposibilă" — adevărat cât măsura era doar pe straturile FIFO,
--     fals de când există și măsura pe registru. Verificat pe piesa 21068 la Briceni: după TRANSFER_IN
--     registrul urcă de la −1 la 0, eliberarea celei sosite dă `v_short = 1`, tranzacția se anulează și
--     mutarea rămâne IN_TRANSIT, fără nicio cale prin ecran de a o debloca. Ar fi rupt exact reparația
--     documentelor 417/418, pe care i-am descris-o lui Eduard.
--
--     Calea aceea primește acum acordul explicit: se eliberează exact cantitatea intrată o clipă mai
--     devreme, iar cine ia marfa în mână n-are cum să repare un minus lăsat de altcineva.

-- ── Previzualizarea, într-o singură interogare ───────────────────────────────
-- Migr. 330 făcea o buclă cu 2N+1 interogări (un SUM per piesă, cu subinterogare corelată per strat, plus
-- o citire de denumire per piesă lipsă). Aici e un singur plan. La volumele de azi diferența e de ordinul
-- milisecundelor, dar forma corectă costă la fel de mult de scris.
--
-- `stoc` iese separat de `disponibil`: ecranul afișează pe rând stocul din registru (care poate fi negativ),
-- iar dialogul trebuie să arate același număr, nu unul limitat la zero. Două cifre diferite pentru „stoc"
-- pe același ecran, în același moment, ar fi părut o defecțiune.
--
-- `<> 'NaN'::numeric`: în Postgres NaN e egal cu sine și mai mare decât orice număr, deci `qty <= 0` NU îl
-- prinde (lecția migr. 296). `cleanLines` îl oprește deja în aplicație; aici e apărarea în adâncime,
-- fiindcă funcția e exportată și va avea alți apelanți.
CREATE OR REPLACE FUNCTION piese_issue_shortages(p_wh bigint, p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE v_out jsonb;
BEGIN
  IF p_wh IS NULL THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;
  WITH cerute AS (
    SELECT (e->>'part_id')::bigint AS part_id,
           SUM(abs((e->>'qty')::numeric)) AS cerut
      FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) e
     WHERE (e->>'part_id') IS NOT NULL
       AND (e->>'qty') IS NOT NULL
       AND (e->>'qty')::numeric <> 'NaN'::numeric
     GROUP BY 1
  ), fifo AS (
    SELECT r.part_id,
           SUM(GREATEST(r.qty_delta - COALESCE(al.alocat, 0), 0)) AS disponibil_fifo
      FROM piese_stock_movements r
      JOIN cerute c ON c.part_id = r.part_id
      LEFT JOIN LATERAL (
        SELECT SUM(x.qty) AS alocat FROM piese_fifo_alloc x WHERE x.receipt_movement_id = r.id
      ) al ON true
     WHERE r.warehouse_id = p_wh
       AND r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS')
     GROUP BY 1
  ), registru AS (
    -- Direct din mișcări, NU din `piese_current_stock`: vederea aceea filtrează piesele inactive, iar o
    -- piesă scoasă din catalog poate avea în continuare marfă pe raft.
    SELECT m.part_id, SUM(m.qty_delta)::numeric AS qty
      FROM piese_stock_movements m
      JOIN cerute c ON c.part_id = m.part_id
     WHERE m.warehouse_id = p_wh
     GROUP BY 1
  ), calc AS (
    SELECT c.part_id, c.cerut,
           COALESCE(g.qty, 0) AS stoc,
           GREATEST(LEAST(COALESCE(f.disponibil_fifo, 0), COALESCE(g.qty, 0)), 0) AS disponibil
      FROM cerute c
      LEFT JOIN fifo f ON f.part_id = c.part_id
      LEFT JOIN registru g ON g.part_id = c.part_id
     WHERE c.cerut > 0.0000001
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'part_id', k.part_id,
           'name', COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long, '#' || k.part_id),
           'cerut', k.cerut, 'stoc', k.stoc, 'disponibil', k.disponibil,
           'lipsa', k.cerut - k.disponibil) ORDER BY k.part_id), '[]'::jsonb)
    INTO v_out
    FROM calc k
    LEFT JOIN piese_parts p ON p.id = k.part_id
   WHERE k.cerut > k.disponibil + 0.0000001;
  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION piese_issue_shortages(bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_issue_shortages(bigint, jsonb) TO service_role;

-- ── Aceeași măsură în motor ──────────────────────────────────────────────────
-- Aici e reparația care contează. Ecranul întreabă pe baza previzualizării, dar cine decide e motorul: dacă
-- el consideră linia acoperită fiindcă a găsit straturi, scrie fără să întrebe nimic. Deci verificarea față
-- de registru trebuie să fie AICI, nu doar în previzualizare.
--
-- Registrul se citește ÎNAINTE de inserarea liniei curente, dar DUPĂ cele dinainte din același apel — e o
-- vedere peste mișcări, iar rândurile deja scrise în tranzacție se văd. Așa două rânduri cu aceeași piesă
-- se adună singure, fără să ținem noi socoteala.
CREATE OR REPLACE FUNCTION piese_create_issue(
  p_wh bigint, p_vehicle bigint, p_mechanic bigint, p_reason bigint, p_lines jsonb, p_user bigint,
  p_allow_short boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_doc bigint; v_line bigint; v_mov bigint; v_odo int; ln jsonb;
  v_part bigint; v_qty numeric; v_need numeric; v_take numeric; v_total numeric; v_unit numeric;
  v_ledger numeric; v_short numeric;
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
    SELECT COALESCE(SUM(m.qty_delta), 0)::numeric INTO v_ledger FROM piese_stock_movements m
      WHERE m.part_id = v_part AND m.warehouse_id = p_wh;
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
    v_short := GREATEST(v_need, v_qty - GREATEST(COALESCE(v_ledger, 0), 0));
    IF v_short > 0.0000001 THEN
      shortages := shortages || to_jsonb(format('Stoc insuficient (#%s): lipsesc %s', v_part, v_short));
    END IF;
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

CREATE OR REPLACE FUNCTION piese_append_issue(
  p_doc bigint, p_wh bigint, p_vehicle bigint, p_lines jsonb, p_user bigint,
  p_allow_short boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE d record; v_line bigint; v_mov bigint; v_odo int; ln jsonb;
  v_part bigint; v_qty numeric; v_need numeric; v_take numeric; v_total numeric; v_unit numeric;
  v_ledger numeric; v_short numeric;
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
    SELECT COALESCE(SUM(m.qty_delta), 0)::numeric INTO v_ledger FROM piese_stock_movements m
      WHERE m.part_id = v_part AND m.warehouse_id = d.warehouse_id;
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
    v_short := GREATEST(v_need, v_qty - GREATEST(COALESCE(v_ledger, 0), 0));
    IF v_short > 0.0000001 THEN
      shortages := shortages || to_jsonb(format('Stoc insuficient (#%s): lipsesc %s', v_part, v_short));
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

-- ── Confirmarea sosirii nu se mai poate bloca ────────────────────────────────
-- Singura schimbare față de migr. 319: `p_allow_short => true` la apelul motorului, plus mențiunea
-- lipsurilor în jurnal. Restul e identic.
CREATE OR REPLACE FUNCTION piese_transfer_receive_to_vehicle(
  p_doc bigint, p_wh bigint, p_vehicle bigint, p_mechanic bigint, p_user bigint
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE d record; l record; v_lines jsonb := '[]'::jsonb; v_issue jsonb;
BEGIN
  IF p_wh IS NULL OR p_doc IS NULL OR p_vehicle IS NULL THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;

  SELECT * INTO d FROM piese_stock_documents WHERE id = p_doc FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;
  -- APARTENENȚA ÎNTÂI (lecția din migr. 311): cu tipul și starea verificate primele, codurile distincte
  -- descriau documente STRĂINE, deci iterând `doc_id` se putea cartografia activitatea altor depozite.
  IF d.to_warehouse_id IS DISTINCT FROM p_wh THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;
  IF d.doc_type <> 'TRANSFER' THEN RAISE EXCEPTION 'NOT_TRANSFER'; END IF;
  IF d.status <> 'IN_TRANSIT' THEN RAISE EXCEPTION 'NOT_IN_TRANSIT'; END IF;
  IF d.vehicle_id IS NULL THEN RAISE EXCEPTION 'NOT_FOR_VEHICLE'; END IF;

  PERFORM 1 FROM piese_vehicles WHERE id = p_vehicle;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAD_VEHICLE'; END IF;
  IF p_mechanic IS NOT NULL THEN
    PERFORM 1 FROM piese_mechanics WHERE id = p_mechanic;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_MECHANIC'; END IF;
  END IF;

  -- (1) Primirea: marfa intră pe stocul depozitului-destinație, ca la o mutare obișnuită.
  --     `ORDER BY part_id` — ordine de blocare sortată, ca în migr. 295.
  FOR l IN SELECT * FROM piese_stock_document_lines WHERE document_id = p_doc ORDER BY part_id LOOP
    INSERT INTO piese_stock_movements(part_id, warehouse_id, movement_type, qty_delta, unit_cost, document_id, line_id, created_by)
      VALUES(l.part_id, d.to_warehouse_id, 'TRANSFER_IN', abs(l.qty), l.unit_cost, p_doc, l.id, p_user);
    v_lines := v_lines || jsonb_build_object('part_id', l.part_id, 'qty', abs(l.qty));
  END LOOP;
  IF jsonb_array_length(v_lines) = 0 THEN RAISE EXCEPTION 'NO_LINES'; END IF;

  UPDATE piese_stock_documents
     SET status = 'CONFIRMED', confirmed_by = p_user, confirmed_at = now()
   WHERE id = p_doc;

  -- (2) Eliberarea pe mașină, din depozitul-destinație.
  --
  -- `p_allow_short => true` (migr. 332): aici nu se cere consimțământ, fiindcă nu există decizie de luat.
  -- Se eliberează exact cantitatea intrată cu câteva rânduri mai sus, în aceeași tranzacție. Dacă piesa avea
  -- registrul deja pe minus dintr-o greșeală anterioară, garda ar refuza — și ar bloca mutarea în tranzit
  -- pentru totdeauna, fiindcă pe calea asta nu există dialog de confirmare. Cine ia marfa în mână n-are cum
  -- să repare un minus lăsat de altcineva; lipsurile rămân raportate în `shortages`, mai jos.
  --
  -- ATENȚIE la ce NU garantează asta: motorul consumă straturile FIFO peste TOT stocul depozitului, nu doar
  -- peste cele sosite acum. Dacă depozitul avea deja piesa, pe mașină ajunge costul stratului MAI VECHI.
  -- Contabil e corect, dar nu e „pass-through" de cost.
  v_issue := piese_create_issue(p_wh, p_vehicle, p_mechanic, NULL, v_lines, p_user, true);

  INSERT INTO piese_audit_log(user_id, action, entity, entity_id, detail)
    VALUES(p_user, 'RECEIVE', 'transfer', p_doc,
           'Primită și eliberată pe mașina #' || p_vehicle ||
           CASE WHEN d.vehicle_id <> p_vehicle THEN ' (propusă: #' || d.vehicle_id || ')' ELSE '' END ||
           CASE WHEN d.mechanic_id IS DISTINCT FROM p_mechanic
                THEN ' (lăcătuș propus: ' || COALESCE(d.mechanic_id::text, '—') || ')' ELSE '' END ||
           ' → rashod #' || (v_issue->>'doc_id') ||
           CASE WHEN jsonb_array_length(COALESCE(v_issue->'shortages','[]'::jsonb)) > 0
                THEN ' — ATENȚIE, peste stoc: ' || (v_issue->'shortages')::text ELSE '' END);

  RETURN jsonb_build_object('transfer_id', p_doc, 'issue_id', (v_issue->>'doc_id')::bigint,
                            'shortages', COALESCE(v_issue->'shortages', '[]'::jsonb),
                            'vehicle_changed', d.vehicle_id <> p_vehicle,
                            'mechanic_changed', d.mechanic_id IS DISTINCT FROM p_mechanic);
END $$;

REVOKE ALL ON FUNCTION piese_transfer_receive_to_vehicle(bigint, bigint, bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_transfer_receive_to_vehicle(bigint, bigint, bigint, bigint, bigint) TO service_role;
