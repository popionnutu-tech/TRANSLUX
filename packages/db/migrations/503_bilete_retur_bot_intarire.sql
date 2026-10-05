-- 503_bilete_retur_bot_intarire.sql — ION-244 (05.10.2026): întărirea returnării din bot după auditul de securitate.
--   1. cifrele telefonului se verifică ÎN BAZĂ, cu comanda blocată: contorul crește atomic (cererile paralele nu-l ocolesc);
--   2. oferta se folosește doar cât comanda e încă legată de același cont (dezlegarea o oprește) + IS DISTINCT FROM;
--   4. oferta nouă: expirarea ≤ plecarea − 240 min, totalul = totalul comenzii, suma ≤ total — verificate aici;
--   6. bilete_alerte.telegram_id — plafonul cererilor pe cont fără căutare în text.

ALTER TABLE bilete_alerte ADD COLUMN IF NOT EXISTS telegram_id bigint;
CREATE INDEX IF NOT EXISTS bilete_alerte_telegram_idx ON bilete_alerte (telegram_id, moment DESC) WHERE telegram_id IS NOT NULL;

-- Verificarea cifrelor: întoarce {ok, ramase, blocat}. La reușită leagă verificarea de cont și pune contorul la 0.
CREATE OR REPLACE FUNCTION public.bilete_retur_cifre(p_comanda uuid, p_telegram bigint, p_cifre text, p_max int DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; tel text; cif text; n int;
BEGIN
  SELECT * INTO c FROM bilete_comenzi WHERE id = p_comanda FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OFERTA_COMANDA_INEXISTENTA'; END IF;
  IF c.telegram_id IS DISTINCT FROM p_telegram THEN RAISE EXCEPTION 'OFERTA_NELEGAT'; END IF;
  IF c.telegram_verificat_pentru IS NOT DISTINCT FROM p_telegram THEN RETURN jsonb_build_object('ok', true, 'ramase', p_max, 'blocat', false); END IF;
  IF c.retur_cifre_gresite >= p_max THEN RETURN jsonb_build_object('ok', false, 'ramase', 0, 'blocat', true); END IF;
  tel := regexp_replace(coalesce(c.phone, ''), '\D', '', 'g');
  cif := regexp_replace(coalesce(p_cifre, ''), '\D', '', 'g');
  IF length(tel) >= 4 AND length(cif) = 4 AND right(tel, 4) = cif THEN
    UPDATE bilete_comenzi SET telegram_verificat_pentru = p_telegram, retur_cifre_gresite = 0 WHERE id = p_comanda;
    RETURN jsonb_build_object('ok', true, 'ramase', p_max, 'blocat', false);
  END IF;
  UPDATE bilete_comenzi SET retur_cifre_gresite = retur_cifre_gresite + 1 WHERE id = p_comanda RETURNING retur_cifre_gresite INTO n;
  RETURN jsonb_build_object('ok', false, 'ramase', greatest(p_max - n, 0), 'blocat', n >= p_max);
END $$;

CREATE OR REPLACE FUNCTION public.bilete_retur_oferta_noua(
  p_comanda uuid, p_telegram bigint, p_noimi int, p_suma numeric, p_total numeric, p_expira timestamptz
) RETURNS bilete_retur_oferte
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; o bilete_retur_oferte;
BEGIN
  SELECT * INTO c FROM bilete_comenzi WHERE id = p_comanda FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OFERTA_COMANDA_INEXISTENTA'; END IF;
  IF p_telegram IS NULL OR c.telegram_id IS DISTINCT FROM p_telegram THEN RAISE EXCEPTION 'OFERTA_NELEGAT'; END IF;
  IF c.telegram_verificat_pentru IS DISTINCT FROM p_telegram THEN RAISE EXCEPTION 'OFERTA_NEVERIFICAT'; END IF;
  IF c.status NOT IN ('platita', 'platita_fara_bilet') THEN RAISE EXCEPTION 'OFERTA_STARE'; END IF;
  IF p_expira <= now() OR p_expira > c.departure_at - interval '240 minutes' THEN RAISE EXCEPTION 'OFERTA_EXPIRARE_GRESITA'; END IF;
  IF p_total <> c.total OR p_suma <= 0 OR p_suma > c.total THEN RAISE EXCEPTION 'OFERTA_SUMA_GRESITA'; END IF;
  UPDATE bilete_retur_oferte SET inchisa_la = now()
   WHERE comanda_id = p_comanda AND folosita_la IS NULL AND inchisa_la IS NULL;
  INSERT INTO bilete_retur_oferte (comanda_id, telegram_id, noimi, suma, total, expira_la)
  VALUES (p_comanda, p_telegram, p_noimi, p_suma, p_total, p_expira) RETURNING * INTO o;
  RETURN o;
END $$;

CREATE OR REPLACE FUNCTION public.bilete_retur_foloseste(p_oferta uuid, p_telegram bigint) RETURNS bilete_retur_oferte
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE v_comanda uuid; c bilete_comenzi; o bilete_retur_oferte;
BEGIN
  SELECT comanda_id INTO v_comanda FROM bilete_retur_oferte WHERE id = p_oferta;
  IF NOT FOUND THEN RAISE EXCEPTION 'OFERTA_INEXISTENTA'; END IF;
  SELECT * INTO c FROM bilete_comenzi WHERE id = v_comanda FOR UPDATE;
  SELECT * INTO o FROM bilete_retur_oferte WHERE id = p_oferta FOR UPDATE;
  IF p_telegram IS NULL OR o.telegram_id IS DISTINCT FROM p_telegram THEN RAISE EXCEPTION 'OFERTA_STRAINA'; END IF;
  IF o.folosita_la IS NOT NULL THEN RAISE EXCEPTION 'OFERTA_FOLOSITA'; END IF;
  -- comanda dezlegată (sau legată de alt cont) după ofertă → oferta nu mai e bună
  IF o.inchisa_la IS NOT NULL OR c.telegram_id IS DISTINCT FROM p_telegram THEN RAISE EXCEPTION 'OFERTA_INCHISA'; END IF;
  IF now() > o.expira_la THEN RAISE EXCEPTION 'OFERTA_EXPIRATA'; END IF;
  UPDATE bilete_retur_oferte SET folosita_la = now(), validata_la = now() WHERE id = p_oferta RETURNING * INTO o;
  RETURN o;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bilete_retur_oferta_noua(uuid, bigint, int, numeric, numeric, timestamptz)', 'bilete_retur_foloseste(uuid, bigint)', 'bilete_retur_cifre(uuid, bigint, text, int)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', t);
  END LOOP;
END $$;

-- Probe la aplicare.
DO $$
DECLARE c bilete_comenzi; o bilete_retur_oferte; r jsonb; ok boolean; i int;
BEGIN
  IF has_function_privilege('anon', 'public.bilete_retur_cifre(uuid, bigint, text, int)', 'EXECUTE') THEN RAISE EXCEPTION '503: cifrele executabile de anon'; END IF;
  c := bilete_creeaza_comanda(jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000503', 'trip_date', '2026-12-14',
        'crm_route_id', (SELECT id FROM crm_routes WHERE active ORDER BY id LIMIT 1), 'going_north', false, 'from_stop_order', 10,
        'to_stop_order', 340, 'from_name', 'Probă', 'to_name', 'Probă', 'departure_at', '2026-12-14T05:45:00+02:00', 'seats', 1,
        'price_per_seat', 135, 'total', 135, 'passenger_name', 'Probă 503', 'phone', '37360000503', 'ip_hash', 'proba503'));
  UPDATE bilete_comenzi SET status = 'platita', telegram_id = 503503 WHERE id = c.id;
  -- fără cifre verificate → fără ofertă
  ok := false;
  BEGIN PERFORM bilete_retur_oferta_noua(c.id, 503503, 9, 135, 135, now() + interval '15 minutes'); EXCEPTION WHEN OTHERS THEN ok := SQLERRM = 'OFERTA_NEVERIFICAT'; END;
  IF NOT ok THEN RAISE EXCEPTION '503: ofertă fără cifre'; END IF;
  -- 5 greșeli → blocat; a 6-a, chiar corectă, rămâne blocată
  FOR i IN 1..5 LOOP r := bilete_retur_cifre(c.id, 503503, '0000'); END LOOP;
  IF NOT (r->>'blocat')::boolean THEN RAISE EXCEPTION '503: nu s-a blocat după 5'; END IF;
  r := bilete_retur_cifre(c.id, 503503, '0503');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION '503: blocat dar acceptat'; END IF;
  UPDATE bilete_comenzi SET retur_cifre_gresite = 0 WHERE id = c.id;
  r := bilete_retur_cifre(c.id, 503503, '05 03');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION '503: cifrele corecte refuzate'; END IF;
  -- suma peste total / expirare după prag → refuz
  ok := false;
  BEGIN PERFORM bilete_retur_oferta_noua(c.id, 503503, 9, 200, 135, now() + interval '15 minutes'); EXCEPTION WHEN OTHERS THEN ok := SQLERRM = 'OFERTA_SUMA_GRESITA'; END;
  IF NOT ok THEN RAISE EXCEPTION '503: sumă peste total acceptată'; END IF;
  ok := false;
  BEGIN PERFORM bilete_retur_oferta_noua(c.id, 503503, 9, 135, 135, c.departure_at - interval '1 hour'); EXCEPTION WHEN OTHERS THEN ok := SQLERRM = 'OFERTA_EXPIRARE_GRESITA'; END;
  IF NOT ok THEN RAISE EXCEPTION '503: expirare după prag acceptată'; END IF;
  -- dezlegarea după ofertă o oprește
  o := bilete_retur_oferta_noua(c.id, 503503, 9, 135, 135, now() + interval '15 minutes');
  UPDATE bilete_comenzi SET telegram_id = NULL WHERE id = c.id;
  ok := false;
  BEGIN PERFORM bilete_retur_foloseste(o.id, 503503); EXCEPTION WHEN OTHERS THEN ok := SQLERRM = 'OFERTA_INCHISA'; END;
  IF NOT ok THEN RAISE EXCEPTION '503: oferta a mers după dezlegare'; END IF;
  ok := false;
  BEGIN PERFORM bilete_retur_foloseste(o.id, NULL); EXCEPTION WHEN OTHERS THEN ok := SQLERRM = 'OFERTA_STRAINA'; END;
  IF NOT ok THEN RAISE EXCEPTION '503: NULL a trecut'; END IF;
  DELETE FROM bilete_retur_oferte WHERE comanda_id = c.id;
  DELETE FROM bilete_comenzi WHERE id = c.id;
END $$;
