-- 548_bilete_tur_retur_o_plata.sql — tur-returul Bălți ⇄ Chișinău plătit O SINGURĂ DATĂ (Ion, 10.10.2026: «totul trebuie să
-- fie achitare într-o pagină»; anularea: «poate să facă returul doar până a începe cursa la tur, include asta în reguli
-- care le confirmă el»). Banca face un singur refund pe o plată, deci pachetul se anulează doar împreună.
--
-- Modelul: turul ține sesiunea maib (suma = tur + retur), returul e comanda lui, legată (comanda_tur_id, in_pachet), fără
-- sesiune proprie. Plata turului plătește și returul în aceeași tranzacție; anularea turului anulează și returul, într-un
-- singur refund; returul din pachet nu se anulează singur. Fereastra «până la plecarea turului» e în aplicație (refund.ts).

ALTER TABLE bilete_comenzi ADD COLUMN IF NOT EXISTS in_pachet boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN bilete_comenzi.in_pachet IS 'Returul plătit în aceeași sesiune cu turul (548): plata, biletele și anularea merg odată cu turul (comanda_tur_id).';
ALTER TABLE bilete_comenzi DROP CONSTRAINT IF EXISTS bilete_comenzi_pachet_retur;
ALTER TABLE bilete_comenzi ADD CONSTRAINT bilete_comenzi_pachet_retur CHECK (NOT in_pachet OR (comanda_tur_id IS NOT NULL AND reducere_tip = 'retur' AND checkout_id IS NULL));

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
    -- 548: în pachet (o singură plată) turul e încă neplătit, fără sesiune, creat acum, cu aceleași locuri.
    IF NOT FOUND OR (CASE WHEN v_pachet THEN t.status NOT IN ('noua', 'eroare_creare') OR t.checkout_id IS NOT NULL
                          OR t.created_at < now() - interval '30 minutes' OR v_seats <> t.seats
                     ELSE t.status <> 'platita' END) OR t.proba_fizica OR t.test <> v_test OR t.comanda_tur_id IS NOT NULL
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

