-- 546_bilete_promotii_balti.sql — promoțiile online Bălți ⇄ Chișinău (Ion, 10.10.2026: «hai să lansăm aceste 2 promoții la
-- cumpărare bilete online din Bălți spre Chișinău și din Chișinău spre Bălți»; «20% doar la a 2-a cursă»; «AI trebuie să
-- verifice carnetul de student la client»; «tur-retur niciodată să nu fie posibil pe aceeași cursă, ca să nu facă fraudă
-- șoferul»; «vineri până la orele 12 putem vinde câte dorim, după ora 12 lăsăm minim 2 locuri»; «lansăm de pe 13.10»).
-- Planul aprobat (Claude ×3 + Codex ×2, gate trecut): ~/.claude/plans/whimsical-wobbling-newell.md → docs/plans/
-- 2026-10-10-promotii-balti.md.
--
--  * bilete_comenzi: prețul întreg, reducerea (tip, %, lei pe loc), legătura retur → tur, codul de retur (secret separat
--    de `cod`, dă DOAR reducerea), verificarea de student, cheile localităților pentru cotă, cota cursei, suma scăzută la
--    refund. CHECK-uri pe formula prețului: un bug în TS nu poate scrie un preț arbitrar.
--  * bilete_studenti_verificari: verificările AI ale carnetelor (doar service_role); plafoanele AI se numără aici, pe zi.
--  * Protocol unic de blocare (Codex C4): orice funcție care atinge o pereche tur/retur ia întâi lacătul perechii
--    (`bilete_pereche:<id tur>`), apoi lacătul global al comenzilor, abia apoi rânduri — turul înaintea returului.
--  * bilete_creeaza_comanda: cota pe localitate (locuri, sub lacăt), returul (tur plătit, nefolosit, sens opus, altă rută,
--    același telefon, ≤ 30 zile, fără lanț), studentul (verificare acceptată, 1 loc, ≤ 4 locuri/7 zile pe carnet),
--    telefon de șofer → fără reducere.
--  * bilete_marcheaza_platita / bilete_reactiveaza / bilete_emite_fara_bilet: revalidează returul, cota (rezervare
--    pierdută) și studentul la orice trecere spre «platita»; conflict → «platita_fara_bilet» + alertă, fără excepție la
--    plată (Codex C3, r2 C2); generează codul de retur la plata unui tur pe perechea promo.
--  * bilete_anuleaza (supraîncărcare nouă): suma refund-ului se fixează în tranzacția anulării — «doar turul» scade
--    reducerea dată returului, «ambele» anulează și returul, «vina noastră» nu scade nimic.

-- ── 1. Coloane ─────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE bilete_comenzi
  ADD COLUMN IF NOT EXISTS pret_intreg numeric(10,2),
  ADD COLUMN IF NOT EXISTS reducere_tip text,
  ADD COLUMN IF NOT EXISTS reducere_pct smallint,
  ADD COLUMN IF NOT EXISTS reducere_lei_loc numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comanda_tur_id uuid REFERENCES bilete_comenzi(id),
  ADD COLUMN IF NOT EXISTS student_verificare_id uuid,
  ADD COLUMN IF NOT EXISTS promo_pereche boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cod_retur text,
  ADD COLUMN IF NOT EXISTS loc_cheie text[],
  ADD COLUMN IF NOT EXISTS cota_online smallint,
  ADD COLUMN IF NOT EXISTS scazut_la_refund numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN bilete_comenzi.pret_intreg IS 'Prețul întreg pe loc înainte de reducere (546); null = fără reducere.';
