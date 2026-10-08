-- 400: Asamblare — din mai multe piese plus manoperă iese una singură («Укомплектация»).
--
-- Cerut de Eduard (08.10), cu exemplul Marianei: se repară un motor — piesele noi se iau din magazin,
-- motorul reparat se pune în depozitul Briceni și de acolo se montează pe un autobuz. Nu se vinde.
--
-- Azi operația nu există. S-ar face ca eliberare plus recepție, iar legătura dintre ele — și costul real
-- al motorului — s-ar pierde: recepția ar cere un cost scris de mână, adică o cifră inventată peste niște
-- costuri care sunt deja cunoscute exact.
--
-- STRUCTURA urmează documentul din 1C, ca să nu inventăm un al doilea model: produsul stă în ANTET
-- («Приходуемый товар»), componentele pe LINII, iar manopera e o sumă pe document — nu o linie de marfă,
-- fiindcă manopera n-are stoc. Depozitul de ieșire și cel de intrare pot fi diferite; în exemplul de mai
-- sus chiar sunt.
--
-- INVARIANTUL care trebuie să țină: valoarea componentelor consumate + manopera = valoarea produsului
-- intrat. Valoarea nu se pierde și nu apare din nimic. De aici și costul unitar al produsului:
-- (suma FIFO a componentelor + manoperă) / cantitatea produsă.
ALTER TABLE piese_stock_documents ADD COLUMN IF NOT EXISTS produs_part_id bigint REFERENCES piese_parts(id);
ALTER TABLE piese_stock_documents ADD COLUMN IF NOT EXISTS produs_qty numeric(14,3);
ALTER TABLE piese_stock_documents ADD COLUMN IF NOT EXISTS manopera numeric(14,2);
ALTER TABLE piese_stock_documents
  ADD CONSTRAINT piese_doc_manopera_ck CHECK (manopera IS NULL OR manopera >= 0) NOT VALID;
ALTER TABLE piese_stock_documents VALIDATE CONSTRAINT piese_doc_manopera_ck;

COMMENT ON COLUMN piese_stock_documents.produs_part_id IS 'Asamblare: piesa care REZULTĂ. Componentele sunt liniile documentului.';
COMMENT ON COLUMN piese_stock_documents.manopera IS 'Asamblare: manopera, în lei. Intră în costul produsului, nu în stoc — nu e marfă.';

