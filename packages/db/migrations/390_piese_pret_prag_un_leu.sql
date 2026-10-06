-- 390: Prețul nu mai poate cădea la zero din rotunjire. Prag: 1 leu.
--
-- Regula „la vânzare doar cifre întregi" (migr. 382) avea o gaură la capătul de jos. `round(cost × adaos, 0)`
-- dă 0 pentru orice piesă mai ieftină de 50 de bani, iar sămânța de preț sare peste prețurile zero
-- (migr. 367: `WHERE s.price > 0`) — așa că piesa ajunge în magazin cu „— lei", iar vânzătorul trebuie
-- să întrebe prețul.
--
-- Astăzi păţeşte una: `Мяч`, cost 0,3667 lei, adaos 25% din grupă → 0,4583 → rotunjit 0. Trei bucăți în
-- magazin, fără preț pe ecran. Una singură, dar mecanismul se redeschide la fiecare piesă ieftină.
--
-- Zero rămâne zero DOAR când nu știm costul. O piesă fără nicio intrare cu cost nu primește 1 leu —
-- primește NULL, adică „n-avem de unde ști", care e adevărul și se vede ca „— lei". Diferența contează:
-- 1 leu pe o piesă necunoscută ar fi o minciună care se poate vinde.
CREATE OR REPLACE FUNCTION piese_pret_candidat(p_part bigint, p_cost numeric)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $fn$
  SELECT CASE
           WHEN COALESCE(p_cost, 0) <= 0 THEN NULL
           ELSE GREATEST(round(p_cost * (1 + COALESCE(p.markup_pct, g.markup_pct, 0)::numeric / 100.0), 0), 1)
         END
    -- LEFT JOIN, nu JOIN: `group_id` e nullable, iar cu INNER JOIN o piesă fără grupă nu întorcea 0 —
    -- nu întorcea NICIUN rând, deci NULL tăcut, deci „— lei" fără explicație. Azi n-avem nicio piesă
    -- activă fără grupă, dar nimic nu împiedică prima.
    FROM piese_parts p LEFT JOIN piese_part_groups g ON g.id = p.group_id
   WHERE p.id = p_part;
$fn$;

