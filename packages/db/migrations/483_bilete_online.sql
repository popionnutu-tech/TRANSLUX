-- 483_bilete_online.sql — ION-191 (03.10.2026): schema biletelor online (pasul 1 din planul ION-190, v6).
-- Comanda (pasagerul, cursa, suma, plata maib), biletele cu cod QR, jurnalul scanărilor, alertele, plafoanele,
-- legarea șoferului de Telegram, termenul «online» pe sesiunea de numărare, steagurile pe rută + direcție.
-- Nimic vizibil nimănui: toate steagurile sunt închise. Doar service_role (tiparul 446/482). Nimic greu la aplicare.
-- Deciziile lui Ion (02.10): vânzarea se închide la plecarea rutei (tur) / cu 2 h înainte (retur); steag pe rută ȘI
-- direcție; fără anonimizarea datelor pasagerilor; șoferul primește biletele în privat, de la bot.

-- ---------------------------------------------------------------------------------------------
-- Codul biletului: 20 de caractere Base32 Crockford (fără I, L, O, U), 100 de biți din pgcrypto.
-- 256 % 32 = 0, deci fiecare octet dă un caracter uniform.
CREATE OR REPLACE FUNCTION public.bilete_cod_qr() RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path TO 'public' AS $$
DECLARE alfabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; b bytea := extensions.gen_random_bytes(20); s text := ''; i int;
BEGIN
  FOR i IN 0..19 LOOP s := s || substr(alfabet, (get_byte(b, i) % 32) + 1, 1); END LOOP;
  RETURN s;
END $$;

-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bilete_comenzi (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- secretul paginii biletului (128 de biți); NU pleacă la maib ca orderId (orderId = id)
  cod                text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  idempotency_key    uuid NOT NULL UNIQUE,
  trip_date          date NOT NULL,
  crm_route_id       int  NOT NULL REFERENCES crm_routes(id),
  going_north        boolean NOT NULL,
  from_stop_order    int  NOT NULL,
  to_stop_order      int  NOT NULL,
  from_name          text NOT NULL,
  to_name            text NOT NULL,
  -- plecarea de la oprirea de urcare, în Europe/Chisinau, cu data corectată după miezul nopții (se calculează în admin)
  departure_at       timestamptz NOT NULL,
  seats              smallint NOT NULL CHECK (seats BETWEEN 1 AND 4),
  price_per_seat     numeric(10,2) NOT NULL CHECK (price_per_seat > 0),
  total              numeric(10,2) NOT NULL CHECK (total > 0),
  passenger_name     text NOT NULL,
  phone              text NOT NULL,            -- 373XXXXXXXX (normalizeDriverPhone)
  email              text,
  lang               text NOT NULL DEFAULT 'ro' CHECK (lang IN ('ro', 'ru')),
  telegram_id        bigint,                   -- pasagerul care a cerut biletul în bot («Primește în Telegram»)
  status             text NOT NULL DEFAULT 'noua'
                     CHECK (status IN ('noua', 'platita', 'expirata', 'eroare_creare', 'anulata', 'returnata', 'platita_fara_bilet')),
  checkout_id        uuid REFERENCES maib_checkouts(checkout_id),
  creare_in_curs_la  timestamptz,              -- revendicarea creării sesiunii maib: o singură sesiune pe comandă
  creare_incercari   smallint NOT NULL DEFAULT 0,
  paid_at            timestamptz,
  cancelled_at       timestamptz,
  cancel_source      text CHECK (cancel_source IN ('pasager', 'admin', 'sistem')),
  refund_reason      text,
  refund_finalizat_la timestamptz,
  notificat_la       timestamptz,
  ip_hash            text,                     -- SHA-256(BILETE_IP_SALT + ip), calculat pe site
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE bilete_comenzi IS 'Comenzile de bilete online (ION-191): o comandă = o cursă, un pasager, 1–4 locuri, o plată maib. Doar service_role.';
COMMENT ON COLUMN bilete_comenzi.status IS 'noua → platita | expirata | eroare_creare (maib n-a răspuns clar la creare) ; platita → anulata → returnata ; expirata + plată sosită → platita_fara_bilet';
CREATE INDEX IF NOT EXISTS bilete_comenzi_cursa_idx ON bilete_comenzi (trip_date, crm_route_id);
CREATE INDEX IF NOT EXISTS bilete_comenzi_checkout_idx ON bilete_comenzi (checkout_id);
CREATE INDEX IF NOT EXISTS bilete_comenzi_deschise_idx ON bilete_comenzi (created_at) WHERE status IN ('noua', 'eroare_creare');
CREATE INDEX IF NOT EXISTS bilete_comenzi_ip_idx ON bilete_comenzi (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS bilete_comenzi_telefon_noua_idx ON bilete_comenzi (phone) WHERE status = 'noua';
CREATE INDEX IF NOT EXISTS bilete_comenzi_refund_idx ON bilete_comenzi (trip_date) WHERE status = 'anulata' AND refund_finalizat_la IS NULL;
CREATE INDEX IF NOT EXISTS bilete_comenzi_telegram_idx ON bilete_comenzi (telegram_id) WHERE telegram_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bilete (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id   uuid NOT NULL REFERENCES bilete_comenzi(id) ON DELETE CASCADE,
  nr           smallint NOT NULL,
  cod_qr       text NOT NULL UNIQUE DEFAULT bilete_cod_qr(),
  status       text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'urcat', 'anulat', 'returnat')),
  urcat_at     timestamptz,                   -- ora clientului (scanarea), prima câștigă
  urcat_de     uuid REFERENCES drivers(id),
  urcat_sursa  text CHECK (urcat_sursa IN ('scan', 'manual')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comanda_id, nr)
);
COMMENT ON TABLE bilete IS 'Un rând pe loc: codul QR (Crockford, 20 car.) și starea lui. Doar service_role.';
CREATE INDEX IF NOT EXISTS bilete_comanda_idx ON bilete (comanda_id);

