-- 222_piese_sale_owner.sql
-- Reține cine (care cont admin) a creat documentul — pentru „e-Factura doar pe vânzările lui".
-- Aditiv, nullable; documentele existente rămân cu NULL (invizibile vânzătorului — intenționat).
ALTER TABLE piese_stock_documents ADD COLUMN IF NOT EXISTS created_by_admin UUID REFERENCES admin_accounts(id);
CREATE INDEX IF NOT EXISTS idx_pdoc_created_by_admin ON piese_stock_documents(created_by_admin);

-- View-ul de facturi expune și vânzătorul (created_by_admin), ca să putem filtra pe el (coloană la final).
CREATE OR REPLACE VIEW piese_sale_invoices AS
SELECT d.id, d.invoice_series, d.invoice_number, d.created_at, d.efactura_status, c.name AS client_name,
  COALESCE((SELECT SUM(l.qty*l.unit_price) FROM piese_stock_document_lines l WHERE l.document_id=d.id),0) AS net,
  d.created_by_admin
FROM piese_stock_documents d LEFT JOIN piese_clients c ON c.id=d.client_id
WHERE d.doc_type='SALE' AND d.status='CONFIRMED' ORDER BY d.created_at DESC, d.id DESC;

-- Vânzarea setează created_by_admin ATOMIC, în aceeași tranzacție (fără UPDATE separat = fără fereastră de orfanare).
-- Corp IDENTIC cu piese_create_sale din 202_piese_module_phase2.sql; SINGURELE diferențe:
--   + parametrul p_created_by uuid (DEFAULT NULL) și coloana created_by_admin în INSERT-ul documentului.
DROP FUNCTION IF EXISTS piese_create_sale(bigint, bigint, text, text, jsonb, bigint);
CREATE OR REPLACE FUNCTION piese_create_sale(p_wh bigint, p_client bigint, p_series text, p_number text, p_lines jsonb, p_user bigint, p_created_by uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_doc bigint; v_line bigint; v_mov bigint; ln jsonb; v_part bigint; v_qty numeric; v_price numeric; v_need numeric; v_take numeric; v_total numeric; v_unit numeric; v_rev numeric:=0; v_cost numeric:=0; lyr record; alloc jsonb; a jsonb;
BEGIN
  INSERT INTO piese_stock_documents(doc_type,status,warehouse_id,client_id,invoice_series,invoice_number,efactura_status,created_by,created_by_admin,confirmed_by,confirmed_at) VALUES('SALE','CONFIRMED',p_wh,p_client,p_series,p_number,'PENDING',p_user,p_created_by,p_user,now()) RETURNING id INTO v_doc;
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