CREATE OR REPLACE FUNCTION public.bilete_marcheaza_platita(p_checkout_id uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; m maib_checkouts; i int; v_id uuid; v_alerta text; rt bilete_comenzi; v_alerta_rt text;
BEGIN
  SELECT * INTO m FROM maib_checkouts WHERE checkout_id = p_checkout_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Protocolul de blocare (546): perechea comenzii (citită fără lacăt), apoi lacătul global, apoi rândul.
  SELECT id INTO v_id FROM bilete_comenzi WHERE checkout_id = p_checkout_id;
  IF v_id IS NULL AND m.order_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_id := m.order_id::uuid; END IF;
  IF v_id IS NOT NULL THEN PERFORM bilete_lacat_pereche(v_id); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bilete_comanda'));

  SELECT * INTO c FROM bilete_comenzi WHERE checkout_id = p_checkout_id FOR UPDATE;
  IF NOT FOUND THEN
    IF m.order_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT * INTO c FROM bilete_comenzi WHERE id = m.order_id::uuid AND checkout_id IS NULL FOR UPDATE;
      IF FOUND THEN
        UPDATE bilete_comenzi SET checkout_id = p_checkout_id, creare_in_curs_la = NULL, updated_at = now() WHERE id = c.id;
        c.checkout_id := p_checkout_id;
      END IF;
    END IF;
    IF c.id IS NULL THEN RETURN 0; END IF;
  END IF;

  IF lower(m.status) <> 'completed' THEN RETURN 0; END IF;
  -- 548: returul din pachet (aceeași plată): rândul lui, sub același lacăt al perechii, după tur.
  SELECT * INTO rt FROM bilete_comenzi WHERE comanda_tur_id = c.id AND in_pachet
     AND status IN ('noua', 'eroare_creare', 'expirata') ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF m.amount <> c.total + coalesce(rt.total, 0) THEN
    INSERT INTO bilete_alerte (comanda_id, tip, detalii) VALUES (c.id, 'suma_nepotrivita', format('maib %s ≠ comanda %s', m.amount, c.total + coalesce(rt.total, 0)));
    RETURN 0;
  END IF;
  -- Plata trebuie să fie executată și neatinsă de refund: altfel s-ar emite bilete valide pe bani deja returnați.
  IF lower(coalesce(m.payment_status, '')) <> 'executed' OR coalesce(m.refunded_amount, 0) <> 0 OR m.refund_id IS NOT NULL THEN
    IF c.status IN ('noua', 'eroare_creare', 'expirata') THEN
      INSERT INTO bilete_alerte (comanda_id, tip, detalii)
      VALUES (c.id, 'platita_fara_bilet', format('plata %s / returnat %s / refund %s — nu se emit bilete', coalesce(m.payment_status, '?'), coalesce(m.refunded_amount, 0), coalesce(m.refund_status, '-')));
    END IF;
    RETURN 0;
  END IF;

  IF c.status IN ('noua', 'eroare_creare') THEN
    -- Revalidarea (546): retur pe un tur anulat sau deja folosit, cota depășită după pierderea rezervării, limita
    -- studentului → «platita_fara_bilet» + alertă (fără excepție: banca nu primește 500).
    v_alerta := bilete_revalideaza_plata(c);
    IF v_alerta IS NOT NULL THEN
      UPDATE bilete_comenzi SET status = 'platita_fara_bilet', paid_at = coalesce(m.callback_at, now()), creare_in_curs_la = NULL, updated_at = now()
       WHERE id = c.id OR id = rt.id;
      INSERT INTO bilete_alerte (comanda_id, tip, detalii) VALUES (c.id, v_alerta, 'plata a sosit, dar comanda nu mai e eligibilă — se emite manual sau se returnează');
      RETURN 0;
    END IF;
    UPDATE bilete_comenzi SET status = 'platita', paid_at = coalesce(m.callback_at, now()), creare_in_curs_la = NULL, updated_at = now(),
           cod_retur = CASE WHEN promo_pereche AND comanda_tur_id IS NULL AND NOT proba_fizica AND rt.id IS NULL
                            THEN coalesce(cod_retur, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) ELSE cod_retur END
     WHERE id = c.id;
    FOR i IN 1..c.seats LOOP
      INSERT INTO bilete (comanda_id, nr) VALUES (c.id, i) ON CONFLICT (comanda_id, nr) DO NOTHING;
    END LOOP;
    -- 548: returul din pachet se plătește odată cu turul (turul e acum «platita», deci revalidarea lui trece de tur).
    IF rt.id IS NOT NULL THEN
      v_alerta_rt := bilete_revalideaza_plata(rt);
      IF v_alerta_rt IS NOT NULL THEN
        UPDATE bilete_comenzi SET status = 'platita_fara_bilet', paid_at = coalesce(m.callback_at, now()), creare_in_curs_la = NULL, updated_at = now() WHERE id = rt.id;
        INSERT INTO bilete_alerte (comanda_id, tip, detalii) VALUES (rt.id, v_alerta_rt, 'returul din pachet (aceeași plată cu turul) nu mai e eligibil — se emite manual sau se returnează pachetul');
        RETURN c.seats;
      END IF;
      UPDATE bilete_comenzi SET status = 'platita', paid_at = coalesce(m.callback_at, now()), creare_in_curs_la = NULL, updated_at = now() WHERE id = rt.id;
      FOR i IN 1..rt.seats LOOP
        INSERT INTO bilete (comanda_id, nr) VALUES (rt.id, i) ON CONFLICT (comanda_id, nr) DO NOTHING;
      END LOOP;
      RETURN c.seats + rt.seats;
    END IF;
    RETURN c.seats;
  ELSIF c.status = 'expirata' THEN
    UPDATE bilete_comenzi SET status = 'platita_fara_bilet', paid_at = coalesce(m.callback_at, now()), updated_at = now() WHERE id = c.id OR id = rt.id;
    INSERT INTO bilete_alerte (comanda_id, tip, detalii) VALUES (c.id, 'platita_fara_bilet', 'plata a sosit după expirarea comenzii');
    RETURN 0;
  END IF;
  RETURN 0;
END $$;

CREATE OR REPLACE FUNCTION public.bilete_emite_fara_bilet(p_id uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; m maib_checkouts; i int; v_alerta text; v_ck uuid; v_suma numeric; v_tur uuid;
BEGIN
  PERFORM bilete_lacat_pereche(p_id);
  PERFORM pg_advisory_xact_lock(hashtext('bilete_comanda'));
  SELECT * INTO c FROM bilete_comenzi WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMANDA_INEXISTENTA' USING ERRCODE = 'P0001'; END IF;
  IF c.status <> 'platita_fara_bilet' THEN RAISE EXCEPTION 'STARE_%', upper(c.status) USING ERRCODE = 'P0001'; END IF;
  -- 548: în pachet plata e pe tur; suma băncii = turul + returul din pachet.
  v_tur := CASE WHEN c.in_pachet THEN c.comanda_tur_id ELSE c.id END;
  SELECT checkout_id INTO v_ck FROM bilete_comenzi WHERE id = v_tur;
  IF v_ck IS NULL THEN RAISE EXCEPTION 'FARA_SESIUNE' USING ERRCODE = 'P0001'; END IF;
  SELECT coalesce(sum(total), 0) INTO v_suma FROM bilete_comenzi WHERE id = v_tur OR (comanda_tur_id = v_tur AND in_pachet);
  SELECT * INTO m FROM maib_checkouts WHERE checkout_id = v_ck;
  IF NOT FOUND OR lower(m.status) <> 'completed' OR lower(coalesce(m.payment_status, '')) <> 'executed'
     OR coalesce(m.refunded_amount, 0) <> 0 OR m.refund_id IS NOT NULL THEN
    RAISE EXCEPTION 'PLATA_NEELIGIBILA' USING ERRCODE = 'P0001';
  END IF;
  IF m.amount <> v_suma THEN RAISE EXCEPTION 'SUMA_NEPOTRIVITA' USING ERRCODE = 'P0001'; END IF;
  -- 544: returul pe tur anulat/folosit și studentul peste limită nu se emit nici manual (se returnează). Cota depășită
  -- se poate emite: dispecerul a decis după ce a vorbit cu pasagerul și cu șoferul.
  v_alerta := bilete_revalideaza_plata(c);
  IF v_alerta IN ('retur_tur_anulat', 'plafon_student') THEN RAISE EXCEPTION 'NEELIGIBIL_%', upper(v_alerta) USING ERRCODE = 'P0001'; END IF;

  UPDATE bilete_comenzi SET status = 'platita', updated_at = now(),
         cod_retur = CASE WHEN promo_pereche AND comanda_tur_id IS NULL AND NOT proba_fizica
                          THEN coalesce(cod_retur, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) ELSE cod_retur END
   WHERE id = p_id;
  FOR i IN 1..c.seats LOOP
    INSERT INTO bilete (comanda_id, nr) VALUES (p_id, i) ON CONFLICT (comanda_id, nr) DO NOTHING;
  END LOOP;
  UPDATE bilete_alerte SET rezolvat_la = now()
   WHERE comanda_id = p_id AND tip IN ('platita_fara_bilet', 'cota_depasita') AND rezolvat_la IS NULL;
  RETURN c.seats;
END $$;

CREATE OR REPLACE FUNCTION public.bilete_reactiveaza(p_id uuid) RETURNS bilete_comenzi
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; m maib_checkouts; v_alerta text;
BEGIN
  PERFORM bilete_lacat_pereche(p_id);
  PERFORM pg_advisory_xact_lock(hashtext('bilete_comanda'));
  SELECT * INTO c FROM bilete_comenzi WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMANDA_INEXISTENTA' USING ERRCODE = 'P0001'; END IF;
  IF c.status <> 'anulata' THEN RETURN c; END IF;
  IF c.in_pachet THEN RAISE EXCEPTION 'PACHET_DIN_TUR' USING ERRCODE = 'P0001'; END IF;
  IF c.checkout_id IS NOT NULL THEN
    SELECT * INTO m FROM maib_checkouts WHERE checkout_id = c.checkout_id;
    IF FOUND AND (m.refund_id IS NOT NULL OR coalesce(m.refunded_amount, 0) <> 0) THEN
      RAISE EXCEPTION 'REFUND_EXISTENT' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  UPDATE bilete SET status = 'valid' WHERE comanda_id = p_id AND status = 'anulat';
  -- 548: returul din pachet (același refund refuzat) revine odată cu turul.
  UPDATE bilete SET status = 'valid' WHERE status = 'anulat' AND comanda_id IN
    (SELECT id FROM bilete_comenzi WHERE comanda_tur_id = p_id AND in_pachet AND status = 'anulata');
  UPDATE bilete_comenzi SET status = 'platita', cancelled_at = NULL, cancel_source = NULL, refund_reason = NULL, updated_at = now()
   WHERE comanda_tur_id = p_id AND in_pachet AND status = 'anulata';
  UPDATE bilete_comenzi
     SET status = 'platita', cancelled_at = NULL, cancel_source = NULL, refund_reason = NULL, scazut_la_refund = 0, updated_at = now()
   WHERE id = p_id
  RETURNING * INTO c;
  -- 544 (Codex r2 C2): după un refuz bancar, comanda revine doar dacă e încă eligibilă; altfel așteaptă dispecerul.
  v_alerta := bilete_revalideaza_plata(c);
  IF v_alerta IN ('retur_tur_anulat', 'plafon_student') THEN
    UPDATE bilete SET status = 'anulat' WHERE comanda_id = p_id AND status = 'valid';
    UPDATE bilete_comenzi SET status = 'platita_fara_bilet', updated_at = now() WHERE id = p_id RETURNING * INTO c;
    INSERT INTO bilete_alerte (comanda_id, tip, detalii) VALUES (p_id, v_alerta, 'refund refuzat de bancă; comanda nu mai e eligibilă — se returnează manual');
  END IF;
  RETURN c;
END $$;

CREATE OR REPLACE FUNCTION public.bilete_anuleaza(p_id uuid, p_sursa text, p_motiv text, p_grila numeric,
                                                  p_vina_noastra boolean, p_si_returul boolean, p_grila_retur numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; rt bilete_comenzi; n int; v_suma numeric; v_scazut numeric := 0; rez jsonb := '[]'::jsonb; v_rt_urcat boolean;
BEGIN
  IF p_sursa NOT IN ('pasager', 'admin', 'sistem', 'ai') THEN RAISE EXCEPTION 'SURSA_NEVALIDA' USING ERRCODE = 'P0001'; END IF;
  IF p_grila IS NULL OR p_grila < 0 THEN RAISE EXCEPTION 'GRILA_NEVALIDA' USING ERRCODE = 'P0001'; END IF;
  PERFORM bilete_lacat_pereche(p_id);
  SELECT * INTO c FROM bilete_comenzi WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMANDA_INEXISTENTA' USING ERRCODE = 'P0001'; END IF;
  IF c.status IN ('anulata', 'returnata') THEN
    RETURN jsonb_build_array(jsonb_build_object('id', c.id, 'suma', null, 'status', c.status, 'deja', true));
  END IF;
  IF c.status NOT IN ('platita', 'platita_fara_bilet') THEN RAISE EXCEPTION 'STARE_%', upper(c.status) USING ERRCODE = 'P0001'; END IF;
  -- 548: tur-returul plătit o dată se anulează doar împreună, din tur.
  IF c.in_pachet THEN RAISE EXCEPTION 'PACHET_DOAR_IMPREUNA' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) INTO n FROM bilete WHERE comanda_id = p_id AND status = 'urcat';
  IF n > 0 THEN RAISE EXCEPTION 'BILET_URCAT' USING ERRCODE = 'P0001'; END IF;
  IF p_grila > c.total THEN RAISE EXCEPTION 'GRILA_PESTE_TOTAL' USING ERRCODE = 'P0001'; END IF;

  v_suma := p_grila;
  -- Returul plătit legat de acest tur (doar pentru un tur: comanda_tur_id e null).
  IF c.comanda_tur_id IS NULL THEN
    SELECT * INTO rt FROM bilete_comenzi WHERE comanda_tur_id = c.id
       AND (status = 'platita' OR (in_pachet AND status = 'platita_fara_bilet')) ORDER BY in_pachet DESC LIMIT 1 FOR UPDATE;
  END IF;
  IF rt.id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM bilete WHERE comanda_id = rt.id AND status = 'urcat') INTO v_rt_urcat;
    IF coalesce(p_si_returul, false) OR rt.in_pachet THEN
      IF v_rt_urcat THEN RAISE EXCEPTION 'RETUR_URCAT' USING ERRCODE = 'P0001'; END IF;
      -- Fără grila returului (dispecerul din /bilete) = integral: returul n-a plecat, banii lui se întorc toți.
      p_grila_retur := coalesce(p_grila_retur, rt.total);
      IF p_grila_retur < 0 OR p_grila_retur > rt.total THEN RAISE EXCEPTION 'GRILA_RETUR_NEVALIDA' USING ERRCODE = 'P0001'; END IF;
      UPDATE bilete SET status = 'anulat' WHERE comanda_id = rt.id AND status = 'valid';
      UPDATE bilete_comenzi SET status = 'anulata', cancelled_at = now(), cancel_source = p_sursa,
             refund_reason = left('împreună cu turul: ' || coalesce(p_motiv, ''), 500), updated_at = now()
       WHERE id = rt.id;
      rez := rez || jsonb_build_array(jsonb_build_object('id', rt.id, 'suma', p_grila_retur, 'status', 'anulata'));
    ELSIF NOT coalesce(p_vina_noastra, false) THEN
      v_suma := greatest(0, p_grila - rt.reducere_lei_loc * rt.seats);
      v_scazut := p_grila - v_suma;
    END IF;
  END IF;

  UPDATE bilete SET status = 'anulat' WHERE comanda_id = p_id AND status = 'valid';
  UPDATE bilete_comenzi
     SET status = 'anulata', cancelled_at = now(), cancel_source = p_sursa, refund_reason = left(p_motiv, 500),
         scazut_la_refund = v_scazut, updated_at = now()
   WHERE id = p_id;
  rez := jsonb_build_array(jsonb_build_object('id', c.id, 'suma', v_suma, 'status', 'anulata', 'scazut', v_scazut)) || rez;
  RETURN rez;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bilete_creeaza_comanda(jsonb)', 'bilete_marcheaza_platita(uuid)', 'bilete_emite_fara_bilet(uuid)',
    'bilete_reactiveaza(uuid)', 'bilete_anuleaza(uuid, text, text, numeric, boolean, boolean, numeric)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', t);
  END LOOP;
