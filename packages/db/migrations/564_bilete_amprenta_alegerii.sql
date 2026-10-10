-- 564_bilete_amprenta_alegerii.sql — N3 + F15 + reactivarea fără dispecer (dezbaterea Claude ⇄ Codex, 10.10.2026; Codex r3 C3).
--
-- 1. N3: amprenta alegerii cumpărătorului (apps/admin/src/lib/bilete/amprenta.ts: cursa, opririle, locurile pe ambele sensuri,
--    numărul de locuri, numele, telefonul, e-mailul, punctul de urcare, intrarea promoției, returul cu locurile lui) se scrie
--    pe rând (bilete_comenzi.amprenta). bilete_creeaza_comanda întorcea rândul existent cu aceeași cheie ÎNAINTE și DUPĂ
--    lacăt fără să compare conținutul: o cerere concurentă cu altă alegere primea comanda (și sesiunea) celeilalte. Acum
--    rândul se întoarce doar cu aceeași amprentă, altfel IDEMPOTENTA_CONTINUT (→ «idempotenta» în panou; site-ul vine cu
--    chei noi și cheia veche în `inlocuieste`). Apelantul fără amprentă (codul de dinaintea deploy-ului) nu e verificat.
-- 2. F15 (Codex r3 C3): un al doilea retur din pachet pe același tur nu se creează niciodată, în nicio stare a primului
--    (suma pachetului le-ar număra pe amândouă) — RETUR_PACHET_EXISTENT, sub lacătul perechii. Reluarea returului identic
--    (aceeași cheie, aceeași amprentă) rămâne: verificarea cheii e înaintea acestei reguli.
-- 3. bilete_reactiveaza (copiată textual din 558): după refuzul băncii, comanda care nu mai e eligibilă (returul pe un tur
--    anulat, limita studentului) rămânea «platita_fara_bilet» cu alerta «se returnează manual». Ion, 10.10.2026: «dispecer
--    nu va fi» — acum toți membrii lăsați «platita_fara_bilet» (comanda și returul din pachet readus fără bilete) primesc o
--    intenție de refund INTEGRAL (558), în aceeași tranzacție, ca plățile târzii din 560; alerta spune doar că banii se
--    întorc automat.

ALTER TABLE bilete_comenzi ADD COLUMN IF NOT EXISTS amprenta text;
COMMENT ON COLUMN bilete_comenzi.amprenta IS 'Amprenta alegerii cumpărătorului (564, N3; lib/bilete/amprenta.ts). Aceeași idempotency_key se refolosește doar cu aceeași amprentă.';

-- bilete_creeaza_comanda (copiată textual din 553) + 564: amprenta comparată la ambele întoarceri ale rândului existent
-- (înainte și sub lacăt) și scrisă la INSERT; al doilea retur din pachet refuzat sub lacătul perechii.
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
        v_amprenta text := nullif(p->>'amprenta', '');