-- Aceeași gaură pe drumul vânzării: `piese_cost_ok` acceptă 0, deci un preț tastat de 0,40 lei trecea
-- prin `round(…, 0)` în 0 și marfa pleca gratis, cu 0 lei pe cec.
--
-- Zero tastat INTENȚIONAT rămâne permis — se mai dă o piesă fără bani, iar asta e decizia omului, scrisă
-- ca atare în document. Dar un preț POZITIV nu mai are voie să devină zero prin rotunjire: urcă la 1 leu.
-- Verificarea se face pe valoarea TASTATĂ, înaintea rotunjirii, ca un NaN sau un minus să fie prins acolo
-- unde se vede, nu după ce rotunjirea l-a mascat.
--
-- Semnătura e identică cu cea din migr. 380-382, cuvânt cu cuvânt. `CREATE OR REPLACE` cu un singur
-- parametru schimbat ar fi creat o SUPRAÎNCĂRCARE, nu o înlocuire, iar varianta veche — fără prag — ar fi
-- rămas apelabilă. Capcana asta ne-a prins deja de trei ori (migr. 355, 377, 379).
CREATE OR REPLACE FUNCTION public.piese_create_sale(p_wh bigint, p_client bigint, p_series text, p_number text, p_lines jsonb, p_user bigint, p_created_by uuid DEFAULT NULL::uuid, p_admin uuid DEFAULT NULL::uuid, p_actor text DEFAULT NULL::text, p_allow_short boolean DEFAULT false, p_plata text DEFAULT 'NUMERAR'::text, p_incasat numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_doc bigint; v_line bigint; v_mov bigint; ln jsonb; v_part bigint; v_qty numeric; v_price numeric;
        v_need numeric; v_take numeric; v_total numeric; v_unit numeric; v_rev numeric:=0; v_cost numeric:=0;
        lyr record; alloc jsonb; a jsonb; v_ledger numeric; v_short numeric; shortages jsonb := '[]'::jsonb;
        v_plata text;
BEGIN
  v_plata := upper(btrim(COALESCE(p_plata, 'NUMERAR')));
  IF v_plata NOT IN ('NUMERAR','CARD','TRANSFER') THEN RAISE EXCEPTION 'BAD_PLATA'; END IF;

  INSERT INTO piese_stock_documents(doc_type,status,warehouse_id,client_id,invoice_series,invoice_number,
                                    efactura_status,created_by,created_by_admin,confirmed_by,confirmed_at,
                                    plata,incasat)
  VALUES('SALE','CONFIRMED',p_wh,p_client,p_series,p_number,'PENDING',p_user,p_created_by,p_user,now(),
         v_plata,p_incasat)
  RETURNING id INTO v_doc;

  FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_part:=(ln->>'part_id')::bigint; v_qty:=abs((ln->>'qty')::numeric);
    -- Prețul de vânzare: întreg, aici, înaintea oricărui calcul. Validat pe valoarea tastată, apoi
    -- rotunjit cu prag — un preț pozitiv nu poate ajunge 0, un 0 tastat rămâne 0.
    v_price:=(ln->>'unit_price')::numeric;
    IF NOT piese_qty_ok(v_qty) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
    IF NOT piese_cost_ok(v_price) THEN RAISE EXCEPTION 'BAD_PRICE'; END IF;
    v_price:=CASE WHEN v_price > 0 THEN GREATEST(round(v_price, 0), 1) ELSE 0 END;
    PERFORM 1 FROM piese_parts WHERE id=v_part FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;

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

  IF jsonb_array_length(shortages) > 0 AND NOT COALESCE(p_allow_short, false) THEN
    RAISE EXCEPTION 'SHORTAGE' USING DETAIL = shortages::text;
  END IF;

  IF p_incasat IS NOT NULL AND p_incasat < v_rev - 0.0001 THEN
    RAISE EXCEPTION 'INCASAT_PREA_MIC';
  END IF;

  INSERT INTO piese_audit_log(user_id,admin_id,actor_label,action,entity,entity_id,detail)
  VALUES(p_user,p_admin,p_actor,'CREATE','sale',v_doc,
         format('Vânzare %s lei (%s)', round(v_rev,2), v_plata)
         || CASE WHEN jsonb_array_length(shortages) > 0
                 THEN ' — PESTE STOC: ' || shortages::text ELSE '' END);

  RETURN jsonb_build_object('doc_id',v_doc,'total',round(v_rev,2),'cost',round(v_cost,2),
                            'shortages',shortages,'plata',v_plata,
                            'rest', CASE WHEN p_incasat IS NULL THEN NULL
                                         ELSE round(p_incasat - v_rev, 2) END);
END $function$;

-- Piesele rămase fără preț din cauza rotunjirii vechi. Aceeași sămânță ca migr. 371, cu două diferențe:
-- prinde și `sale_price = 0` (nu doar NULL), fiindcă migr. 382 a rotunjit prețurile existente și putea
-- lăsa zerouri scrise; și trece prin funcția NOUĂ, deci cu prag.
--
-- Nu încalcă regula „urcă, nu coboară": a pune un preț acolo unde nu era niciunul nu e o coborâre.
UPDATE piese_parts p
   SET sale_price = piese_pret_candidat(p.id, c.cost_mediu),
       sale_price_at = now(),
       sale_price_sursa = 'initial'
  FROM (
    SELECT m.part_id, AVG(m.unit_cost) AS cost_mediu
      FROM piese_stock_movements m
      JOIN piese_warehouses w ON w.id = m.warehouse_id
     WHERE w.kind = 'SHOP' AND m.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN')
     GROUP BY m.part_id
  ) c
 WHERE c.part_id = p.id
   AND p.is_for_sale AND p.active
   AND COALESCE(p.sale_price, 0) = 0
   AND c.cost_mediu > 0;
