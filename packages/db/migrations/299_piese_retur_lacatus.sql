-- 299: Returul de la lăcătuș — piesa scoasă pentru o reparație se întoarce în depozit.
--
-- Cerut de Eduard: „при возврате запчасти от слесаря корректировать расход". Până acum rashodul nu avea
-- NICIO cale de corecție — nici ecran de modificare, nimic. Singura soluție era inventarierea, care
-- corectează cantitatea dar strică atribuirea costului pe mașină (rămâne cheltuită acolo).
--
-- ── Cum se întoarce corect o piesă ─────────────────────────────────────────────
-- Naiv, s-ar adăuga un strat nou de stoc la costul mediu curent. Ar fi greșit: piesa a plecat dintr-un
-- strat ANUME, la un cost ANUME. Dacă între timp au intrat recepții mai scumpe, returul ar readuce
-- cantitatea la alt preț decât a plecat, iar valoarea stocului ar deriva la fiecare retur.
--
-- Corect e inversul consumului: `piese_fifo_alloc` reține exact din ce straturi s-a luat și cu ce cost.
-- Stingem acele alocări — și atunci straturile ORIGINALE redevin disponibile, la costul lor. Cantitatea
-- crește printr-o mișcare nouă, iar valoarea crește exact cu ce s-a eliberat. Costul mediu rămâne intact.
-- Verificat pe bază, în tranzacție anulată: două straturi (100 și 300 lei), eliberare de 15 care le mușcă
-- pe amândouă, retur parțial de 5 → valoare 1500 (stratul luat ULTIMUL), nu 833 (media). Retur integral →
-- stocul și valoarea revin exact la starea dinaintea eliberării.
--
-- Ordinea de stingere e INVERSĂ consumului (ultimul strat luat se eliberează primul): dacă eliberarea a
-- consumat două straturi, returul parțial trebuie să întoarcă exact ce s-a luat ultima dată, nu o medie.
--
-- Stingerea se face prin alocare NOUĂ cu cantitate negativă, nu prin UPDATE pe cea existentă. Modulul e
-- append-only peste tot (`trg_pmov_immutable` din migr. 200, jurnalul de audit din migr. 292), iar
-- `piese_replace_receipt` (migr. 244) stinge deja straturi exact așa. Un UPDATE ar fi șters urma a ce
-- consumase eliberarea. Toate formulele existente citesc `SUM(a.qty)`, deci rezultatul numeric e identic.
--
-- ── De ce un tip de mișcare nou ────────────────────────────────────────────────
-- `RETURN_ISSUE` (cantitate POZITIVĂ), nu `ISSUE` cu semn schimbat: rapoartele numără eliberările, iar un
-- retur nu e o montare în plus. Dar COSTUL trebuie să se scadă de pe mașină — de aceea view-urile de cost
-- sunt actualizate mai jos să includă returul.
-- `RETURN_ISSUE` NU intră în lista de straturi-sursă FIFO: stocul lui e deja consumabil, fiindcă am stins
-- alocările originale. Dacă l-am pune și acolo, cantitatea s-ar dubla la următoarea eliberare.
--
-- ── Ce a găsit review-ul, și e reparat aici ────────────────────────────────────
-- 1. O eliberare returnată INTEGRAL rămânea numărată ca montare: „перерасход" acuza mașina pentru piese
--    care nu au ieșit niciodată efectiv, iar `piese_cost_per_vehicle` afișa „3 eliberări / cost 0".
--    Acum contorul numără doar eliberările cu rest net (`piese_issue_line_net`). Același defect lovea
--    avertismentul „aceeași piesă acum 2 zile" și raportul de fiabilitate — corectate la fel.
-- 2. Motorul PERMITE eliberarea peste stoc (`shortages`), deci alocările pot însuma mai puțin decât linia.
--    Plafonul de retur se calcula din cantitatea liniei, deci trecea de `TOO_MUCH` și cădea în
--    `FIFO_MISMATCH` — „Anunță administratorul" pentru o operațiune legitimă. Acum plafonul e
--    `LEAST(rest de linie, rest de alocări)`, aceeași formulă în RPC și în lista de pe ecran.
-- 3. Garda verifica depozitul, nu și mașina, și n-avea limită de vechime: un `line_id` trimis direct la
--    acțiune putea corecta rashodul altei mașini, de acum doi ani. Acum `p_vehicle` e obligatoriu (ca în
--    migr. 295) și există o fereastră de vechime.
-- 4. `IF d.warehouse_id <> p_wh` nu e fail-closed: cu `p_wh` NULL expresia e NULL, `IF` nu se declanșează
--    și garda DISPARE. `NaN` din JS se serializează ca `null`, deci era ajungibil. Acum `IS DISTINCT FROM`
--    plus respingere explicită a NULL-ului.
-- 5. Nimic nu indexa `piese_stock_movements.line_id` și `piese_fifo_alloc.issue_movement_id` — ambele căi
--    de acces sunt NOI, introduse de returul ăsta, iar scanările se făceau ținând lock-ul pe piesă, adică
--    serializând tot ce atinge acea piesă în toate depozitele. Indecșii sunt mai jos.
-- 6. Scriere ireversibilă fără protecție la dublă trimitere (dublu-clic, retrimitere): `client_key`.

