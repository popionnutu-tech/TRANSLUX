-- 379: Garda „nu e pe stoc" și la VÂNZARE.
--
-- Ultima cale prin care marfa ieșea din depozit fără nicio verificare. La eliberări garda există din
-- migr. 330-332, la mutări din migr. 355; la vânzări lipsea cu totul. Se putea vinde marfă inexistentă,
-- iar magazinul intra pe minus în tăcere.
--
-- Până acum n-a contat: prin modul nu s-a făcut NICIO vânzare (0 documente SALE — magazinul vindea prin
-- IntelectSoft). Contează de acum: Mariana (06.10) — «scopul este ca integral să lucrăm pe softul
-- nostru» — deci vânzarea trece la noi și devine calea principală de ieșire a mărfii.
--
-- Lipsa se măsoară ca peste tot (migr. 331): MAXIMUL dintre cât n-a găsit FIFO și cât depășește
-- registrul. Cele două diverg definitiv după prima ieșire în minus — o ieșire scurtă nu creează rânduri
-- de alocare, deci FIFO „uită" datoria, iar garda măsurată doar pe el ar tăcea pentru totdeauna.
--
-- ATENȚIE: funcția avea 9 parametri. `CREATE OR REPLACE` cu unul nou în plus NU o înlocuiește — creează
-- o supraîncărcare, iar cea veche, fără gardă, ar rămâne apelabilă. Se șterge explicit. (A treia oară:
-- vezi migr. 355 și 377.)
CREATE OR REPLACE FUNCTION piese_create_sale(
  p_wh bigint, p_client bigint, p_series text, p_number text, p_lines jsonb, p_user bigint,
  p_created_by uuid DEFAULT NULL, p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL,
  p_allow_short boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_doc bigint; v_line bigint; v_mov bigint; ln jsonb; v_part bigint; v_qty numeric; v_price numeric;
        v_need numeric; v_take numeric; v_total numeric; v_unit numeric; v_rev numeric:=0; v_cost numeric:=0;
        lyr record; alloc jsonb; a jsonb; v_ledger numeric; v_short numeric; shortages jsonb := '[]'::jsonb;
BEGIN
  INSERT INTO piese_stock_documents(doc_type,status,warehouse_id,client_id,invoice_series,invoice_number,
                                    efactura_status,created_by,created_by_admin,confirmed_by,confirmed_at)
  VALUES('SALE','CONFIRMED',p_wh,p_client,p_series,p_number,'PENDING',p_user,p_created_by,p_user,now())
  RETURNING id INTO v_doc;

  FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_part:=(ln->>'part_id')::bigint; v_qty:=abs((ln->>'qty')::numeric); v_price:=(ln->>'unit_price')::numeric;
    IF NOT piese_qty_ok(v_qty) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
    PERFORM 1 FROM piese_parts WHERE id=v_part FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;

    -- Registrul citit DIRECT din mișcări, nu din `piese_current_stock`: vederea aceea filtrează piesele
    -- inactive, iar o piesă scoasă din catalog poate avea în continuare marfă pe raft (lecția migr. 332).
    SELECT COALESCE(SUM(m.qty_delta),0)::numeric INTO v_ledger
      FROM piese_stock_movements m WHERE m.part_id=v_part AND m.warehouse_id=p_wh;

    v_need:=v_qty; v_total:=0; alloc:='[]'::jsonb;
    FOR lyr IN SELECT r.id,r.unit_cost,
                      (r.qty_delta-COALESCE((SELECT SUM(x.qty) FROM piese_fifo_alloc x
                                              WHERE x.receipt_movement_id=r.id),0)) AS remaining
      FROM piese_stock_movements r
     WHERE r.part_id=v_part AND r.warehouse_id=p_wh
       AND r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS')
     ORDER BY r.created_at,r.id LOOP
      EXIT WHEN v_need<=0.0000001; IF lyr.remaining<=0 THEN CONTINUE; END IF;
      v_take:=LEAST(lyr.remaining,v_need);
      alloc:=alloc||jsonb_build_object('rid',lyr.id,'qty',v_take,'cost',lyr.unit_cost);
      v_total:=v_total+v_take*lyr.unit_cost; v_need:=v_need-v_take;
    END LOOP;

    v_short := GREATEST(v_need, v_qty - GREATEST(COALESCE(v_ledger,0), 0));
    IF v_short > 0.0000001 THEN
      shortages := shortages || to_jsonb(format('Stoc insuficient (#%s): lipsesc %s', v_part, v_short));
    END IF;

    v_unit:=CASE WHEN v_qty>0 THEN v_total/v_qty ELSE 0 END;
    INSERT INTO piese_stock_document_lines(document_id,part_id,qty,unit_cost,unit_price)
      VALUES(v_doc,v_part,v_qty,v_unit,v_price) RETURNING id INTO v_line;
    INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,created_by)
      VALUES(v_part,p_wh,'SALE',-v_qty,v_unit,v_doc,v_line,p_user) RETURNING id INTO v_mov;
    FOR a IN SELECT * FROM jsonb_array_elements(alloc) LOOP
      INSERT INTO piese_fifo_alloc(issue_movement_id,receipt_movement_id,qty,unit_cost)
        VALUES(v_mov,(a->>'rid')::bigint,(a->>'qty')::numeric,(a->>'cost')::numeric);
    END LOOP;
    v_rev:=v_rev+v_qty*v_price; v_cost:=v_cost+v_total;
  END LOOP;

  -- Verificarea e la SFÂRȘIT, ca la eliberări: omul vede TOATE piesele care lipsesc dintr-o dată.
  -- Excepția anulează tranzacția, deci documentul scris mai sus dispare cu ea.
  IF jsonb_array_length(shortages) > 0 AND NOT COALESCE(p_allow_short, false) THEN
    RAISE EXCEPTION 'SHORTAGE' USING DETAIL = shortages::text;
  END IF;

  INSERT INTO piese_audit_log(user_id,admin_id,actor_label,action,entity,entity_id,detail)
  VALUES(p_user,p_admin,p_actor,'CREATE','sale',v_doc,
         'Vânzare' || CASE WHEN jsonb_array_length(shortages) > 0
                           THEN ' — PESTE STOC: ' || shortages::text ELSE '' END);
  RETURN jsonb_build_object('doc_id',v_doc,'total',v_rev,'cost',v_cost,'shortages', shortages);
END $$;

DROP FUNCTION IF EXISTS piese_create_sale(bigint, bigint, text, text, jsonb, bigint, uuid, uuid, text);

REVOKE ALL ON FUNCTION piese_create_sale(bigint, bigint, text, text, jsonb, bigint, uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_create_sale(bigint, bigint, text, text, jsonb, bigint, uuid, uuid, text, boolean)
  TO service_role;
