-- 484_bilete_online_corecturi.sql — ION-193 (03.10.2026): corecturile reviziei de cod (Claude × 3) la migr. 483.
-- 1) Plafoanele numără doar comenzile din ultimele 30 de minute: fără cron (pasul 5), comenzile «noua» abandonate
--    n-ar fi expirat niciodată și 50 de coșuri părăsite ar fi oprit vânzarea pentru toți (REL-1 / SPD-1 / SEC-2).
--    Alerta «plafon_atins» nu se mai scrie din funcție (excepția o anula) — o scrie API-ul.
-- 2) bilete_comenzi.test: comenzile de probă ale adminului nu intră în digestul șoferului și în termenul online (SEC-4).
-- 3) bilete_marcheaza_platita caută comanda și după maib_checkouts.order_id când legarea checkout_id nu s-a scris
--    (SEC-1): plata sosită pe o comandă nelegată NU mai rămâne fără bilet și fără alertă.

ALTER TABLE bilete_comenzi ADD COLUMN IF NOT EXISTS test boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN bilete_comenzi.test IS 'comandă de probă făcută din /plati (mod test_admin); nu intră în digest și în online_lei';

CREATE OR REPLACE FUNCTION public.bilete_creeaza_comanda(p jsonb) RETURNS bilete_comenzi
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE r bilete_comenzi; n int; v_ip text := p->>'ip_hash'; v_phone text := p->>'phone';
BEGIN
  SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = (p->>'idempotency_key')::uuid;
  IF FOUND THEN RETURN r; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bilete_comanda'));

  -- Doar ultimele 30 de minute: sesiunea maib expiră în 25, deci o comandă «noua» mai veche e un coș părăsit.
  SELECT count(*) INTO n FROM bilete_comenzi WHERE ip_hash = coalesce(v_ip, '') AND created_at > now() - interval '10 minutes';
  IF n >= 5 THEN RAISE EXCEPTION 'PLAFON_IP' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) INTO n FROM bilete_comenzi WHERE phone = v_phone AND status = 'noua' AND created_at > now() - interval '30 minutes';
  IF n >= 3 THEN RAISE EXCEPTION 'PLAFON_TELEFON' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) INTO n FROM bilete_comenzi WHERE status = 'noua' AND created_at > now() - interval '30 minutes';
  IF n >= 50 THEN RAISE EXCEPTION 'PLAFON_GLOBAL' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO bilete_comenzi (idempotency_key, trip_date, crm_route_id, going_north, from_stop_order, to_stop_order,
                              from_name, to_name, departure_at, seats, price_per_seat, total, passenger_name, phone,
                              email, lang, ip_hash, test)
  VALUES ((p->>'idempotency_key')::uuid, (p->>'trip_date')::date, (p->>'crm_route_id')::int, (p->>'going_north')::boolean,
          (p->>'from_stop_order')::int, (p->>'to_stop_order')::int, p->>'from_name', p->>'to_name',
          (p->>'departure_at')::timestamptz, (p->>'seats')::smallint, (p->>'price_per_seat')::numeric,
          (p->>'total')::numeric, p->>'passenger_name', v_phone, p->>'email', coalesce(p->>'lang', 'ro'), coalesce(v_ip, ''),
          coalesce((p->>'test')::boolean, false))
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO r;
  IF r.id IS NULL THEN SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = (p->>'idempotency_key')::uuid; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.bilete_marcheaza_platita(p_checkout_id uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; m maib_checkouts; i int;
BEGIN
  SELECT * INTO m FROM maib_checkouts WHERE checkout_id = p_checkout_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT * INTO c FROM bilete_comenzi WHERE checkout_id = p_checkout_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Legarea checkout_id nu s-a scris (eroare după crearea sesiunii): orderId-ul sesiunii e id-ul comenzii.
    IF m.order_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT * INTO c FROM bilete_comenzi WHERE id = m.order_id::uuid AND checkout_id IS NULL FOR UPDATE;
      IF FOUND THEN
        UPDATE bilete_comenzi SET checkout_id = p_checkout_id, creare_in_curs_la = NULL, updated_at = now() WHERE id = c.id;
        c.checkout_id := p_checkout_id;
      END IF;
    END IF;
    IF c.id IS NULL THEN RETURN 0; END IF;  -- nu e o comandă de bilete (ex. plata de test din /plati)
  END IF;

  IF lower(m.status) <> 'completed' THEN RETURN 0; END IF;
  IF m.amount <> c.total THEN
    INSERT INTO bilete_alerte (comanda_id, tip, detalii) VALUES (c.id, 'suma_nepotrivita', format('maib %s ≠ comanda %s', m.amount, c.total));
    RETURN 0;
  END IF;

  IF c.status IN ('noua', 'eroare_creare') THEN
    UPDATE bilete_comenzi SET status = 'platita', paid_at = coalesce(m.callback_at, now()), creare_in_curs_la = NULL, updated_at = now() WHERE id = c.id;
    FOR i IN 1..c.seats LOOP
      INSERT INTO bilete (comanda_id, nr) VALUES (c.id, i);
    END LOOP;
    RETURN c.seats;
  ELSIF c.status = 'expirata' THEN
    UPDATE bilete_comenzi SET status = 'platita_fara_bilet', paid_at = coalesce(m.callback_at, now()), updated_at = now() WHERE id = c.id;
    INSERT INTO bilete_alerte (comanda_id, tip, detalii) VALUES (c.id, 'platita_fara_bilet', 'plata a sosit după expirarea comenzii');
    RETURN 0;
  END IF;
  RETURN 0;
END $$;

-- Probă: comanda legată doar prin order_id primește biletele.
DO $$
DECLARE c bilete_comenzi; ck uuid := gen_random_uuid(); n int;
BEGIN
  c := bilete_creeaza_comanda(jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000484', 'trip_date', '2026-10-14',
        'crm_route_id', (SELECT id FROM crm_routes WHERE active ORDER BY id LIMIT 1), 'going_north', false, 'from_stop_order', 10,
        'to_stop_order', 340, 'from_name', 'Probă', 'to_name', 'Probă', 'departure_at', '2026-10-14T05:45:00+03:00', 'seats', 2,
        'price_per_seat', 283, 'total', 566, 'passenger_name', 'Probă 484', 'phone', '37360000001', 'ip_hash', 'proba484', 'test', true));
  IF NOT c.test THEN RAISE EXCEPTION '484: steagul test nu s-a scris'; END IF;
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status) VALUES (ck, c.id::text, 'sandbox', 566, 'Completed');
  SELECT bilete_marcheaza_platita(ck) INTO n;
  IF n <> 2 THEN RAISE EXCEPTION '484: legarea după order_id nu a emis biletele (%)', n; END IF;
  SELECT bilete_marcheaza_platita(ck) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION '484: a doua marcare nu e idempotentă (%)', n; END IF;
  DELETE FROM bilete_comenzi WHERE id = c.id;
  DELETE FROM maib_checkouts WHERE checkout_id = ck;
END $$;
