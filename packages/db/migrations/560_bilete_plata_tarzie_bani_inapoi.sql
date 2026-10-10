-- 560_bilete_plata_tarzie_bani_inapoi.sql — sesiunile și plățile târzii (dezbaterea Claude ⇄ Codex, 10.10.2026: C2 + D2 + C4).
--
-- Ion, 10.10.2026: «plata după ce cursa pleacă nu poate fi, dispecer nu va fi!!!» (D2). Până acum o plată sosită după
-- plecare emitea bilete (fără nicio verificare a orei), iar una sosită după expirarea comenzii devenea «platita_fara_bilet»
-- + alertă «dispecerul o verifică și te sună».
--
-- Acum:
--   * maib_checkouts.executat_la = ora execuției plății la bancă (callback-ul semnat «paymentExecutedAt», getCheckout /
--     getPayment «executedAt»); rândurile vechi se completează din callback-ul păstrat. Ora necunoscută → nicio
--     clasificare (nu se presupune now()); împăcarea o citește de la bancă și cheamă din nou.
--   * bilete_marcheaza_platita (copiată textual din 548): plata executată după plecare → «platita_fara_bilet» + intenția de
--     refund integral (558) ÎN ACEEAȘI tranzacție; plata executată după rezervare (created_at + 30 min, neprelungită) sau pe
--     o comandă deja «expirata» → biletele se emit doar dacă mai sunt locuri libere (și cota trece), altfel la fel: fără
--     bilet, banii înapoi automat. Orice altă comandă neeligibilă la plată (cota, returul pe tur anulat, limita
--     studentului) primește și ea intenția de refund — nu mai așteaptă dispecerul.
--   * bilete_emite_fara_bilet (copiată din 548) și bilete_anuleaza (copiată din 559) nu mai pot emite / returna a doua
--     oară o comandă cu banii deja în drum înapoi (REFUND_IN_CURS).
--   * bilete_comenzi.impacare_verificata_la: rotația echitabilă a împăcării (pasul B, Codex C2) — scrisă la fiecare
--     verificare, și la eroare, ca nicio comandă să nu rămână neverificată în spatele acelorași 10.

ALTER TABLE maib_checkouts ADD COLUMN IF NOT EXISTS executat_la timestamptz;
COMMENT ON COLUMN maib_checkouts.executat_la IS 'Ora execuției plății la maib (callback paymentExecutedAt / getPayment executedAt), 560. NULL = necunoscută: plata nu se clasifică până nu e citită.';
DO $$
DECLARE r record; v timestamptz;
BEGIN
  FOR r IN SELECT checkout_id, callback->>'paymentExecutedAt' AS t FROM maib_checkouts WHERE executat_la IS NULL AND callback ? 'paymentExecutedAt' LOOP
    BEGIN v := r.t::timestamptz; EXCEPTION WHEN OTHERS THEN v := NULL; END;
    IF v IS NOT NULL THEN UPDATE maib_checkouts SET executat_la = v WHERE checkout_id = r.checkout_id; END IF;
  END LOOP;
END $$;

ALTER TABLE bilete_comenzi ADD COLUMN IF NOT EXISTS impacare_verificata_la timestamptz;
COMMENT ON COLUMN bilete_comenzi.impacare_verificata_la IS 'Ultima verificare a sesiunii maib de către împăcare (560): rotația pasului B, scrisă și la eroare.';
CREATE INDEX IF NOT EXISTS bilete_comenzi_deschise_rotatie_idx ON bilete_comenzi (impacare_verificata_la NULLS FIRST, created_at)
  WHERE status IN ('noua', 'eroare_creare');

-- Câte locuri mai sunt libere pe cursă (biletele vii cu loc + rezervările vii ale altor comenzi), pentru plata venită
-- după rezervare. p_fara_comanda = comanda proprie.
CREATE OR REPLACE FUNCTION public.bilete_locuri_libere(p_trip_date date, p_crm_route_id int, p_going_north boolean, p_fara_comanda uuid) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT bilete_capacitate_autobuz() - (SELECT count(DISTINCT o.loc)::int FROM bilete_locuri_ocupate(p_trip_date, p_crm_route_id, p_going_north, p_fara_comanda) o)
$$;

