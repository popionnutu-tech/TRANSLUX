-- 488_bilete_emite_fara_bilet.sql — ION-195 (03.10.2026): «Emite biletele» pentru o comandă platita_fara_bilet
-- (plata a sosit după ce comanda expirase). Doar din /bilete, de admin, după ce a verificat cu pasagerul.
-- Condiții tari, în tranzacție (FOR UPDATE): starea platita_fara_bilet; sesiunea Completed, plata Executed, nimic
-- returnat, fără refund, suma = total. Biletele se creează idempotent. Excluderea cu «Returnează» e prin stare.

CREATE OR REPLACE FUNCTION public.bilete_emite_fara_bilet(p_id uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; m maib_checkouts; i int;
BEGIN
  SELECT * INTO c FROM bilete_comenzi WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMANDA_INEXISTENTA' USING ERRCODE = 'P0001'; END IF;
  IF c.status <> 'platita_fara_bilet' THEN RAISE EXCEPTION 'STARE_%', upper(c.status) USING ERRCODE = 'P0001'; END IF;
  IF c.checkout_id IS NULL THEN RAISE EXCEPTION 'FARA_SESIUNE' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO m FROM maib_checkouts WHERE checkout_id = c.checkout_id;
  IF NOT FOUND OR lower(m.status) <> 'completed' OR lower(coalesce(m.payment_status, '')) <> 'executed'
     OR coalesce(m.refunded_amount, 0) <> 0 OR m.refund_id IS NOT NULL THEN
    RAISE EXCEPTION 'PLATA_NEELIGIBILA' USING ERRCODE = 'P0001';
  END IF;
  IF m.amount <> c.total THEN RAISE EXCEPTION 'SUMA_NEPOTRIVITA' USING ERRCODE = 'P0001'; END IF;

  UPDATE bilete_comenzi SET status = 'platita', updated_at = now() WHERE id = p_id;
  FOR i IN 1..c.seats LOOP
    INSERT INTO bilete (comanda_id, nr) VALUES (p_id, i) ON CONFLICT (comanda_id, nr) DO NOTHING;
  END LOOP;
  UPDATE bilete_alerte SET rezolvat_la = now() WHERE comanda_id = p_id AND tip = 'platita_fara_bilet' AND rezolvat_la IS NULL;
  RETURN c.seats;
END $$;

REVOKE EXECUTE ON FUNCTION public.bilete_emite_fara_bilet(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bilete_emite_fara_bilet(uuid) TO service_role;

-- Probă: comandă expirată + plată sosită → platita_fara_bilet → emiterea dă biletele; cu refund → refuz.
DO $$
DECLARE c bilete_comenzi; ck uuid := gen_random_uuid(); n int; ok boolean;
BEGIN
  c := bilete_creeaza_comanda(jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000488', 'trip_date', '2026-10-14',
        'crm_route_id', (SELECT id FROM crm_routes WHERE active ORDER BY id LIMIT 1), 'going_north', false, 'from_stop_order', 10,
        'to_stop_order', 340, 'from_name', 'Probă', 'to_name', 'Probă', 'departure_at', '2026-10-14T05:45:00+03:00', 'seats', 3,
        'price_per_seat', 283, 'total', 849, 'passenger_name', 'Probă 488', 'phone', '37360000004', 'ip_hash', 'proba488', 'test', true));
  UPDATE bilete_comenzi SET status = 'expirata' WHERE id = c.id;
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck, c.id::text, 'sandbox', 849, 'Completed', 'Executed', 0);
  PERFORM bilete_marcheaza_platita(ck);
  SELECT status INTO c.status FROM bilete_comenzi WHERE id = c.id;
  IF c.status <> 'platita_fara_bilet' THEN RAISE EXCEPTION '488: starea așteptată platita_fara_bilet, e %', c.status; END IF;
  SELECT bilete_emite_fara_bilet(c.id) INTO n;
  IF n <> 3 THEN RAISE EXCEPTION '488: emiterea nu a dat 3 bilete (%)', n; END IF;
  SELECT count(*) INTO n FROM bilete_alerte WHERE comanda_id = c.id AND tip = 'platita_fara_bilet' AND rezolvat_la IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION '488: alerta nu s-a închis'; END IF;
  ok := false;
  BEGIN PERFORM bilete_emite_fara_bilet(c.id); EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'STARE_%'; END;
  IF NOT ok THEN RAISE EXCEPTION '488: a doua emitere nu e refuzată'; END IF;
  DELETE FROM bilete_comenzi WHERE id = c.id;
  DELETE FROM maib_checkouts WHERE checkout_id = ck;
END $$;
