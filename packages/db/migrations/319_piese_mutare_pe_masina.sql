-- 319: Mutarea marcată pentru o mașină — se confirmă în Rashod și devine eliberare pe mașină.
--
-- Cerut de Eduard: „Давай в MUTARI добавляем какую то галочку (на автомобиль) и выбором механика, а в
-- расходе чтоб появилось перемещение по депозитам на выбранный автомобиль, указанный слесарь и подтвердить."
--
-- CONTEXTUL: în ecranul „Eliberare pe mașină" nu apare magazinul — intenționat, acolo sunt doar depozitele
-- interne. Dar autobuzele lor iau piese și din magazin. Până acum singurele variante erau: ori se elibera
-- direct din magazin (și evidența magazinului se murdărea), ori se făcea mutare + rashod ca două operațiuni
-- fără nicio legătură între ele, iar cine primea marfa nu știa pentru ce mașină era.
--
-- SOLUȚIA, aleasă de Eduard: mutarea poartă INTENȚIA (pentru ce mașină, la ce lăcătuș), iar confirmarea în
-- Rashod o transformă în eliberare. Marfa trece efectiv prin depozitul intern — deci contabilitatea
-- magazinului rămâne curată, iar costul ajunge pe mașină prin drumul normal.

-- Coloanele există deja pe documente (`vehicle_id`, `mechanic_id`), folosite până acum doar de rashod.
-- Pe o mutare înseamnă altceva: nu „s-a dat pe mașina asta", ci „se trimite PENTRU mașina asta".
comment on column piese_stock_documents.vehicle_id is
  'ISSUE: mașina pe care s-a eliberat. TRANSFER: mașina pentru care se trimite marfa (intenție, migr. 319).';

-- Mutările „pe drum" către un depozit, marcate pentru o mașină. Astea apar în Rashod ca de-confirmat.
-- Se exclud cele deja confirmate: după confirmare devin rashod, deci n-au ce mai aștepta pe nimeni.
CREATE OR REPLACE VIEW piese_transfers_for_vehicle AS
  SELECT d.id, d.warehouse_id AS from_warehouse_id, w.name AS from_name,
         d.to_warehouse_id, d.vehicle_id, v.plate AS vehicle_plate,
         d.mechanic_id, m.name AS mechanic_name, d.created_at,
         (SELECT count(*) FROM piese_stock_document_lines l WHERE l.document_id = d.id) AS line_count
    FROM piese_stock_documents d
    JOIN piese_warehouses w ON w.id = d.warehouse_id
    JOIN piese_vehicles v ON v.id = d.vehicle_id
    LEFT JOIN piese_mechanics m ON m.id = d.mechanic_id
   WHERE d.doc_type = 'TRANSFER' AND d.status = 'IN_TRANSIT' AND d.vehicle_id IS NOT NULL;

REVOKE ALL ON piese_transfers_for_vehicle FROM PUBLIC, anon, authenticated;
GRANT SELECT ON piese_transfers_for_vehicle TO service_role;

-- ── Trimiterea, cu mașina și lăcătușul ────────────────────────────────────────
-- `CREATE OR REPLACE` cu ALT NUMĂR de parametri nu înlocuiește funcția, ci creează a doua. Cea din
-- migr. 202 ar fi rămas apelabilă de service_role — fără `piese_qty_ok`, fără `BAD_PART`, fără
-- `search_path` — adică exact drumul pe care întărirea împotriva NaN din migr. 296 se putea ocoli.
DROP FUNCTION IF EXISTS piese_transfer_send(bigint, bigint, jsonb, bigint);