CREATE TABLE IF NOT EXISTS bilete_scanari (
  id               bigserial PRIMARY KEY,
  cod_citit        text NOT NULL,
  driver_id        uuid REFERENCES drivers(id),
  cursa_sofer      text,                      -- «2026-10-14 r7 tur», cum o vede mini app-ul
  cursa_bilet      text,
  rezultat         text NOT NULL CHECK (rezultat IN ('ok', 'neconfirmat', 'deja_urcat', 'anulat', 'alta_cursa', 'necunoscut')),
  moment_client    timestamptz,
  moment_server    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE bilete_scanari IS 'Jurnalul brut al scanărilor din mini app-ul șoferului, pentru dispute. Doar service_role.';
CREATE INDEX IF NOT EXISTS bilete_scanari_cod_idx ON bilete_scanari (cod_citit);

CREATE TABLE IF NOT EXISTS bilete_api_apeluri (
  id      bigserial PRIMARY KEY,
  cheie   text NOT NULL,
  moment  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE bilete_api_apeluri IS 'Plafoanele în bază (serverless n-are memorie comună): un rând pe apel, șterse la 5 minute de bilete_plafon().';
CREATE INDEX IF NOT EXISTS bilete_api_apeluri_idx ON bilete_api_apeluri (cheie, moment);

CREATE TABLE IF NOT EXISTS bilete_alerte (
  id          bigserial PRIMARY KEY,
  comanda_id  uuid REFERENCES bilete_comenzi(id) ON DELETE CASCADE,
  tip         text NOT NULL CHECK (tip IN ('platita_fara_bilet', 'suma_nepotrivita', 'refund_necunoscut', 'refund_respins',
                                           'cursa_fara_sofer', 'urcat_pe_anulat', 'creare_esuata', 'plafon_atins', 'refund_pe_zi_confirmata')),
  detalii     text,
  moment      timestamptz NOT NULL DEFAULT now(),
  rezolvat_la timestamptz
);
COMMENT ON TABLE bilete_alerte IS 'Ce trebuie să vadă adminul în /bilete și în digestul de seară. Doar service_role.';
CREATE INDEX IF NOT EXISTS bilete_alerte_deschise_idx ON bilete_alerte (moment) WHERE rezolvat_la IS NULL;

CREATE TABLE IF NOT EXISTS drivers_telegram_incercari (
  id               bigserial PRIMARY KEY,
  telegram_id      bigint NOT NULL,
  nume_telegram    text,
  telefon_trimis   text,
  motiv            text NOT NULL,              -- 'nepotrivit' | 'multiplu' | 'contact_strain' | 'deja_legat'
  moment           timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE drivers_telegram_incercari IS 'Încercări de legare șofer ↔ Telegram refuzate automat; adminul le leagă de mână din /drivers.';

-- Legarea șoferului de Telegram (contactul PROPRIU trimis botului; telefoanele șoferilor sunt publice pe site)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS telegram_id bigint;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS telegram_legat_la timestamptz;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS telegram_legat_prin text CHECK (telegram_legat_prin IN ('telefon', 'admin'));
CREATE UNIQUE INDEX IF NOT EXISTS drivers_telegram_id_uniq ON drivers (telegram_id) WHERE telegram_id IS NOT NULL;

-- Termenul «online» pe sesiunea de numărare (cheia rută-zi, ca încasarea): se recalculează din bilete (pasul 4b)
ALTER TABLE counting_sessions ADD COLUMN IF NOT EXISTS online_pasageri int;
ALTER TABLE counting_sessions ADD COLUMN IF NOT EXISTS online_lei numeric(10,2);
ALTER TABLE counting_sessions ADD COLUMN IF NOT EXISTS online_neprezentati int;
ALTER TABLE counting_sessions ADD COLUMN IF NOT EXISTS online_calculat_la timestamptz;
COMMENT ON COLUMN counting_sessions.online_lei IS 'Pasagerii cu bilet online (valid + urcat) ai sesiunii rută-zi, la prețul camerei (ION-190, 4b); NULL = nicio vânzare online';

-- Steagurile: pe rută ȘI direcție (Ion, 02.10: «pe direcții țintit, ex. Briceni→Chișinău»); global închis
ALTER TABLE crm_routes ADD COLUMN IF NOT EXISTS bilete_online_tur boolean NOT NULL DEFAULT false;
ALTER TABLE crm_routes ADD COLUMN IF NOT EXISTS bilete_online_retur boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN crm_routes.bilete_online_tur IS 'Vânzare online deschisă pe plecarea din nord (tur). Global: app_config.bilete_online_activ';
INSERT INTO app_config (key, value) VALUES
  ('bilete_online_activ', 'false'),
  ('bilete_inchidere_tur_min', '0'),      -- tur: până la ora plecării rutei
  ('bilete_inchidere_retur_min', '120'),  -- retur (din Chișinău): cu 2 h înainte
  ('bilete_digest_sofer_ora', '05:30')    -- botul trimite șoferului biletele zilei
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- Plafon în bază: numără apelurile cheii în fereastră; șterge rândurile mai vechi de 5 minute în același apel.
CREATE OR REPLACE FUNCTION public.bilete_plafon(p_cheie text, p_fereastra_s int, p_max int) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '3s' AS $$
DECLARE n int;
BEGIN
  DELETE FROM bilete_api_apeluri WHERE cheie = p_cheie AND moment < now() - interval '5 minutes';
  SELECT count(*) INTO n FROM bilete_api_apeluri WHERE cheie = p_cheie AND moment > now() - make_interval(secs => p_fereastra_s);
  IF n >= p_max THEN RETURN false; END IF;
  INSERT INTO bilete_api_apeluri (cheie) VALUES (p_cheie);
  RETURN true;
END $$;

-- Crearea comenzii: plafoanele și INSERT-ul în aceeași tranzacție, serializate (plafonul global e atomic).
-- Aceeași idempotency_key → comanda existentă (API-ul compară conținutul și dă 409 dacă diferă).
-- Plafoanele aruncă excepții cu cod propriu: PLAFON_IP, PLAFON_TELEFON, PLAFON_GLOBAL.
CREATE OR REPLACE FUNCTION public.bilete_creeaza_comanda(p jsonb) RETURNS bilete_comenzi
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE r bilete_comenzi; n int; v_ip text := p->>'ip_hash'; v_phone text := p->>'phone';
BEGIN
  SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = (p->>'idempotency_key')::uuid;
  IF FOUND THEN RETURN r; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bilete_comanda'));

  SELECT count(*) INTO n FROM bilete_comenzi WHERE ip_hash = coalesce(v_ip, '') AND created_at > now() - interval '10 minutes';
  IF n >= 5 THEN RAISE EXCEPTION 'PLAFON_IP' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) INTO n FROM bilete_comenzi WHERE phone = v_phone AND status = 'noua';
  IF n >= 3 THEN RAISE EXCEPTION 'PLAFON_TELEFON' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) INTO n FROM bilete_comenzi WHERE status = 'noua';
  IF n >= 50 THEN
    INSERT INTO bilete_alerte (tip, detalii) VALUES ('plafon_atins', format('%s comenzi «noua» deschise', n));
    RAISE EXCEPTION 'PLAFON_GLOBAL' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO bilete_comenzi (idempotency_key, trip_date, crm_route_id, going_north, from_stop_order, to_stop_order,
                              from_name, to_name, departure_at, seats, price_per_seat, total, passenger_name, phone,
                              email, lang, ip_hash)
  VALUES ((p->>'idempotency_key')::uuid, (p->>'trip_date')::date, (p->>'crm_route_id')::int, (p->>'going_north')::boolean,
          (p->>'from_stop_order')::int, (p->>'to_stop_order')::int, p->>'from_name', p->>'to_name',
          (p->>'departure_at')::timestamptz, (p->>'seats')::smallint, (p->>'price_per_seat')::numeric,
          (p->>'total')::numeric, p->>'passenger_name', v_phone, p->>'email', coalesce(p->>'lang', 'ro'), coalesce(v_ip, ''))
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO r;
  IF r.id IS NULL THEN SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = (p->>'idempotency_key')::uuid; END IF;
  RETURN r;
END $$;

-- Plata confirmată: comanda trece «platita» și primește N bilete, ÎN ACEEAȘI tranzacție. Idempotentă.
-- Verifică EA ÎNSĂȘI că sesiunea maib e Completed și că suma e a comenzii (nu se încrede în apelant).
-- Comandă deja expirată + plată sosită → platita_fara_bilet + alertă (adminul emite biletele sau returnează).
-- Comandă anulată / returnată / deja plătită → 0, fără schimbare (reluarea callback-ului e normală).
CREATE OR REPLACE FUNCTION public.bilete_marcheaza_platita(p_checkout_id uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; m maib_checkouts; i int;
BEGIN
  SELECT * INTO c FROM bilete_comenzi WHERE checkout_id = p_checkout_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO m FROM maib_checkouts WHERE checkout_id = p_checkout_id;
  IF NOT FOUND OR lower(m.status) <> 'completed' THEN RETURN 0; END IF;
  IF m.amount <> c.total THEN
    INSERT INTO bilete_alerte (comanda_id, tip, detalii) VALUES (c.id, 'suma_nepotrivita', format('maib %s ≠ comanda %s', m.amount, c.total));
    RETURN 0;
  END IF;

  IF c.status IN ('noua', 'eroare_creare') THEN
    UPDATE bilete_comenzi SET status = 'platita', paid_at = coalesce(m.callback_at, now()), updated_at = now() WHERE id = c.id;
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

-- ---------------------------------------------------------------------------------------------
-- Drepturi: RLS fără politici + REVOKE anon/authenticated + GRANT service_role (tiparul 446/482);
-- funcțiile nu rămân executabile de anon prin PUBLIC.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bilete_comenzi', 'bilete', 'bilete_scanari', 'bilete_api_apeluri', 'bilete_alerte', 'drivers_telegram_incercari'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['bilete_scanari_id_seq', 'bilete_api_apeluri_id_seq', 'bilete_alerte_id_seq', 'drivers_telegram_incercari_id_seq'] LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO service_role', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['bilete_cod_qr()', 'bilete_plafon(text, int, int)', 'bilete_creeaza_comanda(jsonb)', 'bilete_marcheaza_platita(uuid)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Probe la aplicare (se opresc cu excepție → migrația nu se aplică):
DO $$
DECLARE n int; z int; c bilete_comenzi;
BEGIN
  -- codurile: 10.000 distincte, 20 de caractere, alfabetul Crockford
  SELECT count(DISTINCT bilete_cod_qr()) INTO n FROM generate_series(1, 10000);
  IF n <> 10000 THEN RAISE EXCEPTION '483: coduri repetate din 10000: %', 10000 - n; END IF;
  IF bilete_cod_qr() !~ '^[0-9A-HJKMNP-TV-Z]{20}$' THEN RAISE EXCEPTION '483: alfabetul codului'; END IF;
  -- plata pe un checkout inexistent nu face nimic
  SELECT bilete_marcheaza_platita(gen_random_uuid()) INTO z;
  IF z <> 0 THEN RAISE EXCEPTION '483: marcheaza_platita pe checkout inexistent = %', z; END IF;
  -- plafonul: 3 apeluri permise, al 4-lea refuzat
  IF NOT bilete_plafon('proba', 60, 3) OR NOT bilete_plafon('proba', 60, 3) OR NOT bilete_plafon('proba', 60, 3) THEN RAISE EXCEPTION '483: plafon prea strâns'; END IF;
  IF bilete_plafon('proba', 60, 3) THEN RAISE EXCEPTION '483: plafonul nu refuză'; END IF;
  DELETE FROM bilete_api_apeluri WHERE cheie = 'proba';
  -- comanda: aceeași idempotency_key → același rând
  c := bilete_creeaza_comanda(jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000483', 'trip_date', '2026-10-14',
        'crm_route_id', (SELECT id FROM crm_routes WHERE active ORDER BY id LIMIT 1), 'going_north', false, 'from_stop_order', 10,
        'to_stop_order', 340, 'from_name', 'Probă', 'to_name', 'Probă', 'departure_at', '2026-10-14T05:45:00+03:00', 'seats', 2,
        'price_per_seat', 283, 'total', 566, 'passenger_name', 'Probă 483', 'phone', '37360000000', 'ip_hash', 'proba483'));
  IF (bilete_creeaza_comanda(jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000483'))).id <> c.id THEN
    RAISE EXCEPTION '483: idempotency_key nu întoarce aceeași comandă';
  END IF;
  DELETE FROM bilete_comenzi WHERE id = c.id;
END $$;
