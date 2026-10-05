-- 501_bilete_loc_nr.sql — ION-239 (05.10.2026): numărul locului pe biletul online (mini app-ul șoferului, pachetul A).
-- Ion, 05.10 (planul de vizualizare, «Deciziile lui Ion: locurile»): autobuzul interurban are 1 loc în față lângă șofer,
-- 5 rânduri a câte 3 (două stânga, culoar, unul dreapta) și rândul din spate cu 4 = 20 de locuri.
-- Ion, 05.10 (mai târziu, prin coordonator): la plecarea din Chișinău spre nord (retur, going_north = true) PASAGERUL
-- își alege locul pe hartă la cumpărare; pe tur (spre Chișinău) locul se dă automat la emitere, în ordinea cumpărării.
--
--  * bilete.loc_nr smallint 1..20, unic pe cursă. Cursa = bilete_comenzi(trip_date, crm_route_id, going_north); cele trei
--    coloane se copiază pe bilet (denormalizate, puse de trigger la INSERT) ca unicitatea să fie un index, nu o funcție.
--  * bilete_comenzi.locuri_alese smallint[] — locurile alese de pasager (doar retur; NULL pe tur). Cât comanda e «noua»
--    (sau «eroare_creare») și mai tânără de 30 de minute (termenul coșului părăsit din 484 / împăcarea ION-196: sesiunea
--    maib trăiește 25), alegerea e o REZERVARE: locul e ocupat și pentru alți cumpărători, și pentru atribuirea automată.
--  * bilete_locuri_ocupate(cursă) = biletele valid/urcat cu loc + rezervările vii; o folosesc verificarea din
--    bilete_creeaza_comanda (sub lacătul cursei: două cumpărări simultane nu iau același loc → LOC_OCUPAT:2,3) și
--    endpointul public /api/bilete/public/locuri (harta de pe site).
--  * atribuirea: trigger BEFORE INSERT pe bilete — prinde ambele funcții de emitere (bilete_marcheaza_platita din 486 și
--    bilete_emite_fara_bilet din 488), care inserează biletele în ordinea nr: biletul nr ia locuri_alese[nr] dacă comanda
--    le are (și locul nu e deja al unui bilet viu — altfel cel mai mic liber + alertă «loc_schimbat»), altfel cel mai mic
--    loc liber pe cursă, sub lacătul advisory al cursei; indexul unic e plasa de siguranță.
--  * fără loc liber → emiterea NU pică (pasagerul a plătit): loc_nr NULL + alertă «fara_loc».
--  * bilet anulat / returnat eliberează locul (loc_nr NULL); reactivarea (bilete_reactiveaza, 487) primește din nou loc
--    (cel ales dacă e liber, altfel cel mai mic liber).
--  * backfill pe biletele deja emise, în ordinea paid_at, nr.
-- Nimic greu la aplicare (biletele sunt câteva zeci). Doar service_role; REVOKE EXECUTE FROM PUBLIC pe funcțiile noi.

ALTER TABLE bilete ADD COLUMN IF NOT EXISTS loc_nr       smallint CHECK (loc_nr BETWEEN 1 AND 20);
ALTER TABLE bilete ADD COLUMN IF NOT EXISTS trip_date    date;
ALTER TABLE bilete ADD COLUMN IF NOT EXISTS crm_route_id int REFERENCES crm_routes(id);
ALTER TABLE bilete ADD COLUMN IF NOT EXISTS going_north  boolean;
COMMENT ON COLUMN bilete.loc_nr IS 'Locul din autobuz (ION-239): 1 = în față lângă șofer, 2–16 = cinci rânduri a câte trei, 17–20 = rândul din spate. Pe retur = ales de pasager (bilete_comenzi.locuri_alese[nr]), pe tur = cel mai mic liber la emitere; NULL = n-a mai fost loc (alertă fara_loc) sau bilet anulat/returnat.';
COMMENT ON COLUMN bilete.trip_date IS 'Copia cursei de pe comandă (trip_date, crm_route_id, going_north), pusă de trigger — unicitatea locului pe cursă e un index.';

