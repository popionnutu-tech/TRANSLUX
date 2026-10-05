-- 502_bilete_retur_bot.sql — ION-244 (05.10.2026): returnarea biletului online în botul Telegram, cu AI.
-- Ion: «trebuie să facem funcția returului» → «prin bot, cu AI»; grila ION-208; suma afișată valabilă 15 minute.
-- Planul (Claude 2 runde + Codex 9.0): docs/plans/2026-10-05-retur-bot-ai.md.
--   * bilete_retur_oferte — oferta cu suma din grilă, legată de contul Telegram, cu expirare
--     least(creata_la + 15 min, plecarea − 240 min) (calculată în panou, verificată aici);
--   * bilete_retur_oferta_noua — o singură ofertă deschisă pe comandă (blochează comanda, închide ofertele vechi);
--   * bilete_retur_foloseste — consumă atomic oferta (comanda întâi, apoi oferta: aceeași ordine de blocare) și întoarce
--     momentul validării (executorul îl folosește ca «acum» la plasa de timp);
--   * bilete_comenzi.telegram_verificat_pentru / retur_cifre_gresite — cele 4 cifre ale telefonului, legate de cont;
--   * alerta nouă «retur_cerere» (dispecerul în /bilete).

ALTER TABLE bilete_comenzi
  ADD COLUMN IF NOT EXISTS telegram_verificat_pentru bigint,
  ADD COLUMN IF NOT EXISTS retur_cifre_gresite smallint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS bilete_retur_oferte (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id   uuid NOT NULL REFERENCES bilete_comenzi(id),
  telegram_id  bigint NOT NULL,
  noimi        smallint NOT NULL CHECK (noimi BETWEEN 1 AND 9),
  suma         numeric(10,2) NOT NULL CHECK (suma > 0),
  total        numeric(10,2) NOT NULL CHECK (total >= suma),
  creata_la    timestamptz NOT NULL DEFAULT now(),
  expira_la    timestamptz NOT NULL,
  inchisa_la   timestamptz,
  folosita_la  timestamptz,
  validata_la  timestamptz,
  rezultat     text
);
CREATE INDEX IF NOT EXISTS bilete_retur_oferte_comanda_idx ON bilete_retur_oferte (comanda_id, creata_la DESC);

-- Lista tipurilor de alerte: cea CURENTĂ din producție (pg_constraint, 05.10, după 501) + «retur_cerere».
ALTER TABLE bilete_alerte DROP CONSTRAINT IF EXISTS bilete_alerte_tip_check;
ALTER TABLE bilete_alerte ADD CONSTRAINT bilete_alerte_tip_check CHECK (tip IN (
  'platita_fara_bilet', 'suma_nepotrivita', 'refund_necunoscut', 'refund_respins', 'cursa_fara_sofer',
  'urcat_pe_anulat', 'creare_esuata', 'plafon_atins', 'refund_pe_zi_confirmata', 'email_esuat',
  'fara_loc', 'loc_schimbat', 'retur_cerere'));

CREATE OR REPLACE FUNCTION public.bilete_retur_oferta_noua(
  p_comanda uuid, p_telegram bigint, p_noimi int, p_suma numeric, p_total numeric, p_expira timestamptz
) RETURNS bilete_retur_oferte
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; o bilete_retur_oferte;
BEGIN
  SELECT * INTO c FROM bilete_comenzi WHERE id = p_comanda FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OFERTA_COMANDA_INEXISTENTA'; END IF;
  IF c.telegram_id IS DISTINCT FROM p_telegram THEN RAISE EXCEPTION 'OFERTA_NELEGAT'; END IF;
  IF c.status NOT IN ('platita', 'platita_fara_bilet') THEN RAISE EXCEPTION 'OFERTA_STARE'; END IF;
  IF p_expira <= now() THEN RAISE EXCEPTION 'OFERTA_EXPIRARE_TRECUTA'; END IF;
  UPDATE bilete_retur_oferte SET inchisa_la = now()
   WHERE comanda_id = p_comanda AND folosita_la IS NULL AND inchisa_la IS NULL;
  INSERT INTO bilete_retur_oferte (comanda_id, telegram_id, noimi, suma, total, expira_la)
  VALUES (p_comanda, p_telegram, p_noimi, p_suma, p_total, p_expira) RETURNING * INTO o;
  RETURN o;
END $$;

CREATE OR REPLACE FUNCTION public.bilete_retur_foloseste(p_oferta uuid, p_telegram bigint) RETURNS bilete_retur_oferte
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE v_comanda uuid; o bilete_retur_oferte;
BEGIN
  SELECT comanda_id INTO v_comanda FROM bilete_retur_oferte WHERE id = p_oferta;
  IF NOT FOUND THEN RAISE EXCEPTION 'OFERTA_INEXISTENTA'; END IF;
  -- Aceeași ordine de blocare ca bilete_retur_oferta_noua: comanda, apoi oferta (fără blocaj reciproc).
  PERFORM 1 FROM bilete_comenzi WHERE id = v_comanda FOR UPDATE;
  SELECT * INTO o FROM bilete_retur_oferte WHERE id = p_oferta FOR UPDATE;
  IF o.telegram_id <> p_telegram THEN RAISE EXCEPTION 'OFERTA_STRAINA'; END IF;
  IF o.folosita_la IS NOT NULL THEN RAISE EXCEPTION 'OFERTA_FOLOSITA'; END IF;
  IF o.inchisa_la IS NOT NULL THEN RAISE EXCEPTION 'OFERTA_INCHISA'; END IF;
  IF now() > o.expira_la THEN RAISE EXCEPTION 'OFERTA_EXPIRATA'; END IF;
  UPDATE bilete_retur_oferte SET folosita_la = now(), validata_la = now() WHERE id = p_oferta RETURNING * INTO o;
  RETURN o;