-- Parametrii noi au DEFAULT NULL: o mutare obișnuită între depozite rămâne exact ce era.
-- Restul corpului e identic cu migr. 202, plus validările lipsă (cantitate, piesă, depozite).
CREATE OR REPLACE FUNCTION piese_transfer_send(
  p_from bigint, p_to bigint, p_lines jsonb, p_user bigint,
  p_vehicle bigint DEFAULT NULL, p_mechanic bigint DEFAULT NULL
) RETURNS bigint LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_doc bigint; v_line bigint; v_mov bigint; ln jsonb; v_part bigint; v_qty numeric;
        v_need numeric; v_take numeric; v_total numeric; v_unit numeric; lyr record; alloc jsonb; a jsonb;
        v_to_kind text;
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN RAISE EXCEPTION 'BAD_WAREHOUSE'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'SAME_WAREHOUSE'; END IF;
  -- Mașina trebuie să existe: altfel mutarea ar rămâne veșnic „pe drum", invizibilă în Rashod (view-ul
  -- face JOIN pe vehicule), și nimeni n-ar ști de ce marfa a dispărut din depozitul-sursă.
  IF p_vehicle IS NOT NULL THEN
    PERFORM 1 FROM piese_vehicles WHERE id = p_vehicle;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_VEHICLE'; END IF;
    -- Destinația unei mutări PE MAȘINĂ trebuie să fie un depozit INTERN. Ecranul Rashod listează doar
    -- depozite interne, iar mutarea nu mai apare în lista de tranzit — deci una trimisă către magazin ar
    -- ieși din sursă și n-ar mai putea fi atinsă de nimeni: nici confirmată, nici primită obișnuit.
    SELECT kind INTO v_to_kind FROM piese_warehouses WHERE id = p_to;
    IF v_to_kind IS DISTINCT FROM 'INTERNAL' THEN RAISE EXCEPTION 'DEST_NOT_INTERNAL'; END IF;
  END IF;
  IF p_mechanic IS NOT NULL THEN
    PERFORM 1 FROM piese_mechanics WHERE id = p_mechanic;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_MECHANIC'; END IF;
  END IF;
  -- Lăcătuș fără mașină n-are înțeles: rashodul se face PE mașină, iar lăcătușul spune cine a montat.
  IF p_vehicle IS NULL AND p_mechanic IS NOT NULL THEN RAISE EXCEPTION 'MECHANIC_WITHOUT_VEHICLE'; END IF;

  INSERT INTO piese_stock_documents(doc_type, status, warehouse_id, to_warehouse_id, vehicle_id, mechanic_id, created_by)
    VALUES('TRANSFER', 'IN_TRANSIT', p_from, p_to, p_vehicle, p_mechanic, p_user) RETURNING id INTO v_doc;

  -- ORDINEA DE BLOCARE, sortată după `part_id` — nu cea din payload, care e control al clientului.
  -- Migr. 295 a reparat exact asta la eliberare: două operațiuni simultane cu aceleași piese în ordine
  -- inversă își luau lock-urile încrucișat și se blocau reciproc. `piese_transfer_send` rămăsese pe forma
  -- veche, iar fluxul „magazin → mașină" trece acum ACELEAȘI piese prin ea și apoi prin `create_issue`.
  -- Lock-ul e pe rândul din catalog, deci agnostic de depozit: se ciocnește cu orice scriere pe piesa aia.
  FOR ln IN SELECT e FROM jsonb_array_elements(p_lines) e ORDER BY (e->>'part_id')::bigint LOOP
    v_part := (ln->>'part_id')::bigint;
    v_qty := abs((ln->>'qty')::numeric);
    IF NOT piese_qty_ok(v_qty) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
    PERFORM 1 FROM piese_parts WHERE id = v_part FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;
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

  INSERT INTO piese_audit_log(user_id, action, entity, entity_id, detail)
    VALUES(p_user, 'CREATE', 'transfer', v_doc,
           CASE WHEN p_vehicle IS NULL THEN 'Mutare trimisă'
                ELSE 'Mutare trimisă pentru mașina #' || p_vehicle END);
  RETURN v_doc;
END $$;