COMMENT ON COLUMN bilete_comenzi.reducere_lei_loc IS 'Reducerea PE LOC (546): pret_intreg − price_per_seat; pe comandă = × seats.';
COMMENT ON COLUMN bilete_comenzi.comanda_tur_id IS 'Returul cu reducere (546): turul plătit pe care s-a sprijinit; un tur = un singur retur plătit.';
COMMENT ON COLUMN bilete_comenzi.promo_pereche IS 'Comanda e pe perechea promoțiilor (Bălți ⇄ Chișinău, 544): la plata unui tur primește cod_retur.';
COMMENT ON COLUMN bilete_comenzi.cod_retur IS 'Secretul care dă −20% la retur (546); separat de `cod` (pagina biletului), nu dă acces la bilet.';
COMMENT ON COLUMN bilete_comenzi.loc_cheie IS 'Cheile normalizate (fără diacritice) ale localităților cu cotă online ale comenzii (546), scrise de TS.';
COMMENT ON COLUMN bilete_comenzi.cota_online IS 'Cota online a cursei pentru loc_cheie la creare (546): 4, sau 2 vineri spre Bălți / duminică spre Chișinău după 12:00.';
COMMENT ON COLUMN bilete_comenzi.scazut_la_refund IS 'Cât s-a reținut la refund-ul turului pentru reducerea dată returului (546); 0 după reactivare.';

ALTER TABLE bilete_comenzi DROP CONSTRAINT IF EXISTS bilete_comenzi_reducere_tip_check;
ALTER TABLE bilete_comenzi ADD CONSTRAINT bilete_comenzi_reducere_tip_check CHECK (reducere_tip IN ('retur', 'student'));
ALTER TABLE bilete_comenzi DROP CONSTRAINT IF EXISTS bilete_comenzi_reducere_formula;
ALTER TABLE bilete_comenzi ADD CONSTRAINT bilete_comenzi_reducere_formula CHECK (
  (reducere_tip IS NULL AND reducere_pct IS NULL AND pret_intreg IS NULL AND reducere_lei_loc = 0)
  OR (reducere_tip IS NOT NULL AND reducere_pct BETWEEN 1 AND 50
      AND price_per_seat = round(pret_intreg * (100 - reducere_pct) / 100.0)
      AND reducere_lei_loc = pret_intreg - price_per_seat));
ALTER TABLE bilete_comenzi DROP CONSTRAINT IF EXISTS bilete_comenzi_total_formula;
ALTER TABLE bilete_comenzi ADD CONSTRAINT bilete_comenzi_total_formula CHECK (total = price_per_seat * seats);
ALTER TABLE bilete_comenzi DROP CONSTRAINT IF EXISTS bilete_comenzi_student_un_loc;
ALTER TABLE bilete_comenzi ADD CONSTRAINT bilete_comenzi_student_un_loc CHECK (reducere_tip IS DISTINCT FROM 'student' OR seats = 1);

CREATE UNIQUE INDEX IF NOT EXISTS bilete_comenzi_cod_retur_uq ON bilete_comenzi (cod_retur) WHERE cod_retur IS NOT NULL;
-- Plasa: un tur are cel mult un retur PLĂTIT (verificarea reală e explicită, sub lacătul perechii).
CREATE UNIQUE INDEX IF NOT EXISTS bilete_comenzi_un_retur_platit ON bilete_comenzi (comanda_tur_id) WHERE status = 'platita' AND comanda_tur_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bilete_comenzi_tur_idx ON bilete_comenzi (comanda_tur_id) WHERE comanda_tur_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bilete_comenzi_student_idx ON bilete_comenzi (student_verificare_id) WHERE student_verificare_id IS NOT NULL;

-- ── 2. Tipurile noi de alertă (Codex C2), ÎNAINTEA funcțiilor care le scriu ─────────────────────────────────────────
ALTER TABLE bilete_alerte DROP CONSTRAINT IF EXISTS bilete_alerte_tip_check;
ALTER TABLE bilete_alerte ADD CONSTRAINT bilete_alerte_tip_check CHECK (tip IN (
  'platita_fara_bilet', 'suma_nepotrivita', 'refund_necunoscut', 'refund_respins', 'cursa_fara_sofer', 'urcat_pe_anulat',
  'creare_esuata', 'plafon_atins', 'refund_pe_zi_confirmata', 'email_esuat', 'fara_loc', 'loc_schimbat', 'retur_cerere',
  'sofer_nelegat',
  'retur_tur_anulat', 'cota_depasita', 'plafon_student', 'ai_eroare', 'plafon_ai'));