ALTER TABLE bilete_comenzi ADD COLUMN IF NOT EXISTS locuri_alese smallint[];
ALTER TABLE bilete_comenzi DROP CONSTRAINT IF EXISTS bilete_comenzi_locuri_alese_check;
ALTER TABLE bilete_comenzi ADD CONSTRAINT bilete_comenzi_locuri_alese_check
  CHECK (locuri_alese IS NULL OR (going_north AND cardinality(locuri_alese) = seats AND 1 <= ALL (locuri_alese) AND 20 >= ALL (locuri_alese)));
COMMENT ON COLUMN bilete_comenzi.locuri_alese IS 'ION-239: locurile alese de pasager pe hartă (doar retur, câte unul pe loc, în ordinea biletelor nr); cât comanda e deschisă și sub 30 min = rezervare temporară; NULL = atribuire automată.';
-- Rezervările vii se caută pe cursă: index parțial pe comenzile deschise cu locuri alese (rămâne minuscul).
CREATE INDEX IF NOT EXISTS bilete_comenzi_rezervari_idx ON bilete_comenzi (trip_date, crm_route_id, going_north)
  WHERE status IN ('noua', 'eroare_creare') AND locuri_alese IS NOT NULL;

ALTER TABLE bilete_alerte DROP CONSTRAINT IF EXISTS bilete_alerte_tip_check;
ALTER TABLE bilete_alerte ADD CONSTRAINT bilete_alerte_tip_check CHECK (tip IN (
  'platita_fara_bilet', 'suma_nepotrivita', 'refund_necunoscut', 'refund_respins', 'cursa_fara_sofer',
  'urcat_pe_anulat', 'creare_esuata', 'plafon_atins', 'refund_pe_zi_confirmata', 'email_esuat', 'fara_loc', 'loc_schimbat'));

-- ---------------------------------------------------------------------------------------------
-- Capacitatea autobuzului: 20 = 1 (față, lângă șofer) + 5 × 3 (rânduri) + 4 (rândul din spate). Ion, 05.10.
-- O singură constantă, aici; API-urile o repetă (capacitate: 20) din același motiv — fără tabel de configurare.
CREATE OR REPLACE FUNCTION public.bilete_capacitate_autobuz() RETURNS smallint
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 20::smallint $$;

-- Cât trăiește rezervarea unei comenzi deschise: 30 de minute de la creare (sesiunea maib trăiește 25; împăcarea
-- marchează «expirata» comenzile deschise mai vechi de 30 — VARSTA_MIN_MS din impacare-reguli.ts).
CREATE OR REPLACE FUNCTION public.bilete_rezervare_durata() RETURNS interval
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT interval '30 minutes' $$;

-- Locurile ocupate pe cursă: biletele vii cu loc («bilet», fără expirare) și rezervările comenzilor deschise («rezervare»,
-- cu momentul expirării). p_fara_comanda = comanda proprie, care nu se blochează singură.
CREATE OR REPLACE FUNCTION public.bilete_locuri_ocupate(p_trip_date date, p_crm_route_id int, p_going_north boolean, p_fara_comanda uuid DEFAULT NULL)
RETURNS TABLE (loc smallint, fel text, expira_la timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT b.loc_nr, 'bilet'::text, NULL::timestamptz
    FROM bilete b
   WHERE b.trip_date = p_trip_date AND b.crm_route_id = p_crm_route_id AND b.going_north = p_going_north
     AND b.loc_nr IS NOT NULL AND b.status IN ('valid', 'urcat')
  UNION ALL
  SELECT l, 'rezervare'::text, c.created_at + bilete_rezervare_durata()
    FROM bilete_comenzi c, unnest(c.locuri_alese) AS l
   WHERE c.trip_date = p_trip_date AND c.crm_route_id = p_crm_route_id AND c.going_north = p_going_north
     AND c.status IN ('noua', 'eroare_creare') AND c.locuri_alese IS NOT NULL
     AND c.created_at > now() - bilete_rezervare_durata()
     AND (p_fara_comanda IS NULL OR c.id <> p_fara_comanda)
$$;

-- Cel mai mic loc liber pe cursă (NULL = nu mai e niciunul), ocolind biletele vii ȘI rezervările. Lacăt advisory pe
-- cursă, ținut până la sfârșitul tranzacției: a doua plată pe aceeași cursă așteaptă prima și apoi vede locurile ei
-- deja scrise (READ COMMITTED, funcție VOLATILE → snapshot nou la fiecare interogare).
CREATE OR REPLACE FUNCTION public.bilete_loc_liber(p_trip_date date, p_crm_route_id int, p_going_north boolean, p_fara_comanda uuid DEFAULT NULL) RETURNS smallint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v smallint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(format('bilete_loc:%s:%s:%s', p_trip_date, p_crm_route_id, p_going_north)));
  SELECT min(g)::smallint INTO v
    FROM generate_series(1, bilete_capacitate_autobuz()) g
   WHERE NOT EXISTS (SELECT 1 FROM bilete_locuri_ocupate(p_trip_date, p_crm_route_id, p_going_north, p_fara_comanda) o WHERE o.loc = g);
  RETURN v;