-- ── Legătura returului cu linia pe care o corectează ───────────────────────────
alter table piese_stock_document_lines
  add column if not exists reverses_line_id bigint references piese_stock_document_lines(id) on delete restrict;

comment on column piese_stock_document_lines.reverses_line_id is
  'Pentru liniile de RETUR: linia de eliberare pe care o corectează. Cantitatea liniei e NEGATIVĂ.';

create index if not exists idx_pdocl_reverses
  on piese_stock_document_lines (reverses_line_id) where reverses_line_id is not null;

-- Cheia de idempotență a clientului: un clic = o cheie. O a doua trimitere a ACELUIAȘI clic (dublu-clic,
-- retrimitere după timeout) lovește indexul unic și primește înapoi rezultatul primei, nu un al doilea
-- retur. Fără ea, o piesă s-ar întoarce de două ori în stoc, ireversibil.
alter table piese_stock_document_lines
  add column if not exists client_key text;

create unique index if not exists idx_pdocl_client_key
  on piese_stock_document_lines (client_key) where client_key is not null;

-- ── Indecșii ceruți de căile de acces NOI ──────────────────────────────────────
-- Ambele se citesc ținând `FOR UPDATE` pe piesă — resursa cea mai disputată din motor. Fără ele, fiecare
-- retur ar fi scanat integral cele două tabele cu cea mai rapidă creștere din modul, blocând între timp
-- orice eliberare, vânzare sau recepție a acelei piese.
create index if not exists idx_pmov_line_issue
  on piese_stock_movements (line_id) where movement_type = 'ISSUE';

-- `id DESC` e acolo ca acoperire pentru ordinea de stingere. NU elimină sortarea: bucla grupează pe
-- `receipt_movement_id` și ordonează după `MAX(id)`, iar ordinea din index nu trece prin agregare. Setul e
-- de câteva straturi, deci nu contează — dar justificarea trebuie să fie adevărată, ca să n-o citeze cineva.
create index if not exists idx_pfifo_issue
  on piese_fifo_alloc (issue_movement_id, id DESC);

-- ── Cât a mai rămas efectiv pe mașină dintr-o linie de eliberare ───────────────
-- Sursă unică pentru toate locurile care trebuie să ignore o eliberare anulată prin retur: contoarele din
-- rapoarte, avertismentul de la eliberare și fiabilitatea.
CREATE OR REPLACE VIEW piese_issue_line_net AS
  SELECT l.id AS line_id,
         l.qty::numeric AS issued,
         COALESCE(r.returned, 0) AS returned,
         l.qty::numeric - COALESCE(r.returned, 0) AS net
    FROM piese_stock_document_lines l
    LEFT JOIN (SELECT reverses_line_id, SUM(-qty)::numeric AS returned
                 FROM piese_stock_document_lines
                WHERE reverses_line_id IS NOT NULL
                GROUP BY reverses_line_id) r ON r.reverses_line_id = l.id
   WHERE l.reverses_line_id IS NULL;

REVOKE ALL ON piese_issue_line_net FROM PUBLIC, anon, authenticated;
GRANT SELECT ON piese_issue_line_net TO service_role;

-- ── RPC-ul de retur ────────────────────────────────────────────────────────────
-- Semnătura s-a schimbat (`p_vehicle`, `p_idem`), deci varianta veche se scoate explicit.
DROP FUNCTION IF EXISTS piese_return_issue(bigint, bigint, numeric, bigint);

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
  v_available := LEAST(ln.qty::numeric - v_returned, v_alloc);
  IF p_qty > v_available + 0.0000001 THEN RAISE EXCEPTION 'TOO_MUCH'; END IF;

  -- Se stinge în ordine INVERSĂ consumului. Straturile se agregă (o alocare stinsă parțial are deja
  -- rânduri negative), iar ordinea e dată de ultimul rând al stratului.
  v_need := p_qty;
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
  -- Nu poate rămâne nimic neacoperit: plafonul de mai sus a ținut deja cont de alocările rămase.
  -- Dacă totuși se întâmplă, oprim — mai bine o eroare decât un stoc inventat.
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

