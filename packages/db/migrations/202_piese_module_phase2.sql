-- ============================================================================
-- MODUL PIESE — faza 2: mutări, inventariere, vânzare, fiscal, rapoarte
-- (capturează în repo ce a fost aplicat live: piese_module_phase2 + piese_inventory_fifo_fix)
-- ============================================================================

-- ── MUTĂRI ──
CREATE OR REPLACE FUNCTION piese_transfer_send(p_from bigint, p_to bigint, p_lines jsonb, p_user bigint)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_doc bigint; v_line bigint; v_mov bigint; ln jsonb; v_part bigint; v_qty numeric; v_need numeric; v_take numeric; v_total numeric; v_unit numeric; lyr record; alloc jsonb; a jsonb;
BEGIN
  INSERT INTO piese_stock_documents(doc_type,status,warehouse_id,to_warehouse_id,created_by) VALUES('TRANSFER','IN_TRANSIT',p_from,p_to,p_user) RETURNING id INTO v_doc;
  FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_part:=(ln->>'part_id')::bigint; v_qty:=abs((ln->>'qty')::numeric);
    PERFORM 1 FROM piese_parts WHERE id=v_part FOR UPDATE;
    v_need:=v_qty; v_total:=0; alloc:='[]'::jsonb;
    FOR lyr IN SELECT r.id,r.unit_cost,(r.qty_delta-COALESCE((SELECT SUM(x.qty) FROM piese_fifo_alloc x WHERE x.receipt_movement_id=r.id),0)) AS remaining
      FROM piese_stock_movements r WHERE r.part_id=v_part AND r.warehouse_id=p_from AND r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS') ORDER BY r.created_at,r.id LOOP
      EXIT WHEN v_need<=0.0000001; IF lyr.remaining<=0 THEN CONTINUE; END IF;
      v_take:=LEAST(lyr.remaining,v_need); alloc:=alloc||jsonb_build_object('rid',lyr.id,'qty',v_take,'cost',lyr.unit_cost); v_total:=v_total+v_take*lyr.unit_cost; v_need:=v_need-v_take;
    END LOOP;
    v_unit:=CASE WHEN v_qty>0 THEN v_total/v_qty ELSE 0 END;
    INSERT INTO piese_stock_document_lines(document_id,part_id,qty,unit_cost) VALUES(v_doc,v_part,v_qty,v_unit) RETURNING id INTO v_line;
    INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,created_by) VALUES(v_part,p_from,'TRANSFER_OUT',-v_qty,v_unit,v_doc,v_line,p_user) RETURNING id INTO v_mov;
    FOR a IN SELECT * FROM jsonb_array_elements(alloc) LOOP INSERT INTO piese_fifo_alloc(issue_movement_id,receipt_movement_id,qty,unit_cost) VALUES(v_mov,(a->>'rid')::bigint,(a->>'qty')::numeric,(a->>'cost')::numeric); END LOOP;
  END LOOP;
  INSERT INTO piese_audit_log(user_id,action,entity,entity_id,detail) VALUES(p_user,'CREATE','transfer',v_doc,'Mutare trimisă');
  RETURN v_doc;
END $$;

CREATE OR REPLACE FUNCTION piese_transfer_receive(p_doc bigint, p_user bigint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d record; l record;
BEGIN
  SELECT * INTO d FROM piese_stock_documents WHERE id=p_doc;
  IF d IS NULL OR d.status<>'IN_TRANSIT' THEN RAISE EXCEPTION 'Mutarea nu e pe drum'; END IF;
  FOR l IN SELECT * FROM piese_stock_document_lines WHERE document_id=p_doc LOOP
    INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,created_by) VALUES(l.part_id,d.to_warehouse_id,'TRANSFER_IN',abs(l.qty),l.unit_cost,p_doc,l.id,p_user);
  END LOOP;
  UPDATE piese_stock_documents SET status='CONFIRMED',confirmed_by=p_user,confirmed_at=now() WHERE id=p_doc;
  INSERT INTO piese_audit_log(user_id,action,entity,entity_id,detail) VALUES(p_user,'RECEIVE','transfer',p_doc,'Mutare primită');
END $$;

CREATE OR REPLACE VIEW piese_transfers_transit AS
SELECT d.id, w.name AS from_name, w2.name AS to_name, (SELECT count(*) FROM piese_stock_document_lines l WHERE l.document_id=d.id) AS line_count, d.created_at
FROM piese_stock_documents d JOIN piese_warehouses w ON w.id=d.warehouse_id JOIN piese_warehouses w2 ON w2.id=d.to_warehouse_id
WHERE d.doc_type='TRANSFER' AND d.status='IN_TRANSIT' ORDER BY d.created_at DESC;