END $$;

-- Triggerul: la INSERT copiază cursa de pe comandă și dă locul (ales sau automat); la UPDATE eliberează locul biletului
-- anulat/returnat și dă loc nou biletului reactivat. Locul pus explicit (loc_nr diferit de OLD) rămâne — indexul unic îl apără.
CREATE OR REPLACE FUNCTION public.bilete_loc_nr_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; ales smallint; sens text;
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.trip_date IS NULL OR NEW.crm_route_id IS NULL OR NEW.going_north IS NULL) THEN
    SELECT trip_date, crm_route_id, going_north INTO c FROM bilete_comenzi WHERE id = NEW.comanda_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'COMANDA_INEXISTENTA' USING ERRCODE = 'P0001'; END IF;
    NEW.trip_date := c.trip_date; NEW.crm_route_id := c.crm_route_id; NEW.going_north := c.going_north;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IN ('anulat', 'returnat') THEN
    NEW.loc_nr := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status IN ('valid', 'urcat') AND NEW.loc_nr IS NULL
     AND (TG_OP = 'INSERT' OR OLD.status IN ('anulat', 'returnat')) THEN
    sens := CASE WHEN NEW.going_north THEN 'retur' ELSE 'tur' END;
    PERFORM pg_advisory_xact_lock(hashtext(format('bilete_loc:%s:%s:%s', NEW.trip_date, NEW.crm_route_id, NEW.going_north)));
    -- Locul ales de pasager (retur): locuri_alese[nr], dacă nu l-a luat între timp un bilet viu (rezervarea expirase).
    SELECT locuri_alese[NEW.nr] INTO ales FROM bilete_comenzi
     WHERE id = NEW.comanda_id AND locuri_alese IS NOT NULL AND cardinality(locuri_alese) >= NEW.nr;
    IF ales IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM bilete b WHERE b.trip_date = NEW.trip_date AND b.crm_route_id = NEW.crm_route_id
                   AND b.going_north = NEW.going_north AND b.loc_nr = ales AND b.status IN ('valid', 'urcat')) THEN
        INSERT INTO bilete_alerte (comanda_id, tip, detalii)
        VALUES (NEW.comanda_id, 'loc_schimbat', format('biletul nr. %s: locul ales %s era deja dat pe cursa %s / ruta %s / %s (rezervarea expirase); primește alt loc',
                NEW.nr, ales, NEW.trip_date, NEW.crm_route_id, sens));
        ales := NULL;
      END IF;
    END IF;
    NEW.loc_nr := coalesce(ales, bilete_loc_liber(NEW.trip_date, NEW.crm_route_id, NEW.going_north, NEW.comanda_id));
    IF NEW.loc_nr IS NULL THEN
      INSERT INTO bilete_alerte (comanda_id, tip, detalii)
      VALUES (NEW.comanda_id, 'fara_loc', format('biletul nr. %s%s: toate cele %s locuri ale cursei %s / ruta %s / %s sunt date',
              NEW.nr, CASE WHEN TG_OP = 'UPDATE' THEN ' (reactivat)' ELSE '' END, bilete_capacitate_autobuz(), NEW.trip_date, NEW.crm_route_id, sens));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bilete_loc_nr ON bilete;