BEGIN
  SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = v_key;
  -- 564 (N3): aceeași cheie, altă alegere → refuz, nu comanda altei cereri. Rândul fără amprentă (de dinainte de 564) nu se
  -- potrivește cu nicio amprentă: cererea nouă e refuzată și formularul face o comandă nouă care o înlocuiește pe cea veche.
  IF FOUND THEN
    IF v_amprenta IS NOT NULL AND r.amprenta IS DISTINCT FROM v_amprenta THEN RAISE EXCEPTION 'IDEMPOTENTA_CONTINUT' USING ERRCODE = 'P0001'; END IF;
    RETURN r;
  END IF;

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
  -- 564 (N3, Codex r3 C3): «identică» = aceeași amprentă; cererea concurentă cu altă alegere e refuzată aici, sub lacăt.
  SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_amprenta IS NOT NULL AND r.amprenta IS DISTINCT FROM v_amprenta THEN RAISE EXCEPTION 'IDEMPOTENTA_CONTINUT' USING ERRCODE = 'P0001'; END IF;
    RETURN r;
  END IF;
  -- 564 (F15): un singur retur din pachet pe tur, în orice stare (și expirat): al doilea nu se creează. Sub lacătul perechii
  -- (luat mai sus pentru v_tur_id), deci două cereri concurente nu pot trece amândouă.
  IF v_pachet AND v_tur_id IS NOT NULL AND EXISTS (SELECT 1 FROM bilete_comenzi WHERE comanda_tur_id = v_tur_id AND in_pachet) THEN
    RAISE EXCEPTION 'RETUR_PACHET_EXISTENT' USING ERRCODE = 'P0001';
  END IF;

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
                              promo_pereche, loc_cheie, cota_online, in_pachet, amprenta)
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
          coalesce((p->>'promo_pereche')::boolean, false), v_chei, v_cota, v_pachet AND v_red = 'retur', v_amprenta)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO r;
  IF r.id IS NULL THEN
    SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = v_key;
    IF v_amprenta IS NOT NULL AND r.amprenta IS DISTINCT FROM v_amprenta THEN RAISE EXCEPTION 'IDEMPOTENTA_CONTINUT' USING ERRCODE = 'P0001'; END IF;
  END IF;
  IF v_red = 'student' THEN UPDATE bilete_studenti_verificari SET comanda_id = r.id WHERE id = v_stud; END IF;
  RETURN r;
END $$;