-- ── Lista de pe ecran: din ce se mai poate returna ─────────────────────────────
-- În SQL, nu în JS: netarea făcută în aplicație peste un set trunchiat putea pierde tocmai linia de retur
-- (stă pe același document ca eliberarea, deci intra în același plafon) și afișa un disponibil deja
-- returnat. Aici plafonul se aplică pe liniile de ELIBERARE, după netare, cu ordine deterministă.
-- `available` folosește ACEEAȘI formulă ca RPC-ul, ca ecranul să nu ofere o cantitate pe care motorul o refuză.
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
           GREATEST(0, LEAST(l.qty::numeric - COALESCE(r.returned, 0), COALESCE(al.remaining, 0))) AS available
      FROM piese_stock_documents d
      JOIN piese_stock_document_lines l ON l.document_id = d.id AND l.reverses_line_id IS NULL
      JOIN piese_parts p ON p.id = l.part_id
      LEFT JOIN LATERAL (
        SELECT SUM(-x.qty)::numeric AS returned FROM piese_stock_document_lines x
         WHERE x.reverses_line_id = l.id) r ON true
      LEFT JOIN LATERAL (
        SELECT SUM(fa.qty)::numeric AS remaining FROM piese_fifo_alloc fa
          JOIN piese_stock_movements m ON m.id = fa.issue_movement_id
         WHERE m.line_id = l.id AND m.movement_type = 'ISSUE') al ON true
     WHERE d.doc_type = 'ISSUE' AND d.status = 'CONFIRMED'
       AND d.warehouse_id = p_wh AND d.vehicle_id = p_vehicle
       -- Aceeași fereastră ca în RPC: ecranul nu are voie să ofere ce motorul refuză.
       AND d.created_at >= now() - interval '180 days'
  ) q
  WHERE q.available > 0.0000001
  ORDER BY q.created_at DESC, q.line_id DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
$$;