CREATE TRIGGER bilete_loc_nr BEFORE INSERT OR UPDATE OF status, loc_nr ON bilete
  FOR EACH ROW EXECUTE FUNCTION bilete_loc_nr_trg();

-- ---------------------------------------------------------------------------------------------
-- Crearea comenzii (ultima formă: 490) + locurile alese: doar pe retur, câte unul pe loc, 1..20, distincte, LIBERE —
-- verificate sub lacătul cursei (același ca la emitere), în aceeași tranzacție cu INSERT-ul. Ocupate → LOC_OCUPAT:2,3.
-- Lacătul global 'bilete_comanda' (plafoanele) se ia primul, apoi cel al cursei; emiterea ia doar pe al cursei — fără
-- interblocare.
CREATE OR REPLACE FUNCTION public.bilete_creeaza_comanda(p jsonb) RETURNS bilete_comenzi
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE r bilete_comenzi; n int; v_ip text := p->>'ip_hash'; v_phone text := p->>'phone'; v_key uuid := (p->>'idempotency_key')::uuid;
        v_locuri smallint[]; v_ocupate text; v_north boolean := (p->>'going_north')::boolean; v_seats smallint := (p->>'seats')::smallint;
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

  IF v_locuri IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(format('bilete_loc:%s:%s:%s', (p->>'trip_date')::date, (p->>'crm_route_id')::int, v_north)));
    SELECT string_agg(l::text, ',' ORDER BY l) INTO v_ocupate
      FROM (SELECT DISTINCT o.loc AS l FROM bilete_locuri_ocupate((p->>'trip_date')::date, (p->>'crm_route_id')::int, v_north) o
             WHERE o.loc = ANY (v_locuri)) s;
    IF v_ocupate IS NOT NULL THEN RAISE EXCEPTION 'LOC_OCUPAT:%', v_ocupate USING ERRCODE = 'P0001'; END IF;
  END IF;

  INSERT INTO bilete_comenzi (idempotency_key, trip_date, crm_route_id, going_north, from_stop_order, to_stop_order,
                              from_name, to_name, departure_at, seats, price_per_seat, total, passenger_name, phone,
                              email, lang, ip_hash, test,
                              punct_urcare_id, punct_urcare_nume_ro, punct_urcare_nume_ru, punct_urcare_lat, punct_urcare_lon,
                              locuri_alese)
  VALUES (v_key, (p->>'trip_date')::date, (p->>'crm_route_id')::int, v_north,
          (p->>'from_stop_order')::int, (p->>'to_stop_order')::int, p->>'from_name', p->>'to_name',
          (p->>'departure_at')::timestamptz, v_seats, (p->>'price_per_seat')::numeric,
          (p->>'total')::numeric, p->>'passenger_name', v_phone, p->>'email', coalesce(p->>'lang', 'ro'), coalesce(v_ip, ''),
          coalesce((p->>'test')::boolean, false),
          (p->>'punct_urcare_id')::bigint, p->>'punct_urcare_nume_ro', p->>'punct_urcare_nume_ru',
          (p->>'punct_urcare_lat')::numeric, (p->>'punct_urcare_lon')::numeric,
          v_locuri)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO r;
  IF r.id IS NULL THEN SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = v_key; END IF;
  RETURN r;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Backfill: cursa de pe comandă, apoi locurile biletelor vii, în ordinea plății și a numărului (triggerul de UPDATE
-- nu intervine: starea nu se schimbă, loc_nr vine explicit). Peste capacitate → NULL + alertă, ca la emitere.
UPDATE bilete b
   SET trip_date = c.trip_date, crm_route_id = c.crm_route_id, going_north = c.going_north
  FROM bilete_comenzi c
 WHERE c.id = b.comanda_id AND (b.trip_date IS NULL OR b.crm_route_id IS NULL OR b.going_north IS NULL);