REVOKE EXECUTE ON FUNCTION public.bilete_creeaza_comanda(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bilete_creeaza_comanda(jsonb) TO service_role;

-- bilete_reactiveaza (copiată textual din 558) + 564: membrii rămași «platita_fara_bilet» → intenția de refund integral.
CREATE OR REPLACE FUNCTION public.bilete_reactiveaza(p_id uuid) RETURNS bilete_comenzi
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; m maib_checkouts; v_alerta text; v_membri uuid[];
        v_fara uuid[]; v_suma numeric; v_ck uuid; v_int uuid;
BEGIN
  PERFORM bilete_lacat_pereche(p_id);
  PERFORM pg_advisory_xact_lock(hashtext('bilete_comanda'));
  SELECT * INTO c FROM bilete_comenzi WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMANDA_INEXISTENTA' USING ERRCODE = 'P0001'; END IF;
  IF c.status <> 'anulata' THEN RETURN c; END IF;
  -- (returul din pachet anulat singur, «vina noastră», se reactivează singur; checkout-ul e pe tur)
  IF c.checkout_id IS NOT NULL THEN
    SELECT * INTO m FROM maib_checkouts WHERE checkout_id = c.checkout_id;
    IF FOUND AND (m.refund_id IS NOT NULL OR coalesce(m.refunded_amount, 0) <> 0) THEN
      RAISE EXCEPTION 'REFUND_EXISTENT' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- 558: comanda și returul ei din pachet, cu intențiile lor.
  v_membri := ARRAY[p_id] || coalesce((SELECT array_agg(id) FROM bilete_comenzi WHERE comanda_tur_id = p_id AND in_pachet AND status = 'anulata'), '{}');
  PERFORM 1 FROM bilete_refund_intentii WHERE comenzi && v_membri ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM bilete_refund_intentii WHERE comenzi && v_membri AND stare NOT IN ('refuzata', 'anulata')) THEN
    RAISE EXCEPTION 'REFUND_EXISTENT' USING ERRCODE = 'P0001';
  END IF;
  UPDATE bilete_refund_intentii SET stare = 'anulata', revendicare_id = NULL, revendicata_pana = NULL,
         ultima_eroare = 'comanda reactivată după refuzul băncii', actualizata_la = now()
   WHERE comenzi && v_membri AND stare = 'refuzata';
  UPDATE bilete SET status = 'valid' WHERE comanda_id = p_id AND status = 'anulat';
  -- 548: returul din pachet (același refund refuzat) revine odată cu turul.
  UPDATE bilete SET status = 'valid' WHERE status = 'anulat' AND comanda_id IN
    (SELECT id FROM bilete_comenzi WHERE comanda_tur_id = p_id AND in_pachet AND status = 'anulata');
  UPDATE bilete_comenzi b SET status = CASE WHEN EXISTS (SELECT 1 FROM bilete x WHERE x.comanda_id = b.id) THEN 'platita' ELSE 'platita_fara_bilet' END,
         cancelled_at = NULL, cancel_source = NULL, refund_reason = NULL, updated_at = now()
   WHERE b.comanda_tur_id = p_id AND b.in_pachet AND b.status = 'anulata';
  UPDATE bilete_comenzi
     SET status = 'platita', cancelled_at = NULL, cancel_source = NULL, refund_reason = NULL, scazut_la_refund = 0, updated_at = now()
   WHERE id = p_id
  RETURNING * INTO c;
  -- 544 (Codex r2 C2): după un refuz bancar, comanda revine doar dacă e încă eligibilă.
  v_alerta := bilete_revalideaza_plata(c);
  IF v_alerta IN ('retur_tur_anulat', 'plafon_student') THEN
    UPDATE bilete SET status = 'anulat' WHERE comanda_id = p_id AND status = 'valid';
    UPDATE bilete_comenzi SET status = 'platita_fara_bilet', updated_at = now() WHERE id = p_id RETURNING * INTO c;
  END IF;
  -- 564 (Ion, 10.10.2026: «dispecer nu va fi»): tot ce a rămas «platita_fara_bilet» după reactivare (comanda neeligibilă și
  -- returul din pachet readus fără bilete) primește intenția de refund INTEGRAL, în aceeași tranzacție (ca plata târzie, 560).
  -- Intențiile refuzate ale membrilor sunt deja «anulata» (mai sus), deci suma nu se dublează; plafonul pe plată îl ține
  -- bilete_refund_intentie_noua. Plata: a comenzii, sau a turului pentru returul din pachet (548).
  SELECT array_agg(id ORDER BY in_pachet, id), sum(total) INTO v_fara, v_suma
    FROM bilete_comenzi WHERE id = ANY (v_membri) AND status = 'platita_fara_bilet';
  IF v_fara IS NOT NULL THEN
    v_ck := CASE WHEN c.in_pachet THEN (SELECT checkout_id FROM bilete_comenzi WHERE id = c.comanda_tur_id) ELSE c.checkout_id END;
    v_int := bilete_refund_intentie_noua(v_ck, v_fara, v_suma,
               format('refund refuzat de bancă; după reactivare comanda nu mai are bilet (%s) — banii se întorc integral', coalesce(v_alerta, 'retur fără bilet')),
               'fara_bilet', format('reactivare:%s:%s', p_id, extract(epoch FROM clock_timestamp())));
    INSERT INTO bilete_alerte (comanda_id, tip, detalii)
    VALUES (p_id, coalesce(v_alerta, 'platita_fara_bilet'),
            format('refund refuzat de bancă; după reactivare comanda nu mai e eligibilă (%s): %s lei se întorc automat (intenția %s)', coalesce(v_alerta, 'retur fără bilet'), v_suma, v_int));
  END IF;
  RETURN c;
END $$;