-- ── INVENTARIERE (lipsa consumă FIFO; surplus intră la cost mediu, nu 0) ──
CREATE OR REPLACE FUNCTION piese_inventory_count(p_wh bigint, p_counts jsonb, p_user bigint)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_doc bigint; v_line bigint; v_mov bigint; c jsonb; v_part bigint; v_cnt numeric; v_cur numeric; v_diff numeric; v_n int:=0;
  v_need numeric; v_take numeric; v_total numeric; v_unit numeric; lyr record; alloc jsonb; a jsonb; v_avg numeric;
BEGIN
  INSERT INTO piese_stock_documents(doc_type,status,warehouse_id,created_by,confirmed_by,confirmed_at) VALUES('INVENTORY','CONFIRMED',p_wh,p_user,p_user,now()) RETURNING id INTO v_doc;
  FOR c IN SELECT * FROM jsonb_array_elements(p_counts) LOOP
    v_part:=(c->>'part_id')::bigint; v_cnt:=(c->>'counted_qty')::numeric;
    PERFORM 1 FROM piese_parts WHERE id=v_part FOR UPDATE;
    SELECT COALESCE(SUM(qty_delta),0) INTO v_cur FROM piese_stock_movements WHERE part_id=v_part AND warehouse_id=p_wh;
    v_diff:=v_cnt-v_cur; IF abs(v_diff)<0.0000001 THEN CONTINUE; END IF; v_n:=v_n+1;
    IF v_diff < 0 THEN
      v_need:=-v_diff; v_total:=0; alloc:='[]'::jsonb;
      FOR lyr IN SELECT r.id,r.unit_cost,(r.qty_delta-COALESCE((SELECT SUM(x.qty) FROM piese_fifo_alloc x WHERE x.receipt_movement_id=r.id),0)) AS remaining
        FROM piese_stock_movements r WHERE r.part_id=v_part AND r.warehouse_id=p_wh AND r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS') ORDER BY r.created_at,r.id LOOP
        EXIT WHEN v_need<=0.0000001; IF lyr.remaining<=0 THEN CONTINUE; END IF;
        v_take:=LEAST(lyr.remaining,v_need); alloc:=alloc||jsonb_build_object('rid',lyr.id,'qty',v_take,'cost',lyr.unit_cost); v_total:=v_total+v_take*lyr.unit_cost; v_need:=v_need-v_take;
      END LOOP;
      v_unit:=CASE WHEN (-v_diff)>0 THEN v_total/(-v_diff) ELSE 0 END;
      INSERT INTO piese_stock_document_lines(document_id,part_id,qty,unit_cost) VALUES(v_doc,v_part,v_diff,v_unit) RETURNING id INTO v_line;
      INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,created_by) VALUES(v_part,p_wh,'ADJUST_MINUS',v_diff,v_unit,v_doc,v_line,p_user) RETURNING id INTO v_mov;
      FOR a IN SELECT * FROM jsonb_array_elements(alloc) LOOP INSERT INTO piese_fifo_alloc(issue_movement_id,receipt_movement_id,qty,unit_cost) VALUES(v_mov,(a->>'rid')::bigint,(a->>'qty')::numeric,(a->>'cost')::numeric); END LOOP;
    ELSE
      SELECT COALESCE(AVG(unit_cost),0) INTO v_avg FROM piese_stock_movements WHERE part_id=v_part AND warehouse_id=p_wh AND qty_delta>0;
      INSERT INTO piese_stock_document_lines(document_id,part_id,qty,unit_cost) VALUES(v_doc,v_part,v_diff,v_avg) RETURNING id INTO v_line;
      INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,created_by) VALUES(v_part,p_wh,'ADJUST_PLUS',v_diff,v_avg,v_doc,v_line,p_user);
    END IF;
  END LOOP;
  INSERT INTO piese_audit_log(user_id,action,entity,entity_id,detail) VALUES(p_user,'INVENTORY','inventory',v_doc,'Inventariere: '||v_n||' diferențe');
  RETURN jsonb_build_object('doc_id',v_doc,'diffs',v_n);
END $$;