WITH ordonate AS (
  SELECT b.id,
         row_number() OVER (PARTITION BY b.trip_date, b.crm_route_id, b.going_north ORDER BY c.paid_at NULLS LAST, c.created_at, b.nr) AS rn
    FROM bilete b JOIN bilete_comenzi c ON c.id = b.comanda_id
   WHERE b.status IN ('valid', 'urcat') AND b.loc_nr IS NULL
)
UPDATE bilete b SET loc_nr = o.rn FROM ordonate o WHERE o.id = b.id AND o.rn <= bilete_capacitate_autobuz();

INSERT INTO bilete_alerte (comanda_id, tip, detalii)
SELECT b.comanda_id, 'fara_loc', format('backfill 501: biletul nr. %s n-a încăput în cele %s locuri ale cursei %s / ruta %s', b.nr, bilete_capacitate_autobuz(), b.trip_date, b.crm_route_id)
  FROM bilete b WHERE b.status IN ('valid', 'urcat') AND b.loc_nr IS NULL;

ALTER TABLE bilete ALTER COLUMN trip_date SET NOT NULL;
ALTER TABLE bilete ALTER COLUMN crm_route_id SET NOT NULL;
ALTER TABLE bilete ALTER COLUMN going_north SET NOT NULL;

-- Un loc o singură dată pe cursă (doar biletele cu loc; anulat/returnat au NULL). Servește și căutării pe cursă a API-ului.
CREATE UNIQUE INDEX IF NOT EXISTS bilete_loc_cursa_uniq ON bilete (trip_date, crm_route_id, going_north, loc_nr) WHERE loc_nr IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bilete_capacitate_autobuz()', 'bilete_rezervare_durata()', 'bilete_locuri_ocupate(date, int, boolean, uuid)',
                           'bilete_loc_liber(date, int, boolean, uuid)', 'bilete_loc_nr_trg()', 'bilete_creeaza_comanda(jsonb)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Probe la aplicare (pe o cursă din 2031, ca să nu atingă biletele reale).
-- A. Tur, automat: emiterea dă 1, 2 în ordinea nr; a doua comandă continuă cu 3; anularea eliberează; reactivarea ia
--    din nou cel mai mic liber; la 20 ocupate → NULL + fara_loc.
DO $$
DECLARE c1 bilete_comenzi; c2 bilete_comenzi; ck1 uuid := gen_random_uuid(); ck2 uuid := gen_random_uuid();
        ruta int := (SELECT id FROM crm_routes WHERE active ORDER BY id LIMIT 1); locuri smallint[]; n int; i int;