CREATE OR REPLACE FUNCTION public.bilete_marcheaza_platita(p_checkout_id uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; m maib_checkouts; i int; v_id uuid; v_alerta text; rt bilete_comenzi; v_alerta_rt text; v_suma numeric;
        v_exec timestamptz; v_tarziu text; v_int uuid;
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
  -- Suma pachetului din TOATE rândurile lui (orice stare): un callback repetat după plată nu dă «sumă nepotrivită».
  v_suma := c.total + coalesce((SELECT sum(total) FROM bilete_comenzi WHERE comanda_tur_id = c.id AND in_pachet), 0);
  IF m.amount <> v_suma THEN
    INSERT INTO bilete_alerte (comanda_id, tip, detalii) VALUES (c.id, 'suma_nepotrivita', format('maib %s ≠ comanda %s', m.amount, v_suma));
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

  -- 560 (C2 + D2): ora execuției la bancă — callback-ul semnat (paymentExecutedAt) sau getPayment/getCheckout (executedAt),
  -- scrisă în maib_checkouts.executat_la. Necunoscută → nu se presupune now(): nimic nu se schimbă, împăcarea citește ora de
  -- la bancă și cheamă din nou (Codex C2: «ora necunoscută intră în reconciliere, nu devine automat ora curentă»).
  v_exec := m.executat_la;
  IF v_exec IS NULL AND m.callback ? 'paymentExecutedAt' THEN
    BEGIN v_exec := (m.callback->>'paymentExecutedAt')::timestamptz; EXCEPTION WHEN OTHERS THEN v_exec := NULL; END;
  END IF;

  IF c.status IN ('noua', 'eroare_creare', 'expirata') THEN
    IF v_exec IS NULL THEN RETURN 0; END IF;
    -- D2 (Ion, 10.10: «plata după ce cursa pleacă nu poate fi»): plata executată după plecare → fără bilet, banii înapoi.
    IF v_exec >= c.departure_at THEN
      v_tarziu := 'plata_dupa_plecare';
    -- Rezervarea (created_at + 30 min, neprelungită) expirase la plată: biletele doar dacă locurile mai sunt.
    ELSIF c.status = 'expirata' OR v_exec > c.created_at + bilete_rezervare_durata() THEN
      IF bilete_locuri_libere(c.trip_date, c.crm_route_id, c.going_north, c.id) < c.seats
         OR (rt.id IS NOT NULL AND bilete_locuri_libere(rt.trip_date, rt.crm_route_id, rt.going_north, rt.id) < rt.seats) THEN
        v_tarziu := 'loc_vandut';
      END IF;
    END IF;
    -- Revalidarea (546): retur pe un tur anulat sau deja folosit, cota depășită după pierderea rezervării, limita
    -- studentului → «platita_fara_bilet» (fără excepție: banca nu primește 500).
    v_alerta := coalesce(v_tarziu, bilete_revalideaza_plata(c));
    IF v_alerta IS NOT NULL THEN
      UPDATE bilete_comenzi SET status = 'platita_fara_bilet', paid_at = coalesce(v_exec, m.callback_at, now()), creare_in_curs_la = NULL, updated_at = now()
       WHERE id = c.id OR id = rt.id;
      -- 560: «dispecer nu va fi» — toată plata se întoarce automat; intenția (558) în aceeași tranzacție.
      v_int := bilete_refund_intentie_noua(p_checkout_id, array_remove(ARRAY[c.id, rt.id], NULL), m.amount,
                 format('plata fără bilet (%s), executată la %s', v_alerta, v_exec),
                 CASE WHEN v_tarziu IS NOT NULL THEN 'plata_tarzie' ELSE 'fara_bilet' END, format('plata:%s', p_checkout_id));
      INSERT INTO bilete_alerte (comanda_id, tip, detalii)
      VALUES (c.id, CASE WHEN v_tarziu IS NOT NULL THEN 'platita_fara_bilet' ELSE v_alerta END,
              format('plata executată la %s (%s): bilet neemis; %s lei se întorc automat (intenția %s)', v_exec, v_alerta, m.amount, v_int));
      RETURN 0;
    END IF;
    UPDATE bilete_comenzi SET status = 'platita', paid_at = coalesce(v_exec, m.callback_at, now()), creare_in_curs_la = NULL, updated_at = now(),
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
        UPDATE bilete_comenzi SET status = 'platita_fara_bilet', paid_at = coalesce(v_exec, m.callback_at, now()), creare_in_curs_la = NULL, updated_at = now() WHERE id = rt.id;
        -- 560: partea returului se întoarce automat (refund parțial pe plata turului).
        v_int := bilete_refund_intentie_noua(p_checkout_id, ARRAY[rt.id], rt.total, format('returul din pachet fără bilet (%s)', v_alerta_rt),
                   'fara_bilet', format('plata:%s:%s', p_checkout_id, rt.id));
        INSERT INTO bilete_alerte (comanda_id, tip, detalii)
        VALUES (rt.id, v_alerta_rt, format('returul din pachet (aceeași plată cu turul) nu mai e eligibil; %s lei se întorc automat (intenția %s)', rt.total, v_int));
        RETURN c.seats;
      END IF;
      UPDATE bilete_comenzi SET status = 'platita', paid_at = coalesce(v_exec, m.callback_at, now()), creare_in_curs_la = NULL, updated_at = now() WHERE id = rt.id;
      FOR i IN 1..rt.seats LOOP
        INSERT INTO bilete (comanda_id, nr) VALUES (rt.id, i) ON CONFLICT (comanda_id, nr) DO NOTHING;
      END LOOP;
      RETURN c.seats + rt.seats;
    END IF;
    RETURN c.seats;
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
  -- 560: banii plății sunt deja în drum înapoi (intenția 558) → nu se emit bilete peste ei. O intenție refuzată de bancă
  -- (blocată) nu oprește emiterea: comanda redevine valabilă, iar intenția devine «anulata» (nu se mai datorează nimic).
  IF EXISTS (SELECT 1 FROM bilete_refund_intentii WHERE comenzi && ARRAY[p_id] AND stare NOT IN ('anulata', 'refuzata')) THEN
    RAISE EXCEPTION 'REFUND_IN_CURS' USING ERRCODE = 'P0001';
  END IF;
  UPDATE bilete_refund_intentii SET stare = 'anulata', ultima_eroare = 'biletele au fost emise din panou', actualizata_la = now()
   WHERE comenzi && ARRAY[p_id] AND stare = 'refuzata';
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
                           AND NOT EXISTS (SELECT 1 FROM bilete_comenzi x WHERE x.comanda_tur_id = p_id AND x.in_pachet)
                          THEN coalesce(cod_retur, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) ELSE cod_retur END
   WHERE id = p_id;
  FOR i IN 1..c.seats LOOP
    INSERT INTO bilete (comanda_id, nr) VALUES (p_id, i) ON CONFLICT (comanda_id, nr) DO NOTHING;
  END LOOP;
  UPDATE bilete_alerte SET rezolvat_la = now()
   WHERE comanda_id = p_id AND tip IN ('platita_fara_bilet', 'cota_depasita') AND rezolvat_la IS NULL;
  RETURN c.seats;
END $$;

-- bilete_anuleaza (copiată textual din 559) + 560: nu a doua returnare peste banii deja în drum înapoi.
CREATE OR REPLACE FUNCTION public.bilete_anuleaza(p_id uuid, p_sursa text, p_motiv text, p_grila numeric,
                                                  p_vina_noastra boolean, p_si_returul boolean, p_grila_retur numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; rt bilete_comenzi; n int; v_suma numeric; v_scazut numeric := 0; rez jsonb := '[]'::jsonb; v_rt_urcat boolean;
        v_rt_anulat boolean := false; v_ck uuid; v_int uuid; v_int_rt uuid; v_cheie text := extract(epoch FROM now())::text;
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
  -- 560: plata fără bilet are deja banii în drum înapoi (intenția scrisă la plată) → nu a doua oară.
  IF EXISTS (SELECT 1 FROM bilete_refund_intentii WHERE comenzi && ARRAY[c.id] AND stare <> 'anulata') THEN
    RAISE EXCEPTION 'REFUND_IN_CURS' USING ERRCODE = 'P0001';
  END IF;
  -- 548: tur-returul plătit o dată se anulează doar împreună, din tur.
  -- Excepția: cursa de retur anulată de firmă (sursa «sistem» sau dispecerul cu «vina noastră») — returul singur.
  IF c.in_pachet AND NOT (coalesce(p_vina_noastra, false) OR p_sursa = 'sistem') THEN RAISE EXCEPTION 'PACHET_DOAR_IMPREUNA' USING ERRCODE = 'P0001'; END IF;
  -- Returul plătit legat de acest tur (doar pentru un tur: comanda_tur_id e null).
  -- 559 (N1): returul se identifică ÎNAINTE de lacătul pe bilete, ca ambele comenzi să fie blocate deodată.
  IF c.comanda_tur_id IS NULL THEN
    SELECT * INTO rt FROM bilete_comenzi r WHERE comanda_tur_id = c.id
       AND (status = 'platita' OR (in_pachet AND status = 'platita_fara_bilet'))
       -- 560: returul din pachet fără bilet, cu banii deja în drum înapoi (intenția lui), nu se mai returnează a doua oară
       AND NOT EXISTS (SELECT 1 FROM bilete_refund_intentii x WHERE x.comenzi && ARRAY[r.id] AND x.stare <> 'anulata')
     ORDER BY in_pachet DESC LIMIT 1 FOR UPDATE;
  END IF;
  -- 559 (N1, dezbaterea Claude ⇄ Codex 10.10): biletele comenzii și ale returului legat, blocate într-o ordine stabilă
  -- (id) ÎNAINTE de verificarea «urcat». Scanarea șoferului (UPDATE … WHERE status = 'valid') așteaptă acest lacăt și,
  -- după commit, nu mai găsește biletul «valid»; o scanare comisă înainte e văzută aici → BILET_URCAT / RETUR_URCAT.
  PERFORM 1 FROM bilete WHERE comanda_id IN (c.id, rt.id) ORDER BY id FOR UPDATE;
  SELECT count(*) INTO n FROM bilete WHERE comanda_id = p_id AND status = 'urcat';
  IF n > 0 THEN RAISE EXCEPTION 'BILET_URCAT' USING ERRCODE = 'P0001'; END IF;
  IF p_grila > c.total THEN RAISE EXCEPTION 'GRILA_PESTE_TOTAL' USING ERRCODE = 'P0001'; END IF;

  v_suma := p_grila;
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
      v_rt_anulat := true;
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

  -- 558: intențiile de refund, în aceeași tranzacție. Plata comună a pachetului (548) = o intenție cu ambii membri.
  IF c.in_pachet THEN
    -- returul din pachet anulat singur (vina noastră): refund parțial pe plata turului
    SELECT checkout_id INTO v_ck FROM bilete_comenzi WHERE id = c.comanda_tur_id;
    v_int := bilete_refund_intentie_noua(v_ck, ARRAY[c.id], v_suma, p_motiv, 'anulare', format('anulare:%s:%s', c.id, v_cheie));
  ELSIF v_rt_anulat AND rt.in_pachet THEN
    v_int := bilete_refund_intentie_noua(c.checkout_id, ARRAY[c.id, rt.id], v_suma + p_grila_retur, p_motiv, 'anulare', format('anulare:%s:%s', c.id, v_cheie));
  ELSE
    v_int := bilete_refund_intentie_noua(c.checkout_id, ARRAY[c.id], v_suma, p_motiv, 'anulare', format('anulare:%s:%s', c.id, v_cheie));
    IF v_rt_anulat THEN
      -- returul −20% cumpărat separat: banii lui pe sesiunea lui
      v_int_rt := bilete_refund_intentie_noua(rt.checkout_id, ARRAY[rt.id], p_grila_retur, 'împreună cu turul: ' || coalesce(p_motiv, ''),
                                              'anulare', format('anulare:%s:%s', rt.id, v_cheie));
    END IF;
  END IF;

  IF v_rt_anulat THEN
    rez := jsonb_build_array(jsonb_build_object('id', rt.id, 'suma', p_grila_retur, 'status', 'anulata', 'intentie', v_int_rt));
  END IF;
  rez := jsonb_build_array(jsonb_build_object('id', c.id, 'suma', v_suma, 'status', 'anulata', 'scazut', v_scazut, 'intentie', v_int)) || rez;
  RETURN rez;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bilete_locuri_libere(date, integer, boolean, uuid)', 'bilete_marcheaza_platita(uuid)', 'bilete_emite_fara_bilet(uuid)',
    'bilete_anuleaza(uuid, text, text, numeric, boolean, boolean, numeric)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', t);
  END LOOP;
END $$;

-- Probă (anulată la sfârșit).
DO $$
DECLARE s bilete_comenzi; tur bilete_comenzi; ret bilete_comenzi; ck uuid; ra int; rb int; base jsonb; n int; r jsonb; i bilete_refund_intentii;
        k int; plin bilete_comenzi;
  -- comanda simplă de 1 loc, cu sesiune Completed/Executed (executat_la dat), pe ruta rb
BEGIN
  SELECT min(id) INTO ra FROM crm_routes WHERE active;
  SELECT min(id) INTO rb FROM crm_routes WHERE active AND id <> ra;
  base := jsonb_build_object('from_stop_order', 1, 'to_stop_order', 2, 'passenger_name', 'Proba 560', 'phone', '37360560560', 'test', false,
                             'from_name', 'Bălți', 'to_name', 'Chișinău', 'price_per_seat', 150, 'total', 150, 'seats', 1, 'promo_pereche', false);

  -- 1. ora necunoscută (fără executat_la și fără callback): nimic nu se schimbă
  s := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-09-01', 'crm_route_id', rb,
        'going_north', false, 'departure_at', '2031-09-01T06:00:00+03', 'ip_hash', 'p560a'));
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck, s.id::text, 'sandbox', 150, 'Completed', 'Executed', 0);
  UPDATE bilete_comenzi SET checkout_id = ck WHERE id = s.id;
  n := bilete_marcheaza_platita(ck);
  SELECT * INTO s FROM bilete_comenzi WHERE id = s.id;
  IF n <> 0 OR s.status <> 'noua' THEN RAISE EXCEPTION 'P560: ora necunoscută a schimbat comanda (% %)', n, s.status; END IF;
  -- 2. ora din callback-ul păstrat (7 zecimale, ca maib), la timp → biletul se emite
  UPDATE maib_checkouts SET callback = jsonb_build_object('paymentExecutedAt', to_char((s.created_at + interval '5 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || '.2640194+00:00')
   WHERE checkout_id = ck;
  n := bilete_marcheaza_platita(ck);
  SELECT * INTO s FROM bilete_comenzi WHERE id = s.id;
  IF n <> 1 OR s.status <> 'platita' THEN RAISE EXCEPTION 'P560: plata la timp (% %)', n, s.status; END IF;

  -- 3. plata executată după plecare → fără bilet + intenția integrală, o dată; nu se emite și nu se returnează a doua oară
  s := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-09-02', 'crm_route_id', rb,
        'going_north', false, 'departure_at', '2031-09-02T06:00:00+03', 'ip_hash', 'p560b'));
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount, executat_la)
  VALUES (ck, s.id::text, 'sandbox', 150, 'Completed', 'Executed', 0, '2031-09-02T06:00:01+03');
  UPDATE bilete_comenzi SET checkout_id = ck WHERE id = s.id;
  n := bilete_marcheaza_platita(ck);
  SELECT * INTO s FROM bilete_comenzi WHERE id = s.id;
  SELECT * INTO i FROM bilete_refund_intentii WHERE checkout_id = ck;
  IF n <> 0 OR s.status <> 'platita_fara_bilet' OR i.id IS NULL OR i.suma <> 150 OR i.origine <> 'plata_tarzie' OR i.comenzi <> ARRAY[s.id]
     OR EXISTS (SELECT 1 FROM bilete WHERE comanda_id = s.id) THEN
    RAISE EXCEPTION 'P560: plata după plecare (% %, intenția %)', n, s.status, i.id;
  END IF;
  PERFORM bilete_marcheaza_platita(ck);
  SELECT count(*) INTO n FROM bilete_refund_intentii WHERE checkout_id = ck;
  IF n <> 1 THEN RAISE EXCEPTION 'P560: callback repetat a dublat intenția'; END IF;
  BEGIN PERFORM bilete_emite_fara_bilet(s.id); RAISE EXCEPTION 'P560: emis peste refund';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'REFUND_IN_CURS' THEN RAISE; END IF; END;
  BEGIN PERFORM bilete_anuleaza(s.id, 'admin', 'probă', 150, false, false, NULL); RAISE EXCEPTION 'P560: returnat a doua oară';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'REFUND_IN_CURS' THEN RAISE; END IF; END;

  -- 4. comanda expirată, plătită înainte de plecare, cu locuri libere → biletul se emite
  s := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-09-03', 'crm_route_id', rb,
        'going_north', false, 'departure_at', '2031-09-03T06:00:00+03', 'ip_hash', 'p560c'));
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount, executat_la)
  VALUES (ck, s.id::text, 'sandbox', 150, 'Completed', 'Executed', 0, now() + interval '2 hours');
  UPDATE bilete_comenzi SET checkout_id = ck, status = 'expirata' WHERE id = s.id;
  n := bilete_marcheaza_platita(ck);
  SELECT * INTO s FROM bilete_comenzi WHERE id = s.id;
  IF n <> 1 OR s.status <> 'platita' THEN RAISE EXCEPTION 'P560: expirată cu loc liber (% %)', n, s.status; END IF;

  -- 5. plata după rezervare, autobuzul plin între timp → fără bilet, banii înapoi (loc_vandut)
  plin := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-09-04', 'crm_route_id', rb,
        'going_north', false, 'departure_at', '2031-09-04T06:00:00+03', 'ip_hash', 'p560d'));
  s := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-09-04', 'crm_route_id', rb,
        'going_north', false, 'departure_at', '2031-09-04T06:00:00+03', 'ip_hash', 'p560e', 'phone', '37360560561'));
  UPDATE bilete_comenzi SET status = 'platita' WHERE id = plin.id;
  FOR k IN 1..bilete_capacitate_autobuz() LOOP
    INSERT INTO bilete (comanda_id, nr, loc_nr) VALUES (plin.id, k, k);
  END LOOP;
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount, executat_la)
  VALUES (ck, s.id::text, 'sandbox', 150, 'Completed', 'Executed', 0, s.created_at + interval '40 minutes');
  UPDATE bilete_comenzi SET checkout_id = ck WHERE id = s.id;
  n := bilete_marcheaza_platita(ck);
  SELECT * INTO s FROM bilete_comenzi WHERE id = s.id;
  SELECT * INTO i FROM bilete_refund_intentii WHERE checkout_id = ck;
  IF n <> 0 OR s.status <> 'platita_fara_bilet' OR i.suma <> 150 OR i.origine <> 'plata_tarzie' THEN RAISE EXCEPTION 'P560: loc vândut (% %)', n, s.status; END IF;

  -- 6. pachet: returul neeligibil (cota) → turul primește biletul, returul fără bilet cu refund parțial automat;
  --    anularea turului apoi nu mai ia returul a doua oară (suma rămâne sub plată)
  tur := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-09-05', 'crm_route_id', ra,
          'going_north', false, 'departure_at', '2031-09-05T06:00:00+03', 'promo_pereche', true, 'ip_hash', 'p560f', 'phone', '37360560562'));
  ret := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-09-07', 'crm_route_id', rb,
           'going_north', true, 'departure_at', '2031-09-07T15:00:00+03', 'from_name', 'Chișinău', 'to_name', 'Bălți', 'price_per_seat', 120, 'total', 120,
           'promo_pereche', true, 'pret_intreg', 150, 'reducere_tip', 'retur', 'reducere_pct', 20, 'comanda_tur_id', tur.id, 'in_pachet', true,
           'ip_hash', 'p560g', 'phone', '37360560562'));
  UPDATE bilete_comenzi SET cota_online = 0, loc_cheie = ARRAY['proba560'] WHERE id = ret.id;
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount, executat_la)
  VALUES (ck, tur.id::text, 'sandbox', 270, 'Completed', 'Executed', 0, tur.created_at + interval '3 minutes');
  UPDATE bilete_comenzi SET checkout_id = ck WHERE id = tur.id;
  n := bilete_marcheaza_platita(ck);
  SELECT * INTO tur FROM bilete_comenzi WHERE id = tur.id;
  SELECT * INTO ret FROM bilete_comenzi WHERE id = ret.id;
  SELECT * INTO i FROM bilete_refund_intentii WHERE checkout_id = ck;
  IF n <> 1 OR tur.status <> 'platita' OR ret.status <> 'platita_fara_bilet' OR i.comenzi <> ARRAY[ret.id] OR i.suma <> 120 OR i.origine <> 'fara_bilet' THEN
    RAISE EXCEPTION 'P560: returul neeligibil (% % %)', n, tur.status, ret.status;
  END IF;
  r := bilete_anuleaza(tur.id, 'admin', 'probă 560', 150, false, false, NULL);
  SELECT count(*) INTO n FROM bilete_refund_intentii WHERE checkout_id = ck;
  IF jsonb_array_length(r) <> 1 OR n <> 2 THEN RAISE EXCEPTION 'P560: anularea turului după returul fără bilet (% / %)', r, n; END IF;
  RAISE EXCEPTION 'PROBA560_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'PROBA560_OK' THEN RAISE; END IF;
END $$;
