-- 403: Asamblarea devine un PROCES, nu un act instantaneu. Plus „ce e acum în lucru".
--
-- Eduard (09.10): «Мотор не собирается за один день, здесь должна быть возможность добавлять позиции.
-- Документ должен записываться но не проводиться до окончания ремонта».
--
-- Întrebarea de fond — pusă Marianei, fiindcă de ea depinde tot modelul: când omul ia piesa de pe raft și
-- o pune în motor, piesa a ieșit din depozit sau e încă a depozitului? Răspunsul: «piesele nu rămân în
-- magazin». Asta simplifică totul și face modelul onest:
--
--   Componenta IESE din stoc ÎN MOMENTUL în care e adăugată pe document. Acolo chiar nu mai e.
--   Produsul APARE abia la închidere, cu costul componentelor plus manopera.
--   Între cele două, valoarea stă „în lucru" — nici în depozit, nici în produs.
--
-- Varianta cu rezervare (piesa rămâne pe stoc dar „blocată") ar fi fost o minciună confortabilă: la un
-- inventar fizic nu s-ar fi găsit, iar diferența ar fi apărut ca lipsă inexplicabilă.
--
-- CE APĂRĂ ASTA, din perspectiva conducerii: fereastra în care marfa e luată dar nu e nicăieri în
-- evidență dispare. În orice clipă, suma „în lucru" e vizibilă și are un document în spate, cu cine și
-- de când. Un document rămas deschis prea mult se vede, nu se pierde.

ALTER TABLE piese_stock_documents ADD COLUMN IF NOT EXISTS inchis_la timestamptz;
COMMENT ON COLUMN piese_stock_documents.inchis_la IS 'Asamblare: când s-a închis documentul și a apărut produsul. Cât e NULL, componentele sunt consumate dar produsul încă nu există — valoarea e „în lucru".';

-- ── Deschiderea ──
CREATE OR REPLACE FUNCTION piese_asamblare_deschide(
  p_wh_sursa bigint, p_wh_dest bigint, p_produs bigint, p_produs_qty numeric,
  p_mechanic bigint, p_note text, p_user bigint, p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE v_doc bigint;
BEGIN
  IF p_wh_sursa IS NULL OR p_wh_dest IS NULL THEN RAISE EXCEPTION 'BAD_WAREHOUSE'; END IF;
  IF p_produs IS NULL THEN RAISE EXCEPTION 'BAD_PART'; END IF;
  IF NOT piese_qty_ok(p_produs_qty) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
  PERFORM 1 FROM piese_parts WHERE id = p_produs AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;

  INSERT INTO piese_stock_documents(doc_type,status,warehouse_id,to_warehouse_id,mechanic_id,
                                    produs_part_id,produs_qty,manopera,note,
                                    created_by,created_by_admin)
  VALUES('ASSEMBLY','DRAFT',p_wh_sursa,p_wh_dest,p_mechanic,p_produs,p_produs_qty,0,
         NULLIF(btrim(COALESCE(p_note,'')),''),p_user,p_admin)
  RETURNING id INTO v_doc;

  INSERT INTO piese_audit_log(user_id,admin_id,actor_label,action,entity,entity_id,detail)
  VALUES(p_user,p_admin,p_actor,'OPEN','assembly',v_doc,'Asamblare deschisă');
  RETURN v_doc;
END $fn$;

-- ── Adăugarea unei componente: iese din stoc ACUM ──
--
-- `p_peste_stoc` permite minusul, cerut explicit («сохранялось с минусом»). Nu e o slăbire tăcută a
-- gărzii: apelantul trebuie să ceară asta, iar documentul rămâne cu urmă în jurnal. Cât timp soldul
-- inițial al magazinului nu e încărcat, fără ea nu s-ar putea lucra deloc.
CREATE OR REPLACE FUNCTION piese_asamblare_adauga(
  p_doc bigint, p_part bigint, p_qty numeric, p_peste_stoc boolean DEFAULT false,
  p_user bigint DEFAULT NULL, p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE d record; v_qty numeric; v_need numeric; v_take numeric; v_total numeric := 0; v_unit numeric;
        v_line bigint; v_mov bigint; lyr record; alloc jsonb := '[]'::jsonb; a jsonb; v_lipsa numeric := 0;
BEGIN
  SELECT * INTO d FROM piese_stock_documents WHERE id = p_doc AND doc_type = 'ASSEMBLY' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_DOC'; END IF;
  IF d.status <> 'DRAFT' THEN RAISE EXCEPTION 'DOC_INCHIS'; END IF;
  v_qty := abs(COALESCE(p_qty, 0));
  IF NOT piese_qty_ok(v_qty) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
  IF p_part = d.produs_part_id THEN RAISE EXCEPTION 'PRODUS_IN_COMPONENTE'; END IF;
  PERFORM 1 FROM piese_parts WHERE id = p_part FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;

  v_need := v_qty;
  FOR lyr IN
    SELECT r.id, r.unit_cost,
      (r.qty_delta - COALESCE((SELECT SUM(x.qty) FROM piese_fifo_alloc x WHERE x.receipt_movement_id=r.id),0)) AS remaining
    FROM piese_stock_movements r
    WHERE r.part_id=p_part AND r.warehouse_id=d.warehouse_id
      AND r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS','ASSEMBLY_IN')
    ORDER BY r.created_at ASC, r.id ASC
  LOOP
    EXIT WHEN v_need <= 0.0000001;
    IF lyr.remaining <= 0 THEN CONTINUE; END IF;
    v_take := LEAST(lyr.remaining, v_need);
    alloc := alloc || jsonb_build_object('rid',lyr.id,'qty',v_take,'cost',lyr.unit_cost);
    v_total := v_total + v_take*lyr.unit_cost; v_need := v_need - v_take;
  END LOOP;

  v_lipsa := GREATEST(v_need, 0);
  IF v_lipsa > 0.0000001 AND NOT COALESCE(p_peste_stoc, false) THEN
    RAISE EXCEPTION 'SHORTAGE' USING DETAIL = format('Lipsesc %s bucăți din piesa #%s', v_lipsa, p_part);
  END IF;

  v_unit := CASE WHEN v_qty > 0 THEN v_total / v_qty ELSE 0 END;
  INSERT INTO piese_stock_document_lines(document_id,part_id,qty,unit_cost)
    VALUES(p_doc,p_part,v_qty,v_unit) RETURNING id INTO v_line;
  INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,created_by)
    VALUES(p_part,d.warehouse_id,'ASSEMBLY_OUT',-v_qty,v_unit,p_doc,v_line,p_user) RETURNING id INTO v_mov;
  FOR a IN SELECT * FROM jsonb_array_elements(alloc) LOOP
    INSERT INTO piese_fifo_alloc(issue_movement_id,receipt_movement_id,qty,unit_cost)
      VALUES(v_mov,(a->>'rid')::bigint,(a->>'qty')::numeric,(a->>'cost')::numeric);
  END LOOP;

  INSERT INTO piese_audit_log(user_id,admin_id,actor_label,action,entity,entity_id,detail)
  VALUES(p_user,p_admin,p_actor,'ADD_LINE','assembly',p_doc,
         format('Componentă #%s × %s, cost %s lei%s', p_part, v_qty, round(v_total,2),
                CASE WHEN v_lipsa > 0.0000001 THEN format(' — PESTE STOC, lipseau %s', v_lipsa) ELSE '' END));

  RETURN jsonb_build_object('line_id', v_line, 'cost', round(v_total,2), 'lipsa', round(v_lipsa,3));
END $fn$;

-- ── Închiderea: apare produsul ──
CREATE OR REPLACE FUNCTION piese_asamblare_inchide(
  p_doc bigint, p_manopera numeric DEFAULT 0,
  p_user bigint DEFAULT NULL, p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE d record; v_cost numeric; v_man numeric; v_unit numeric; v_linii int;
BEGIN
  SELECT * INTO d FROM piese_stock_documents WHERE id = p_doc AND doc_type='ASSEMBLY' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_DOC'; END IF;
  IF d.status <> 'DRAFT' THEN RAISE EXCEPTION 'DOC_INCHIS'; END IF;
  v_man := COALESCE(p_manopera, 0);
  IF NOT piese_cost_ok(v_man) THEN RAISE EXCEPTION 'BAD_COST'; END IF;

  SELECT COALESCE(SUM(l.qty * l.unit_cost),0), count(*) INTO v_cost, v_linii
    FROM piese_stock_document_lines l WHERE l.document_id = p_doc;
  IF v_linii = 0 THEN RAISE EXCEPTION 'NO_LINES'; END IF;

  v_unit := (v_cost + v_man) / d.produs_qty;
  INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,created_by)
    VALUES(d.produs_part_id,d.to_warehouse_id,'ASSEMBLY_IN',d.produs_qty,v_unit,p_doc,p_user);

  UPDATE piese_stock_documents
     SET status='CONFIRMED', manopera=v_man, inchis_la=now(), confirmed_by=p_user, confirmed_at=now()
   WHERE id = p_doc;

  INSERT INTO piese_audit_log(user_id,admin_id,actor_label,action,entity,entity_id,detail)
  VALUES(p_user,p_admin,p_actor,'CLOSE','assembly',p_doc,
         format('Asamblare închisă: %s componente, %s lei + manoperă %s = %s lei',
                v_linii, round(v_cost,2), round(v_man,2), round(v_cost+v_man,2)));

  RETURN jsonb_build_object('doc_id',p_doc,'cost_componente',round(v_cost,2),'manopera',round(v_man,2),
                            'cost_total',round(v_cost+v_man,2),'cost_unitar',round(v_unit,4));
END $fn$;

-- ── Anularea: componentele se întorc în depozit ──
-- Mișcările sunt append-only, deci întoarcerea se face prin mișcări NOI, de semn contrar, la costul la
-- care au ieșit. Nimic nu se șterge; se vede și ieșirea, și revenirea.
CREATE OR REPLACE FUNCTION piese_asamblare_anuleaza(
  p_doc bigint, p_user bigint DEFAULT NULL, p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE d record; l record; v_n int := 0;
BEGIN
  SELECT * INTO d FROM piese_stock_documents WHERE id = p_doc AND doc_type='ASSEMBLY' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_DOC'; END IF;
  IF d.status <> 'DRAFT' THEN RAISE EXCEPTION 'DOC_INCHIS'; END IF;
  FOR l IN SELECT * FROM piese_stock_document_lines WHERE document_id = p_doc LOOP
    INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,created_by)
      VALUES(l.part_id,d.warehouse_id,'ASSEMBLY_IN',l.qty,l.unit_cost,p_doc,p_user);
    v_n := v_n + 1;
  END LOOP;
  UPDATE piese_stock_documents SET status='CANCELLED', inchis_la=now() WHERE id = p_doc;
  INSERT INTO piese_audit_log(user_id,admin_id,actor_label,action,entity,entity_id,detail)
  VALUES(p_user,p_admin,p_actor,'CANCEL','assembly',p_doc,
         format('Asamblare anulată, %s componente întoarse în depozit', v_n));
  RETURN jsonb_build_object('doc_id',p_doc,'intoarse',v_n);
END $fn$;

-- ── „Ce e acum în lucru" ──
-- Cerut de Mariana: o fereastră în care se vede ce piese sunt în lucru. Suma de aici e valoarea care a
-- ieșit din depozite și încă n-a devenit produs — singurul loc unde marfa nu e nici pe raft, nici
-- montată. `zile_deschis` e coloana pe care se uită conducerea: un document uitat deschis se vede.
CREATE OR REPLACE VIEW piese_asamblari_in_lucru AS
SELECT d.id AS doc_id,
       d.created_at,
       EXTRACT(DAY FROM (now() - d.created_at))::int AS zile_deschis,
       d.warehouse_id, w1.name AS din_depozit,
       d.to_warehouse_id, w2.name AS in_depozit,
       d.produs_part_id,
       COALESCE(NULLIF(btrim(p.name_ro),''), p.name_long) AS produs,
       d.produs_qty, d.note, m.name AS lacatus,
       (SELECT count(*) FROM piese_stock_document_lines l WHERE l.document_id = d.id) AS componente,
       COALESCE((SELECT round(SUM(l.qty * l.unit_cost), 2) FROM piese_stock_document_lines l
                  WHERE l.document_id = d.id), 0) AS valoare_in_lucru
  FROM piese_stock_documents d
  LEFT JOIN piese_warehouses w1 ON w1.id = d.warehouse_id
  LEFT JOIN piese_warehouses w2 ON w2.id = d.to_warehouse_id
  LEFT JOIN piese_parts p ON p.id = d.produs_part_id
  LEFT JOIN piese_mechanics m ON m.id = d.mechanic_id
 WHERE d.doc_type = 'ASSEMBLY' AND d.status = 'DRAFT'
 ORDER BY d.created_at;

REVOKE ALL ON piese_asamblari_in_lucru FROM PUBLIC, anon, authenticated;
GRANT SELECT ON piese_asamblari_in_lucru TO service_role;

REVOKE ALL ON FUNCTION piese_asamblare_deschide(bigint,bigint,bigint,numeric,bigint,text,bigint,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_asamblare_deschide(bigint,bigint,bigint,numeric,bigint,text,bigint,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION piese_asamblare_adauga(bigint,bigint,numeric,boolean,bigint,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_asamblare_adauga(bigint,bigint,numeric,boolean,bigint,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION piese_asamblare_inchide(bigint,numeric,bigint,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_asamblare_inchide(bigint,numeric,bigint,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION piese_asamblare_anuleaza(bigint,bigint,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_asamblare_anuleaza(bigint,bigint,uuid,text) TO service_role;