-- ── VÂNZARE (magazin) ──
CREATE OR REPLACE FUNCTION piese_create_sale(p_wh bigint, p_client bigint, p_series text, p_number text, p_lines jsonb, p_user bigint)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_doc bigint; v_line bigint; v_mov bigint; ln jsonb; v_part bigint; v_qty numeric; v_price numeric; v_need numeric; v_take numeric; v_total numeric; v_unit numeric; v_rev numeric:=0; v_cost numeric:=0; lyr record; alloc jsonb; a jsonb;
BEGIN
  INSERT INTO piese_stock_documents(doc_type,status,warehouse_id,client_id,invoice_series,invoice_number,efactura_status,created_by,confirmed_by,confirmed_at) VALUES('SALE','CONFIRMED',p_wh,p_client,p_series,p_number,'PENDING',p_user,p_user,now()) RETURNING id INTO v_doc;
  FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_part:=(ln->>'part_id')::bigint; v_qty:=abs((ln->>'qty')::numeric); v_price:=(ln->>'unit_price')::numeric;
    PERFORM 1 FROM piese_parts WHERE id=v_part FOR UPDATE;
    v_need:=v_qty; v_total:=0; alloc:='[]'::jsonb;
    FOR lyr IN SELECT r.id,r.unit_cost,(r.qty_delta-COALESCE((SELECT SUM(x.qty) FROM piese_fifo_alloc x WHERE x.receipt_movement_id=r.id),0)) AS remaining
      FROM piese_stock_movements r WHERE r.part_id=v_part AND r.warehouse_id=p_wh AND r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS') ORDER BY r.created_at,r.id LOOP
      EXIT WHEN v_need<=0.0000001; IF lyr.remaining<=0 THEN CONTINUE; END IF;
      v_take:=LEAST(lyr.remaining,v_need); alloc:=alloc||jsonb_build_object('rid',lyr.id,'qty',v_take,'cost',lyr.unit_cost); v_total:=v_total+v_take*lyr.unit_cost; v_need:=v_need-v_take;
    END LOOP;
    v_unit:=CASE WHEN v_qty>0 THEN v_total/v_qty ELSE 0 END;
    INSERT INTO piese_stock_document_lines(document_id,part_id,qty,unit_cost,unit_price) VALUES(v_doc,v_part,v_qty,v_unit,v_price) RETURNING id INTO v_line;
    INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,created_by) VALUES(v_part,p_wh,'SALE',-v_qty,v_unit,v_doc,v_line,p_user) RETURNING id INTO v_mov;
    FOR a IN SELECT * FROM jsonb_array_elements(alloc) LOOP INSERT INTO piese_fifo_alloc(issue_movement_id,receipt_movement_id,qty,unit_cost) VALUES(v_mov,(a->>'rid')::bigint,(a->>'qty')::numeric,(a->>'cost')::numeric); END LOOP;
    v_rev:=v_rev+v_qty*v_price; v_cost:=v_cost+v_total;
  END LOOP;
  INSERT INTO piese_audit_log(user_id,action,entity,entity_id,detail) VALUES(p_user,'CREATE','sale',v_doc,'Vânzare');
  RETURN jsonb_build_object('doc_id',v_doc,'total',v_rev,'cost',v_cost);
END $$;

CREATE OR REPLACE FUNCTION piese_mark_sfs(p_doc bigint, p_user bigint) RETURNS void LANGUAGE plpgsql AS $$
BEGIN UPDATE piese_stock_documents SET efactura_status='SENT' WHERE id=p_doc AND doc_type='SALE' AND status='CONFIRMED';
  INSERT INTO piese_audit_log(user_id,action,entity,entity_id,detail) VALUES(p_user,'EFACTURA','document',p_doc,'Trimisă SFS'); END $$;

-- ── VIEW-URI: vânzări, preț magazin, rapoarte ──
CREATE OR REPLACE VIEW piese_sale_invoices AS
SELECT d.id, d.invoice_series, d.invoice_number, d.created_at, d.efactura_status, c.name AS client_name,
  COALESCE((SELECT SUM(l.qty*l.unit_price) FROM piese_stock_document_lines l WHERE l.document_id=d.id),0) AS net
FROM piese_stock_documents d LEFT JOIN piese_clients c ON c.id=d.client_id
WHERE d.doc_type='SALE' AND d.status='CONFIRMED' ORDER BY d.created_at DESC, d.id DESC;

CREATE OR REPLACE VIEW piese_sale_parts AS
SELECT p.id, g.name_ro AS grp, p.manufacturer, p.model, g.markup_pct,
  round((COALESCE((SELECT AVG(unit_cost) FROM piese_stock_movements m WHERE m.part_id=p.id AND m.warehouse_id=(SELECT id FROM piese_warehouses WHERE kind='SHOP' LIMIT 1) AND m.qty_delta>0),0)*(1+g.markup_pct/100.0))::numeric,2) AS price
