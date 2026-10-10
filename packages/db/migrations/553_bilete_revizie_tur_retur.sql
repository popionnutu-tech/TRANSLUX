-- 553: corecturile reviziei din 10.10.2026 (Ion: «fă 1000 de testări teoretice că tot lucrează … verifică toate punctele»).
-- 1. bilete_creeaza_comanda (textual din 551, două schimbări):
--    a) PLAFON_GLOBAL nu mai numără returul din pachet — un tur-retur e O comandă și la plafonul global (551 îl scăpase:
--       25 de tur-retururi deschise blocau vânzarea pentru toți, la 50);
--    b) reducerea «retur» cere rândul nou pe perechea promo (Bălți ⇄ Chișinău) — înainte doar turul era verificat, deci o
--       cerere directă putea lua −20% pe un «retur» Briceni → Chișinău.
-- 2. bilete_student_incepe (textual din 546): verificările cu verdict «eroare» (AI indisponibil) nu mai consumă din
--    plafonul de 5/zi pe telefon și pe IP (pe viu, 3 erori la 12:37–12:40 când API-ul răspundea 400); erorile au frâna
--    lor separată, 15 pe IP/zi (revizorul: o poză respinsă de API, trimisă în buclă, ar fi golit plafonul global de 300).
-- 3. Varianta veche bilete_anuleaza(uuid, text, text) — fără logica pachetului, nechemată de cod — se șterge.

CREATE OR REPLACE FUNCTION public.bilete_creeaza_comanda(p jsonb) RETURNS bilete_comenzi
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE r bilete_comenzi; n int; v_ip text := p->>'ip_hash'; v_phone text := p->>'phone'; v_key uuid := (p->>'idempotency_key')::uuid;
        v_locuri smallint[]; v_ocupate text; v_north boolean := (p->>'going_north')::boolean; v_seats smallint := (p->>'seats')::smallint;
        v_proba boolean := coalesce((p->>'proba_fizica')::boolean, false);
        v_test boolean := coalesce((p->>'test')::boolean, false) OR coalesce((p->>'proba_fizica')::boolean, false);
        v_date date := (p->>'trip_date')::date; v_route int := (p->>'crm_route_id')::int;
        v_red text := nullif(p->>'reducere_tip', ''); v_tur_id uuid := nullif(p->>'comanda_tur_id', '')::uuid;
        v_stud uuid := nullif(p->>'student_verificare_id', '')::uuid;
        v_chei text[]; v_cota smallint := nullif(p->>'cota_online', '')::smallint; k text;
        t bilete_comenzi; v bilete_studenti_verificari; max7 int; zile int; v_min int; v_pachet boolean := coalesce((p->>'in_pachet')::boolean, false);
