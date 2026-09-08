-- 327: Returul unei eliberări NEACOPERITE de stoc — reparație raportată din producție.
--
-- SEMNALAT DE EDUARD: „нажимаешь возврат от слесаря, документ создается, уходит с остатка депозит Бричень,
-- но не возвращается в магазин, остаток 0."
--
-- CE S-A ÎNTÂMPLAT, reconstituit din date (documentele 417 și 418, 08.09):
--   06:08  mutare Magazin → Briceni, pe mașina 18, cu o piesă de 10.585 lei. Marfa a IEȘIT din magazin,
--          dar mutarea a rămas „pe drum" — nu s-a apăsat butonul de confirmare din Rashod.
--   06:14  s-a făcut o eliberare MANUALĂ din Briceni pentru aceeași piesă, care încă nu ajunsese acolo.
--          Motorul o permite (semnalează `shortages`), dar o scrie cu cost 0 și fără nicio alocare FIFO.
--   Rezultat: stoc Briceni −1, iar returul REFUZAT — „disponibil 0".
--
-- DE CE REFUZA. Migr. 311 plafona returul la `LEAST(rest de linie, rest de alocări FIFO)`. Plafonul acela
-- a fost pus după un review care semnala corect că alocările pot însuma mai puțin decât linia — dar
-- reparația a mers prea departe: pentru o eliberare complet neacoperită alocările sunt ZERO, deci
-- plafonul ieșea zero și returul devenea imposibil. Adică exact piesa care scosese stocul pe minus era
-- singura care nu putea fi pusă la loc.
--
-- CE E CORECT. Returul unei eliberări neacoperite e legitim: stocul urcă de la −1 la 0, iar valoarea nu
-- se schimbă, fiindcă nu s-a consumat niciun strat. Plafonul redevine „cât s-a eliberat minus cât s-a
-- întors", iar eliberarea straturilor se face DOAR pentru partea care chiar a fost alocată; restul se
-- întoarce la cost 0 — exact cât a costat și eliberarea.
--
-- Verificat pe datele reale, în tranzacție anulată:
--   · linia 486 (neacoperită): stoc −1 → 0, valoare 0 → 0, valoarea returului 0;
--   · o eliberare normală de 2 × 200 lei: valoarea returului 400 — neschimbată față de migr. 311.