REVOKE ALL ON FUNCTION piese_vehicle_issue_lines(bigint, bigint, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_vehicle_issue_lines(bigint, bigint, int) TO service_role;

-- ── O eliberare anulată prin retur nu mai e o montare ──────────────────────────
-- Avertismentul de la eliberare citea ULTIMA mișcare ISSUE pe grupă/mașină. După un retur integral,
-- montarea reală de peste două zile primea „Aceeași piesă a fost pusă acum 2 zile!" — pentru o montare
-- care nu a avut loc. Un avertisment fals repetat e mai rău decât niciunul: oamenii încep să-l ignore.
CREATE OR REPLACE FUNCTION piese_issue_alert(p_vehicle bigint, p_part bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE v_grp bigint; v_norm int; v_name text; v_km int; last_at timestamptz; last_odo int;
  msgs jsonb := '[]'::jsonb; lvl text := 'ok'; days int; ran int;
BEGIN
  SELECT p.group_id, g.norm_km, g.name_ro INTO v_grp, v_norm, v_name
    FROM piese_parts p JOIN piese_part_groups g ON g.id=p.group_id WHERE p.id=p_part;
  IF v_grp IS NULL THEN RETURN jsonb_build_object('level','ok','messages','[]'::jsonb); END IF;
  SELECT km_current INTO v_km FROM piese_vehicles WHERE id=p_vehicle;
  -- Forma e CORELATĂ (EXISTS per rând), nu join cu `piese_issue_line_net`. View-ul e agregat, iar un
  -- agregat nu poate fi parametrizat de un nested loop: Postgres îl calcula ÎNTREG la fiecare apel, pierdea
  -- `idx_pmov_vehicle_issue_recent` (creat în migr. 298 exact pentru asta) și sorta tot istoricul mașinii ca
  -- să ia un singur rând. Măsurat: 272 buffere și sortare completă, față de 29 de buffere și oprire după 3
  -- rânduri cu forma de mai jos. Iar funcția asta se apelează O DATĂ PER RÂND de pe ecranul de eliberare.
  SELECT m.created_at, m.odometer_km INTO last_at, last_odo
    FROM piese_stock_movements m
    JOIN piese_parts p ON p.id=m.part_id
    WHERE m.vehicle_id=p_vehicle AND p.group_id=v_grp AND m.movement_type='ISSUE'
      -- eliberarea returnată integral nu e o montare
      AND (m.line_id IS NULL OR EXISTS (
            SELECT 1 FROM piese_stock_document_lines l
             WHERE l.id = m.line_id
               AND l.qty::numeric > COALESCE((SELECT SUM(-x.qty)::numeric
                                                FROM piese_stock_document_lines x
                                               WHERE x.reverses_line_id = l.id), 0) + 0.0000001))
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

-- ── Rapoartele: costul se compensează, iar montările fantomă nu se mai numără ──
-- `RETURN_ISSUE` are `qty_delta` pozitiv, deci `-qty_delta` scade cantitatea și costul — exact ce trebuie.
-- Contorul de eliberări numără doar liniile cu rest net: o eliberare întoarsă integral nu mai e o montare,
-- altfel „перерасход" ar acuza mașina pentru piese care nu au ieșit niciodată efectiv din depozit.

CREATE OR REPLACE VIEW piese_cost_per_vehicle AS
  SELECT v.id AS vehicle_id, v.plate, v.model, v.km_current,
    count(*) FILTER (WHERE m.movement_type = 'ISSUE' AND COALESCE(n.net, 1) > 0.0000001) AS issues,
    sum(- m.qty_delta) AS parts_qty,
    sum((- m.qty_delta) * m.unit_cost) AS total_cost
  FROM piese_stock_movements m
  JOIN piese_vehicles v ON v.id = m.vehicle_id
  LEFT JOIN piese_issue_line_net n ON n.line_id = m.line_id
  WHERE m.movement_type IN ('ISSUE','RETURN_ISSUE')
  GROUP BY v.id
  ORDER BY sum((- m.qty_delta) * m.unit_cost) DESC;

CREATE OR REPLACE VIEW piese_overconsumption AS
  SELECT v.plate, g.name_ro AS group_name,
    count(*) FILTER (WHERE m.movement_type = 'ISSUE' AND COALESCE(n.net, 1) > 0.0000001) AS times,
    sum((- m.qty_delta) * m.unit_cost) AS cost
  FROM piese_stock_movements m
  JOIN piese_vehicles v ON v.id = m.vehicle_id
  JOIN piese_parts p ON p.id = m.part_id
  JOIN piese_part_groups g ON g.id = p.group_id
  LEFT JOIN piese_issue_line_net n ON n.line_id = m.line_id
  WHERE m.movement_type IN ('ISSUE','RETURN_ISSUE')
  GROUP BY v.id, g.id
  HAVING count(*) FILTER (WHERE m.movement_type = 'ISSUE' AND COALESCE(n.net, 1) > 0.0000001) >= 3
  ORDER BY count(*) FILTER (WHERE m.movement_type = 'ISSUE' AND COALESCE(n.net, 1) > 0.0000001) DESC,
           sum((- m.qty_delta) * m.unit_cost) DESC;

-- Fiabilitatea măsoară câți km rezistă o piesă între două montări. Un retur nu e o montare (deci nu intră
-- deloc), dar nici eliberarea pe care o anulează integral — altfel ar apărea un interval de aproape zero km
-- care trage în jos media producătorului, adică exact cifra pe care se aleg furnizorii.
CREATE OR REPLACE VIEW piese_reliability AS
  WITH seq AS (
    SELECT lag(p.manufacturer) OVER w AS manufacturer,
           (m.odometer_km - lag(m.odometer_km) OVER w) AS span
      FROM piese_stock_movements m
      JOIN piese_parts p ON p.id = m.part_id
      LEFT JOIN piese_issue_line_net n ON n.line_id = m.line_id
     WHERE m.movement_type = 'ISSUE' AND m.vehicle_id IS NOT NULL AND m.odometer_km IS NOT NULL
       AND COALESCE(n.net, 1) > 0.0000001
     WINDOW w AS (PARTITION BY m.vehicle_id, p.group_id ORDER BY m.created_at, m.id)
  )
  SELECT manufacturer, count(*) AS samples, round(avg(span)) AS avg_km
    FROM seq
   WHERE span > 0 AND manufacturer IS NOT NULL
   GROUP BY manufacturer
   ORDER BY round(avg(span)) DESC;

-- Numărul de poziții al unui document nu numără liniile de retur: un rashod de 3 piese cu un retur scria
-- „4 poziții", deși pe mașină sunt tot cel mult 3 piese.
CREATE OR REPLACE VIEW piese_recent_docs AS
  SELECT d.id, d.doc_type, d.status, d.created_at,
    w.name AS warehouse_name,
    w2.name AS to_warehouse_name,
    (SELECT count(*) FROM piese_stock_document_lines l
      WHERE l.document_id = d.id AND l.reverses_line_id IS NULL) AS line_count
  FROM piese_stock_documents d
  LEFT JOIN piese_warehouses w ON w.id = d.warehouse_id
  LEFT JOIN piese_warehouses w2 ON w2.id = d.to_warehouse_id
  ORDER BY d.created_at DESC, d.id DESC;

-- ── Returul nu are voie să dezghețe corectarea unei recepții deja consumate ────
-- `piese_replace_receipt` refuza corectarea cât timp `SUM(qty) > 0` pe straturile recepției. Stingerea
-- prin retur poate readuce suma la zero — deci o recepție blocată devenea editabilă, iar prin corecție i
-- se putea rescrie retroactiv PREȚUL DE ACHIZIȚIE. E un drept obținut pe ușa din dos, pe care nimeni nu
-- l-a acordat. Acum contează dacă stratul a fost consumat VREODATĂ, nu dacă mai e consumat acum.
CREATE OR REPLACE FUNCTION piese_replace_receipt(
  p_doc bigint, p_supplier bigint, p_series text, p_number text, p_note text, p_lines jsonb, p_user bigint
) RETURNS bigint LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE d record; m record; v_new bigint; v_line bigint; v_rev bigint; ln jsonb; v_q numeric; v_c numeric;
BEGIN
  SELECT * INTO d FROM piese_stock_documents WHERE id = p_doc FOR UPDATE;
  IF NOT FOUND OR d.doc_type <> 'RECEIPT' THEN RAISE EXCEPTION 'NOT_RECEIPT'; END IF;
  IF d.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'NOT_CONFIRMED'; END IF;
  IF d.invoice_series = 'SOLD' THEN RAISE EXCEPTION 'SOLD_INITIAL'; END IF;
  IF p_series = 'SOLD' THEN RAISE EXCEPTION 'SOLD_SERIES'; END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'NO_LINES'; END IF;
  FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF (ln->>'part_id') IS NULL THEN RAISE EXCEPTION 'BAD_PART'; END IF;
    PERFORM 1 FROM piese_parts WHERE id = (ln->>'part_id')::bigint;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;
    v_q := abs((ln->>'qty')::numeric); v_c := (ln->>'unit_cost')::numeric;
    IF v_q IS NULL OR v_q <= 0.0000001 THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
    IF v_c IS NULL OR v_c < 0 THEN RAISE EXCEPTION 'BAD_COST'; END IF;
  END LOOP;

  -- (1) Blochează piesele recepției și verifică dacă vreun strat a fost consumat VREODATĂ.
  --     SINGURA schimbare față de migr. 244: era `SUM(qty) > 0`, adică „mai e consumat ACUM". Stingerea
  --     prin retur poate readuce suma la zero, deci recepția ar fi redevenit editabilă la preț.
  FOR m IN SELECT * FROM piese_stock_movements WHERE document_id = p_doc AND movement_type = 'RECEIPT' LOOP
    PERFORM 1 FROM piese_parts WHERE id = m.part_id FOR UPDATE;
    PERFORM 1 FROM piese_fifo_alloc WHERE receipt_movement_id = m.id AND qty > 0.0000001;
    IF FOUND THEN RAISE EXCEPTION 'CONSUMED'; END IF;
  END LOOP;

  -- (2) Anulează fiecare strat: mișcare inversă + alocare FIFO care îl stinge complet.
  FOR m IN SELECT * FROM piese_stock_movements WHERE document_id = p_doc AND movement_type = 'RECEIPT' LOOP
    INSERT INTO piese_stock_movements(part_id, warehouse_id, movement_type, qty_delta, unit_cost, document_id, storno_of, created_by)
      VALUES(m.part_id, m.warehouse_id, 'ADJUST_MINUS', -m.qty_delta, m.unit_cost, p_doc, m.id, p_user) RETURNING id INTO v_rev;
    INSERT INTO piese_fifo_alloc(issue_movement_id, receipt_movement_id, qty, unit_cost)
      VALUES(v_rev, m.id, m.qty_delta, m.unit_cost);
  END LOOP;

  UPDATE piese_stock_documents SET status = 'CANCELLED' WHERE id = p_doc;

  -- (3) Documentul nou (corectat) — păstrează data și creatorul original.
  INSERT INTO piese_stock_documents(doc_type, status, warehouse_id, supplier_id, invoice_series, invoice_number, note, created_by, confirmed_by, confirmed_at, created_at, created_by_admin)
    VALUES('RECEIPT', 'CONFIRMED', d.warehouse_id, p_supplier, p_series, p_number, p_note, p_user, p_user, now(), d.created_at, d.created_by_admin)
    RETURNING id INTO v_new;
  FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO piese_stock_document_lines(document_id, part_id, qty, unit_cost)
      VALUES(v_new, (ln->>'part_id')::bigint, abs((ln->>'qty')::numeric), (ln->>'unit_cost')::numeric) RETURNING id INTO v_line;
    INSERT INTO piese_stock_movements(part_id, warehouse_id, movement_type, qty_delta, unit_cost, document_id, line_id, created_by, created_at)
      VALUES((ln->>'part_id')::bigint, d.warehouse_id, 'RECEIPT', abs((ln->>'qty')::numeric), (ln->>'unit_cost')::numeric, v_new, v_line, p_user, d.created_at);
  END LOOP;

  INSERT INTO piese_audit_log(user_id, action, entity, entity_id, detail)
    VALUES(p_user, 'EDIT', 'receipt', v_new, 'Corectie receptie (anuleaza #' || p_doc || ')');
  RETURN v_new;
END $$;

-- Grant-urile se reafirmă: proiectul are ALTER DEFAULT PRIVILEGES care acordă EXECUTE lui anon+authenticated
-- pe funcțiile din `public` (vezi migr. 244), iar `CREATE OR REPLACE` nu le curăță.
REVOKE ALL ON FUNCTION piese_replace_receipt(bigint, bigint, text, text, text, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_replace_receipt(bigint, bigint, text, text, text, jsonb, bigint) TO service_role;

-- ── `RETURN_ISSUE` e prima mișcare POZITIVĂ care nu e un strat de stoc ─────────
-- Două locuri vechi identificau intrările după SEMN, nu după tip. Până acum coincideau: tot ce avea
-- `qty_delta > 0` chiar era o intrare de marfă. Returul rupe asta — are cantitate pozitivă, dar costul lui
-- e o medie a straturilor stinse, nu un preț de achiziție.
--
-- Fără reparație: plusurile de inventar s-ar evalua la o medie otrăvită de returi, iar prețul de raft din
-- magazin ar migra la fiecare retur făcut acolo. Lista explicită de tipuri e cea deja folosită în restul
-- motorului (8 locuri), deci asta doar aliniază ultimele două.

CREATE OR REPLACE VIEW piese_sale_parts AS
  SELECT p.id, g.name_ro AS grp, p.manufacturer, p.model, g.markup_pct,
    round(((COALESCE((SELECT avg(m.unit_cost)
             FROM piese_stock_movements m
            WHERE m.part_id = p.id
              AND m.warehouse_id = (SELECT piese_warehouses.id FROM piese_warehouses
                                     WHERE piese_warehouses.kind = 'SHOP' LIMIT 1)
              AND m.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS')
              AND NOT EXISTS (SELECT 1 FROM piese_stock_documents dd
                               WHERE dd.id = m.document_id AND dd.status = 'CANCELLED')),
            (0)::double precision) * ((1)::double precision + (g.markup_pct / (100.0)::double precision))))::numeric, 0) AS price
  FROM piese_parts p
  JOIN piese_part_groups g ON g.id = p.group_id
  WHERE p.is_for_sale AND p.active
  ORDER BY g.name_ro;

-- Plusul de inventar se evalua la media TUTUROR mișcărilor pozitive. Aceeași reparație ca la prețul de
-- raft: returul are cantitate pozitivă, dar costul lui e o medie a straturilor stinse, nu un preț plătit
-- unui furnizor. Restul funcției e neatins față de migr. 202.
CREATE OR REPLACE FUNCTION piese_inventory_count(p_wh bigint, p_counts jsonb, p_user bigint)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_doc bigint; v_line bigint; v_mov bigint; c jsonb; v_part bigint; v_cnt numeric; v_cur numeric; v_diff numeric; v_n int:=0;
  v_need numeric; v_take numeric; v_total numeric; v_unit numeric; lyr record; alloc jsonb; a jsonb; v_avg numeric;
BEGIN
  INSERT INTO piese_stock_documents(doc_type,status,warehouse_id,created_by,confirmed_by,confirmed_at) VALUES('INVENTORY','CONFIRMED',p_wh,p_user,p_user,now()) RETURNING id INTO v_doc;
  FOR c IN SELECT * FROM jsonb_array_elements(p_counts) LOOP
    v_part:=(c->>'part_id')::bigint; v_cnt:=(c->>'counted_qty')::numeric;
    PERFORM 1 FROM piese_parts WHERE id=v_part FOR UPDATE;
    SELECT COALESCE(SUM(qty_delta),0) INTO v_cur FROM piese_stock_movements WHERE part_id=v_part AND warehouse_id=p_wh;
    v_diff:=v_cnt-v_cur; IF abs(v_diff)<0.0000001 THEN CONTINUE; END IF; v_n:=v_n+1;
    IF v_diff < 0 THEN
      v_need:=-v_diff; v_total:=0; alloc:='[]'::jsonb;
      FOR lyr IN SELECT r.id,r.unit_cost,(r.qty_delta-COALESCE((SELECT SUM(x.qty) FROM piese_fifo_alloc x WHERE x.receipt_movement_id=r.id),0)) AS remaining
        FROM piese_stock_movements r WHERE r.part_id=v_part AND r.warehouse_id=p_wh AND r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS') ORDER BY r.created_at,r.id LOOP
        EXIT WHEN v_need<=0.0000001; IF lyr.remaining<=0 THEN CONTINUE; END IF;
        v_take:=LEAST(lyr.remaining,v_need); alloc:=alloc||jsonb_build_object('rid',lyr.id,'qty',v_take,'cost',lyr.unit_cost); v_total:=v_total+v_take*lyr.unit_cost; v_need:=v_need-v_take;
      END LOOP;
      v_unit:=CASE WHEN (-v_diff)>0 THEN v_total/(-v_diff) ELSE 0 END;
      INSERT INTO piese_stock_document_lines(document_id,part_id,qty,unit_cost) VALUES(v_doc,v_part,v_diff,v_unit) RETURNING id INTO v_line;
      INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,created_by) VALUES(v_part,p_wh,'ADJUST_MINUS',v_diff,v_unit,v_doc,v_line,p_user) RETURNING id INTO v_mov;
      FOR a IN SELECT * FROM jsonb_array_elements(alloc) LOOP INSERT INTO piese_fifo_alloc(issue_movement_id,receipt_movement_id,qty,unit_cost) VALUES(v_mov,(a->>'rid')::bigint,(a->>'qty')::numeric,(a->>'cost')::numeric); END LOOP;
    ELSE
      SELECT COALESCE(AVG(unit_cost),0) INTO v_avg FROM piese_stock_movements
        WHERE part_id=v_part AND warehouse_id=p_wh
          AND movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS');
      INSERT INTO piese_stock_document_lines(document_id,part_id,qty,unit_cost) VALUES(v_doc,v_part,v_diff,v_avg) RETURNING id INTO v_line;
      INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,created_by) VALUES(v_part,p_wh,'ADJUST_PLUS',v_diff,v_avg,v_doc,v_line,p_user);
    END IF;
  END LOOP;
  INSERT INTO piese_audit_log(user_id,action,entity,entity_id,detail) VALUES(p_user,'INVENTORY','inventory',v_doc,'Inventariere: '||v_n||' diferențe');
  RETURN jsonb_build_object('doc_id',v_doc,'diffs',v_n);
END $$;

REVOKE ALL ON FUNCTION piese_inventory_count(bigint, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_inventory_count(bigint, jsonb, bigint) TO service_role;

-- ── Aceeași gardă nesigură exista și în funcția-soră ───────────────────────────
-- Antetul de mai sus declară `IF x <> y` nesigur, dar migr. 295 îl folosea în continuare la ADĂUGAREA pe
-- rashodul zilei: `IF d.warehouse_id <> p_wh OR d.vehicle_id IS DISTINCT FROM p_vehicle`. Cu `p_wh` NULL,
-- prima jumătate e NULL, iar `NULL OR fals` e NULL — deci garda nu se declanșează. Ar fi fost ciudat să
-- reparăm forma la retur și s-o lăsăm la funcția pe care ecranul o apelează de zeci de ori pe zi.
-- Restul funcției e identic cu migr. 295; se adaugă doar respingerea NULL-urilor și `IS DISTINCT FROM`.
CREATE OR REPLACE FUNCTION piese_append_issue(p_doc bigint, p_wh bigint, p_vehicle bigint, p_lines jsonb, p_user bigint)
RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE d record; v_line bigint; v_mov bigint; v_odo int; ln jsonb;
  v_part bigint; v_qty numeric; v_need numeric; v_take numeric; v_total numeric; v_unit numeric;
  lyr record; alloc jsonb; a jsonb; shortages jsonb := '[]'::jsonb; v_added int := 0;
BEGIN
  IF p_doc IS NULL OR p_wh IS NULL OR p_vehicle IS NULL THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;
  SELECT * INTO d FROM piese_stock_documents WHERE id = p_doc FOR UPDATE;
  IF NOT FOUND OR d.doc_type <> 'ISSUE' THEN RAISE EXCEPTION 'NOT_ISSUE'; END IF;
  IF d.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'NOT_CONFIRMED'; END IF;
  IF d.warehouse_id IS DISTINCT FROM p_wh OR d.vehicle_id IS DISTINCT FROM p_vehicle THEN
    RAISE EXCEPTION 'DOC_MISMATCH';
  END IF;
  IF (d.created_at AT TIME ZONE 'Europe/Chisinau')::date
     <> (now() AT TIME ZONE 'Europe/Chisinau')::date THEN
    RAISE EXCEPTION 'NOT_TODAY';
  END IF;
  SELECT km_current INTO v_odo FROM piese_vehicles WHERE id = d.vehicle_id;
  FOR ln IN SELECT e FROM jsonb_array_elements(p_lines) e ORDER BY (e->>'part_id')::bigint LOOP
    v_part := (ln->>'part_id')::bigint;
    v_qty  := abs((ln->>'qty')::numeric);
    IF v_part IS NULL THEN RAISE EXCEPTION 'BAD_PART'; END IF;
    IF NOT piese_qty_ok(v_qty) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;
    PERFORM 1 FROM piese_parts WHERE id = v_part FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;
    v_need := v_qty; v_total := 0; alloc := '[]'::jsonb;
    FOR lyr IN
      SELECT r.id, r.unit_cost,
        (r.qty_delta - COALESCE((SELECT SUM(x.qty) FROM piese_fifo_alloc x WHERE x.receipt_movement_id=r.id),0)) AS remaining
      FROM piese_stock_movements r
      WHERE r.part_id=v_part AND r.warehouse_id=d.warehouse_id
        AND r.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS')
      ORDER BY r.created_at ASC, r.id ASC
    LOOP
      EXIT WHEN v_need <= 0.0000001;
      IF lyr.remaining <= 0 THEN CONTINUE; END IF;
      v_take := LEAST(lyr.remaining, v_need);
      alloc := alloc || jsonb_build_object('rid',lyr.id,'qty',v_take,'cost',lyr.unit_cost);
      v_total := v_total + v_take*lyr.unit_cost; v_need := v_need - v_take;
    END LOOP;
    IF v_need > 0.0000001 THEN
      shortages := shortages || to_jsonb(format('Stoc insuficient (#%s): lipsesc %s', v_part, v_need));
    END IF;
    v_unit := CASE WHEN v_qty>0 THEN v_total/v_qty ELSE 0 END;
    INSERT INTO piese_stock_document_lines(document_id,part_id,qty,unit_cost)
      VALUES(p_doc,v_part,v_qty,v_unit) RETURNING id INTO v_line;
    INSERT INTO piese_stock_movements(part_id,warehouse_id,movement_type,qty_delta,unit_cost,document_id,line_id,vehicle_id,odometer_km,created_by)
      VALUES(v_part,d.warehouse_id,'ISSUE',-v_qty,v_unit,p_doc,v_line,d.vehicle_id,v_odo,p_user) RETURNING id INTO v_mov;
    FOR a IN SELECT * FROM jsonb_array_elements(alloc) LOOP
      INSERT INTO piese_fifo_alloc(issue_movement_id,receipt_movement_id,qty,unit_cost)
        VALUES(v_mov,(a->>'rid')::bigint,(a->>'qty')::numeric,(a->>'cost')::numeric);
    END LOOP;
    v_added := v_added + 1;
  END LOOP;
  IF v_added = 0 THEN RAISE EXCEPTION 'NO_LINES'; END IF;
  RETURN jsonb_build_object('doc_id',p_doc,'added',v_added,'shortages',shortages);
END $$;

REVOKE ALL ON FUNCTION piese_append_issue(bigint, bigint, bigint, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_append_issue(bigint, bigint, bigint, jsonb, bigint) TO service_role;