BEGIN
  SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = v_key;
  IF FOUND THEN RETURN r; END IF;

  IF p ? 'locuri_alese' AND jsonb_typeof(p->'locuri_alese') = 'array' AND jsonb_array_length(p->'locuri_alese') > 0 THEN
    SELECT array_agg(x::smallint) INTO v_locuri FROM jsonb_array_elements_text(p->'locuri_alese') x;
    IF NOT v_north THEN RAISE EXCEPTION 'LOC_DOAR_RETUR' USING ERRCODE = 'P0001'; END IF;
    IF cardinality(v_locuri) <> v_seats THEN RAISE EXCEPTION 'LOC_NUMAR' USING ERRCODE = 'P0001'; END IF;
    IF (SELECT count(DISTINCT l) FROM unnest(v_locuri) l) <> v_seats OR NOT (1 <= ALL (v_locuri) AND bilete_capacitate_autobuz() >= ALL (v_locuri)) THEN
      RAISE EXCEPTION 'LOC_NEVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF p ? 'loc_cheie' AND jsonb_typeof(p->'loc_cheie') = 'array' AND jsonb_array_length(p->'loc_cheie') > 0 THEN
    SELECT array_agg(x) INTO v_chei FROM jsonb_array_elements_text(p->'loc_cheie') x;
  END IF;
  IF v_red IS NOT NULL AND v_red NOT IN ('retur', 'student') THEN RAISE EXCEPTION 'REDUCERE_NEVALIDA' USING ERRCODE = 'P0001'; END IF;
  IF v_red = 'retur' AND v_tur_id IS NULL THEN RAISE EXCEPTION 'REDUCERE_NEVALIDA' USING ERRCODE = 'P0001'; END IF;
  IF v_red = 'student' AND v_stud IS NULL THEN RAISE EXCEPTION 'REDUCERE_NEVALIDA' USING ERRCODE = 'P0001'; END IF;

  -- Protocolul de blocare (Codex C4): perechea întâi, apoi lacătul global.
  IF v_tur_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext('bilete_pereche:' || v_tur_id::text)); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bilete_comanda'));
  -- A doua verificare, sub blocare: cererea identică sosită între timp nu trebuie să cadă pe plafoane.
  SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = v_key;
  IF FOUND THEN RETURN r; END IF;

  -- 551: un tur-retur e O comandă pentru plafoane. Returul din pachet nu se numără și nu e oprit de plafonul pe IP/telefon
  -- (turul lui tocmai a trecut de ele, sub același lacăt); înainte, al doilea tur-retur în 30 min cădea «la retur».
  IF NOT v_pachet THEN
    SELECT count(*) INTO n FROM bilete_comenzi WHERE ip_hash = coalesce(v_ip, '') AND NOT in_pachet AND created_at > now() - interval '10 minutes';
    IF n >= 5 THEN RAISE EXCEPTION 'PLAFON_IP' USING ERRCODE = 'P0001'; END IF;
    SELECT count(*) INTO n FROM bilete_comenzi WHERE phone = v_phone AND status = 'noua' AND NOT in_pachet AND created_at > now() - interval '30 minutes';
    IF n >= 3 THEN RAISE EXCEPTION 'PLAFON_TELEFON' USING ERRCODE = 'P0001'; END IF;
  END IF;
  SELECT count(*) INTO n FROM bilete_comenzi WHERE status = 'noua' AND NOT in_pachet AND created_at > now() - interval '30 minutes';
  IF n >= 50 THEN RAISE EXCEPTION 'PLAFON_GLOBAL' USING ERRCODE = 'P0001'; END IF;
  IF v_proba THEN
    SELECT count(*) INTO n FROM bilete_comenzi
     WHERE proba_fizica AND (created_at AT TIME ZONE 'Europe/Chisinau')::date = (now() AT TIME ZONE 'Europe/Chisinau')::date;
    IF n >= 10 THEN RAISE EXCEPTION 'PLAFON_PROBA' USING ERRCODE = 'P0001'; END IF;
  END IF;

  -- Cota online pe localitate (546): locuri, nu comenzi; doar comenzile reale (test=false) intră în ea.
  IF v_chei IS NOT NULL AND v_cota IS NOT NULL AND NOT v_test THEN
    FOREACH k IN ARRAY v_chei LOOP
      n := bilete_cota_ocupata(v_date, v_route, v_north, k, NULL);
      IF n + v_seats > v_cota THEN RAISE EXCEPTION 'COTA_PLINA:%', greatest(v_cota - n, 0) USING ERRCODE = 'P0001'; END IF;
    END LOOP;
  END IF;

  -- Promoțiile (546): telefonul unui șofer nu primește reducere (Ion, 10.10: «ca să nu facă fraudă șoferul»).
  IF v_red IS NOT NULL AND EXISTS (SELECT 1 FROM drivers WHERE phone = v_phone) THEN
    RAISE EXCEPTION 'PROMO_SOFER' USING ERRCODE = 'P0001';
  END IF;
  IF v_red = 'retur' THEN
    SELECT * INTO t FROM bilete_comenzi WHERE id = v_tur_id;
    -- 548: în pachet (o singură plată) turul e încă neplătit, fără sesiune, creat acum, cu aceleași locuri.
    IF NOT FOUND OR (CASE WHEN v_pachet THEN t.status NOT IN ('noua', 'eroare_creare') OR t.checkout_id IS NOT NULL
                          OR t.created_at < now() - interval '30 minutes' OR v_seats <> t.seats
                     ELSE t.status <> 'platita' END) OR t.proba_fizica OR t.test <> v_test OR t.comanda_tur_id IS NOT NULL
       OR t.reducere_tip = 'retur' OR NOT t.promo_pereche OR NOT coalesce((p->>'promo_pereche')::boolean, false)
       OR t.phone <> v_phone OR t.going_north = v_north OR t.crm_route_id = v_route
       OR v_seats > t.seats OR (p->>'departure_at')::timestamptz <= t.departure_at THEN
      RAISE EXCEPTION 'RETUR_TUR_NEVALID' USING ERRCODE = 'P0001';
    END IF;
    zile := coalesce((SELECT value::int FROM app_config WHERE key = 'bilete_promo_retur_zile'), 30);
    IF v_date > t.trip_date + zile THEN RAISE EXCEPTION 'RETUR_TERMEN' USING ERRCODE = 'P0001'; END IF;
    -- 547 (Ion, 10.10: «tur-returul facem doar dacă cumpără în același moment»): returul redus se cumpără imediat după
    -- plata turului, în cel mult bilete_promo_retur_min minute (30).
    v_min := coalesce((SELECT value::int FROM app_config WHERE key = 'bilete_promo_retur_min'), 30);
    IF NOT v_pachet AND (t.paid_at IS NULL OR t.paid_at < now() - make_interval(mins => v_min)) THEN RAISE EXCEPTION 'RETUR_DUPA_TUR' USING ERRCODE = 'P0001'; END IF;
    IF bilete_retur_activ(v_tur_id, NULL) IS NOT NULL THEN RAISE EXCEPTION 'RETUR_FOLOSIT' USING ERRCODE = 'P0001'; END IF;
  ELSIF v_red = 'student' THEN
    IF v_seats <> 1 THEN RAISE EXCEPTION 'STUDENT_UN_LOC' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO v FROM bilete_studenti_verificari WHERE id = v_stud FOR UPDATE;
    IF NOT FOUND OR v.verdict <> 'accept' OR v.verificat_la < now() - interval '30 minutes' OR v.telefon <> v_phone
       OR v.nume_pasager_cheie <> coalesce(p->>'nume_pasager_cheie', '') THEN
      RAISE EXCEPTION 'STUDENT_VERIFICARE' USING ERRCODE = 'P0001';
    END IF;
    IF v.comanda_id IS NOT NULL AND EXISTS (SELECT 1 FROM bilete_comenzi o WHERE o.id = v.comanda_id
          AND bilete_comanda_activa(o.status, o.created_at, o.refund_finalizat_la, true)) THEN
      RAISE EXCEPTION 'STUDENT_JETON_FOLOSIT' USING ERRCODE = 'P0001';
    END IF;
    max7 := coalesce((SELECT value::int FROM app_config WHERE key = 'bilete_student_max_7z'), 4);
    IF bilete_student_locuri_7z(v.carnet_hash, NULL) + v_seats > max7 THEN RAISE EXCEPTION 'STUDENT_PLAFON' USING ERRCODE = 'P0001'; END IF;
  END IF;

  IF v_locuri IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(format('bilete_loc:%s:%s:%s', v_date, v_route, v_north)));
    SELECT string_agg(l::text, ',' ORDER BY l) INTO v_ocupate
      FROM (SELECT DISTINCT o.loc AS l FROM bilete_locuri_ocupate(v_date, v_route, v_north) o
             WHERE o.loc = ANY (v_locuri)) s;
    IF v_ocupate IS NOT NULL THEN RAISE EXCEPTION 'LOC_OCUPAT:%', v_ocupate USING ERRCODE = 'P0001'; END IF;
  END IF;

  INSERT INTO bilete_comenzi (idempotency_key, trip_date, crm_route_id, going_north, from_stop_order, to_stop_order,
                              from_name, to_name, departure_at, seats, price_per_seat, total, passenger_name, phone,
                              email, lang, ip_hash, test, proba_fizica,
                              punct_urcare_id, punct_urcare_nume_ro, punct_urcare_nume_ru, punct_urcare_lat, punct_urcare_lon,
                              locuri_alese,
                              pret_intreg, reducere_tip, reducere_pct, reducere_lei_loc, comanda_tur_id, student_verificare_id,
                              promo_pereche, loc_cheie, cota_online, in_pachet)
  VALUES (v_key, v_date, v_route, v_north,
          (p->>'from_stop_order')::int, (p->>'to_stop_order')::int, p->>'from_name', p->>'to_name',
          (p->>'departure_at')::timestamptz, v_seats, (p->>'price_per_seat')::numeric,
          (p->>'total')::numeric, p->>'passenger_name', v_phone, p->>'email', coalesce(p->>'lang', 'ro'), coalesce(v_ip, ''),
          v_test, v_proba,
          (p->>'punct_urcare_id')::bigint, p->>'punct_urcare_nume_ro', p->>'punct_urcare_nume_ru',
          (p->>'punct_urcare_lat')::numeric, (p->>'punct_urcare_lon')::numeric,
          v_locuri,
          CASE WHEN v_red IS NULL THEN NULL ELSE (p->>'pret_intreg')::numeric END, v_red,
          CASE WHEN v_red IS NULL THEN NULL ELSE (p->>'reducere_pct')::smallint END,
          CASE WHEN v_red IS NULL THEN 0 ELSE (p->>'pret_intreg')::numeric - (p->>'price_per_seat')::numeric END,
          CASE WHEN v_red = 'retur' THEN v_tur_id END, CASE WHEN v_red = 'student' THEN v_stud END,
          coalesce((p->>'promo_pereche')::boolean, false), v_chei, v_cota, v_pachet AND v_red = 'retur')
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO r;
  IF r.id IS NULL THEN SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = v_key; END IF;
  IF v_red = 'student' THEN UPDATE bilete_studenti_verificari SET comanda_id = r.id WHERE id = v_stud; END IF;
  RETURN r;
