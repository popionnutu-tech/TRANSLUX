-- ============================================================================
-- MODUL PIESE (depozit & evidența pieselor) — pentru central-hub (apps/admin)
-- Toate tabelele prefixate `piese_` → aditiv, nu atinge schema TRANSLUX existentă.
-- Stocul = SUMA jurnalului append-only (leacul durerii #1). Cost = FIFO.
-- ============================================================================

CREATE TABLE IF NOT EXISTS piese_warehouses (
  id BIGSERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'INTERNAL'
);
CREATE TABLE IF NOT EXISTS piese_part_groups (
  id BIGSERIAL PRIMARY KEY, name_ro TEXT NOT NULL, name_ru TEXT,
  markup_pct REAL NOT NULL DEFAULT 0, norm_km INT
);
CREATE TABLE IF NOT EXISTS piese_parts (
  id BIGSERIAL PRIMARY KEY, group_id BIGINT NOT NULL REFERENCES piese_part_groups(id),
  name_long TEXT NOT NULL, manufacturer TEXT, model TEXT, article_code TEXT, oem_code TEXT,
  barcode TEXT UNIQUE, unit TEXT NOT NULL DEFAULT 'buc', is_for_sale BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS piese_part_locations (
  id BIGSERIAL PRIMARY KEY, part_id BIGINT NOT NULL REFERENCES piese_parts(id),
  warehouse_id BIGINT NOT NULL REFERENCES piese_warehouses(id),
  location_label TEXT NOT NULL, min_qty REAL NOT NULL DEFAULT 0,
  UNIQUE(part_id, warehouse_id)
);
CREATE TABLE IF NOT EXISTS piese_vehicles (
  id BIGSERIAL PRIMARY KEY, plate TEXT UNIQUE NOT NULL, model TEXT,
  km_current INT NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS piese_mechanics ( id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS piese_suppliers ( id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, idno TEXT, contact TEXT );
CREATE TABLE IF NOT EXISTS piese_clients ( id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, idno TEXT, bank TEXT, address TEXT );
CREATE TABLE IF NOT EXISTS piese_breakdown_reasons ( id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT );

CREATE TABLE IF NOT EXISTS piese_stock_documents (
  id BIGSERIAL PRIMARY KEY, doc_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT',
  warehouse_id BIGINT REFERENCES piese_warehouses(id), to_warehouse_id BIGINT REFERENCES piese_warehouses(id),
  supplier_id BIGINT REFERENCES piese_suppliers(id), client_id BIGINT REFERENCES piese_clients(id),
  vehicle_id BIGINT REFERENCES piese_vehicles(id), mechanic_id BIGINT REFERENCES piese_mechanics(id),
  breakdown_reason_id BIGINT REFERENCES piese_breakdown_reasons(id),
  note TEXT, invoice_series TEXT, invoice_number TEXT, efactura_status TEXT,
  created_by BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), confirmed_by BIGINT, confirmed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS piese_stock_document_lines (
  id BIGSERIAL PRIMARY KEY, document_id BIGINT NOT NULL REFERENCES piese_stock_documents(id),
  part_id BIGINT NOT NULL REFERENCES piese_parts(id), qty REAL NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0, unit_price REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS piese_stock_movements (
  id BIGSERIAL PRIMARY KEY, part_id BIGINT NOT NULL REFERENCES piese_parts(id),
  warehouse_id BIGINT NOT NULL REFERENCES piese_warehouses(id), movement_type TEXT NOT NULL,
  qty_delta REAL NOT NULL, unit_cost REAL NOT NULL DEFAULT 0,
  document_id BIGINT REFERENCES piese_stock_documents(id), line_id BIGINT REFERENCES piese_stock_document_lines(id),
  storno_of BIGINT REFERENCES piese_stock_movements(id), vehicle_id BIGINT REFERENCES piese_vehicles(id),
  odometer_km INT, created_by BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS piese_fifo_alloc (
  id BIGSERIAL PRIMARY KEY, issue_movement_id BIGINT NOT NULL REFERENCES piese_stock_movements(id),
  receipt_movement_id BIGINT NOT NULL REFERENCES piese_stock_movements(id), qty REAL NOT NULL, unit_cost REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS piese_audit_log (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT, action TEXT NOT NULL, entity TEXT, entity_id BIGINT,
  detail TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pmov_part_wh ON piese_stock_movements(part_id, warehouse_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pmov_vehicle ON piese_stock_movements(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_pmov_created ON piese_stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_pfifo_receipt ON piese_fifo_alloc(receipt_movement_id);
CREATE INDEX IF NOT EXISTS idx_ploc_part ON piese_part_locations(part_id);

-- Imuabilitate: jurnalul nu se editează/șterge (doar storno = insert nou)
CREATE OR REPLACE FUNCTION piese_mov_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'piese_stock_movements este append-only: foloseste storno'; END $$;
DROP TRIGGER IF EXISTS trg_pmov_immutable ON piese_stock_movements;
CREATE TRIGGER trg_pmov_immutable BEFORE UPDATE OR DELETE ON piese_stock_movements
  FOR EACH ROW EXECUTE FUNCTION piese_mov_immutable();

-- Stoc curent (остатки) + valoare FIFO rămasă
CREATE OR REPLACE VIEW piese_current_stock AS
SELECT p.id AS part_id, w.id AS warehouse_id,
  COALESCE((SELECT SUM(qty_delta) FROM piese_stock_movements m WHERE m.part_id=p.id AND m.warehouse_id=w.id),0) AS qty,
  COALESCE((SELECT SUM((r.qty_delta - COALESCE((SELECT SUM(a.qty) FROM piese_fifo_alloc a WHERE a.receipt_movement_id=r.id),0)) * r.unit_cost)
            FROM piese_stock_movements r WHERE r.part_id=p.id AND r.warehouse_id=w.id
              AND r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS')),0) AS value
FROM piese_parts p CROSS JOIN piese_warehouses w WHERE p.active = true;

CREATE OR REPLACE FUNCTION piese_total_stock_value() RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM((r.qty_delta - COALESCE((SELECT SUM(a.qty) FROM piese_fifo_alloc a WHERE a.receipt_movement_id=r.id),0)) * r.unit_cost),0)
  FROM piese_stock_movements r WHERE r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS');
$$;

-- Recepție (prihod): lines = [{part_id, qty, unit_cost}]
CREATE OR REPLACE FUNCTION piese_create_receipt(p_wh bigint, p_supplier bigint, p_series text, p_number text, p_lines jsonb, p_user bigint)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_doc bigint; v_line bigint; ln jsonb;
BEGIN
  INSERT INTO piese_stock_documents(doc_type,status,warehouse_id,supplier_id,invoice_series,invoice_number,created_by,confirmed_by,confirmed_at)
    VALUES('RECEIPT','CONFIRMED',p_wh,p_supplier,p_series,p_number,p_user,p_user,now()) RETURNING id INTO v_doc;
  FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO piese_stock_document_lines(document_id,part_id,qty,unit_cost)
      VALUES(v_doc,(ln->>'part_id')::bigint, abs((ln->>'qty')::numeric), (ln->>'unit_cost')::numeric) RETURNING id INTO v_line;
    INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,created_by)
      VALUES((ln->>'part_id')::bigint, p_wh, 'RECEIPT', abs((ln->>'qty')::numeric), (ln->>'unit_cost')::numeric, v_doc, v_line, p_user);
  END LOOP;
  INSERT INTO piese_audit_log(user_id,action,entity,entity_id,detail) VALUES(p_user,'CREATE','receipt',v_doc,'Prihod');
  RETURN v_doc;
END $$;

-- Eliberare (rashod) cu FIFO; km din piese_vehicles (GPS). lines = [{part_id, qty}]
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

-- Alertă pe loc la rashod (norma de km / schimbată prea des)
CREATE OR REPLACE FUNCTION piese_issue_alert(p_vehicle bigint, p_part bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v_grp bigint; v_norm int; v_name text; v_km int; last_at timestamptz; last_odo int;
  msgs jsonb := '[]'::jsonb; lvl text := 'ok'; days int; ran int;
BEGIN
  SELECT p.group_id, g.norm_km, g.name_ro INTO v_grp, v_norm, v_name
    FROM piese_parts p JOIN piese_part_groups g ON g.id=p.group_id WHERE p.id=p_part;
  IF v_grp IS NULL THEN RETURN jsonb_build_object('level','ok','messages','[]'::jsonb); END IF;
  SELECT km_current INTO v_km FROM piese_vehicles WHERE id=p_vehicle;
  SELECT m.created_at, m.odometer_km INTO last_at, last_odo
    FROM piese_stock_movements m JOIN piese_parts p ON p.id=m.part_id
    WHERE m.vehicle_id=p_vehicle AND p.group_id=v_grp AND m.movement_type='ISSUE'
    ORDER BY m.created_at DESC, m.id DESC LIMIT 1;
  IF last_at IS NULL THEN
    RETURN jsonb_build_object('level','info','messages', jsonb_build_array(format('Prima montare „%s” pe această mașină.', v_name)));
  END IF;
  days := EXTRACT(DAY FROM (now()-last_at))::int;
  IF days <= 3 THEN lvl:='warn'; msgs := msgs || to_jsonb(format('Aceeași piesă „%s” a fost pusă acum %s zile pe această mașină!', v_name, days));
  ELSE msgs := msgs || to_jsonb(format('Ultima „%s” montată acum %s zile.', v_name, days)); END IF;
  IF v_norm IS NOT NULL AND last_odo IS NOT NULL AND v_km IS NOT NULL THEN
    ran := v_km - last_odo;
    IF ran < v_norm THEN lvl:='warn'; msgs := msgs || to_jsonb(format('Sub normă: a rezistat %s km din %s km.', ran, v_norm));
    ELSE msgs := msgs || to_jsonb(format('A făcut norma: %s km (normă %s km).', ran, v_norm)); END IF;
  END IF;
  RETURN jsonb_build_object('level',lvl,'messages',msgs);
END $$;
