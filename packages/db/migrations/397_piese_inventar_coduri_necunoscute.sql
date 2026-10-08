-- 397: La numărătoare, un cod de bare necunoscut nu mai oprește omul — se reține ca rând, fără piesă.
--
-- Cerut de Eduard (08.10): «В случае сканирования штрихкода, который не прописан в нашей базе номенклатур
-- — должен сохраняться штрихкод с количеством. После того как мы добавим название для этого штрихкода,
-- обновляем страницу инвентаризации — она заменяет штрихкод на название».
--
-- Până acum, un cod necunoscut primea mesajul „codul nu e al niciunei piese, caut-o pe nume mai jos" și
-- se deschidea căutarea manuală. Marfa nu se pierdea, dar omul se OPREA din numărat: stătea în fața
-- raftului și trebuia ori să găsească piesa după denumire, ori s-o creeze pe loc. La un raft cu zeci de
-- poziții noi, numărătoarea se transformă în muncă de nomenclator, în picioare.
--
-- Acum codul se reține cu cantitatea lui, iar numele i se dă mai târziu, la birou. Numărătoarea curge.
--
-- DE CE TABEL SEPARAT, nu `part_id` nullable în `piese_inventory_session_lines`: acolo cheia unică e
-- (session_id, part_id), iar închiderea construiește din ea cantitățile ca ADEVĂR ABSOLUT pe depozit.
-- Un rând fără piesă n-are ce căuta în calculul acela nici măcar pentru o clipă; ținut deoparte, nu poate
-- ajunge din greșeală în stoc.
CREATE TABLE IF NOT EXISTS piese_inventory_session_codes (
  id             bigserial PRIMARY KEY,
  session_id     bigint NOT NULL REFERENCES piese_inventory_sessions(id) ON DELETE CASCADE,
  code           text   NOT NULL,
  location_label text   NOT NULL,
  counted_qty    numeric(14,3) NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- Insensibil la litere, ca potrivirea codurilor din tot modulul (`idx_ppbc_code_ci`).
CREATE UNIQUE INDEX IF NOT EXISTS idx_pinvcod_sesiune_cod
  ON piese_inventory_session_codes (session_id, lower(code));

ALTER TABLE piese_inventory_session_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON piese_inventory_session_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON piese_inventory_session_codes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE piese_inventory_session_codes_id_seq TO service_role;

-- Un bip pe cod necunoscut. Aceeași semantică de acumulare ca la piese: fără cantitate = +1.
CREATE OR REPLACE FUNCTION piese_inv_scan_cod(p_session bigint, p_code text, p_location text, p_qty numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE s record; v_loc text; v_cod text; v_out jsonb;
BEGIN
  SELECT * INTO s FROM piese_inventory_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_SESSION'; END IF;
  IF s.status <> 'OPEN' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;

  v_cod := btrim(COALESCE(p_code, ''));
  IF v_cod = '' THEN RAISE EXCEPTION 'NO_CODE'; END IF;
  v_loc := upper(btrim(regexp_replace(COALESCE(p_location, ''), '\s*-\s*', '-', 'g')));
  IF v_loc = '' THEN RAISE EXCEPTION 'NO_LOCATION'; END IF;
  IF p_qty IS NOT NULL AND (p_qty = 'NaN'::numeric OR p_qty < 0) THEN RAISE EXCEPTION 'BAD_QTY'; END IF;

  INSERT INTO piese_inventory_session_codes(session_id, code, location_label, counted_qty)
    VALUES(p_session, v_cod, v_loc, COALESCE(p_qty, 1))
  ON CONFLICT (session_id, lower(code)) DO UPDATE
    SET counted_qty = CASE WHEN p_qty IS NULL THEN piese_inventory_session_codes.counted_qty + 1 ELSE p_qty END,
        location_label = v_loc,
        updated_at = now()
  RETURNING jsonb_build_object('code', code, 'qty', counted_qty, 'location', location_label) INTO v_out;
  RETURN v_out;
END $fn$;

-- Trecerea codurilor care AU CĂPĂTAT ÎNTRE TIMP o piesă în rândurile normale. Asta e „обновляем страницу
-- и она заменяет штрихкод на название" — se cheamă la fiecare citire a foii, înainte de a o afișa.
--
-- Se mută DOAR codurile care duc la EXACT o piesă. Dacă același cod ajunge la două piese (se întâmplă —
-- azi 161 de articole sunt în situația asta), rămâne pe loc: a ghici ar însemna bucăți adăugate pe
-- articolul greșit, iar diferența ar ieși la iveală peste luni, ca lipsă inexplicabilă.
--
-- Cantitatea se ADUNĂ la rândul piesei dacă el există deja: aceeași marfă poate fi bipată și prin cod
-- necunoscut, și — după ce i s-a dat nume — direct pe piesă.
CREATE OR REPLACE FUNCTION piese_inv_rezolva_coduri(p_session bigint)
RETURNS int LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE r record; v_ids bigint[]; v_part bigint; v_n int := 0;
BEGIN
  FOR r IN SELECT * FROM piese_inventory_session_codes WHERE session_id = p_session LOOP
    SELECT array_agg(t.id) INTO v_ids FROM piese_part_by_code(r.code) t;
    -- Exact o potrivire, altfel rândul rămâne pe loc.
    IF v_ids IS NULL OR array_length(v_ids, 1) <> 1 THEN CONTINUE; END IF;
    v_part := v_ids[1];

    INSERT INTO piese_inventory_session_lines(session_id, part_id, location_label, counted_qty)
      VALUES(p_session, v_part, r.location_label, r.counted_qty)
    ON CONFLICT (session_id, part_id) DO UPDATE
      SET counted_qty = piese_inventory_session_lines.counted_qty + EXCLUDED.counted_qty,
          location_label = EXCLUDED.location_label,
          updated_at = now();

    DELETE FROM piese_inventory_session_codes WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $fn$;

-- Lista codurilor rămase fără piesă — alimentează bannerul roșu.
CREATE OR REPLACE FUNCTION piese_inv_coduri(p_session bigint)
RETURNS TABLE(code text, location_label text, counted_qty numeric, updated_at timestamptz)
LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $fn$
  SELECT c.code, c.location_label, c.counted_qty, c.updated_at
    FROM piese_inventory_session_codes c WHERE c.session_id = p_session ORDER BY c.updated_at;
$fn$;

-- Ștergerea unui cod: supapa pentru codul care nu e al nimănui (ambalaj străin, etichetă veche).
-- Fără ea, un singur cod imposibil de identificat ar ține numărătoarea deschisă la nesfârșit.
CREATE OR REPLACE FUNCTION piese_inv_sterge_cod(p_session bigint, p_code text)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM piese_inventory_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_SESSION'; END IF;
  IF s.status <> 'OPEN' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;
  DELETE FROM piese_inventory_session_codes
   WHERE session_id = p_session AND lower(code) = lower(btrim(p_code));
END $fn$;

REVOKE ALL ON FUNCTION piese_inv_scan_cod(bigint,text,text,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_inv_scan_cod(bigint,text,text,numeric) TO service_role;
REVOKE ALL ON FUNCTION piese_inv_rezolva_coduri(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_inv_rezolva_coduri(bigint) TO service_role;
REVOKE ALL ON FUNCTION piese_inv_coduri(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_inv_coduri(bigint) TO service_role;
REVOKE ALL ON FUNCTION piese_inv_sterge_cod(bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_inv_sterge_cod(bigint,text) TO service_role;

-- Închiderea numărătorii: întâi absoarbe codurile care au primit între timp o piesă, apoi REFUZĂ dacă au
-- mai rămas. Decizia Marianei: numărătoarea rămâne deschisă și pe ecran apare un banner roșu, în loc să
-- se închidă lăsând codurile deoparte.
--
-- Motivul e de fond, nu de interfață: liniile numărătorii devin la închidere stocul ca ADEVĂR ABSOLUT pe
-- depozit. Un cod nerezolvat e marfă numărată pe raft; o închidere care îl ignoră scrie un stoc mai mic
-- decât realitatea — și nimeni n-ar afla, fiindcă diferența n-ar apărea nicăieri ca lipsă, ar fi doar
-- absentă din numărătoare.
--
-- Restul funcției e neatins față de migr. 357.
CREATE OR REPLACE FUNCTION public.piese_inv_commit(p_session bigint, p_extra bigint[] DEFAULT '{}'::bigint[], p_admin uuid DEFAULT NULL::uuid, p_actor text DEFAULT NULL::text, p_force boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s record; v_counts jsonb; v_zero jsonb; v_moved jsonb; v_adrese int; v_res jsonb; v_coduri jsonb;
BEGIN
  SELECT * INTO s FROM piese_inventory_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_SESSION'; END IF;
  IF s.status <> 'OPEN' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;

  PERFORM piese_inv_rezolva_coduri(p_session);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('code', c.code, 'qty', c.counted_qty, 'location', c.location_label)
                            ORDER BY c.code), '[]'::jsonb)
    INTO v_coduri FROM piese_inventory_session_codes c WHERE c.session_id = p_session;
  IF jsonb_array_length(v_coduri) > 0 THEN
    RAISE EXCEPTION 'CODURI_NEREZOLVATE' USING DETAIL = v_coduri::text;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'part_id', l.part_id,
           'name', COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long)) ORDER BY l.part_id), '[]'::jsonb)
    INTO v_moved
    FROM piese_inventory_session_lines l
    JOIN piese_parts p ON p.id = l.part_id
   WHERE l.session_id = p_session
     AND EXISTS (SELECT 1 FROM piese_stock_movements m
                  WHERE m.part_id = l.part_id AND m.warehouse_id = s.warehouse_id
                    AND m.created_at > l.updated_at);
  IF jsonb_array_length(v_moved) > 0 AND NOT COALESCE(p_force, false) THEN
    RAISE EXCEPTION 'MOVED' USING DETAIL = v_moved::text;
  END IF;

  INSERT INTO piese_part_locations(part_id, warehouse_id, location_label)
  SELECT l.part_id, s.warehouse_id, l.location_label
    FROM piese_inventory_session_lines l
   WHERE l.session_id = p_session AND l.counted_qty > 0
  ON CONFLICT (part_id, warehouse_id) DO UPDATE SET location_label = EXCLUDED.location_label;
  GET DIAGNOSTICS v_adrese = ROW_COUNT;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('part_id', part_id, 'counted_qty', counted_qty)), '[]'::jsonb)
    INTO v_counts FROM piese_inventory_session_lines WHERE session_id = p_session;

  IF p_extra IS NULL OR cardinality(p_extra) = 0 THEN
    v_zero := '[]'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('part_id', m.part_id, 'counted_qty', 0)), '[]'::jsonb)
      INTO v_zero FROM piese_inv_missing(p_session) m WHERE m.part_id = ANY(p_extra);
  END IF;

  v_counts := v_counts || v_zero;
  IF jsonb_array_length(v_counts) = 0 THEN RAISE EXCEPTION 'NO_LINES'; END IF;

  v_res := piese_inventory_count(s.warehouse_id, v_counts, NULL, p_admin, p_actor);

  UPDATE piese_inventory_sessions
     SET status = 'COMMITTED', committed_at = now(), document_id = (v_res->>'doc_id')::bigint
   WHERE id = p_session;

  RETURN jsonb_build_object('doc_id', (v_res->>'doc_id')::bigint, 'diffs', (v_res->>'diffs')::int,
                            'adrese', v_adrese, 'pozitii', jsonb_array_length(v_counts),
                            'zerouri', jsonb_array_length(v_zero),
                            'miscate', jsonb_array_length(v_moved));
END $function$;