REVOKE ALL ON FUNCTION piese_transfer_send(bigint, bigint, jsonb, bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_transfer_send(bigint, bigint, jsonb, bigint, bigint, bigint) TO service_role;

-- ── Confirmarea în Rashod: primire + eliberare, ATOMIC ────────────────────────
-- Cele două nu au voie să se despartă. Dacă marfa s-ar primi și rashodul ar eșua, piesa ar rămâne pe
-- stocul intern fără să fie atribuită mașinii — și nimeni n-ar ști că mai are ceva de făcut, fiindcă
-- mutarea ar apărea deja ca primită. De aceea o singură funcție, o singură tranzacție.
--
-- Mașina și lăcătușul se pot CORECTA la confirmare (decizie luată cu Eduard): mutarea e o intenție, iar
-- adevărul e ce s-a montat efectiv. Dacă am forța anularea și refacerea, oamenii ar confirma greșit doar
-- ca să scape de birocrație. Ambele valori rămân în urmă — și cea propusă, și cea confirmată.
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
  -- ATENȚIE la ce NU garantează asta: `piese_create_issue` consumă straturile în ordine FIFO peste TOT
  -- stocul depozitului, nu doar peste cele sosite acum. Dacă depozitul avea deja piesa asta dinainte, pe
  -- mașină ajunge costul stratului MAI VECHI, iar cel proaspăt rămâne pe raft. Contabil e corect (FIFO e
  -- FIFO, cantitatea netă pe depozit rămâne 0), dar nu e „pass-through" de cost.
  v_issue := piese_create_issue(p_wh, p_vehicle, p_mechanic, NULL, v_lines, p_user);

  INSERT INTO piese_audit_log(user_id, action, entity, entity_id, detail)
    VALUES(p_user, 'RECEIVE', 'transfer', p_doc,
           'Primită și eliberată pe mașina #' || p_vehicle ||
           CASE WHEN d.vehicle_id <> p_vehicle THEN ' (propusă: #' || d.vehicle_id || ')' ELSE '' END ||
           CASE WHEN d.mechanic_id IS DISTINCT FROM p_mechanic
                THEN ' (lăcătuș propus: ' || COALESCE(d.mechanic_id::text, '—') || ')' ELSE '' END ||
           ' → rashod #' || (v_issue->>'doc_id'));

  RETURN jsonb_build_object('transfer_id', p_doc, 'issue_id', (v_issue->>'doc_id')::bigint,
                            'shortages', COALESCE(v_issue->'shortages', '[]'::jsonb),
                            'vehicle_changed', d.vehicle_id <> p_vehicle,
                            'mechanic_changed', d.mechanic_id IS DISTINCT FROM p_mechanic);
END $$;

REVOKE ALL ON FUNCTION piese_transfer_receive_to_vehicle(bigint, bigint, bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_transfer_receive_to_vehicle(bigint, bigint, bigint, bigint, bigint) TO service_role;

-- Mutarea marcată pentru o mașină NU se mai confirmă pe calea obișnuită: ar intra pe stoc și ar rămâne
-- acolo, fără rashod, iar în Rashod ar dispărea din lista de confirmat — marfa ar deveni invizibilă.
CREATE OR REPLACE FUNCTION piese_transfer_receive(p_doc bigint, p_user bigint)
RETURNS void LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE d record; l record;
BEGIN
  SELECT * INTO d FROM piese_stock_documents WHERE id = p_doc FOR UPDATE;
  IF d IS NULL OR d.status <> 'IN_TRANSIT' THEN RAISE EXCEPTION 'Mutarea nu e pe drum'; END IF;
  IF d.vehicle_id IS NOT NULL THEN RAISE EXCEPTION 'FOR_VEHICLE'; END IF;
  FOR l IN SELECT * FROM piese_stock_document_lines WHERE document_id = p_doc LOOP
    INSERT INTO piese_stock_movements(part_id, warehouse_id, movement_type, qty_delta, unit_cost, document_id, line_id, created_by)
      VALUES(l.part_id, d.to_warehouse_id, 'TRANSFER_IN', abs(l.qty), l.unit_cost, p_doc, l.id, p_user);
  END LOOP;
  UPDATE piese_stock_documents SET status = 'CONFIRMED', confirmed_by = p_user, confirmed_at = now() WHERE id = p_doc;
  INSERT INTO piese_audit_log(user_id, action, entity, entity_id, detail) VALUES(p_user, 'RECEIVE', 'transfer', p_doc, 'Mutare primită');
END $$;

REVOKE ALL ON FUNCTION piese_transfer_receive(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_transfer_receive(bigint, bigint) TO service_role;

-- Lista mutărilor „pe drum" din ecranul Mutări nu trebuie să le arate și pe cele pentru mașină: acolo
-- butonul „Primește" le-ar confirma fără rashod, iar acum funcția le refuză. Se confirmă în Rashod.
-- Coloanele și ordinea lor rămân EXACT ca în migr. 202 (`CREATE OR REPLACE VIEW` nu permite altfel);
-- se adaugă doar condiția `vehicle_id IS NULL`.
CREATE OR REPLACE VIEW piese_transfers_transit AS
  SELECT d.id, w.name AS from_name, w2.name AS to_name,
    (SELECT count(*) FROM piese_stock_document_lines l WHERE l.document_id = d.id) AS line_count,
    d.created_at
  FROM piese_stock_documents d
  JOIN piese_warehouses w ON w.id = d.warehouse_id
  JOIN piese_warehouses w2 ON w2.id = d.to_warehouse_id
  WHERE d.doc_type = 'TRANSFER' AND d.status = 'IN_TRANSIT' AND d.vehicle_id IS NULL
  ORDER BY d.created_at DESC;

-- ── Anularea unei mutări încă „pe drum" ───────────────────────────────────────
-- Fără ea, marfa trimisă și neconfirmată n-avea nicio ieșire: ieșise din sursă, nu intrase nicăieri, iar
-- singurul ocol era „confirmă greșit, apoi retur" — exact ce mutarea pe mașină trebuia să evite.
--
-- Se face prin STORNO, nu prin ștergere: `piese_stock_movements` e append-only (migr. 200). Alocarea FIFO
-- nouă, NEGATIVĂ, eliberează straturile din care marfa plecase — același tipar ca returul de la lăcătuș
-- (migr. 311), ca stocul să revină la costul cu care a ieșit, nu la o medie.
CREATE OR REPLACE FUNCTION piese_transfer_cancel(p_doc bigint, p_wh bigint, p_user bigint)
RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE d record; m record; v_n int := 0;
BEGIN
  IF p_doc IS NULL OR p_wh IS NULL THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;
  SELECT * INTO d FROM piese_stock_documents WHERE id = p_doc FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;
  -- Apartenența întâi (vezi mai sus). Anulează EXPEDITORUL: el primește marfa înapoi.
  IF d.warehouse_id IS DISTINCT FROM p_wh THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;
  IF d.doc_type <> 'TRANSFER' THEN RAISE EXCEPTION 'NOT_TRANSFER'; END IF;
  IF d.status <> 'IN_TRANSIT' THEN RAISE EXCEPTION 'NOT_IN_TRANSIT'; END IF;

  -- Storno SIMPLU: o mișcare pozitivă, atât.
  --
  -- `ADJUST_PLUS` E DEJA strat-sursă FIFO, deci mișcarea singură readuce marfa consumabilă. Prima
  -- variantă adăuga PE LÂNGĂ ea și alocări negative care eliberau și straturile originale — adică
  -- restituia de DOUĂ ori. Măsurat: cantitatea ieșea corect (10), dar valoarea sărea de la 1000 la 1400,
  -- iar disponibilul FIFO devenea 14 pentru 10 bucăți fizice. Repetat, umfla valoarea la nesfârșit și
  -- dezarma `shortages` — singura alarmă automată împotriva eliberării peste stoc. Migr. 311 avertizează
  -- exact despre asta: un tip de mișcare care e strat-sursă NU are voie să primească și alocări negative.
  --
  -- Verificat după reparație: trei cicluri trimite+anulează lasă stocul la 10/1000, iar o cerere de 12
  -- bucăți din 10 raportează în continuare lipsă.
  FOR m IN SELECT * FROM piese_stock_movements
            WHERE document_id = p_doc AND movement_type = 'TRANSFER_OUT'
            ORDER BY part_id LOOP  -- ordine de blocare sortată, ca în migr. 295
    PERFORM 1 FROM piese_parts WHERE id = m.part_id FOR UPDATE;
    INSERT INTO piese_stock_movements(part_id, warehouse_id, movement_type, qty_delta, unit_cost,
                                      document_id, storno_of, created_by)
      VALUES(m.part_id, m.warehouse_id, 'ADJUST_PLUS', -m.qty_delta, m.unit_cost, p_doc, m.id, p_user);
    v_n := v_n + 1;
  END LOOP;

  UPDATE piese_stock_documents SET status = 'CANCELLED' WHERE id = p_doc;
  INSERT INTO piese_audit_log(user_id, action, entity, entity_id, detail)
    VALUES(p_user, 'CANCEL', 'transfer', p_doc, 'Mutare anulată — marfa s-a întors în depozitul-sursă');
  RETURN jsonb_build_object('doc_id', p_doc, 'restored', v_n);
END $$;

REVOKE ALL ON FUNCTION piese_transfer_cancel(bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_transfer_cancel(bigint, bigint, bigint) TO service_role;

-- Expeditorul trebuie să VADĂ ce a trimis și nu i s-a confirmat. Mutările pe mașină au dispărut din
-- `piese_transfers_transit` (se confirmă în Rashod), deci magazinul își pierduse vizibilitatea asupra
-- propriei mărfi — ieșită din stoc, neintrată nicăieri.
CREATE OR REPLACE VIEW piese_transfers_sent AS
  SELECT d.id, d.warehouse_id AS from_warehouse_id, w2.name AS to_name,
         d.vehicle_id, v.plate AS vehicle_plate, d.created_at,
         (SELECT count(*) FROM piese_stock_document_lines l WHERE l.document_id = d.id) AS line_count
    FROM piese_stock_documents d
    JOIN piese_warehouses w2 ON w2.id = d.to_warehouse_id
    LEFT JOIN piese_vehicles v ON v.id = d.vehicle_id
   WHERE d.doc_type = 'TRANSFER' AND d.status = 'IN_TRANSIT'
   ORDER BY d.created_at DESC;

REVOKE ALL ON piese_transfers_sent FROM PUBLIC, anon, authenticated;
GRANT SELECT ON piese_transfers_sent TO service_role;

-- `piese_transfers_transit` vine din migr. 202, care n-avea REVOKE — deci a prins `ALTER DEFAULT
-- PRIVILEGES` al proiectului. Migr. 289 a curățat doar funcțiile, nu și view-urile.
REVOKE ALL ON piese_transfers_transit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON piese_transfers_transit TO service_role;

-- Indecși parțiali pentru marfa ÎN ZBOR. Azi indexează zero rânduri (nicio mutare în tranzit), deci sunt
-- practic gratuiți; devin relevanți când documentele cresc de la câteva sute la zeci de mii. `piese_stock_documents`
-- n-avea nimic pe `to_warehouse_id` și nimic pe `status`.
create index if not exists idx_pdoc_transit_for_vehicle
  on piese_stock_documents (to_warehouse_id, created_at DESC)
  where doc_type = 'TRANSFER' and status = 'IN_TRANSIT' and vehicle_id is not null;

create index if not exists idx_pdoc_transit_sent
  on piese_stock_documents (warehouse_id, created_at DESC)
  where doc_type = 'TRANSFER' and status = 'IN_TRANSIT';
