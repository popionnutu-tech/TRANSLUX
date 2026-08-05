-- ============================================================================
-- MODUL PIESE — modificarea unei recepții de prihod (corectare)
-- ----------------------------------------------------------------------------
-- Antetul (furnizor / serie / număr / comentariu) se modifică direct pe document
-- din aplicație (UPDATE simplu), chiar și când marfa a fost deja folosită — nu
-- atinge stocul. Modificarea LINIILOR (cantitate / preț / piesă / adăugare-ștergere)
-- se face DOAR prin acest RPC și DOAR dacă niciun strat FIFO al recepției nu a fost
-- încă consumat (vândut / casat / mutat). Mișcările sunt append-only → „anularea"
-- unui strat = mișcare inversă (ADJUST_MINUS pe -cantitate) + o alocare FIFO care
-- stinge complet stratul (qty și valoare → 0, exact ca la lipsa de inventar).
-- Documentul vechi trece în status CANCELLED (ascuns din jurnal); se creează un
-- document nou, corectat, păstrând data și creatorul original. Auditul reține legătura.
-- ============================================================================

-- ── FIX de concurență (bug preexistent): rashod-ul (issue) NU bloca piesa înainte de
-- calculul FIFO, spre deosebire de vânzare/mutare/inventar → două rashoduri concurente
-- (sau un rashod concurent cu corecția/recostul de mai jos) puteau supra-aloca același
-- strat → stoc/valoare negative. Adăugăm lock-ul pe piesă (aliniere cu ceilalți consumatori).
CREATE OR REPLACE FUNCTION piese_create_issue(p_wh bigint, p_vehicle bigint, p_mechanic bigint, p_reason bigint, p_lines jsonb, p_user bigint)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_doc bigint; v_line bigint; v_mov bigint; v_odo int; ln jsonb;
  v_part bigint; v_qty numeric; v_need numeric; v_take numeric; v_total numeric; v_unit numeric;
  lyr record; alloc jsonb; a jsonb; shortages jsonb := '[]'::jsonb;
BEGIN
  SELECT km_current INTO v_odo FROM piese_vehicles WHERE id = p_vehicle;
  INSERT INTO piese_stock_documents(doc_type,status,warehouse_id,vehicle_id,mechanic_id,breakdown_reason_id,created_by,confirmed_by,confirmed_at)
    VALUES('ISSUE','CONFIRMED',p_wh,p_vehicle,p_mechanic,p_reason,p_user,p_user,now()) RETURNING id INTO v_doc;
  FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_part := (ln->>'part_id')::bigint; v_qty := abs((ln->>'qty')::numeric);
    PERFORM 1 FROM piese_parts WHERE id = v_part FOR UPDATE; -- serializare pe piesă (ca sale/transfer/inventory)
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
  INSERT INTO piese_audit_log(user_id,action,entity,entity_id,detail) VALUES(p_user,'CREATE','issue',v_doc,'Rashod');
  RETURN jsonb_build_object('doc_id',v_doc,'shortages',shortages);
END $$;

-- Index pentru căutarea mișcărilor după document (verificarea/anularea recepției) — lipsea, evita 2 seq-scan-uri.
CREATE INDEX IF NOT EXISTS idx_pmov_document ON piese_stock_movements(document_id);

