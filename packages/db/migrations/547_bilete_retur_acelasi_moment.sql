-- 547_bilete_retur_acelasi_moment.sql — returul −20% doar «în același moment» cu turul (Ion, 10.10.2026: «tur-returul
-- facem doar dacă cumpără în același moment, trebuie să adăugăm retur»; «retura apare pe pagina căutării deodată, mai jos
-- adaugă retur»; termenul cursei de întoarcere rămâne 30 de zile). Omul alege returul în formularul turului, plătește
-- turul, apoi pagina biletului îi deschide imediat plata returului. Banca face un singur refund pe o plată, deci tur și
-- retur rămân două plăți (fiecare se poate returna separat). Aici: bilete_creeaza_comanda (textul din 546) + condiția
-- «turul plătit acum cel mult bilete_promo_retur_min minute».

INSERT INTO app_config (key, value) VALUES ('bilete_promo_retur_min', '30') ON CONFLICT (key) DO NOTHING;

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
        t bilete_comenzi; v bilete_studenti_verificari; max7 int; zile int; v_min int;
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

  SELECT count(*) INTO n FROM bilete_comenzi WHERE ip_hash = coalesce(v_ip, '') AND created_at > now() - interval '10 minutes';
  IF n >= 5 THEN RAISE EXCEPTION 'PLAFON_IP' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) INTO n FROM bilete_comenzi WHERE phone = v_phone AND status = 'noua' AND created_at > now() - interval '30 minutes';
  IF n >= 3 THEN RAISE EXCEPTION 'PLAFON_TELEFON' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) INTO n FROM bilete_comenzi WHERE status = 'noua' AND created_at > now() - interval '30 minutes';
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
    IF NOT FOUND OR t.status <> 'platita' OR t.proba_fizica OR t.test <> v_test OR t.comanda_tur_id IS NOT NULL
       OR t.reducere_tip = 'retur' OR NOT t.promo_pereche
       OR t.phone <> v_phone OR t.going_north = v_north OR t.crm_route_id = v_route
       OR v_seats > t.seats OR (p->>'departure_at')::timestamptz <= t.departure_at THEN
      RAISE EXCEPTION 'RETUR_TUR_NEVALID' USING ERRCODE = 'P0001';
    END IF;
    zile := coalesce((SELECT value::int FROM app_config WHERE key = 'bilete_promo_retur_zile'), 30);
    IF v_date > t.trip_date + zile THEN RAISE EXCEPTION 'RETUR_TERMEN' USING ERRCODE = 'P0001'; END IF;
    -- 547 (Ion, 10.10: «tur-returul facem doar dacă cumpără în același moment»): returul redus se cumpără imediat după
    -- plata turului, în cel mult bilete_promo_retur_min minute (30).
    v_min := coalesce((SELECT value::int FROM app_config WHERE key = 'bilete_promo_retur_min'), 30);
    IF t.paid_at IS NULL OR t.paid_at < now() - make_interval(mins => v_min) THEN RAISE EXCEPTION 'RETUR_DUPA_TUR' USING ERRCODE = 'P0001'; END IF;
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
                              promo_pereche, loc_cheie, cota_online)
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
          coalesce((p->>'promo_pereche')::boolean, false), v_chei, v_cota)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO r;
  IF r.id IS NULL THEN SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = v_key; END IF;
  IF v_red = 'student' THEN UPDATE bilete_studenti_verificari SET comanda_id = r.id WHERE id = v_stud; END IF;
  RETURN r;
END $$;

REVOKE EXECUTE ON FUNCTION public.bilete_creeaza_comanda(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bilete_creeaza_comanda(jsonb) TO service_role;

-- Probă (se anulează prin excepția finală): turul plătit acum 31 de minute nu mai dă reducere; cel de acum 1 minut, da.
DO $$
DECLARE tur bilete_comenzi; ck uuid; ra int; rb int; base jsonb;
BEGIN
  SELECT min(id) INTO ra FROM crm_routes WHERE active;
  SELECT min(id) INTO rb FROM crm_routes WHERE active AND id <> ra;
  base := jsonb_build_object('from_stop_order', 1, 'to_stop_order', 2, 'passenger_name', 'Proba 547', 'phone', '37360547547', 'promo_pereche', true, 'test', false, 'seats', 1);
  tur := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-05-01', 'crm_route_id', ra,
          'going_north', false, 'departure_at', '2031-05-01T06:00:00+03', 'from_name', 'Bălți', 'to_name', 'Chișinău', 'price_per_seat', 150, 'total', 150, 'ip_hash', 'p547a'));
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck, tur.id::text, 'sandbox', 150, 'Completed', 'Executed', 0);
  PERFORM bilete_marcheaza_platita(ck);
  UPDATE bilete_comenzi SET paid_at = now() - interval '31 minutes' WHERE id = tur.id;
  BEGIN
    PERFORM bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-05-03', 'crm_route_id', rb,
      'going_north', true, 'departure_at', '2031-05-03T15:00:00+03', 'from_name', 'Chișinău', 'to_name', 'Bălți', 'price_per_seat', 120, 'total', 120,
      'pret_intreg', 150, 'reducere_tip', 'retur', 'reducere_pct', 20, 'comanda_tur_id', tur.id, 'ip_hash', 'p547b'));
    RAISE EXCEPTION 'P547: returul după 31 de minute a trecut';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'RETUR_DUPA_TUR' THEN RAISE; END IF; END;
  UPDATE bilete_comenzi SET paid_at = now() - interval '1 minute' WHERE id = tur.id;
  PERFORM bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-05-03', 'crm_route_id', rb,
    'going_north', true, 'departure_at', '2031-05-03T15:00:00+03', 'from_name', 'Chișinău', 'to_name', 'Bălți', 'price_per_seat', 120, 'total', 120,
    'pret_intreg', 150, 'reducere_tip', 'retur', 'reducere_pct', 20, 'comanda_tur_id', tur.id, 'ip_hash', 'p547c'));
  RAISE EXCEPTION 'PROBA547_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'PROBA547_OK' THEN RAISE; END IF;
END $$;
