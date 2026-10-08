-- 532_bilete_proba_fizica.sql — proba fizică a biletelor online (Ion, 08.10.2026: «cum să facem test la toată veriga
-- fizic, am nevoie de pagină test separată de site, am nevoie de fake șofer»; «pui să fie biletul 10 lei»; «pui Iura unic
-- șofer»; «alt Iura, care a fost înainte»). Planul: docs/plans/2026-10-08-proba-fizica-bilete.md.
--  * drivers.is_test — șoferul de probă: vede și scanează DOAR comenzile proba_fizica; ieșit din listele dispecerului.
--  * bilete_comenzi.proba_fizica — comanda făcută de pe pagina de probă (test=true, 10 lei/loc).
--  * bilete_creeaza_comanda (ultima formă: 501) + plafonul PROBEI: max 10 comenzi proba_fizica pe zi (Europe/Chisinau),
--    sub același lacăt global ca celelalte plafoane, în aceeași tranzacție cu INSERT-ul.
--  * rândul șoferului de probă: Iurie (users 34936fff, telegram_id 1407418059), INACTIV — se activează separat după
--    ce filtrele is_test sunt live (critica C4).

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN drivers.is_test IS 'Șoferul de probă al biletelor online (532): vede/scanează doar comenzile proba_fizica; ieșit din grafic, atribuiri, penalități, rapoarte.';
ALTER TABLE bilete_comenzi ADD COLUMN IF NOT EXISTS proba_fizica boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN bilete_comenzi.proba_fizica IS 'Comanda de pe pagina de probă /proba-bilete (532): test=true, 10 lei/loc, doar șoferul is_test o vede.';
CREATE INDEX IF NOT EXISTS bilete_comenzi_proba_zi ON bilete_comenzi (trip_date) WHERE proba_fizica;

CREATE OR REPLACE FUNCTION public.bilete_creeaza_comanda(p jsonb) RETURNS bilete_comenzi
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE r bilete_comenzi; n int; v_ip text := p->>'ip_hash'; v_phone text := p->>'phone'; v_key uuid := (p->>'idempotency_key')::uuid;
        v_locuri smallint[]; v_ocupate text; v_north boolean := (p->>'going_north')::boolean; v_seats smallint := (p->>'seats')::smallint;
        v_proba boolean := coalesce((p->>'proba_fizica')::boolean, false);
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
    -- Plafonul probei (532): 10 comenzi pe zi, ziua creării la Chișinău; sub lacăt, deci fără depășire concurentă.
    SELECT count(*) INTO n FROM bilete_comenzi
     WHERE proba_fizica AND (created_at AT TIME ZONE 'Europe/Chisinau')::date = (now() AT TIME ZONE 'Europe/Chisinau')::date;
    IF n >= 10 THEN RAISE EXCEPTION 'PLAFON_PROBA' USING ERRCODE = 'P0001'; END IF;
  END IF;

  IF v_locuri IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(format('bilete_loc:%s:%s:%s', (p->>'trip_date')::date, (p->>'crm_route_id')::int, v_north)));
    SELECT string_agg(l::text, ',' ORDER BY l) INTO v_ocupate
      FROM (SELECT DISTINCT o.loc AS l FROM bilete_locuri_ocupate((p->>'trip_date')::date, (p->>'crm_route_id')::int, v_north) o
             WHERE o.loc = ANY (v_locuri)) s;
    IF v_ocupate IS NOT NULL THEN RAISE EXCEPTION 'LOC_OCUPAT:%', v_ocupate USING ERRCODE = 'P0001'; END IF;
  END IF;

  INSERT INTO bilete_comenzi (idempotency_key, trip_date, crm_route_id, going_north, from_stop_order, to_stop_order,
                              from_name, to_name, departure_at, seats, price_per_seat, total, passenger_name, phone,
                              email, lang, ip_hash, test, proba_fizica,
                              punct_urcare_id, punct_urcare_nume_ro, punct_urcare_nume_ru, punct_urcare_lat, punct_urcare_lon,
                              locuri_alese)
  VALUES (v_key, (p->>'trip_date')::date, (p->>'crm_route_id')::int, v_north,
          (p->>'from_stop_order')::int, (p->>'to_stop_order')::int, p->>'from_name', p->>'to_name',
          (p->>'departure_at')::timestamptz, v_seats, (p->>'price_per_seat')::numeric,
          (p->>'total')::numeric, p->>'passenger_name', v_phone, p->>'email', coalesce(p->>'lang', 'ro'), coalesce(v_ip, ''),
          -- comanda de probă e mereu și test (532)
          coalesce((p->>'test')::boolean, false) OR v_proba, v_proba,
          (p->>'punct_urcare_id')::bigint, p->>'punct_urcare_nume_ro', p->>'punct_urcare_nume_ru',
          (p->>'punct_urcare_lat')::numeric, (p->>'punct_urcare_lon')::numeric,
          v_locuri)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO r;
  IF r.id IS NULL THEN SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = v_key; END IF;
  RETURN r;
