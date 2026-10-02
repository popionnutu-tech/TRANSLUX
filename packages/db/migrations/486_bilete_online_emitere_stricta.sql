-- 486_bilete_online_emitere_stricta.sql — ION-193 (03.10.2026): Codex runda 2 (Y1, X13).
-- 1) bilete_marcheaza_platita emite bilete DOAR pe o plată Executed fără nimic returnat: o sesiune Completed cu plata
--    Refunded/PartiallyRefunded (ex. returnată din /plati cât comanda era orfană) nu mai produce bilete valide;
--    cazul se semnalează ca alertă, nu se emite.
-- 2) bilete_plafon devine atomic pe cheie (advisory lock) și curăță periodic TOATE rândurile vechi, nu doar ale
--    cheii reapelate (IP-urile care nu revin nu mai lasă rânduri pe veci). Index pe moment pentru curățare.

CREATE OR REPLACE FUNCTION public.bilete_marcheaza_platita(p_checkout_id uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; m maib_checkouts; i int;
BEGIN
  SELECT * INTO m FROM maib_checkouts WHERE checkout_id = p_checkout_id;
  IF NOT FOUND THEN RETURN 0; END IF;

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
  IF m.amount <> c.total THEN
    INSERT INTO bilete_alerte (comanda_id, tip, detalii) VALUES (c.id, 'suma_nepotrivita', format('maib %s ≠ comanda %s', m.amount, c.total));
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
    UPDATE bilete_comenzi SET status = 'platita', paid_at = coalesce(m.callback_at, now()), creare_in_curs_la = NULL, updated_at = now() WHERE id = c.id;
    FOR i IN 1..c.seats LOOP
      INSERT INTO bilete (comanda_id, nr) VALUES (c.id, i) ON CONFLICT (comanda_id, nr) DO NOTHING;
    END LOOP;
    RETURN c.seats;
  ELSIF c.status = 'expirata' THEN
    UPDATE bilete_comenzi SET status = 'platita_fara_bilet', paid_at = coalesce(m.callback_at, now()), updated_at = now() WHERE id = c.id;
    INSERT INTO bilete_alerte (comanda_id, tip, detalii) VALUES (c.id, 'platita_fara_bilet', 'plata a sosit după expirarea comenzii');
    RETURN 0;
  END IF;
  RETURN 0;
END $$;

CREATE INDEX IF NOT EXISTS bilete_api_apeluri_moment_idx ON bilete_api_apeluri (moment);

CREATE OR REPLACE FUNCTION public.bilete_plafon(p_cheie text, p_fereastra_s int, p_max int) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '3s' AS $$
DECLARE n int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bilete_plafon:' || p_cheie));
  -- Curățenie globală, rară (1 din ~50 de apeluri): rândurile de peste o oră, ale oricărei chei.
  IF random() < 0.02 THEN DELETE FROM bilete_api_apeluri WHERE moment < now() - interval '1 hour'; END IF;
  DELETE FROM bilete_api_apeluri WHERE cheie = p_cheie AND moment < now() - interval '5 minutes';
  SELECT count(*) INTO n FROM bilete_api_apeluri WHERE cheie = p_cheie AND moment > now() - make_interval(secs => p_fereastra_s);
  IF n >= p_max THEN RETURN false; END IF;
  INSERT INTO bilete_api_apeluri (cheie) VALUES (p_cheie);
  RETURN true;
END $$;

-- Probă: plata Completed dar Refunded nu emite bilete; Executed emite.
DO $$
DECLARE c bilete_comenzi; ck uuid := gen_random_uuid(); ck2 uuid := gen_random_uuid(); n int; a int;
BEGIN
  c := bilete_creeaza_comanda(jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000486', 'trip_date', '2026-10-14',
        'crm_route_id', (SELECT id FROM crm_routes WHERE active ORDER BY id LIMIT 1), 'going_north', false, 'from_stop_order', 10,
        'to_stop_order', 340, 'from_name', 'Probă', 'to_name', 'Probă', 'departure_at', '2026-10-14T05:45:00+03:00', 'seats', 1,
        'price_per_seat', 283, 'total', 283, 'passenger_name', 'Probă 486', 'phone', '37360000002', 'ip_hash', 'proba486', 'test', true));
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck, c.id::text, 'sandbox', 283, 'Completed', 'Refunded', 283);
  SELECT bilete_marcheaza_platita(ck) INTO n;
  SELECT count(*) INTO a FROM bilete_alerte WHERE comanda_id = c.id AND tip = 'platita_fara_bilet';
  IF n <> 0 OR a <> 1 THEN RAISE EXCEPTION '486: plata returnată a emis bilete (%) sau n-a alertat (%)', n, a; END IF;
  UPDATE maib_checkouts SET payment_status = 'Executed', refunded_amount = 0 WHERE checkout_id = ck;
  SELECT bilete_marcheaza_platita(ck) INTO n;
  IF n <> 1 THEN RAISE EXCEPTION '486: plata executată nu a emis biletul (%)', n; END IF;
  DELETE FROM bilete_comenzi WHERE id = c.id;
  DELETE FROM maib_checkouts WHERE checkout_id IN (ck, ck2);
END $$;
