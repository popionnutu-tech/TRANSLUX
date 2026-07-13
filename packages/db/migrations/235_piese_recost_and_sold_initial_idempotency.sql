-- 235: Piese — (M1) idempotența recepției „SOLD INIȚIAL" + (2B) revizuirea costului fără schimbarea cantității.
-- Aplicat pe prod prin Supabase MCP (execute_sql) — coordonat cu numerotarea folderului (următorul liber = 235).

-- ── M1: barieră anti-dublare a recepției de sold inițial ──────────────────────────────────────────────
-- „Inventar inițial" cu cost creează o recepție prin furnizorul fictiv „SOLD INIȚIAL" cu invoice_series='SOLD'
-- și invoice_number = o cheie de idempotență (uuid generat de client, stabilă pe retry). Indexul unic parțial
-- împiedică o a DOUA recepție cu aceeași cheie în același depozit (pană de rețea + re-click Salvează) → stocul
-- nu se dublează. Prihod-ul normal (invoice_series != 'SOLD') NU e atins. Prod verificat: 0 recepții 'SOLD'.
CREATE UNIQUE INDEX IF NOT EXISTS uq_piese_sold_initial_receipt
  ON piese_stock_documents (warehouse_id, invoice_number)
  WHERE doc_type = 'RECEIPT' AND invoice_series = 'SOLD';

-- ── 2B: revizuirea costului mediu al unei piese într-un depozit, PĂSTRÂND cantitatea ─────────────────
-- Scoate tot stocul curent la costul FIFO curent (ADJUST_MINUS, consumând straturile existente) și-l readuce
-- la costul nou (ADJUST_PLUS, un strat nou) → net cantitate 0, valoare nouă = cantitate × cost_nou, avg = cost_nou.
-- Append-only (doar INSERT-uri de mișcări), compatibil cu trigger-ul de imuabilitate. doc_type='RECOST' (TEXT liber).
CREATE OR REPLACE FUNCTION piese_recost(p_wh bigint, p_part bigint, p_new_cost numeric, p_user bigint)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_doc bigint; v_line bigint; v_mov bigint; v_qty numeric; v_need numeric; v_take numeric; v_total numeric; v_old_avg numeric;
  lyr record; alloc jsonb; a jsonb;
BEGIN
  IF p_new_cost IS NULL OR p_new_cost < 0 THEN RAISE EXCEPTION 'Costul nou trebuie să fie >= 0.'; END IF;
  PERFORM 1 FROM piese_parts WHERE id = p_part FOR UPDATE;
  SELECT COALESCE(SUM(qty_delta),0) INTO v_qty FROM piese_stock_movements WHERE part_id = p_part AND warehouse_id = p_wh;
  IF v_qty <= 0 THEN RAISE EXCEPTION 'Nu poți revizui costul unei piese fără stoc pozitiv (stoc curent = %).', v_qty; END IF;

  INSERT INTO piese_stock_documents(doc_type,status,warehouse_id,created_by,confirmed_by,confirmed_at)
    VALUES('RECOST','CONFIRMED',p_wh,p_user,p_user,now()) RETURNING id INTO v_doc;

  -- (1) ADJUST_MINUS: scoate tot stocul, consumând straturile FIFO existente (identic cu ramura din inventar).
  v_need := v_qty; v_total := 0; alloc := '[]'::jsonb;
  FOR lyr IN SELECT r.id, r.unit_cost,
      (r.qty_delta - COALESCE((SELECT SUM(x.qty) FROM piese_fifo_alloc x WHERE x.receipt_movement_id = r.id),0)) AS remaining
    FROM piese_stock_movements r
    WHERE r.part_id = p_part AND r.warehouse_id = p_wh AND r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS')
    ORDER BY r.created_at, r.id LOOP
    EXIT WHEN v_need <= 0.0000001; IF lyr.remaining <= 0 THEN CONTINUE; END IF;
    v_take := LEAST(lyr.remaining, v_need);
    alloc := alloc || jsonb_build_object('rid', lyr.id, 'qty', v_take, 'cost', lyr.unit_cost);
    v_total := v_total + v_take * lyr.unit_cost; v_need := v_need - v_take;
  END LOOP;
  v_old_avg := CASE WHEN v_qty > 0 THEN v_total / v_qty ELSE 0 END;
  INSERT INTO piese_stock_document_lines(document_id,part_id,qty,unit_cost) VALUES(v_doc,p_part,-v_qty,v_old_avg) RETURNING id INTO v_line;
  INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,created_by)
    VALUES(p_part,p_wh,'ADJUST_MINUS',-v_qty,v_old_avg,v_doc,v_line,p_user) RETURNING id INTO v_mov;
  FOR a IN SELECT * FROM jsonb_array_elements(alloc) LOOP
    INSERT INTO piese_fifo_alloc(issue_movement_id,receipt_movement_id,qty,unit_cost)
      VALUES(v_mov,(a->>'rid')::bigint,(a->>'qty')::numeric,(a->>'cost')::numeric);
  END LOOP;

  -- (2) ADJUST_PLUS: readu tot stocul la costul nou (strat nou, neconsumat → dă valoarea nouă).
  INSERT INTO piese_stock_document_lines(document_id,part_id,qty,unit_cost) VALUES(v_doc,p_part,v_qty,p_new_cost) RETURNING id INTO v_line;
  INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,created_by)
    VALUES(p_part,p_wh,'ADJUST_PLUS',v_qty,p_new_cost,v_doc,v_line,p_user);

  INSERT INTO piese_audit_log(user_id,action,entity,entity_id,detail)
    VALUES(p_user,'RECOST','recost',v_doc,'Revizuire cost: '||v_qty||' buc, '||round(v_old_avg,2)||' → '||round(p_new_cost,2));
  RETURN jsonb_build_object('doc_id',v_doc,'qty',v_qty,'old_avg',v_old_avg,'new_cost',p_new_cost);
END $$;