END $$;

-- Probă (anulată la sfârșit): pachet tur 150 + retur 120 → o plată de 270 emite ambele; returul nu se anulează singur;
-- anularea turului dă ambele rânduri; o plată de 150 (suma greșită) nu emite nimic.
DO $$
DECLARE tur bilete_comenzi; ret bilete_comenzi; ck uuid; ra int; rb int; base jsonb; n int; r jsonb;
BEGIN
  SELECT min(id) INTO ra FROM crm_routes WHERE active;
  SELECT min(id) INTO rb FROM crm_routes WHERE active AND id <> ra;
  base := jsonb_build_object('from_stop_order', 1, 'to_stop_order', 2, 'passenger_name', 'Proba 548', 'phone', '37360548548', 'promo_pereche', true, 'test', false, 'seats', 1);
  tur := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-06-01', 'crm_route_id', ra,
          'going_north', false, 'departure_at', '2031-06-01T06:00:00+03', 'from_name', 'Bălți', 'to_name', 'Chișinău', 'price_per_seat', 150, 'total', 150, 'ip_hash', 'p548a'));
  -- returul pe aceeași rută: refuzat și în pachet
  BEGIN
    PERFORM bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-06-03', 'crm_route_id', ra,
      'going_north', true, 'departure_at', '2031-06-03T15:00:00+03', 'from_name', 'Chișinău', 'to_name', 'Bălți', 'price_per_seat', 120, 'total', 120,
      'pret_intreg', 150, 'reducere_tip', 'retur', 'reducere_pct', 20, 'comanda_tur_id', tur.id, 'in_pachet', true, 'ip_hash', 'p548b'));
    RAISE EXCEPTION 'P548: pachet pe aceeași rută a trecut';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'RETUR_TUR_NEVALID' THEN RAISE; END IF; END;
  ret := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-06-03', 'crm_route_id', rb,
           'going_north', true, 'departure_at', '2031-06-03T15:00:00+03', 'from_name', 'Chișinău', 'to_name', 'Bălți', 'price_per_seat', 120, 'total', 120,
           'pret_intreg', 150, 'reducere_tip', 'retur', 'reducere_pct', 20, 'comanda_tur_id', tur.id, 'in_pachet', true, 'ip_hash', 'p548c'));
  IF NOT ret.in_pachet THEN RAISE EXCEPTION 'P548: returul nu e în pachet'; END IF;
  -- suma greșită (doar turul): nimic
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck, tur.id::text, 'sandbox', 150, 'Completed', 'Executed', 0);
  UPDATE bilete_comenzi SET checkout_id = ck WHERE id = tur.id;
  n := bilete_marcheaza_platita(ck);
  IF n <> 0 THEN RAISE EXCEPTION 'P548: 150 în loc de 270 a emis bilete'; END IF;
  UPDATE maib_checkouts SET amount = 270 WHERE checkout_id = ck;
  n := bilete_marcheaza_platita(ck);
  SELECT * INTO ret FROM bilete_comenzi WHERE id = ret.id;
  SELECT * INTO tur FROM bilete_comenzi WHERE id = tur.id;
  IF n <> 2 OR tur.status <> 'platita' OR ret.status <> 'platita' OR tur.cod_retur IS NOT NULL THEN
    RAISE EXCEPTION 'P548: plata pachetului (n=%, tur %, retur %, cod %)', n, tur.status, ret.status, tur.cod_retur;
  END IF;
  BEGIN
    PERFORM bilete_anuleaza(ret.id, 'admin', 'probă', 120, false, false, NULL);
    RAISE EXCEPTION 'P548: returul din pachet s-a anulat singur';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'PACHET_DOAR_IMPREUNA' THEN RAISE; END IF; END;
  r := bilete_anuleaza(tur.id, 'admin', 'probă', 150, false, false, NULL);
  IF jsonb_array_length(r) <> 2 OR (r->1->>'suma')::numeric <> 120 THEN RAISE EXCEPTION 'P548: anularea pachetului (%)', r; END IF;
  RAISE EXCEPTION 'PROBA548_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'PROBA548_OK' THEN RAISE; END IF;
END $$;