-- ── 3. Verificările de student ──────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bilete_studenti_verificari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefon text NOT NULL,
  ip_hash text NOT NULL DEFAULT '',
  nume_pasager text NOT NULL,
  nume_pasager_cheie text NOT NULL,
  nume_carnet text,
  institutie text,
  valabil_pana date,
  carnet_hash text,
  verdict text NOT NULL DEFAULT 'in_lucru' CHECK (verdict IN ('in_lucru', 'accept', 'poza_neclara', 'respins', 'eroare')),
  motive jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  poza_carnet text,
  poza_act text,
  jeton_hash text,
  comanda_id uuid REFERENCES bilete_comenzi(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  verificat_la timestamptz
);
COMMENT ON TABLE bilete_studenti_verificari IS 'Verificările AI ale carnetelor de student (546): AI-ul extrage, codul decide; pozele în bucketul privat carnete-studenti, golite la 90 de zile.';
ALTER TABLE bilete_studenti_verificari ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS bilete_studenti_tel_idx ON bilete_studenti_verificari (telefon, created_at);
CREATE INDEX IF NOT EXISTS bilete_studenti_ip_idx ON bilete_studenti_verificari (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS bilete_studenti_creat_idx ON bilete_studenti_verificari (created_at);
CREATE INDEX IF NOT EXISTS bilete_studenti_carnet_idx ON bilete_studenti_verificari (carnet_hash) WHERE carnet_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bilete_studenti_jeton_uq ON bilete_studenti_verificari (jeton_hash) WHERE jeton_hash IS NOT NULL;
REVOKE ALL ON bilete_studenti_verificari FROM PUBLIC, anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('carnete-studenti', 'carnete-studenti', false, 1048576, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 1048576, allowed_mime_types = ARRAY['image/jpeg'];

-- ── 4. Configurația ─────────────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO app_config (key, value) VALUES
  ('bilete_promo_activ', 'false'),
  ('bilete_promo_pct', '20'),
  ('bilete_promo_retur_zile', '30'),
  ('bilete_student_max_7z', '4'),
  ('bilete_ai_plafon_zi', '300'),
  ('bilete_cota_dupa_ora', '12'),
  ('bilete_cota_seara', '2'),
  ('bilete_localitati_de_la', '{"Bălți":"2026-10-13"}')
ON CONFLICT (key) DO NOTHING;

-- ── 5. Funcții ajutătoare ───────────────────────────────────────────────────────────────────────────────────────────
-- Ziua de lucru a comenzii «activă» pentru cote și limite: plătită, sau deschisă cât rezervarea ține (30 min).
CREATE OR REPLACE FUNCTION public.bilete_comanda_activa(s text, creat timestamptz, refund_fin timestamptz, cu_refund_in_curs boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT s IN ('platita', 'platita_fara_bilet')
      OR (s IN ('noua', 'eroare_creare') AND creat > now() - interval '30 minutes')
      OR (cu_refund_in_curs AND s = 'anulata' AND refund_fin IS NULL)
$$;

-- Locurile ocupate din cota unei localități pe cursă (fără test; opțional fără o comandă).
CREATE OR REPLACE FUNCTION public.bilete_cota_ocupata(p_trip_date date, p_route int, p_north boolean, p_cheie text, p_fara uuid)
RETURNS int LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT coalesce(sum(seats), 0)::int FROM bilete_comenzi
   WHERE trip_date = p_trip_date AND crm_route_id = p_route AND going_north = p_north AND NOT test
     AND loc_cheie @> ARRAY[p_cheie] AND id IS DISTINCT FROM p_fara
     AND bilete_comanda_activa(status, created_at, refund_finalizat_la, false)
$$;

-- Locurile studentului pe un carnet în ultimele 7 zile (stări active + anulate cu refund nefinalizat — Codex r2 C2).
CREATE OR REPLACE FUNCTION public.bilete_student_locuri_7z(p_carnet text, p_fara uuid)
RETURNS int LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT coalesce(sum(c.seats), 0)::int FROM bilete_comenzi c
    JOIN bilete_studenti_verificari v ON v.id = c.student_verificare_id
   WHERE v.carnet_hash = p_carnet AND NOT c.test AND c.id IS DISTINCT FROM p_fara
     AND c.created_at > now() - interval '7 days'
     AND bilete_comanda_activa(c.status, c.created_at, c.refund_finalizat_la, true)
$$;

-- Returul activ legat de un tur (fără o comandă): plătit, deschis recent sau anulat cu refund nefinalizat.
CREATE OR REPLACE FUNCTION public.bilete_retur_activ(p_tur uuid, p_fara uuid)
RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT id FROM bilete_comenzi
   WHERE comanda_tur_id = p_tur AND id IS DISTINCT FROM p_fara
     AND bilete_comanda_activa(status, created_at, refund_finalizat_la, false)
   ORDER BY created_at LIMIT 1
$$;

-- Lacătul perechii (Codex C4): cheia e turul — al comenzii însăși, sau turul pe care se sprijină returul.
CREATE OR REPLACE FUNCTION public.bilete_lacat_pereche(p_id uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_tur uuid;
BEGIN
  SELECT coalesce(comanda_tur_id, id) INTO v_tur FROM bilete_comenzi WHERE id = p_id;
  IF v_tur IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext('bilete_pereche:' || v_tur::text)); END IF;
  RETURN v_tur;
END $$;

/*
 * Revalidarea unei comenzi înaintea trecerii spre «platita» (Codex C3, r2 C2). Se cheamă sub lacătul perechii și sub
 * lacătul global. Întoarce null = în regulă, altfel tipul alertei: retur_tur_anulat / cota_depasita / plafon_student.
 */
CREATE OR REPLACE FUNCTION public.bilete_revalideaza_plata(c bilete_comenzi) RETURNS text
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE t bilete_comenzi; v bilete_studenti_verificari; n int; max7 int; k text;
BEGIN
  IF c.comanda_tur_id IS NOT NULL THEN
    SELECT * INTO t FROM bilete_comenzi WHERE id = c.comanda_tur_id;
    IF NOT FOUND OR t.status <> 'platita' THEN RETURN 'retur_tur_anulat'; END IF;
    IF EXISTS (SELECT 1 FROM bilete_comenzi WHERE comanda_tur_id = c.comanda_tur_id AND id <> c.id AND status = 'platita') THEN
      RETURN 'retur_tur_anulat';
    END IF;
  END IF;
  IF c.loc_cheie IS NOT NULL AND c.cota_online IS NOT NULL AND NOT c.test THEN
    FOREACH k IN ARRAY c.loc_cheie LOOP
      IF bilete_cota_ocupata(c.trip_date, c.crm_route_id, c.going_north, k, c.id) + c.seats > c.cota_online THEN
        RETURN 'cota_depasita';
      END IF;
    END LOOP;
  END IF;
  IF c.student_verificare_id IS NOT NULL THEN
    SELECT * INTO v FROM bilete_studenti_verificari WHERE id = c.student_verificare_id;
    IF NOT FOUND OR v.verdict <> 'accept' OR v.comanda_id IS DISTINCT FROM c.id THEN RETURN 'plafon_student'; END IF;
    max7 := coalesce((SELECT value::int FROM app_config WHERE key = 'bilete_student_max_7z'), 4);
    n := bilete_student_locuri_7z(v.carnet_hash, c.id);
    IF n + c.seats > max7 THEN RETURN 'plafon_student'; END IF;
  END IF;
  RETURN NULL;
END $$;

-- ── 6. Plafonul verificărilor AI (pe zi, numărat în tabela verificărilor — bilete_plafon ține doar 5 minute) ────────
CREATE OR REPLACE FUNCTION public.bilete_student_incepe(p_telefon text, p_ip text, p_nume text, p_nume_cheie text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE n_tel int; n_ip int; n_tot int; plafon int; v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bilete_student_plafon'));
  plafon := coalesce((SELECT value::int FROM app_config WHERE key = 'bilete_ai_plafon_zi'), 300);
  SELECT count(*) FILTER (WHERE telefon = p_telefon), count(*) FILTER (WHERE ip_hash = coalesce(p_ip, '')), count(*)
    INTO n_tel, n_ip, n_tot FROM bilete_studenti_verificari WHERE created_at > now() - interval '1 day';
  IF n_tot >= plafon THEN
    IF NOT EXISTS (SELECT 1 FROM bilete_alerte WHERE tip = 'plafon_ai' AND created_at > now() - interval '1 day') THEN
      INSERT INTO bilete_alerte (tip, detalii) VALUES ('plafon_ai', format('plafonul zilnic al verificărilor AI (%s) a fost atins', plafon));
    END IF;
    RETURN jsonb_build_object('ok', false, 'motiv', 'plafon_global');
  END IF;
  IF n_tel >= 5 THEN RETURN jsonb_build_object('ok', false, 'motiv', 'plafon_telefon'); END IF;
  -- 5 pe IP (security M1: telefonul nu e dovedit, deci plafonul pe IP e frâna reală a epuizării plafonului global).
  IF n_ip >= 5 THEN RETURN jsonb_build_object('ok', false, 'motiv', 'plafon_ip'); END IF;
  INSERT INTO bilete_studenti_verificari (telefon, ip_hash, nume_pasager, nume_pasager_cheie)
  VALUES (p_telefon, coalesce(p_ip, ''), p_nume, p_nume_cheie) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- ── 7. Crearea comenzii ─────────────────────────────────────────────────────────────────────────────────────────────
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
        t bilete_comenzi; v bilete_studenti_verificari; max7 int; zile int;
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
    IF NOT FOUND OR t.status <> 'platita' OR t.proba_fizica OR t.test <> v_test OR t.comanda_tur_id IS NOT NULL
       OR t.reducere_tip = 'retur' OR NOT t.promo_pereche
       OR t.phone <> v_phone OR t.going_north = v_north OR t.crm_route_id = v_route
       OR v_seats > t.seats OR (p->>'departure_at')::timestamptz <= t.departure_at THEN
      RAISE EXCEPTION 'RETUR_TUR_NEVALID' USING ERRCODE = 'P0001';
    END IF;
    zile := coalesce((SELECT value::int FROM app_config WHERE key = 'bilete_promo_retur_zile'), 30);
    IF v_date > t.trip_date + zile THEN RAISE EXCEPTION 'RETUR_TERMEN' USING ERRCODE = 'P0001'; END IF;
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
                              promo_pereche, loc_cheie, cota_online)
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
          coalesce((p->>'promo_pereche')::boolean, false), v_chei, v_cota)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO r;
  IF r.id IS NULL THEN SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = v_key; END IF;
  IF v_red = 'student' THEN UPDATE bilete_studenti_verificari SET comanda_id = r.id WHERE id = v_stud; END IF;
  RETURN r;
END $$;

-- ── 8. Plata ────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bilete_marcheaza_platita(p_checkout_id uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; m maib_checkouts; i int; v_id uuid; v_alerta text;
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
    -- Revalidarea (546): retur pe un tur anulat sau deja folosit, cota depășită după pierderea rezervării, limita
    -- studentului → «platita_fara_bilet» + alertă (fără excepție: banca nu primește 500).
    v_alerta := bilete_revalideaza_plata(c);
    IF v_alerta IS NOT NULL THEN
      UPDATE bilete_comenzi SET status = 'platita_fara_bilet', paid_at = coalesce(m.callback_at, now()), creare_in_curs_la = NULL, updated_at = now() WHERE id = c.id;
      INSERT INTO bilete_alerte (comanda_id, tip, detalii) VALUES (c.id, v_alerta, 'plata a sosit, dar comanda nu mai e eligibilă — se emite manual sau se returnează');
      RETURN 0;
    END IF;
    UPDATE bilete_comenzi SET status = 'platita', paid_at = coalesce(m.callback_at, now()), creare_in_curs_la = NULL, updated_at = now(),
           cod_retur = CASE WHEN promo_pereche AND comanda_tur_id IS NULL AND NOT proba_fizica
                            THEN coalesce(cod_retur, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) ELSE cod_retur END
     WHERE id = c.id;
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

-- ── 9. Emiterea manuală (din /bilete) ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bilete_emite_fara_bilet(p_id uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; m maib_checkouts; i int; v_alerta text;
BEGIN
  PERFORM bilete_lacat_pereche(p_id);
  PERFORM pg_advisory_xact_lock(hashtext('bilete_comanda'));
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

-- ── 10. Reactivarea după refuzul băncii ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bilete_reactiveaza(p_id uuid) RETURNS bilete_comenzi
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; m maib_checkouts; v_alerta text;
BEGIN
  PERFORM bilete_lacat_pereche(p_id);
  PERFORM pg_advisory_xact_lock(hashtext('bilete_comanda'));
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

-- ── 11. Anularea cu suma refund-ului fixată în aceeași tranzacție ───────────────────────────────────────────────────
/*
 * p_grila = suma după grila de timp (calculată de aplicație, refund-reguli.ts) pentru comanda p_id;
 * p_grila_retur = idem pentru returul legat, când p_si_returul.
 * Tur cu retur legat «platita» (bilete neurcate): «ambele» → se anulează amândouă, fiecare cu grila lui, fără scădere;
 * «doar turul» → max(0, grila − reducerea returului), cu excepția «vina noastră» (grila întreagă).
 * Întoarce [{id, suma, status}] — suma o trimite aplicația la maib, pe sesiunea fiecărei comenzi.
 */
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
  SELECT count(*) INTO n FROM bilete WHERE comanda_id = p_id AND status = 'urcat';
  IF n > 0 THEN RAISE EXCEPTION 'BILET_URCAT' USING ERRCODE = 'P0001'; END IF;
  IF p_grila > c.total THEN RAISE EXCEPTION 'GRILA_PESTE_TOTAL' USING ERRCODE = 'P0001'; END IF;

  v_suma := p_grila;
  -- Returul plătit legat de acest tur (doar pentru un tur: comanda_tur_id e null).
  IF c.comanda_tur_id IS NULL THEN
    SELECT * INTO rt FROM bilete_comenzi WHERE comanda_tur_id = c.id AND status = 'platita' FOR UPDATE;
  END IF;
  IF rt.id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM bilete WHERE comanda_id = rt.id AND status = 'urcat') INTO v_rt_urcat;
    IF coalesce(p_si_returul, false) THEN
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

-- ── 12. Drepturi ────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bilete_comanda_activa(text, timestamptz, timestamptz, boolean)',
    'bilete_cota_ocupata(date, int, boolean, text, uuid)',
    'bilete_student_locuri_7z(text, uuid)',
    'bilete_retur_activ(uuid, uuid)',
    'bilete_lacat_pereche(uuid)',
    'bilete_revalideaza_plata(bilete_comenzi)',
    'bilete_student_incepe(text, text, text, text)',
    'bilete_creeaza_comanda(jsonb)',
    'bilete_marcheaza_platita(uuid)',
    'bilete_emite_fara_bilet(uuid)',
    'bilete_reactiveaza(uuid)',
    'bilete_anuleaza(uuid, text, text, numeric, boolean, boolean, numeric)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', t);
  END LOOP;
END $$;

-- ── 13. Probe la aplicare (totul se anulează la sfârșit prin excepția finală a blocului) ───────────────────────────
DO $$
DECLARE tur bilete_comenzi; ret bilete_comenzi; ret2 bilete_comenzi; s bilete_comenzi; ck uuid; ck2 uuid; n int; err text;
        r jsonb; v_route_a int; v_route_b int; v_stud uuid; v_pret numeric := 150; v_red numeric := 120;
        base jsonb;
BEGIN
  SELECT min(id) INTO v_route_a FROM crm_routes WHERE active;
  SELECT min(id) INTO v_route_b FROM crm_routes WHERE active AND id <> v_route_a;
  base := jsonb_build_object('from_stop_order', 1, 'to_stop_order', 2, 'from_name', 'Bălți', 'to_name', 'Chișinău',
    'passenger_name', 'Proba 544', 'phone', '37360544544', 'promo_pereche', true, 'test', false);

  -- 1) turul plătit primește cod_retur
  tur := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-04-01',
           'crm_route_id', v_route_a, 'going_north', false, 'departure_at', '2031-04-01T06:00:00+03', 'seats', 1,
           'price_per_seat', v_pret, 'total', v_pret, 'ip_hash', 'p544a', 'loc_cheie', jsonb_build_array('balti'), 'cota_online', 4));
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck, tur.id::text, 'sandbox', v_pret, 'Completed', 'Executed', 0);
  PERFORM bilete_marcheaza_platita(ck);
  SELECT * INTO tur FROM bilete_comenzi WHERE id = tur.id;
  IF tur.status <> 'platita' OR tur.cod_retur IS NULL THEN RAISE EXCEPTION 'P544: turul nu e plătit cu cod_retur (% / %)', tur.status, tur.cod_retur; END IF;

  -- 2) retur pe ACEEAȘI rută → refuzat
  BEGIN
    PERFORM bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-04-03',
      'crm_route_id', v_route_a, 'going_north', true, 'departure_at', '2031-04-03T15:00:00+03', 'seats', 1,
      'from_name', 'Chișinău', 'to_name', 'Bălți', 'price_per_seat', v_red, 'total', v_red, 'pret_intreg', v_pret,
      'reducere_tip', 'retur', 'reducere_pct', 20, 'comanda_tur_id', tur.id, 'ip_hash', 'p544b'));
    RAISE EXCEPTION 'P544: returul pe aceeași rută a trecut';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'RETUR_TUR_NEVALID' THEN RAISE; END IF; END;

  -- 3) retur valid pe altă rută → creat; al doilea retur pe același tur → RETUR_FOLOSIT
  ret := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-04-03',
           'crm_route_id', v_route_b, 'going_north', true, 'departure_at', '2031-04-03T15:00:00+03', 'seats', 1,
           'from_name', 'Chișinău', 'to_name', 'Bălți', 'price_per_seat', v_red, 'total', v_red, 'pret_intreg', v_pret,
           'reducere_tip', 'retur', 'reducere_pct', 20, 'comanda_tur_id', tur.id, 'ip_hash', 'p544c'));
  IF ret.reducere_lei_loc <> 30 OR ret.comanda_tur_id <> tur.id THEN RAISE EXCEPTION 'P544: returul nu are reducerea'; END IF;
  BEGIN
    PERFORM bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-04-04',
      'crm_route_id', v_route_b, 'going_north', true, 'departure_at', '2031-04-04T15:00:00+03', 'seats', 1,
      'from_name', 'Chișinău', 'to_name', 'Bălți', 'price_per_seat', v_red, 'total', v_red, 'pret_intreg', v_pret,
      'reducere_tip', 'retur', 'reducere_pct', 20, 'comanda_tur_id', tur.id, 'ip_hash', 'p544d'));
    RAISE EXCEPTION 'P544: al doilea retur a trecut';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'RETUR_FOLOSIT' THEN RAISE; END IF; END;

  -- 4) prețul greșit e oprit de CHECK
  BEGIN
    PERFORM bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-04-05',
      'crm_route_id', v_route_b, 'going_north', false, 'departure_at', '2031-04-05T06:00:00+03', 'seats', 1,
      'price_per_seat', 50, 'total', 50, 'pret_intreg', v_pret, 'reducere_tip', 'student', 'reducere_pct', 20,
      'student_verificare_id', gen_random_uuid(), 'ip_hash', 'p544e'));
    RAISE EXCEPTION 'P544: comanda student fără verificare a trecut';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'STUDENT_VERIFICARE' THEN RAISE; END IF; END;

  -- 5) plata returului după anularea turului → platita_fara_bilet + retur_tur_anulat
  r := bilete_anuleaza(tur.id, 'pasager', 'probă 544', v_pret, false, false, NULL);
  IF (r->0->>'suma')::numeric <> v_pret THEN RAISE EXCEPTION 'P544: returul neplătit nu trebuia să scadă nimic (%)', r; END IF;
  ck2 := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck2, ret.id::text, 'sandbox', v_red, 'Completed', 'Executed', 0);
  PERFORM bilete_marcheaza_platita(ck2);
  SELECT * INTO ret FROM bilete_comenzi WHERE id = ret.id;
  SELECT count(*) INTO n FROM bilete_alerte WHERE comanda_id = ret.id AND tip = 'retur_tur_anulat';
  IF ret.status <> 'platita_fara_bilet' OR n <> 1 THEN RAISE EXCEPTION 'P544: returul pe tur anulat nu a fost oprit (% / %)', ret.status, n; END IF;

  -- 6) «doar turul» cu retur plătit scade reducerea; reactivarea o pune la 0
  PERFORM bilete_reactiveaza(tur.id);
  UPDATE bilete_comenzi SET status = 'platita' WHERE id = ret.id;   -- simulăm returul plătit
  r := bilete_anuleaza(tur.id, 'ai', 'probă 544 b', v_pret, false, false, NULL);
  IF (r->0->>'suma')::numeric <> v_pret - 30 THEN RAISE EXCEPTION 'P544: «doar turul» nu a scăzut reducerea (%)', r; END IF;
  SELECT * INTO tur FROM bilete_comenzi WHERE id = tur.id;
  IF tur.scazut_la_refund <> 30 THEN RAISE EXCEPTION 'P544: scazut_la_refund %', tur.scazut_la_refund; END IF;
  tur := bilete_reactiveaza(tur.id);
  IF tur.scazut_la_refund <> 0 THEN RAISE EXCEPTION 'P544: reactivarea nu a pus scazut_la_refund la 0'; END IF;
  -- «ambele» anulează și returul, fără scădere; «vina noastră» nu scade
  r := bilete_anuleaza(tur.id, 'ai', 'probă 544 c', v_pret, false, true, v_red);
  IF jsonb_array_length(r) <> 2 OR (r->0->>'suma')::numeric <> v_pret OR (r->1->>'suma')::numeric <> v_red THEN
    RAISE EXCEPTION 'P544: «ambele» greșit (%)', r;
  END IF;

  -- 7) cota: a 3-a comandă pe o cotă de 2 → COTA_PLINA
  FOR n IN 1..3 LOOP
    BEGIN
      s := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-04-06',
             'crm_route_id', v_route_a, 'going_north', true, 'departure_at', '2031-04-06T15:00:00+03', 'seats', 1,
             'from_name', 'Chișinău', 'to_name', 'Bălți', 'price_per_seat', v_pret, 'total', v_pret,
             'phone', '3736054400' || n, 'ip_hash', 'p544q' || n, 'loc_cheie', jsonb_build_array('balti'), 'cota_online', 2));
      IF n = 3 THEN RAISE EXCEPTION 'P544: a 3-a comandă a trecut de cota 2'; END IF;
    EXCEPTION WHEN OTHERS THEN
      IF n = 3 AND SQLERRM LIKE 'COTA_PLINA:%' THEN NULL; ELSE RAISE; END IF;
    END;
  END LOOP;

  -- 8) studentul: verificare acceptată → 1 loc; jetonul nu se refolosește cât comanda e activă
  INSERT INTO bilete_studenti_verificari (telefon, nume_pasager, nume_pasager_cheie, carnet_hash, verdict, verificat_la)
  VALUES ('37360544999', 'Student 544', 'student 544', 'carnet544', 'accept', now()) RETURNING id INTO v_stud;
  s := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-04-07',
         'crm_route_id', v_route_a, 'going_north', false, 'departure_at', '2031-04-07T06:00:00+03', 'seats', 1,
         'phone', '37360544999', 'price_per_seat', v_red, 'total', v_red, 'pret_intreg', v_pret, 'reducere_tip', 'student',
         'reducere_pct', 20, 'student_verificare_id', v_stud, 'nume_pasager_cheie', 'student 544', 'ip_hash', 'p544s'));
  IF s.reducere_tip <> 'student' THEN RAISE EXCEPTION 'P544: comanda student nu are reducerea'; END IF;
  BEGIN
    PERFORM bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-04-08',
      'crm_route_id', v_route_a, 'going_north', false, 'departure_at', '2031-04-08T06:00:00+03', 'seats', 1,
      'phone', '37360544999', 'price_per_seat', v_red, 'total', v_red, 'pret_intreg', v_pret, 'reducere_tip', 'student',
      'reducere_pct', 20, 'student_verificare_id', v_stud, 'nume_pasager_cheie', 'student 544', 'ip_hash', 'p544t'));
    RAISE EXCEPTION 'P544: jetonul s-a refolosit';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'STUDENT_JETON_FOLOSIT' THEN RAISE; END IF; END;

  RAISE EXCEPTION 'PROBA544_OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'PROBA544_OK' THEN RAISE; END IF;
END $$;
