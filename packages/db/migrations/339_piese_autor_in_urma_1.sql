-- 339: Autorul în urmă — prima tranșă (vânzare, marcare SFS, revizuire cost).
--
-- Ecranul Jurnal (migr. 338) a scos la lumină că zece funcții din bază își scriu urma prin `user_id`,
-- coloana veche pentru utilizatorii Telegram, pe care aplicația o trimite mereu NULL. Rândurile acelea
-- apar cu autor „necunoscut" — și ar fi apărut așa la nesfârșit, nu doar retroactiv.
--
-- Reparația e aceeași peste tot: două argumente noi, `p_admin` (uuid-ul contului) și `p_actor` (numele
-- fotografiat la momentul faptei, ca la migr. 293), scrise în coloanele pe care le citește jurnalul.
-- Corpul funcțiilor rămâne NEATINS — se schimbă doar antetul și rândul de audit.
--
-- `DEFAULT NULL` la ambele: un apelant care nu le trimite se comportă exact ca înainte, deci tranșele
-- următoare nu depind de ordinea în care se aplică.
--
-- `DROP` înaintea fiecăreia: semnătura se schimbă, iar `CREATE OR REPLACE` ar fi lăsat vechea variantă în
-- picioare ca suprasarcină — cu grantul implicit pe care `ALTER DEFAULT PRIVILEGES` îl dă lui `anon`.

DROP FUNCTION IF EXISTS piese_create_sale(bigint, bigint, text, text, jsonb, bigint, uuid);

CREATE FUNCTION piese_create_sale(
  p_wh bigint, p_client bigint, p_series text, p_number text, p_lines jsonb, p_user bigint,
  p_created_by uuid DEFAULT NULL, p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
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
  INSERT INTO piese_audit_log(user_id,admin_id,actor_label,action,entity,entity_id,detail)
    VALUES(p_user,p_admin,p_actor,'CREATE','sale',v_doc,'Vânzare');
  RETURN jsonb_build_object('doc_id',v_doc,'total',v_rev,'cost',v_cost);
END $$;

REVOKE ALL ON FUNCTION piese_create_sale(bigint, bigint, text, text, jsonb, bigint, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_create_sale(bigint, bigint, text, text, jsonb, bigint, uuid, uuid, text) TO service_role;

DROP FUNCTION IF EXISTS piese_mark_sfs(bigint, bigint);

CREATE FUNCTION piese_mark_sfs(
  p_doc bigint, p_user bigint, p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE piese_stock_documents SET efactura_status='SENT' WHERE id=p_doc AND doc_type='SALE' AND status='CONFIRMED';
  INSERT INTO piese_audit_log(user_id,admin_id,actor_label,action,entity,entity_id,detail)
    VALUES(p_user,p_admin,p_actor,'EFACTURA','document',p_doc,'Trimisă SFS');
END $$;

REVOKE ALL ON FUNCTION piese_mark_sfs(bigint, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_mark_sfs(bigint, bigint, uuid, text) TO service_role;

DROP FUNCTION IF EXISTS piese_recost(bigint, bigint, numeric, bigint);

CREATE FUNCTION piese_recost(
  p_wh bigint, p_part bigint, p_new_cost numeric, p_user bigint,
  p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
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

  INSERT INTO piese_audit_log(user_id,admin_id,actor_label,action,entity,entity_id,detail)
    VALUES(p_user,p_admin,p_actor,'RECOST','recost',v_doc,'Revizuire cost: '||v_qty||' buc, '||round(v_old_avg,2)||' → '||round(p_new_cost,2));
  RETURN jsonb_build_object('doc_id',v_doc,'qty',v_qty,'old_avg',v_old_avg,'new_cost',p_new_cost);
END $$;

REVOKE ALL ON FUNCTION piese_recost(bigint, bigint, numeric, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_recost(bigint, bigint, numeric, bigint, uuid, text) TO service_role;