END $$;

-- Drepturi: tiparul 483/487/490.
DO $$
DECLARE t text;
BEGIN
  ALTER TABLE bilete_retur_oferte ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE bilete_retur_oferte FROM PUBLIC, anon, authenticated;
  GRANT ALL ON TABLE bilete_retur_oferte TO service_role;
  FOREACH t IN ARRAY ARRAY['bilete_retur_oferta_noua(uuid, bigint, int, numeric, numeric, timestamptz)', 'bilete_retur_foloseste(uuid, bigint)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', t);
  END LOOP;
END $$;

-- Probe la aplicare (excepție → migrația nu se aplică).
DO $$
DECLARE c bilete_comenzi; o bilete_retur_oferte; o2 bilete_retur_oferte; ok boolean;
BEGIN
  IF has_table_privilege('anon', 'bilete_retur_oferte', 'SELECT') OR has_table_privilege('authenticated', 'bilete_retur_oferte', 'SELECT') THEN
    RAISE EXCEPTION '502: ofertele sunt vizibile pentru anon/authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.bilete_retur_foloseste(uuid, bigint)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.bilete_retur_oferta_noua(uuid, bigint, int, numeric, numeric, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION '502: funcțiile sunt executabile de anon';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.bilete_retur_foloseste(uuid, bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION '502: service_role nu poate folosi oferta';
  END IF;
  -- O comandă de probă, plătită și legată de un cont fictiv.
  c := bilete_creeaza_comanda(jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000502', 'trip_date', '2026-12-14',
        'crm_route_id', (SELECT id FROM crm_routes WHERE active ORDER BY id LIMIT 1), 'going_north', false, 'from_stop_order', 10,
        'to_stop_order', 340, 'from_name', 'Probă', 'to_name', 'Probă', 'departure_at', '2026-12-14T05:45:00+02:00', 'seats', 1,
        'price_per_seat', 135, 'total', 135, 'passenger_name', 'Probă 502', 'phone', '37360000502', 'ip_hash', 'proba502'));
  UPDATE bilete_comenzi SET status = 'platita', telegram_id = 502502 WHERE id = c.id;
  -- a doua ofertă o închide pe prima; prima nu se mai poate folosi
  o := bilete_retur_oferta_noua(c.id, 502502, 9, 135, 135, now() + interval '15 minutes');
  o2 := bilete_retur_oferta_noua(c.id, 502502, 9, 135, 135, now() + interval '15 minutes');
  ok := false;
  BEGIN PERFORM bilete_retur_foloseste(o.id, 502502); EXCEPTION WHEN OTHERS THEN ok := SQLERRM = 'OFERTA_INCHISA'; END;
  IF NOT ok THEN RAISE EXCEPTION '502: oferta închisă s-a putut folosi'; END IF;
  -- alt cont nu poate folosi oferta
  ok := false;
  BEGIN PERFORM bilete_retur_foloseste(o2.id, 1); EXCEPTION WHEN OTHERS THEN ok := SQLERRM = 'OFERTA_STRAINA'; END;
  IF NOT ok THEN RAISE EXCEPTION '502: oferta străină s-a putut folosi'; END IF;
  -- folosirea merge o singură dată
  o2 := bilete_retur_foloseste(o2.id, 502502);
  IF o2.validata_la IS NULL THEN RAISE EXCEPTION '502: validata_la lipsește'; END IF;
  ok := false;
  BEGIN PERFORM bilete_retur_foloseste(o2.id, 502502); EXCEPTION WHEN OTHERS THEN ok := SQLERRM = 'OFERTA_FOLOSITA'; END;
  IF NOT ok THEN RAISE EXCEPTION '502: oferta s-a folosit de două ori'; END IF;
  -- contul nelegat nu primește ofertă
  ok := false;
  BEGIN PERFORM bilete_retur_oferta_noua(c.id, 1, 9, 135, 135, now() + interval '15 minutes'); EXCEPTION WHEN OTHERS THEN ok := SQLERRM = 'OFERTA_NELEGAT'; END;
  IF NOT ok THEN RAISE EXCEPTION '502: cont nelegat a primit ofertă'; END IF;
  INSERT INTO bilete_alerte (comanda_id, tip, detalii) VALUES (c.id, 'retur_cerere', 'probă 502');
  DELETE FROM bilete_alerte WHERE comanda_id = c.id;
  DELETE FROM bilete_retur_oferte WHERE comanda_id = c.id;
  DELETE FROM bilete_comenzi WHERE id = c.id;
END $$;