BEGIN
  c1 := bilete_creeaza_comanda(jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000501', 'trip_date', '2031-01-01',
        'crm_route_id', ruta, 'going_north', false, 'from_stop_order', 10, 'to_stop_order', 340, 'from_name', 'Probă', 'to_name', 'Probă',
        'departure_at', '2031-01-01T05:45:00+03:00', 'seats', 2, 'price_per_seat', 283, 'total', 566, 'passenger_name', 'Probă 501',
        'phone', '37360000005', 'ip_hash', 'proba501', 'test', true));
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck1, c1.id::text, 'sandbox', 566, 'Completed', 'Executed', 0);
  PERFORM bilete_marcheaza_platita(ck1);
  SELECT array_agg(loc_nr ORDER BY nr) INTO locuri FROM bilete WHERE comanda_id = c1.id;
  IF locuri IS DISTINCT FROM ARRAY[1, 2]::smallint[] THEN RAISE EXCEPTION '501: locurile primei comenzi = %, așteptat {1,2}', locuri; END IF;
  SELECT count(*) INTO n FROM bilete WHERE comanda_id = c1.id AND trip_date = '2031-01-01' AND crm_route_id = ruta AND going_north = false;
  IF n <> 2 THEN RAISE EXCEPTION '501: cursa nu s-a copiat pe bilete'; END IF;

  c2 := bilete_creeaza_comanda(jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000502', 'trip_date', '2031-01-01',
        'crm_route_id', ruta, 'going_north', false, 'from_stop_order', 10, 'to_stop_order', 340, 'from_name', 'Probă', 'to_name', 'Probă',
        'departure_at', '2031-01-01T05:45:00+03:00', 'seats', 1, 'price_per_seat', 283, 'total', 283, 'passenger_name', 'Probă 501b',
        'phone', '37360000006', 'ip_hash', 'proba501', 'test', true));
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck2, c2.id::text, 'sandbox', 283, 'Completed', 'Executed', 0);
  PERFORM bilete_marcheaza_platita(ck2);
  SELECT loc_nr INTO n FROM bilete WHERE comanda_id = c2.id;
  IF n <> 3 THEN RAISE EXCEPTION '501: a doua comandă a primit locul %, așteptat 3', n; END IF;

  PERFORM bilete_anuleaza(c1.id, 'admin', 'probă 501');
  SELECT count(*) INTO n FROM bilete WHERE comanda_id = c1.id AND loc_nr IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION '501: anularea nu a eliberat locurile'; END IF;
  PERFORM bilete_reactiveaza(c1.id);
  SELECT array_agg(loc_nr ORDER BY nr) INTO locuri FROM bilete WHERE comanda_id = c1.id;
  IF locuri IS DISTINCT FROM ARRAY[1, 2]::smallint[] THEN RAISE EXCEPTION '501: reactivarea a dat %, așteptat {1,2}', locuri; END IF;

  FOR i IN 4..20 LOOP INSERT INTO bilete (comanda_id, nr) VALUES (c2.id, i); END LOOP;
  INSERT INTO bilete (comanda_id, nr) VALUES (c2.id, 21);
  SELECT loc_nr INTO n FROM bilete WHERE comanda_id = c2.id AND nr = 21;
  IF n IS NOT NULL THEN RAISE EXCEPTION '501: al 21-lea bilet a primit loc (%)', n; END IF;
  SELECT count(*) INTO n FROM bilete_alerte WHERE comanda_id = c2.id AND tip = 'fara_loc';
  IF n <> 1 THEN RAISE EXCEPTION '501: alerta fara_loc lipsește (%)', n; END IF;
  SELECT count(DISTINCT loc_nr) INTO n FROM bilete WHERE trip_date = '2031-01-01' AND crm_route_id = ruta AND going_north = false AND loc_nr IS NOT NULL;
  IF n <> 20 THEN RAISE EXCEPTION '501: pe cursă sunt % locuri distincte, așteptat 20', n; END IF;

  DELETE FROM bilete_comenzi WHERE id IN (c1.id, c2.id);  -- cascada șterge biletele și alertele de probă
  DELETE FROM maib_checkouts WHERE checkout_id IN (ck1, ck2);
END $$;

-- B. Retur, locuri alese: rezervarea blochează alți cumpărători (LOC_OCUPAT cu lista), pe tur alegerea e refuzată,
--    numărul greșit de locuri e refuzat, emiterea dă exact locurile alese, atribuirea automată ocolește rezervarea.
DO $$
DECLARE c1 bilete_comenzi; c2 bilete_comenzi; c3 bilete_comenzi; ck1 uuid := gen_random_uuid(); ck3 uuid := gen_random_uuid();
        ruta int := (SELECT id FROM crm_routes WHERE active ORDER BY id LIMIT 1); locuri smallint[]; n int; msg text;
        baza jsonb := jsonb_build_object('trip_date', '2031-01-02', 'crm_route_id', ruta, 'going_north', true, 'from_stop_order', 340,
             'to_stop_order', 10, 'from_name', 'Probă', 'to_name', 'Probă', 'departure_at', '2031-01-02T14:00:00+03:00',
             'price_per_seat', 283, 'ip_hash', 'proba501r', 'test', true);