END $$;

REVOKE EXECUTE ON FUNCTION public.bilete_creeaza_comanda(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bilete_creeaza_comanda(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.bilete_student_incepe(p_telefon text, p_ip text, p_nume text, p_nume_cheie text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE n_tel int; n_ip int; n_tot int; n_err int; plafon int; v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bilete_student_plafon'));
  plafon := coalesce((SELECT value::int FROM app_config WHERE key = 'bilete_ai_plafon_zi'), 300);
  SELECT count(*) FILTER (WHERE telefon = p_telefon AND verdict IS DISTINCT FROM 'eroare'),
         count(*) FILTER (WHERE ip_hash = coalesce(p_ip, '') AND verdict IS DISTINCT FROM 'eroare'), count(*),
         count(*) FILTER (WHERE ip_hash = coalesce(p_ip, '') AND verdict = 'eroare')
    INTO n_tel, n_ip, n_tot, n_err FROM bilete_studenti_verificari WHERE created_at > now() - interval '1 day';
  IF n_tot >= plafon THEN
    IF NOT EXISTS (SELECT 1 FROM bilete_alerte WHERE tip = 'plafon_ai' AND created_at > now() - interval '1 day') THEN
      INSERT INTO bilete_alerte (tip, detalii) VALUES ('plafon_ai', format('plafonul zilnic al verificărilor AI (%s) a fost atins', plafon));
    END IF;
    RETURN jsonb_build_object('ok', false, 'motiv', 'plafon_global');
  END IF;
  IF n_tel >= 5 THEN RETURN jsonb_build_object('ok', false, 'motiv', 'plafon_telefon'); END IF;
  -- 5 pe IP (security M1: telefonul nu e dovedit, deci plafonul pe IP e frâna reală a epuizării plafonului global).
  IF n_ip >= 5 THEN RETURN jsonb_build_object('ok', false, 'motiv', 'plafon_ip'); END IF;
  -- 553: erorile au frâna lor (15 pe IP/zi), ca o poză respinsă de API, trimisă în buclă, să nu golească plafonul global.
  IF n_err >= 15 THEN RETURN jsonb_build_object('ok', false, 'motiv', 'plafon_ip'); END IF;
  INSERT INTO bilete_studenti_verificari (telefon, ip_hash, nume_pasager, nume_pasager_cheie)
  VALUES (p_telefon, coalesce(p_ip, ''), p_nume, p_nume_cheie) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.bilete_student_incepe(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bilete_student_incepe(text, text, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.bilete_anuleaza(uuid, text, text);