FROM piese_parts p JOIN piese_part_groups g ON g.id=p.group_id WHERE p.is_for_sale AND p.active ORDER BY g.name_ro;

CREATE OR REPLACE FUNCTION piese_shop_profit() RETURNS TABLE(revenue numeric, cost numeric, profit numeric, sales bigint) LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(l.qty*l.unit_price),0)::numeric, COALESCE(SUM(l.qty*l.unit_cost),0)::numeric, (COALESCE(SUM(l.qty*l.unit_price),0)-COALESCE(SUM(l.qty*l.unit_cost),0))::numeric, COUNT(DISTINCT d.id)
  FROM piese_stock_documents d JOIN piese_stock_document_lines l ON l.document_id=d.id WHERE d.doc_type='SALE' AND d.status='CONFIRMED';
$$;

CREATE OR REPLACE VIEW piese_cost_per_vehicle AS
SELECT v.id AS vehicle_id, v.plate, v.model, v.km_current, COUNT(*) AS issues, SUM(-m.qty_delta) AS parts_qty, SUM(-m.qty_delta*m.unit_cost) AS total_cost
FROM piese_stock_movements m JOIN piese_vehicles v ON v.id=m.vehicle_id WHERE m.movement_type='ISSUE' GROUP BY v.id ORDER BY total_cost DESC;

CREATE OR REPLACE VIEW piese_overconsumption AS
SELECT v.plate, g.name_ro AS group_name, COUNT(*) AS times, SUM(-m.qty_delta*m.unit_cost) AS cost
FROM piese_stock_movements m JOIN piese_vehicles v ON v.id=m.vehicle_id JOIN piese_parts p ON p.id=m.part_id JOIN piese_part_groups g ON g.id=p.group_id
WHERE m.movement_type='ISSUE' GROUP BY v.id, g.id HAVING COUNT(*)>=3 ORDER BY COUNT(*) DESC, cost DESC;

CREATE OR REPLACE VIEW piese_reliability AS
WITH seq AS (
  SELECT LAG(p.manufacturer) OVER w AS manufacturer, m.odometer_km - LAG(m.odometer_km) OVER w AS span
  FROM piese_stock_movements m JOIN piese_parts p ON p.id=m.part_id
  WHERE m.movement_type='ISSUE' AND m.vehicle_id IS NOT NULL AND m.odometer_km IS NOT NULL
  WINDOW w AS (PARTITION BY m.vehicle_id, p.group_id ORDER BY m.created_at, m.id)
)
SELECT manufacturer, COUNT(*) AS samples, round(AVG(span)) AS avg_km FROM seq WHERE span>0 AND manufacturer IS NOT NULL GROUP BY manufacturer ORDER BY avg_km DESC;

CREATE OR REPLACE VIEW piese_illiquid AS
SELECT p.id AS part_id, g.name_ro AS group_name, p.name_long, w.name AS warehouse_name, cs.qty,
  (SELECT MAX(created_at) FROM piese_stock_movements m2 WHERE m2.part_id=p.id AND m2.warehouse_id=w.id) AS last_move
FROM piese_part_locations loc JOIN piese_parts p ON p.id=loc.part_id JOIN piese_part_groups g ON g.id=p.group_id JOIN piese_warehouses w ON w.id=loc.warehouse_id JOIN piese_current_stock cs ON cs.part_id=p.id AND cs.warehouse_id=w.id
WHERE cs.qty>0 AND (SELECT MAX(created_at) FROM piese_stock_movements m3 WHERE m3.part_id=p.id AND m3.warehouse_id=w.id) < now()-interval '180 days' ORDER BY 6 ASC;

CREATE OR REPLACE VIEW piese_movement_ledger AS
SELECT m.id, m.created_at, m.movement_type, m.qty_delta, m.unit_cost, g.name_ro AS group_name, p.name_long, w.name AS warehouse_name, v.plate AS vehicle_plate
FROM piese_stock_movements m JOIN piese_parts p ON p.id=m.part_id JOIN piese_part_groups g ON g.id=p.group_id JOIN piese_warehouses w ON w.id=m.warehouse_id LEFT JOIN piese_vehicles v ON v.id=m.vehicle_id
ORDER BY m.created_at DESC, m.id DESC;

-- index pe join-ul de grup folosit de piese_overconsumption / piese_reliability
-- (notă: indexurile parțiale ISSUE pe vehicle_id NU ajută — view-urile agregă global, confirmat prin EXPLAIN)
CREATE INDEX IF NOT EXISTS idx_pparts_group ON piese_parts(group_id);