-- ── RPC de corecție a recepției (anulare + re-creare) ──
CREATE OR REPLACE FUNCTION piese_replace_receipt(
  p_doc bigint, p_supplier bigint, p_series text, p_number text, p_note text, p_lines jsonb, p_user bigint
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE d record; m record; v_new bigint; v_line bigint; v_rev bigint; ln jsonb; v_consumed numeric; v_q numeric; v_c numeric;
BEGIN
  SELECT * INTO d FROM piese_stock_documents WHERE id = p_doc FOR UPDATE;
  IF NOT FOUND OR d.doc_type <> 'RECEIPT' THEN RAISE EXCEPTION 'NOT_RECEIPT'; END IF;
  IF d.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'NOT_CONFIRMED'; END IF;
  IF d.invoice_series = 'SOLD' THEN RAISE EXCEPTION 'SOLD_INITIAL'; END IF; -- soldul inițial nu se editează aici
  IF p_series = 'SOLD' THEN RAISE EXCEPTION 'SOLD_SERIES'; END IF;          -- nici documentul nou nu poate fi „SOLD"
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'NO_LINES'; END IF;
  -- Validează liniile ÎNAINTE de orice mutație (piesă validă, cantitate > 0, cost >= 0).
  FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF (ln->>'part_id') IS NULL THEN RAISE EXCEPTION 'BAD_PART'; END IF;
    PERFORM 1 FROM piese_parts WHERE id = (ln->>'part_id')::bigint;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;
    v_q := abs((ln->>'qty')::numeric); v_c := (ln->>'unit_cost')::numeric;
    IF v_q IS NULL OR v_q <= 0.0000001 THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
    IF v_c IS NULL OR v_c < 0 THEN RAISE EXCEPTION 'BAD_COST'; END IF;
  END LOOP;

  -- (1) Blochează piesele recepției și verifică dacă VREUN strat a fost consumat (înainte de a atinge ceva).
  FOR m IN SELECT * FROM piese_stock_movements WHERE document_id = p_doc AND movement_type = 'RECEIPT' LOOP
    PERFORM 1 FROM piese_parts WHERE id = m.part_id FOR UPDATE;
    SELECT COALESCE(SUM(qty), 0) INTO v_consumed FROM piese_fifo_alloc WHERE receipt_movement_id = m.id;
    IF v_consumed > 0.0000001 THEN RAISE EXCEPTION 'CONSUMED'; END IF;
  END LOOP;

  -- (2) Anulează fiecare strat: mișcare inversă + alocare FIFO care îl stinge complet (qty→0, valoare→0).
  FOR m IN SELECT * FROM piese_stock_movements WHERE document_id = p_doc AND movement_type = 'RECEIPT' LOOP
    INSERT INTO piese_stock_movements(part_id, warehouse_id, movement_type, qty_delta, unit_cost, document_id, storno_of, created_by)
      VALUES(m.part_id, m.warehouse_id, 'ADJUST_MINUS', -m.qty_delta, m.unit_cost, p_doc, m.id, p_user) RETURNING id INTO v_rev;
    INSERT INTO piese_fifo_alloc(issue_movement_id, receipt_movement_id, qty, unit_cost)
      VALUES(v_rev, m.id, m.qty_delta, m.unit_cost);
  END LOOP;

  UPDATE piese_stock_documents SET status = 'CANCELLED' WHERE id = p_doc;

  -- (3) Documentul nou (corectat) — păstrează data și creatorul original ca să rămână la locul lui în jurnal.
  INSERT INTO piese_stock_documents(doc_type, status, warehouse_id, supplier_id, invoice_series, invoice_number, note, created_by, confirmed_by, confirmed_at, created_at, created_by_admin)
    VALUES('RECEIPT', 'CONFIRMED', d.warehouse_id, p_supplier, p_series, p_number, p_note, p_user, p_user, now(), d.created_at, d.created_by_admin)
    RETURNING id INTO v_new;
  FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO piese_stock_document_lines(document_id, part_id, qty, unit_cost)
      VALUES(v_new, (ln->>'part_id')::bigint, abs((ln->>'qty')::numeric), (ln->>'unit_cost')::numeric) RETURNING id INTO v_line;
    -- created_at = data originală → stratul corectat își păstrează poziția în coada FIFO (nu sare la „acum").
    INSERT INTO piese_stock_movements(part_id, warehouse_id, movement_type, qty_delta, unit_cost, document_id, line_id, created_by, created_at)
      VALUES((ln->>'part_id')::bigint, d.warehouse_id, 'RECEIPT', abs((ln->>'qty')::numeric), (ln->>'unit_cost')::numeric, v_new, v_line, p_user, d.created_at);
  END LOOP;

  INSERT INTO piese_audit_log(user_id, action, entity, entity_id, detail)
    VALUES(p_user, 'EDIT', 'receipt', v_new, 'Corectie receptie (anuleaza #' || p_doc || ')');
  RETURN v_new;
END $$;

-- Apărare în adâncime: RPC-ul de corecție (mută stoc) NU trebuie apelabil prin PostgREST de anon/authenticated
-- (autorizarea reală rămâne în server action: requireRole + depozit + regula pe zi). Doar rolul aplicației.
-- ⚠️ Proiectul are ALTER DEFAULT PRIVILEGES care acordă EXECUTE pe funcțiile noi din `public` DIRECT lui
-- anon+authenticated (nu doar prin PUBLIC) → REVOKE FROM PUBLIC singur NU e suficient; revocăm explicit și de la ele.
REVOKE ALL ON FUNCTION piese_replace_receipt(bigint, bigint, text, text, text, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_replace_receipt(bigint, bigint, text, text, text, jsonb, bigint) TO service_role;

-- ── View-uri de preț: exclude mișcările RECEIPT ale recepțiilor ANULATE din media de cost achiziție ──
-- La o corecție care schimbă costul, recepția veche devine CANCELLED dar mișcarea ei RECEIPT rămâne (append-only);
-- fără această excludere media de achiziție (deci prețul de vânzare) ar rămâne trasă de costul vechi, greșit.
-- Definițiile păstrează TOT ce era (inclusiv round(...,0) din migr. 243), adaugă DOAR filtrul de status CANCELLED.
CREATE OR REPLACE VIEW piese_part_sale_price AS
SELECT p.id AS part_id, g.markup_pct, a.avg_cost,
  round((a.avg_cost * (1 + g.markup_pct / 100.0))::numeric, 0) AS sale_price
FROM piese_parts p
  JOIN piese_part_groups g ON g.id = p.group_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(avg(m.unit_cost), 0) AS avg_cost
    FROM piese_stock_movements m
    WHERE m.part_id = p.id AND m.movement_type = 'RECEIPT' AND m.unit_cost > 0
      AND NOT EXISTS (SELECT 1 FROM piese_stock_documents dd WHERE dd.id = m.document_id AND dd.status = 'CANCELLED')
  ) a ON true
WHERE p.active;

CREATE OR REPLACE VIEW piese_sale_parts AS
SELECT p.id, g.name_ro AS grp, p.manufacturer, p.model, g.markup_pct,
  round((COALESCE((
    SELECT avg(m.unit_cost)
    FROM piese_stock_movements m
    WHERE m.part_id = p.id
      AND m.warehouse_id = (SELECT piese_warehouses.id FROM piese_warehouses WHERE piese_warehouses.kind = 'SHOP' LIMIT 1)
      AND m.qty_delta > 0
      AND NOT EXISTS (SELECT 1 FROM piese_stock_documents dd WHERE dd.id = m.document_id AND dd.status = 'CANCELLED')
  ), 0) * (1 + g.markup_pct / 100.0))::numeric, 0) AS price
FROM piese_parts p
  JOIN piese_part_groups g ON g.id = p.group_id
WHERE p.is_for_sale AND p.active
ORDER BY g.name_ro;

-- „Ultimul furnizor + preț de achiziție" (asistentul de căutare al vânzătorului, când piesa nu e în stoc).
-- Aceeași aliniere: exclude recepțiile ANULATE, altfel după o corecție care ELIMINĂ o piesă din recepție
-- (liniile documentului vechi rămân, append-only) s-ar afișa furnizorul/prețul dintr-o recepție anulată.
-- Coloane identice cu migr. 223 → CREATE OR REPLACE sigur; se adaugă DOAR filtrul de status.
CREATE OR REPLACE VIEW piese_last_supplier AS
SELECT DISTINCT ON (l.part_id)
  l.part_id,
  d.supplier_id,
  s.name        AS supplier_name,
  l.unit_cost,
  d.created_at  AS received_at,
  d.invoice_series,
  d.invoice_number
FROM piese_stock_document_lines l
JOIN piese_stock_documents d ON d.id = l.document_id
LEFT JOIN piese_suppliers s ON s.id = d.supplier_id
WHERE d.doc_type = 'RECEIPT' AND d.status <> 'CANCELLED'
ORDER BY l.part_id, d.created_at DESC, d.id DESC, l.id DESC;