BEGIN
  c1 := bilete_creeaza_comanda(baza || jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000503', 'seats', 2, 'total', 566,
        'passenger_name', 'Probă 501r', 'phone', '37360000007', 'locuri_alese', jsonb_build_array(5, 6)));
  IF c1.locuri_alese IS DISTINCT FROM ARRAY[5, 6]::smallint[] THEN RAISE EXCEPTION '501: locuri_alese nu s-a scris (%)', c1.locuri_alese; END IF;
  SELECT array_agg(loc ORDER BY loc) INTO locuri FROM bilete_locuri_ocupate('2031-01-02', ruta, true) WHERE fel = 'rezervare';
  IF locuri IS DISTINCT FROM ARRAY[5, 6]::smallint[] THEN RAISE EXCEPTION '501: rezervarea nu apare la ocupate (%)', locuri; END IF;

  msg := '';
  BEGIN
    PERFORM bilete_creeaza_comanda(baza || jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000504', 'seats', 2, 'total', 566,
            'passenger_name', 'Probă 501s', 'phone', '37360000008', 'locuri_alese', jsonb_build_array(6, 7)));
  EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  IF msg <> 'LOC_OCUPAT:6' THEN RAISE EXCEPTION '501: locul rezervat nu e refuzat (%)', msg; END IF;

  msg := '';
  BEGIN
    PERFORM bilete_creeaza_comanda(baza || jsonb_build_object('going_north', false, 'idempotency_key', '00000000-0000-4000-8000-000000000505', 'seats', 1, 'total', 283,
            'passenger_name', 'Probă 501t', 'phone', '37360000009', 'locuri_alese', jsonb_build_array(9)));
  EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  IF msg <> 'LOC_DOAR_RETUR' THEN RAISE EXCEPTION '501: alegerea pe tur nu e refuzată (%)', msg; END IF;

  msg := '';
  BEGIN
    PERFORM bilete_creeaza_comanda(baza || jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000506', 'seats', 2, 'total', 566,
            'passenger_name', 'Probă 501u', 'phone', '37360000010', 'locuri_alese', jsonb_build_array(9)));
  EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  IF msg <> 'LOC_NUMAR' THEN RAISE EXCEPTION '501: numărul greșit de locuri nu e refuzat (%)', msg; END IF;

  -- comandă fără alegere pe aceeași cursă: automat, ocolește rezervarea 5,6 → ia 1
  c3 := bilete_creeaza_comanda(baza || jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000507', 'seats', 1, 'total', 283,
        'passenger_name', 'Probă 501v', 'phone', '37360000011'));
  UPDATE bilete_comenzi SET locuri_alese = ARRAY[1]::smallint[] WHERE id = c3.id;  -- rezervă și 1, ca automatul să sară peste 1, 5, 6
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck1, c1.id::text, 'sandbox', 566, 'Completed', 'Executed', 0);
  PERFORM bilete_marcheaza_platita(ck1);
  SELECT array_agg(loc_nr ORDER BY nr) INTO locuri FROM bilete WHERE comanda_id = c1.id;
  IF locuri IS DISTINCT FROM ARRAY[5, 6]::smallint[] THEN RAISE EXCEPTION '501: emiterea nu a dat locurile alese (%)', locuri; END IF;
  SELECT count(*) INTO n FROM bilete_locuri_ocupate('2031-01-02', ruta, true) WHERE fel = 'bilet';
  IF n <> 2 THEN RAISE EXCEPTION '501: biletele emise nu apar la ocupate (%)', n; END IF;

  UPDATE bilete_comenzi SET locuri_alese = NULL WHERE id = c3.id;
  c2 := bilete_creeaza_comanda(baza || jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000508', 'seats', 1, 'total', 283,
        'passenger_name', 'Probă 501w', 'phone', '37360000012', 'locuri_alese', jsonb_build_array(1)));
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck3, c3.id::text, 'sandbox', 283, 'Completed', 'Executed', 0);
  PERFORM bilete_marcheaza_platita(ck3);
  SELECT loc_nr INTO n FROM bilete WHERE comanda_id = c3.id;
  IF n <> 2 THEN RAISE EXCEPTION '501: automatul nu a ocolit rezervarea și biletele (a dat %, așteptat 2)', n; END IF;

  DELETE FROM bilete_comenzi WHERE id IN (c1.id, c2.id, c3.id);
  DELETE FROM maib_checkouts WHERE checkout_id IN (ck1, ck3);
END $$;