END $$;

REVOKE EXECUTE ON FUNCTION public.bilete_creeaza_comanda(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bilete_creeaza_comanda(jsonb) TO service_role;

-- Telefonul e cerut doar șoferilor reali de interurban; șoferul de probă n-are cursă pe translux.md și se leagă prin
-- telegram_id, nu prin telefon.
CREATE OR REPLACE FUNCTION public.drivers_require_phone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(NEW.is_lde, false) = false AND COALESCE(NEW.is_test, false) = false
     AND (NEW.phone IS NULL OR btrim(NEW.phone) = '') THEN
    RAISE EXCEPTION 'Telefonul este obligatoriu la șoferii de interurban (fără el cursa nu apare pe translux.md)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.drivers_require_phone() FROM PUBLIC, anon, authenticated;

-- Șoferul de probă, INACTIV (activarea e un pas separat, după ce filtrele is_test sunt live).
INSERT INTO drivers (full_name, active, is_test, telegram_id, telegram_legat_la, telegram_legat_prin, directions)
SELECT 'TEST BILETE — Iurie (probă)', false, true, 1407418059, now(), 'admin', '{}'
WHERE NOT EXISTS (SELECT 1 FROM drivers WHERE telegram_id = 1407418059);

-- Probă la aplicare: plafonul probei (pe o cursă din 2031, totul anulat la sfârșit prin excepția finală a blocului).
DO $$
DECLARE c bilete_comenzi; i int; err text;
BEGIN
  FOR i IN 1..11 LOOP
    BEGIN
      c := bilete_creeaza_comanda(jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-03-01',
        'crm_route_id', (SELECT min(id) FROM crm_routes), 'going_north', false, 'from_stop_order', 1, 'to_stop_order', 2,
        'from_name', 'Proba532', 'to_name', 'Proba532', 'departure_at', '2031-03-01T06:00:00+02', 'seats', 1,
        'price_per_seat', 10, 'total', 10, 'passenger_name', 'Proba 532', 'phone', '3736' || lpad(i::text, 7, '0'),
        'ip_hash', 'proba532-' || i, 'proba_fizica', true));
      IF NOT (c.test AND c.proba_fizica) THEN RAISE EXCEPTION 'PROBA532: comanda nu e test+proba'; END IF;
    EXCEPTION WHEN OTHERS THEN
      err := SQLERRM;
      IF err = 'PLAFON_PROBA' AND i = 11 THEN RAISE EXCEPTION 'PROBA532_OK'; END IF;
      RAISE EXCEPTION 'PROBA532: la comanda % → %', i, err;
    END;
  END LOOP;
  RAISE EXCEPTION 'PROBA532: a 11-a comandă de probă a trecut';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'PROBA532_OK' THEN RAISE; END IF;
END $$;