CREATE OR REPLACE FUNCTION piese_return_issue(
  p_line bigint, p_wh bigint, p_vehicle bigint, p_qty numeric, p_user bigint, p_idem text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  ln record; d record; v_mov record; ex record;
  v_returned numeric; v_alloc numeric; v_available numeric;
  v_need numeric; v_take numeric; v_value numeric := 0; v_unit numeric;
  a record; plan jsonb := '[]'::jsonb; pa jsonb; v_new_line bigint; v_new_mov bigint;
  -- Fereastra de vechime: lăcătușul aduce piesa înapoi și peste o săptămână, dar nu peste doi ani. Fără
  -- nicio limită, un `line_id` trimis direct la acțiune putea „returna" un rashod din alt an — stocul ar
  -- crește cu piese care fizic nu mai există, ireversibil (jurnalul e append-only).
  MAX_AGE constant interval := interval '180 days';
BEGIN
  IF NOT piese_qty_ok(p_qty) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
  -- Fail-CLOSED pe NULL pentru TOATE cele trei chei de acces. `p_vehicle` lipsea din listă, iar
  -- `NULL IS DISTINCT FROM NULL` e FALS — deci pe documentele de eliberare FĂRĂ mașină (casare, consum
  -- general, create deliberat de `submitIssue`) garda de mașină nu se declanșa deloc. `Number(undefined)`
  -- din JS dă NaN, care se serializează `null`, deci era ajungibil printr-un apel direct la acțiune.
  IF p_wh IS NULL OR p_line IS NULL OR p_vehicle IS NULL THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;

  -- Reluarea aceluiași clic: se întoarce rezultatul primei execuții, nu se face un al doilea retur.
  -- Căutarea e LEGATĂ de depozitul și mașina apelantului: `client_key` e unic global, iar o căutare
  -- nelegată ar fi întors `doc_id`/`line_id`/cost dintr-un depozit la care apelantul n-are acces —
  -- și încă înaintea oricărei gărzi.
  IF p_idem IS NOT NULL THEN
    SELECT l.id, l.document_id, l.qty, l.unit_cost INTO ex
      FROM piese_stock_document_lines l
      JOIN piese_stock_documents dd ON dd.id = l.document_id
     WHERE l.client_key = p_idem
       AND dd.warehouse_id = p_wh
       AND dd.vehicle_id IS NOT DISTINCT FROM p_vehicle;
    IF FOUND THEN
      RETURN jsonb_build_object('doc_id', ex.document_id, 'line_id', ex.id, 'qty', -ex.qty,
                                'unit_cost', ex.unit_cost, 'value', (-ex.qty) * ex.unit_cost, 'replay', true);
    END IF;
  END IF;

  SELECT * INTO ln FROM piese_stock_document_lines WHERE id = p_line;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_LINE'; END IF;

  SELECT * INTO d FROM piese_stock_documents WHERE id = ln.document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_LINE'; END IF;

  -- ÎNTÂI apartenența (depozit + mașină), abia apoi tipul și starea documentului. Ordinea inversă emitea
  -- coduri distincte pe baza unor proprietăți ale unui document STRĂIN — iterând `line_id` se putea
  -- cartografia ce documente există în alte depozite. Codurile rămân distincte pentru log-ul serverului;
  -- spre client se traduc toate în același mesaj.
  IF d.warehouse_id IS DISTINCT FROM p_wh THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;
  IF d.vehicle_id IS DISTINCT FROM p_vehicle THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;

  IF ln.reverses_line_id IS NOT NULL THEN RAISE EXCEPTION 'IS_RETURN'; END IF; -- nu se returnează un retur
  IF d.doc_type <> 'ISSUE' THEN RAISE EXCEPTION 'NOT_ISSUE'; END IF;
  IF d.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'NOT_CONFIRMED'; END IF;
  IF d.created_at < now() - MAX_AGE THEN RAISE EXCEPTION 'TOO_OLD'; END IF;

  PERFORM 1 FROM piese_parts WHERE id = ln.part_id FOR UPDATE; -- serializare pe piesă, ca în tot motorul

  -- Mișcarea de eliberare a acestei linii: din ea aflăm ce straturi s-au consumat.
  SELECT * INTO v_mov FROM piese_stock_movements
    WHERE line_id = p_line AND movement_type = 'ISSUE'
    ORDER BY id ASC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_MOVEMENT'; END IF;

  -- Plafonul are DOUĂ limite, iar cea mai mică decide:
  --  · cât a mai rămas nereturnat din linie;
  --  · cât mai e alocat efectiv din straturi — la o eliberare peste stoc, alocările însumează mai puțin
  --    decât linia, iar restul nu a ieșit niciodată dintr-un strat, deci nu are ce să se întoarcă în el.
  SELECT COALESCE(SUM(-qty), 0) INTO v_returned
    FROM piese_stock_document_lines WHERE reverses_line_id = p_line;
  SELECT COALESCE(SUM(qty), 0) INTO v_alloc
    FROM piese_fifo_alloc WHERE issue_movement_id = v_mov.id;
  -- Plafonul e CANTITATEA ELIBERATĂ, nu cât s-a alocat din FIFO. Vezi antetul: cu plafonul vechi, o
  -- eliberare peste stoc (alocări zero) nu se putea returna DELOC.
  v_available := ln.qty::numeric - v_returned;
  IF p_qty > v_available + 0.0000001 THEN RAISE EXCEPTION 'TOO_MUCH'; END IF;

  -- Se stinge în ordine INVERSĂ consumului. Straturile se agregă (o alocare stinsă parțial are deja
  -- rânduri negative), iar ordinea e dată de ultimul rând al stratului.
  -- Se stinge DOAR cât e alocat: partea neacoperită n-a ieșit din niciun strat, deci n-are unde să se
  -- întoarcă. Ea se întoarce la cost 0 — exact cât a costat și eliberarea.
  v_need := LEAST(p_qty, v_alloc);
  FOR a IN
    SELECT receipt_movement_id AS rid, SUM(qty) AS remaining, MAX(unit_cost) AS unit_cost, MAX(id) AS ord
      FROM piese_fifo_alloc
     WHERE issue_movement_id = v_mov.id
     GROUP BY receipt_movement_id
    HAVING SUM(qty) > 0.0000001
     ORDER BY MAX(id) DESC
  LOOP
    EXIT WHEN v_need <= 0.0000001;
    v_take := LEAST(a.remaining, v_need);
    plan := plan || jsonb_build_object('rid', a.rid, 'qty', v_take, 'cost', a.unit_cost);
    v_value := v_value + v_take * a.unit_cost;
    v_need := v_need - v_take;
  END LOOP;
  -- Plasă: după `LEAST` de mai sus n-ar trebui să rămână nimic; dacă totuși rămâne, oprim.
  IF v_need > 0.0000001 THEN RAISE EXCEPTION 'FIFO_MISMATCH'; END IF;

  v_unit := CASE WHEN p_qty > 0 THEN v_value / p_qty ELSE 0 END;

  -- Linia de retur stă pe ACELAȘI document, cu cantitate negativă: așa totalul documentului arată net
  -- ce a rămas pe mașină, fără să pierdem urma a ce s-a dat și s-a întors.
  BEGIN
    INSERT INTO piese_stock_document_lines(document_id, part_id, qty, unit_cost, reverses_line_id, client_key)
      VALUES(ln.document_id, ln.part_id, -p_qty, v_unit, p_line, p_idem) RETURNING id INTO v_new_line;
  EXCEPTION WHEN unique_violation THEN
    -- Două trimiteri ale aceluiași clic au intrat în paralel: prima a câștigat, noi îi întoarcem rezultatul.
    -- Aceeași legare de depozit+mașină ca la calea rapidă de mai sus.
    SELECT l.id, l.document_id, l.qty, l.unit_cost INTO ex
      FROM piese_stock_document_lines l
      JOIN piese_stock_documents dd ON dd.id = l.document_id
     WHERE l.client_key = p_idem
       AND dd.warehouse_id = p_wh
       AND dd.vehicle_id IS NOT DISTINCT FROM p_vehicle;
    -- Dacă unicitatea a fost încălcată de ALTCEVA (sau cheia e a altui depozit), NU raportăm succes pentru
    -- o operațiune care n-a avut loc: fără asta se întorcea `{doc_id: null, replay: true}`, clientul vedea
    -- „gata", iar urma nu se scria nicăieri.
    IF NOT FOUND THEN RAISE; END IF;
    RETURN jsonb_build_object('doc_id', ex.document_id, 'line_id', ex.id, 'qty', -ex.qty,
                              'unit_cost', ex.unit_cost, 'value', (-ex.qty) * ex.unit_cost, 'replay', true);
  END;

  INSERT INTO piese_stock_movements(part_id, warehouse_id, movement_type, qty_delta, unit_cost,
                                    document_id, line_id, vehicle_id, odometer_km, created_by)
    VALUES(ln.part_id, d.warehouse_id, 'RETURN_ISSUE', p_qty, v_unit,
           ln.document_id, v_new_line, d.vehicle_id, v_mov.odometer_km, p_user)
    RETURNING id INTO v_new_mov;

  -- Stingerea propriu-zisă: alocări NOI, negative. Straturile originale redevin disponibile la costul lor,
  -- iar urma a ce consumase eliberarea rămâne intactă.
  --
  -- Rândul negativ se leagă de mișcarea de ELIBERARE, nu de cea de retur. Prima variantă îl lega de retur
  -- și a fost prinsă de test: „cât mai e alocat din stratul X" se citește după `issue_movement_id` al
  -- ELIBERĂRII, deci compensarea rămânea invizibilă acolo — stratul scump apărea disponibil a doua oară,
  -- iar al doilea retur îl lua din nou. Concret: retur 5 apoi 10 dintr-o eliberare de 15 dădea 1500 + 2000
  -- în loc de 1500 + 1000, adică valoarea stocului ieșea 5000 în loc de 4000. Semnul liniei spune deja că e
  -- o stingere; legătura cu returul rămâne prin document și prin `reverses_line_id`.
  FOR pa IN SELECT * FROM jsonb_array_elements(plan) LOOP
    INSERT INTO piese_fifo_alloc(issue_movement_id, receipt_movement_id, qty, unit_cost)
      VALUES(v_mov.id, (pa->>'rid')::bigint, -((pa->>'qty')::numeric), (pa->>'cost')::numeric);
  END LOOP;

  RETURN jsonb_build_object('doc_id', ln.document_id, 'line_id', v_new_line,
                            'qty', p_qty, 'unit_cost', v_unit, 'value', v_value, 'replay', false);
END $$;

REVOKE ALL ON FUNCTION piese_return_issue(bigint, bigint, bigint, numeric, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_return_issue(bigint, bigint, bigint, numeric, bigint, text) TO service_role;

-- Lista de pe ecran folosește ACEEAȘI formulă ca plafonul din RPC — altfel ecranul ar oferi o cantitate
-- pe care motorul o refuză, sau ar ascunde una pe care o acceptă.
CREATE OR REPLACE FUNCTION piese_vehicle_issue_lines(p_wh bigint, p_vehicle bigint, p_limit int DEFAULT 200)
RETURNS TABLE(line_id bigint, doc_id bigint, created_at timestamptz, part_id bigint,
              name text, article text, issued numeric, returned numeric, available numeric)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT * FROM (
    SELECT l.id AS line_id, d.id AS doc_id, d.created_at, l.part_id,
           COALESCE(p.name_ro, p.name_long, '#' || l.part_id) AS name,
           p.article_code AS article,
           l.qty::numeric AS issued,
           COALESCE(r.returned, 0) AS returned,
           GREATEST(0, l.qty::numeric - COALESCE(r.returned, 0)) AS available
      FROM piese_stock_documents d
      JOIN piese_stock_document_lines l ON l.document_id = d.id AND l.reverses_line_id IS NULL
      JOIN piese_parts p ON p.id = l.part_id
      LEFT JOIN LATERAL (
        SELECT SUM(-x.qty)::numeric AS returned FROM piese_stock_document_lines x
         WHERE x.reverses_line_id = l.id) r ON true
     WHERE d.doc_type = 'ISSUE' AND d.status = 'CONFIRMED'
       AND d.warehouse_id = p_wh AND d.vehicle_id = p_vehicle
       AND d.created_at >= now() - interval '180 days'
  ) q
  WHERE q.available > 0.0000001
  ORDER BY q.created_at DESC, q.line_id DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
$$;

REVOKE ALL ON FUNCTION piese_vehicle_issue_lines(bigint, bigint, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_vehicle_issue_lines(bigint, bigint, int) TO service_role;