-- Cele două tipuri de mișcare noi. `ASSEMBLY_IN` trebuie recunoscut ca SURSĂ DE VALOARE peste tot unde se
-- consumă FIFO, altfel produsul ar avea bucăți în depozit și cost zero, iar la montare n-ar avea din ce
-- strat să se consume. Lista aceea trăiește în unsprezece locuri (zece funcții + vederea
-- `piese_current_stock`) — toate sunt actualizate în migr. 401, cu o verificare de control după.
CREATE OR REPLACE FUNCTION piese_asamblare_creaza(
  p_wh_sursa bigint, p_wh_dest bigint, p_produs bigint, p_produs_qty numeric,
  p_mechanic bigint, p_manopera numeric, p_note text, p_lines jsonb,
  p_user bigint, p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE v_doc bigint; v_line bigint; v_mov bigint; ln jsonb;
  v_part bigint; v_qty numeric; v_need numeric; v_take numeric; v_total numeric; v_unit numeric;
  v_cost_total numeric := 0; v_manopera numeric; v_unit_produs numeric;
  lyr record; alloc jsonb; a jsonb; lipsuri jsonb := '[]'::jsonb;
BEGIN
  IF p_wh_sursa IS NULL OR p_wh_dest IS NULL THEN RAISE EXCEPTION 'BAD_WAREHOUSE'; END IF;
  IF p_produs IS NULL THEN RAISE EXCEPTION 'BAD_PART'; END IF;
  IF NOT piese_qty_ok(p_produs_qty) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
  v_manopera := COALESCE(p_manopera, 0);
  IF NOT piese_cost_ok(v_manopera) THEN RAISE EXCEPTION 'BAD_COST'; END IF;
  IF jsonb_array_length(COALESCE(p_lines, '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'NO_LINES'; END IF;

  PERFORM 1 FROM piese_parts WHERE id = p_produs AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;

  INSERT INTO piese_stock_documents(doc_type,status,warehouse_id,to_warehouse_id,mechanic_id,
                                    produs_part_id,produs_qty,manopera,note,
                                    created_by,created_by_admin,confirmed_by,confirmed_at)
  VALUES('ASSEMBLY','CONFIRMED',p_wh_sursa,p_wh_dest,p_mechanic,
         p_produs,p_produs_qty,v_manopera,NULLIF(btrim(COALESCE(p_note,'')),''),
         p_user,p_admin,p_user,now())
  RETURNING id INTO v_doc;

  -- Componentele: ies din depozitul-sursă pe FIFO, exact ca la o eliberare.
  FOR ln IN SELECT e FROM jsonb_array_elements(p_lines) e ORDER BY (e->>'part_id')::bigint LOOP
    v_part := (ln->>'part_id')::bigint; v_qty := abs((ln->>'qty')::numeric);
    IF v_part IS NULL THEN RAISE EXCEPTION 'BAD_PART'; END IF;
    IF NOT piese_qty_ok(v_qty) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
    -- O piesă nu se poate consuma pe sine: ar produce un ciclu de cost imposibil de explicat.
    IF v_part = p_produs THEN RAISE EXCEPTION 'PRODUS_IN_COMPONENTE'; END IF;
    PERFORM 1 FROM piese_parts WHERE id = v_part FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;

    v_need := v_qty; v_total := 0; alloc := '[]'::jsonb;
    FOR lyr IN
      SELECT r.id, r.unit_cost,
        (r.qty_delta - COALESCE((SELECT SUM(x.qty) FROM piese_fifo_alloc x WHERE x.receipt_movement_id=r.id),0)) AS remaining
      FROM piese_stock_movements r
      WHERE r.part_id=v_part AND r.warehouse_id=p_wh_sursa
        AND r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS','ASSEMBLY_IN')
      ORDER BY r.created_at ASC, r.id ASC
    LOOP
      EXIT WHEN v_need <= 0.0000001;
      IF lyr.remaining <= 0 THEN CONTINUE; END IF;
      v_take := LEAST(lyr.remaining, v_need);
      alloc := alloc || jsonb_build_object('rid',lyr.id,'qty',v_take,'cost',lyr.unit_cost);
      v_total := v_total + v_take*lyr.unit_cost; v_need := v_need - v_take;
    END LOOP;

    -- Fără „peste stoc" aici, spre deosebire de eliberare: nu poți asambla din piese pe care nu le ai în
    -- mână. O asamblare peste stoc ar inventa valoare, nu doar ar încurca o cantitate.
    IF v_need > 0.0000001 THEN
      lipsuri := lipsuri || to_jsonb(format('Stoc insuficient (#%s): lipsesc %s', v_part, v_need));
    END IF;

    v_unit := CASE WHEN v_qty>0 THEN v_total/v_qty ELSE 0 END;
    INSERT INTO piese_stock_document_lines(document_id,part_id,qty,unit_cost)
      VALUES(v_doc,v_part,v_qty,v_unit) RETURNING id INTO v_line;
    INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,created_by)
      VALUES(v_part,p_wh_sursa,'ASSEMBLY_OUT',-v_qty,v_unit,v_doc,v_line,p_user) RETURNING id INTO v_mov;
    FOR a IN SELECT * FROM jsonb_array_elements(alloc) LOOP
      INSERT INTO piese_fifo_alloc(issue_movement_id,receipt_movement_id,qty,unit_cost)
        VALUES(v_mov,(a->>'rid')::bigint,(a->>'qty')::numeric,(a->>'cost')::numeric);
    END LOOP;
    v_cost_total := v_cost_total + v_total;
  END LOOP;

  IF jsonb_array_length(lipsuri) > 0 THEN
    RAISE EXCEPTION 'SHORTAGE' USING DETAIL = lipsuri::text;
  END IF;

  -- Produsul: intră în depozitul-destinație cu costul componentelor plus manopera.
  v_unit_produs := (v_cost_total + v_manopera) / p_produs_qty;
  INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,created_by)
    VALUES(p_produs,p_wh_dest,'ASSEMBLY_IN',p_produs_qty,v_unit_produs,v_doc,p_user);

  INSERT INTO piese_audit_log(user_id,admin_id,actor_label,action,entity,entity_id,detail)
  VALUES(p_user,p_admin,p_actor,'CREATE','assembly',v_doc,
         format('Asamblare: %s buc din %s componente, cost %s lei (din care manoperă %s)',
                p_produs_qty, jsonb_array_length(p_lines), round(v_cost_total + v_manopera, 2), round(v_manopera, 2)));

  RETURN jsonb_build_object('doc_id', v_doc, 'cost_componente', round(v_cost_total, 2),
                            'manopera', round(v_manopera, 2),
                            'cost_total', round(v_cost_total + v_manopera, 2),
                            'cost_unitar', round(v_unit_produs, 4));
END $fn$;

REVOKE ALL ON FUNCTION piese_asamblare_creaza(bigint,bigint,bigint,numeric,bigint,numeric,text,jsonb,bigint,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_asamblare_creaza(bigint,bigint,bigint,numeric,bigint,numeric,text,jsonb,bigint,uuid,text) TO service_role;

-- `ASSEMBLY_IN` trebuie recunoscut ca SURSĂ DE VALOARE peste tot unde se consumă FIFO. Lista aceea e
-- scrisă de mână în zece funcții plus vederea `piese_current_stock` — exact locul unde se uită una, iar
-- efectul nu e o eroare ci un număr tăcut greșit: un produs care nu se poate elibera, sau o valoare de
-- stoc care nu se mai potrivește cu suma documentelor.
--
-- De aceea modificarea e GENERATĂ, nu scrisă de unsprezece ori: bucla ia fiecare funcție care conține
-- lista și o recreează cu tipul nou adăugat. Dacă mâine apare a douăsprezecea, același bloc o prinde.
DO $$
DECLARE r record; v_n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname LIKE 'piese%'
       AND pg_get_functiondef(p.oid) LIKE '%''ADJUST_PLUS''%'
       AND pg_get_functiondef(p.oid) NOT LIKE '%ASSEMBLY_IN%'
  LOOP
    EXECUTE replace(pg_get_functiondef(r.oid), '''ADJUST_PLUS''', '''ADJUST_PLUS'',''ASSEMBLY_IN''');
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'funcții actualizate cu ASSEMBLY_IN: %', v_n;
END $$;

CREATE OR REPLACE VIEW piese_current_stock AS
 SELECT p.id AS part_id,
    w.id AS warehouse_id,
    COALESCE((( SELECT sum(m.qty_delta) FROM piese_stock_movements m
                 WHERE m.part_id = p.id AND m.warehouse_id = w.id))::real, 0::real) AS qty,
    COALESCE(( SELECT sum((r.qty_delta::double precision - COALESCE((( SELECT sum(a.qty)
                   FROM piese_fifo_alloc a WHERE a.receipt_movement_id = r.id))::real, 0::real)) * r.unit_cost::double precision)
           FROM piese_stock_movements r
          WHERE r.part_id = p.id AND r.warehouse_id = w.id
            AND (r.movement_type = ANY (ARRAY['RECEIPT'::text, 'TRANSFER_IN'::text, 'DONOR_IN'::text, 'ADJUST_PLUS'::text, 'ASSEMBLY_IN'::text]))), 0::real::double precision) AS value
   FROM piese_parts p
     CROSS JOIN piese_warehouses w
  WHERE p.active = true;

-- Probat pe o asamblare reală, într-o tranzacție anulată: două componente din magazin + 500 lei manoperă,
-- produsul în Briceni. Valoarea totală a stocului a crescut cu EXACT 500,00 — adică doar manopera; restul
-- s-a mutat din componente în produs. Produsul are strat FIFO disponibil (2 158,14 lei), deci se poate
-- monta pe autobuz. Invariantul ține.
