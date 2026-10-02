-- 487_bilete_anulare.sql — ION-194 (03.10.2026): anularea comenzii de bilete, în bază, atomic (pasul 6 din ION-190).
-- bilete_anuleaza: comanda «platita» / «platita_fara_bilet» → «anulata» + biletele → «anulat», în aceeași tranzacție,
--   REFUZATĂ dacă vreun bilet e deja «urcat» (clauza (c): după scanare nu se mai returnează). Refund-ul la maib îl
--   face aplicația DUPĂ asta (lib/bilete/refund.ts); dacă banca refuză explicit, bilete_reactiveaza întoarce comanda.
-- bilete_reactiveaza: «anulata» → «platita», biletele «anulat» → «valid», DOAR cât nu există refund creat la bancă.
-- Clauza pasagerului (Ion, 02.10): până la 2 h înaintea plecării → app_config.bilete_anulare_pasager_min = 120.

INSERT INTO app_config (key, value) VALUES ('bilete_anulare_pasager_min', '120') ON CONFLICT (key) DO NOTHING;

-- Sursa «ai»: decizia de returnare o ia AI-ul din botul Telegram (Ion, 03.10: «validarea la refund doar prin
-- Telegram și trebuie să dăm AI să decidă»); funcția de mai jos e doar executorul.
ALTER TABLE bilete_comenzi DROP CONSTRAINT IF EXISTS bilete_comenzi_cancel_source_check;
ALTER TABLE bilete_comenzi ADD CONSTRAINT bilete_comenzi_cancel_source_check CHECK (cancel_source IN ('pasager', 'admin', 'sistem', 'ai'));

CREATE OR REPLACE FUNCTION public.bilete_anuleaza(p_id uuid, p_sursa text, p_motiv text) RETURNS bilete_comenzi
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; n int;
BEGIN
  IF p_sursa NOT IN ('pasager', 'admin', 'sistem', 'ai') THEN RAISE EXCEPTION 'SURSA_NEVALIDA' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO c FROM bilete_comenzi WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMANDA_INEXISTENTA' USING ERRCODE = 'P0001'; END IF;
  IF c.status = 'anulata' OR c.status = 'returnata' THEN RETURN c; END IF;  -- idempotent
  IF c.status NOT IN ('platita', 'platita_fara_bilet') THEN RAISE EXCEPTION 'STARE_%', upper(c.status) USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) INTO n FROM bilete WHERE comanda_id = p_id AND status = 'urcat';
  IF n > 0 THEN RAISE EXCEPTION 'BILET_URCAT' USING ERRCODE = 'P0001'; END IF;

  UPDATE bilete SET status = 'anulat' WHERE comanda_id = p_id AND status = 'valid';
  UPDATE bilete_comenzi
     SET status = 'anulata', cancelled_at = now(), cancel_source = p_sursa, refund_reason = left(p_motiv, 500), updated_at = now()
   WHERE id = p_id
  RETURNING * INTO c;
  RETURN c;
END $$;

CREATE OR REPLACE FUNCTION public.bilete_reactiveaza(p_id uuid) RETURNS bilete_comenzi
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; m maib_checkouts;
BEGIN
  SELECT * INTO c FROM bilete_comenzi WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMANDA_INEXISTENTA' USING ERRCODE = 'P0001'; END IF;
  IF c.status <> 'anulata' THEN RETURN c; END IF;
  IF c.checkout_id IS NOT NULL THEN
    SELECT * INTO m FROM maib_checkouts WHERE checkout_id = c.checkout_id;
    IF FOUND AND (m.refund_id IS NOT NULL OR coalesce(m.refunded_amount, 0) <> 0) THEN
      RAISE EXCEPTION 'REFUND_EXISTENT' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  UPDATE bilete SET status = 'valid' WHERE comanda_id = p_id AND status = 'anulat';
  UPDATE bilete_comenzi
     SET status = 'platita', cancelled_at = NULL, cancel_source = NULL, refund_reason = NULL, updated_at = now()
   WHERE id = p_id
  RETURNING * INTO c;
  RETURN c;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bilete_anuleaza(uuid, text, text)', 'bilete_reactiveaza(uuid)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', t);
  END LOOP;
END $$;

-- Probe la aplicare.
DO $$
DECLARE c bilete_comenzi; ck uuid := gen_random_uuid(); n int; ok boolean;
BEGIN
  c := bilete_creeaza_comanda(jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000487', 'trip_date', '2026-10-14',
        'crm_route_id', (SELECT id FROM crm_routes WHERE active ORDER BY id LIMIT 1), 'going_north', false, 'from_stop_order', 10,
        'to_stop_order', 340, 'from_name', 'Probă', 'to_name', 'Probă', 'departure_at', '2026-10-14T05:45:00+03:00', 'seats', 2,
        'price_per_seat', 283, 'total', 566, 'passenger_name', 'Probă 487', 'phone', '37360000003', 'ip_hash', 'proba487', 'test', true));
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck, c.id::text, 'sandbox', 566, 'Completed', 'Executed', 0);
  PERFORM bilete_marcheaza_platita(ck);
  -- un bilet urcat → anularea e refuzată
  UPDATE bilete SET status = 'urcat' WHERE comanda_id = c.id AND nr = 1;
  ok := false;
  BEGIN PERFORM bilete_anuleaza(c.id, 'pasager', 'probă'); EXCEPTION WHEN OTHERS THEN ok := SQLERRM = 'BILET_URCAT'; END;
  IF NOT ok THEN RAISE EXCEPTION '487: anularea cu bilet urcat nu e refuzată'; END IF;
  UPDATE bilete SET status = 'valid' WHERE comanda_id = c.id AND nr = 1;
  -- anulare ok → comanda anulata, biletele anulat; idempotentă
  c := bilete_anuleaza(c.id, 'pasager', 'probă');
  SELECT count(*) INTO n FROM bilete WHERE comanda_id = c.id AND status = 'anulat';
  IF c.status <> 'anulata' OR n <> 2 THEN RAISE EXCEPTION '487: anularea nu a trecut (% / %)', c.status, n; END IF;
  c := bilete_anuleaza(c.id, 'pasager', 'probă');
  IF c.status <> 'anulata' THEN RAISE EXCEPTION '487: a doua anulare nu e idempotentă'; END IF;
  -- reactivare fără refund → platita + valid; cu refund → refuz
  c := bilete_reactiveaza(c.id);
  SELECT count(*) INTO n FROM bilete WHERE comanda_id = c.id AND status = 'valid';
  IF c.status <> 'platita' OR n <> 2 THEN RAISE EXCEPTION '487: reactivarea nu a trecut (% / %)', c.status, n; END IF;
  c := bilete_anuleaza(c.id, 'admin', 'probă 2');
  UPDATE maib_checkouts SET refund_id = gen_random_uuid(), refund_status = 'Created' WHERE checkout_id = ck;
  ok := false;
  BEGIN PERFORM bilete_reactiveaza(c.id); EXCEPTION WHEN OTHERS THEN ok := SQLERRM = 'REFUND_EXISTENT'; END;
  IF NOT ok THEN RAISE EXCEPTION '487: reactivarea cu refund existent nu e refuzată'; END IF;
  DELETE FROM bilete_comenzi WHERE id = c.id;
  DELETE FROM maib_checkouts WHERE checkout_id = ck;
END $$;
