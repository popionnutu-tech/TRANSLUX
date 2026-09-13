-- 348: Reparațiile din review la piesele б/у.
--
-- (1) NaN pe cost trecea garda. `v_cost <> v_cost` NU prinde NaN în Postgres — `NaN = NaN` e adevărat, iar
--     NaN sortează peste orice număr, deci nici `< 0` nu-l prinde. Exact greșeala pe care migr. 296 a
--     documentat-o textual pentru cantități și a rezolvat-o cu `piese_qty_ok`; linia de cantitate din
--     donor o folosea corect, cea de cost avea forma naivă. Verificat: garda veche chiar era cod mort.
--     Calea prin aplicație e închisă (JSON n-are NaN), dar o gardă care nu apără e mai rea decât una
--     lipsă — se citește ca protecție. Un NaN ajuns în `unit_cost` (coloană REAL) ar otrăvi ireversibil
--     straturile FIFO, valoarea depozitului și, prin ea, prețurile de raft.
CREATE OR REPLACE FUNCTION piese_cost_ok(c numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT c IS NOT NULL AND c <> 'NaN'::numeric AND c >= 0;
$$;

COMMENT ON FUNCTION piese_cost_ok(numeric) IS
  'Cost valid pentru o mișcare de stoc: nenul, nu NaN, >= 0. Zero e PERMIS (o piesă poate valora zero). '
  'SURSĂ UNICĂ — în Postgres NaN e egal cu sine și mai mare decât orice număr, deci `c <> c` și `c < 0` NU îl prind.';

REVOKE ALL ON FUNCTION piese_cost_ok(numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_cost_ok(numeric) TO service_role;

-- (2) Garda de origine nu apăra decât rândul scris. `UPDATE piese_parts SET is_used = true` pe o piesă care
--     e ORIGINE pentru alta nu declanșa nimic — deci lanțul „uzată → uzată", interzis la scrierea legăturii,
--     se putea obține pe ocolite, iar sugestia de valoare s-ar fi calculat din altă sugestie.
CREATE OR REPLACE FUNCTION piese_part_origin_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.origin_part_id IS NOT NULL THEN
    IF NEW.origin_part_id = NEW.id THEN RAISE EXCEPTION 'ORIGIN_SELF'; END IF;
    IF NOT NEW.is_used THEN RAISE EXCEPTION 'ORIGIN_ONLY_USED'; END IF;
    PERFORM 1 FROM piese_parts o WHERE o.id = NEW.origin_part_id AND NOT o.is_used;
    IF NOT FOUND THEN RAISE EXCEPTION 'ORIGIN_MUST_BE_NEW'; END IF;
  END IF;
  -- Calea inversă: piesa asta e originea altcuiva și tocmai devine uzată.
  IF NEW.is_used AND TG_OP = 'UPDATE' AND NOT OLD.is_used THEN
    PERFORM 1 FROM piese_parts c WHERE c.origin_part_id = NEW.id;
    IF FOUND THEN RAISE EXCEPTION 'ORIGIN_HAS_CHILDREN'; END IF;
  END IF;
  RETURN NEW;
END $$;

-- Triggerul nu mai poate avea `WHEN (NEW.origin_part_id IS NOT NULL)`: acum trebuie să prindă și cazul în
-- care se schimbă DOAR `is_used`. Se restrânge în schimb la scrierile care chiar ating unul din cele două
-- câmpuri, ca redenumirile în masă de nomenclator (migr. 317) să nu intre deloc în funcție.
DROP TRIGGER IF EXISTS trg_piese_part_origin ON piese_parts;
CREATE TRIGGER trg_piese_part_origin BEFORE INSERT OR UPDATE ON piese_parts
  FOR EACH ROW WHEN (NEW.origin_part_id IS NOT NULL OR NEW.is_used)
  EXECUTE FUNCTION piese_part_origin_guard();

REVOKE ALL ON FUNCTION piese_part_origin_guard() FROM PUBLIC, anon, authenticated;

-- (3) Donorul folosește garda corectă de cost. Restul funcției e identic cu migr. 346.
CREATE OR REPLACE FUNCTION piese_donor_intake(
  p_wh bigint, p_vehicle bigint, p_note text, p_lines jsonb, p_user bigint,
  p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_doc bigint; v_line bigint; ln jsonb;
  v_part bigint; v_qty numeric; v_cost numeric; v_n int := 0; v_total numeric := 0;
BEGIN
  IF p_wh IS NULL THEN RAISE EXCEPTION 'BAD_WAREHOUSE'; END IF;
  PERFORM 1 FROM piese_warehouses WHERE id = p_wh;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAD_WAREHOUSE'; END IF;
  IF p_vehicle IS NOT NULL THEN
    PERFORM 1 FROM piese_vehicles WHERE id = p_vehicle;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_VEHICLE'; END IF;
  END IF;

  INSERT INTO piese_stock_documents(doc_type, status, warehouse_id, vehicle_id, note,
                                    created_by, created_by_admin, confirmed_by, confirmed_at)
    VALUES('DONOR', 'CONFIRMED', p_wh, p_vehicle, NULLIF(btrim(COALESCE(p_note, '')), ''),
           p_user, p_admin, p_user, now())
    RETURNING id INTO v_doc;

  -- `ORDER BY part_id`: ordine de blocare sortată, ca la migr. 295. Lock-ul e pe rândul din CATALOG, deci
  -- două documente care ating aceleași piese în ordine diferită s-ar bloca reciproc.
  FOR ln IN SELECT e FROM jsonb_array_elements(p_lines) e ORDER BY (e->>'part_id')::bigint LOOP
    v_part := (ln->>'part_id')::bigint;
    v_qty  := abs((ln->>'qty')::numeric);
    v_cost := COALESCE((ln->>'unit_cost')::numeric, 0);
    IF v_part IS NULL THEN RAISE EXCEPTION 'BAD_PART'; END IF;
    IF NOT piese_qty_ok(v_qty) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
    IF NOT piese_cost_ok(v_cost) THEN RAISE EXCEPTION 'BAD_COST'; END IF;

    -- Numai piese marcate uzate. Fără garda asta, documentul „Donor" ar fi devenit o a doua cale de a băga
    -- marfă nouă în stoc, fără furnizor și fără factură — adică exact în afara evidenței pe care o ține
    -- recepția.
    PERFORM 1 FROM piese_parts WHERE id = v_part AND active AND is_used FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_USED_PART'; END IF;

    INSERT INTO piese_stock_document_lines(document_id, part_id, qty, unit_cost)
      VALUES(v_doc, v_part, v_qty, v_cost) RETURNING id INTO v_line;
    INSERT INTO piese_stock_movements(part_id, warehouse_id, movement_type, qty_delta, unit_cost,
                                      document_id, line_id, vehicle_id, created_by)
      VALUES(v_part, p_wh, 'DONOR_IN', v_qty, v_cost, v_doc, v_line, p_vehicle, p_user);
    v_n := v_n + 1; v_total := v_total + v_qty * v_cost;
  END LOOP;

  IF v_n = 0 THEN RAISE EXCEPTION 'NO_LINES'; END IF;

  INSERT INTO piese_audit_log(user_id, admin_id, actor_label, action, entity, entity_id, detail)
    VALUES(p_user, p_admin, p_actor, 'CREATE', 'donor', v_doc,
           'Piese b/u primite: ' || v_n || ' poziții, ' || round(v_total, 2) || ' lei' ||
           CASE WHEN p_vehicle IS NULL THEN '' ELSE ' (de pe mașina #' || p_vehicle || ')' END);

  RETURN jsonb_build_object('doc_id', v_doc, 'lines', v_n, 'total', v_total);
END $$;

REVOKE ALL ON FUNCTION piese_donor_intake(bigint, bigint, text, jsonb, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_donor_intake(bigint, bigint, text, jsonb, bigint, uuid, text) TO service_role;