REVOKE EXECUTE ON FUNCTION public.bilete_reactiveaza(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bilete_reactiveaza(uuid) TO service_role;

-- Probă (anulată la sfârșit): amprenta la reluare (aceeași → același rând; alta → IDEMPOTENTA_CONTINUT; apelantul vechi fără
-- amprentă → rândul); al doilea retur din pachet refuzat și când primul a expirat, reluarea returului identic merge;
-- reactivarea unui retur din pachet al cărui tur a fost anulat între timp → «platita_fara_bilet» + intenția integrală, fără
-- alerta «manual».
DO $$
DECLARE tur bilete_comenzi; ret bilete_comenzi; s bilete_comenzi; x bilete_comenzi; ck uuid; ra int; rb int; base jsonb; pt jsonb; pr jsonb;
        k uuid; kr uuid; r jsonb; i bilete_refund_intentii; n int;
BEGIN
  SELECT min(id) INTO ra FROM crm_routes WHERE active;
  SELECT min(id) INTO rb FROM crm_routes WHERE active AND id <> ra;
  base := jsonb_build_object('from_stop_order', 1, 'to_stop_order', 2, 'passenger_name', 'Proba 564', 'phone', '37360564564', 'test', false,
                             'from_name', 'Bălți', 'to_name', 'Chișinău', 'price_per_seat', 150, 'total', 150, 'seats', 1, 'promo_pereche', false);

  -- 1. N3: aceeași cheie + aceeași amprentă → același rând; altă amprentă → refuz; fără amprentă (cod vechi) → rândul
  k := gen_random_uuid();
  pt := base || jsonb_build_object('idempotency_key', k, 'trip_date', '2031-10-01', 'crm_route_id', rb, 'going_north', false,
                                   'departure_at', '2031-10-01T06:00:00+03', 'ip_hash', 'p564a', 'amprenta', 'a1:proba-1');
  s := bilete_creeaza_comanda(pt);
  IF s.amprenta IS DISTINCT FROM 'a1:proba-1' THEN RAISE EXCEPTION 'P564: amprenta nescrisă (%)', s.amprenta; END IF;
  x := bilete_creeaza_comanda(pt);
  IF x.id <> s.id THEN RAISE EXCEPTION 'P564: reluarea identică a dat alt rând'; END IF;
  BEGIN
    PERFORM bilete_creeaza_comanda(pt || jsonb_build_object('amprenta', 'a1:proba-2', 'passenger_name', 'Alt Nume'));
    RAISE EXCEPTION 'P564: aceeași cheie, altă alegere — acceptată';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'IDEMPOTENTA_CONTINUT' THEN RAISE; END IF; END;
  x := bilete_creeaza_comanda(pt - 'amprenta');
  IF x.id <> s.id THEN RAISE EXCEPTION 'P564: apelantul fără amprentă'; END IF;
  -- rândul vechi, fără amprentă: o cerere cu amprentă nu-l refolosește
  UPDATE bilete_comenzi SET amprenta = NULL WHERE id = s.id;
  BEGIN
    PERFORM bilete_creeaza_comanda(pt);
    RAISE EXCEPTION 'P564: rândul fără amprentă refolosit';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'IDEMPOTENTA_CONTINUT' THEN RAISE; END IF; END;

  -- 2. F15: pachetul tur 150 + retur 120; reluarea returului identic → același rând; al doilea retur → refuz (și după expirare)
  tur := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-10-05', 'crm_route_id', ra,
          'going_north', false, 'departure_at', '2031-10-05T06:00:00+03', 'promo_pereche', true, 'ip_hash', 'p564b', 'phone', '37360564565',
          'amprenta', 'a1:pachet'));
  kr := gen_random_uuid();
  pr := base || jsonb_build_object('idempotency_key', kr, 'trip_date', '2031-10-07', 'crm_route_id', rb,
          'going_north', true, 'departure_at', '2031-10-07T15:00:00+03', 'from_name', 'Chișinău', 'to_name', 'Bălți', 'price_per_seat', 120, 'total', 120,
          'promo_pereche', true, 'pret_intreg', 150, 'reducere_tip', 'retur', 'reducere_pct', 20, 'comanda_tur_id', tur.id, 'in_pachet', true,
          'ip_hash', 'p564c', 'phone', '37360564565', 'amprenta', 'a1:pachet');
  ret := bilete_creeaza_comanda(pr);
  x := bilete_creeaza_comanda(pr);
  IF x.id <> ret.id OR NOT ret.in_pachet THEN RAISE EXCEPTION 'P564: reluarea returului identic'; END IF;
  BEGIN
    PERFORM bilete_creeaza_comanda(pr || jsonb_build_object('idempotency_key', gen_random_uuid()));
    RAISE EXCEPTION 'P564: al doilea retur din pachet creat';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'RETUR_PACHET_EXISTENT' THEN RAISE; END IF; END;
  UPDATE bilete_comenzi SET status = 'expirata' WHERE id = ret.id;
  BEGIN
    PERFORM bilete_creeaza_comanda(pr || jsonb_build_object('idempotency_key', gen_random_uuid()));
    RAISE EXCEPTION 'P564: al doilea retur după expirarea primului';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'RETUR_PACHET_EXISTENT' THEN RAISE; END IF; END;
  UPDATE bilete_comenzi SET status = 'noua' WHERE id = ret.id;

  -- 3. reactivarea fără dispecer: pachetul plătit; returul anulat singur (vina noastră), apoi turul anulat; refundul
  --    returului refuzat de bancă → reactivarea îl lasă «platita_fara_bilet» cu intenția integrală (120) pe plata turului
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount, executat_la)
  VALUES (ck, tur.id::text, 'sandbox', 270, 'Completed', 'Executed', 0, tur.created_at + interval '3 minutes');
  UPDATE bilete_comenzi SET checkout_id = ck WHERE id = tur.id;
  n := bilete_marcheaza_platita(ck);
  IF n <> 2 THEN RAISE EXCEPTION 'P564: plata pachetului (%)', n; END IF;
  r := bilete_anuleaza(ret.id, 'admin', 'cursa de retur anulată', 120, true, false, NULL);
  SELECT * INTO i FROM bilete_refund_intentii WHERE id = (r->0->>'intentie')::uuid;
  IF i.suma <> 120 OR i.comenzi <> ARRAY[ret.id] THEN RAISE EXCEPTION 'P564: intenția returului (%)', r; END IF;
  r := bilete_anuleaza(tur.id, 'admin', 'probă 564', 150, false, false, NULL);
  IF jsonb_array_length(r) <> 1 THEN RAISE EXCEPTION 'P564: anularea turului a luat și returul (%)', r; END IF;
  UPDATE bilete_refund_intentii SET stare = 'refuzata' WHERE id = i.id;
  ret := bilete_reactiveaza(ret.id);
  SELECT * INTO i FROM bilete_refund_intentii WHERE id = i.id;
  IF ret.status <> 'platita_fara_bilet' OR i.stare <> 'anulata' THEN RAISE EXCEPTION 'P564: reactivarea (% / %)', ret.status, i.stare; END IF;
  SELECT * INTO i FROM bilete_refund_intentii WHERE comenzi = ARRAY[ret.id] AND stare = 'de_trimis';
  IF i.id IS NULL OR i.suma <> 120 OR i.checkout_id <> ck OR i.origine <> 'fara_bilet'
     OR NOT (SELECT bani_inapoi FROM bilete_comenzi WHERE id = ret.id)
     OR EXISTS (SELECT 1 FROM bilete WHERE comanda_id = ret.id AND status = 'valid') THEN
    RAISE EXCEPTION 'P564: intenția integrală după reactivare (% % %)', i.id, i.suma, i.origine;
  END IF;
  IF EXISTS (SELECT 1 FROM bilete_alerte WHERE comanda_id = ret.id AND detalii LIKE '%manual%') THEN RAISE EXCEPTION 'P564: alerta «manual» încă scrisă'; END IF;
  IF NOT EXISTS (SELECT 1 FROM bilete_alerte WHERE comanda_id = ret.id AND tip = 'retur_tur_anulat' AND detalii LIKE '%se întorc automat%') THEN
    RAISE EXCEPTION 'P564: alerta informativă lipsește';
  END IF;
  -- suma vie pe plată = 150 (turul) + 120 (returul) = plata întreagă, nu mai mult
  SELECT sum(suma) INTO n FROM bilete_refund_intentii WHERE checkout_id = ck AND stare <> 'anulata';
  IF n <> 270 THEN RAISE EXCEPTION 'P564: suma vie pe plată (%)', n; END IF;
  RAISE EXCEPTION 'PROBA564_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'PROBA564_OK' THEN RAISE; END IF;
END $$;
