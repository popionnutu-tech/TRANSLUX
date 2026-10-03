-- 490_interurban_puncte_urcare.sql — ION-198 (03.10.2026): punctele de urcare pe localități la rutele interurbane.
-- Ion: «când sunt mai multe opriri ar fi bine ca clientul când cumpără biletul să indice unde se va afla». Punctele vin din GPS
-- (lde-geo-worker/mejgorod-urcare/luna.mjs, 01.09–01.10, 37 de mașini) + deciziile lui Ion pe pagina de control
-- (final.mjs); Ion a confirmat setul («totul confirmat»). Planul: docs/plans/2026-10-03-puncte-urcare-interurban.md.
--   interurban_puncte_urcare        — un punct = o localitate (name_ro din crm_stop_fares) + coordonate + rang 1..3;
--   interurban_puncte_urcare_rute   — pe ce rută × sens se oferă punctul (going_north = true ⇔ retur);
--   interurban_puncte_urcare_aplica — scrierea atomică a unui set nou (dezactivează, reactivează, inserează; niciodată DELETE);
--   bilete_comenzi.punct_urcare_*   — punctul ales + copia numelui/coordonatelor la momentul comenzii.

CREATE TABLE IF NOT EXISTS interurban_puncte_urcare (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  localitate   text NOT NULL,
  lat          numeric(8,5) NOT NULL CHECK (lat BETWEEN 45.4 AND 48.6),
  lon          numeric(8,5) NOT NULL CHECK (lon BETWEEN 26.6 AND 30.2),
  nume_ro      text NOT NULL CHECK (char_length(nume_ro) BETWEEN 2 AND 40 AND nume_ro !~ '[<>@/\\]|http'),
  nume_ru      text NOT NULL CHECK (char_length(nume_ru) BETWEEN 2 AND 40 AND nume_ru !~ '[<>@/\\]|http'),
  rang         smallint NOT NULL CHECK (rang BETWEEN 1 AND 3),
  zile         int, masini int, curse int, dur_med_s int,
  decizie      text NOT NULL DEFAULT 'analiza' CHECK (decizie IN ('analiza', 'adaugat_ion')),
  sursa        text NOT NULL,
  activ        boolean NOT NULL DEFAULT true,
  calculat_la  timestamptz NOT NULL DEFAULT now()
);
-- un singur punct activ pe (localitate, rang); un index unic parțial nu poate fi amânat → aplica dezactivează întâi
CREATE UNIQUE INDEX IF NOT EXISTS interurban_puncte_urcare_rang_uidx ON interurban_puncte_urcare (localitate, rang) WHERE activ;

CREATE TABLE IF NOT EXISTS interurban_puncte_urcare_rute (
  punct_id       bigint NOT NULL REFERENCES interurban_puncte_urcare(id),
  crm_route_id   int NOT NULL,
  going_north    boolean NOT NULL,
  pondere        numeric(4,2) CHECK (pondere BETWEEN 0 AND 1),
  curse_trecute  int, curse_oprite int,
  PRIMARY KEY (punct_id, crm_route_id, going_north)
);

ALTER TABLE bilete_comenzi
  ADD COLUMN IF NOT EXISTS punct_urcare_id      bigint REFERENCES interurban_puncte_urcare(id),
  ADD COLUMN IF NOT EXISTS punct_urcare_nume_ro text,
  ADD COLUMN IF NOT EXISTS punct_urcare_nume_ru text,
  ADD COLUMN IF NOT EXISTS punct_urcare_lat     numeric(8,5),
  ADD COLUMN IF NOT EXISTS punct_urcare_lon     numeric(8,5);

-- Aplicarea unui set: p = {sursa, puncte:[{localitate, lat, lon, rang, nume_ro, nume_ru, zile, masini, curse, dur_med_s, decizie,
-- perechi:[{crm_route_id, going_north, pondere, curse_trecute, curse_oprite}]}]}. Toate localitățile din tabel sunt rescrise:
-- (1) toate punctele → inactive; (2) un punct nou la ≤ 50 m de unul vechi din aceeași localitate (activ sau nu) îi păstrează
-- id-ul și îl reactivează; (3) restul se inserează; (4) perechile punctelor din set se rescriu; (5) ≤ 3 active pe localitate.
CREATE OR REPLACE FUNCTION public.interurban_puncte_urcare_aplica(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
DECLARE x jsonb; v_id bigint; v_noi int := 0; v_pastrate int := 0; v_dist numeric; n int;
BEGIN
  IF jsonb_typeof(p->'puncte') <> 'array' OR jsonb_array_length(p->'puncte') = 0 THEN RAISE EXCEPTION 'APLICA_GOL'; END IF;
  UPDATE interurban_puncte_urcare SET activ = false WHERE activ;
  FOR x IN SELECT * FROM jsonb_array_elements(p->'puncte') LOOP
    SELECT id INTO v_id FROM interurban_puncte_urcare
     WHERE localitate = x->>'localitate' AND NOT activ
       AND (6371000 * 2 * asin(sqrt(power(sin(radians(((x->>'lat')::numeric - lat) / 2)), 2)
            + cos(radians(lat)) * cos(radians((x->>'lat')::numeric)) * power(sin(radians(((x->>'lon')::numeric - lon) / 2)), 2)))) <= 50
     ORDER BY power((x->>'lat')::numeric - lat, 2) + power(((x->>'lon')::numeric - lon) * 0.67, 2) LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE interurban_puncte_urcare SET activ = true, lat = (x->>'lat')::numeric, lon = (x->>'lon')::numeric,
        nume_ro = x->>'nume_ro', nume_ru = x->>'nume_ru', rang = (x->>'rang')::smallint, zile = (x->>'zile')::int,
        masini = (x->>'masini')::int, curse = (x->>'curse')::int, dur_med_s = (x->>'dur_med_s')::int,
        decizie = coalesce(x->>'decizie', 'analiza'), sursa = p->>'sursa', calculat_la = now()
       WHERE id = v_id;
      v_pastrate := v_pastrate + 1;
    ELSE
      INSERT INTO interurban_puncte_urcare (localitate, lat, lon, nume_ro, nume_ru, rang, zile, masini, curse, dur_med_s, decizie, sursa)
      VALUES (x->>'localitate', (x->>'lat')::numeric, (x->>'lon')::numeric, x->>'nume_ro', x->>'nume_ru', (x->>'rang')::smallint,
              (x->>'zile')::int, (x->>'masini')::int, (x->>'curse')::int, (x->>'dur_med_s')::int, coalesce(x->>'decizie', 'analiza'), p->>'sursa')
      RETURNING id INTO v_id;
      v_noi := v_noi + 1;
    END IF;
    DELETE FROM interurban_puncte_urcare_rute WHERE punct_id = v_id;
    INSERT INTO interurban_puncte_urcare_rute (punct_id, crm_route_id, going_north, pondere, curse_trecute, curse_oprite)
    SELECT v_id, (q->>'crm_route_id')::int, (q->>'going_north')::boolean, (q->>'pondere')::numeric, (q->>'curse_trecute')::int, (q->>'curse_oprite')::int
      FROM jsonb_array_elements(x->'perechi') q
    ON CONFLICT (punct_id, crm_route_id, going_north) DO NOTHING;
  END LOOP;
  SELECT max(c) INTO n FROM (SELECT count(*) c FROM interurban_puncte_urcare WHERE activ GROUP BY localitate) t;
  IF n > 3 THEN RAISE EXCEPTION 'APLICA_PESTE_3'; END IF;
  RETURN jsonb_build_object('noi', v_noi, 'pastrate', v_pastrate,
    'active', (SELECT count(*) FROM interurban_puncte_urcare WHERE activ),
    'inactive', (SELECT count(*) FROM interurban_puncte_urcare WHERE NOT activ));
END $$;

-- Comanda primește punctul ales (copia o face serverul din bază, nu din cererea clientului).
CREATE OR REPLACE FUNCTION public.bilete_creeaza_comanda(p jsonb)
 RETURNS bilete_comenzi
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '5s'
AS $function$
DECLARE r bilete_comenzi; n int; v_ip text := p->>'ip_hash'; v_phone text := p->>'phone'; v_key uuid := (p->>'idempotency_key')::uuid;
BEGIN
  SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = v_key;
  IF FOUND THEN RETURN r; END IF;

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

  INSERT INTO bilete_comenzi (idempotency_key, trip_date, crm_route_id, going_north, from_stop_order, to_stop_order,
                              from_name, to_name, departure_at, seats, price_per_seat, total, passenger_name, phone,
                              email, lang, ip_hash, test,
                              punct_urcare_id, punct_urcare_nume_ro, punct_urcare_nume_ru, punct_urcare_lat, punct_urcare_lon)
  VALUES (v_key, (p->>'trip_date')::date, (p->>'crm_route_id')::int, (p->>'going_north')::boolean,
          (p->>'from_stop_order')::int, (p->>'to_stop_order')::int, p->>'from_name', p->>'to_name',
          (p->>'departure_at')::timestamptz, (p->>'seats')::smallint, (p->>'price_per_seat')::numeric,
          (p->>'total')::numeric, p->>'passenger_name', v_phone, p->>'email', coalesce(p->>'lang', 'ro'), coalesce(v_ip, ''),
          coalesce((p->>'test')::boolean, false),
          (p->>'punct_urcare_id')::bigint, p->>'punct_urcare_nume_ro', p->>'punct_urcare_nume_ru',
          (p->>'punct_urcare_lat')::numeric, (p->>'punct_urcare_lon')::numeric)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO r;
  IF r.id IS NULL THEN SELECT * INTO r FROM bilete_comenzi WHERE idempotency_key = v_key; END IF;
  RETURN r;
END $function$;

-- Drepturi: tiparul 483 — RLS fără politici, nimic pentru anon/authenticated, totul pentru service_role.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['interurban_puncte_urcare', 'interurban_puncte_urcare_rute'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
  REVOKE ALL ON SEQUENCE interurban_puncte_urcare_id_seq FROM PUBLIC, anon, authenticated;
  GRANT USAGE, SELECT ON SEQUENCE interurban_puncte_urcare_id_seq TO service_role;
  FOREACH t IN ARRAY ARRAY['interurban_puncte_urcare_aplica(jsonb)', 'bilete_creeaza_comanda(jsonb)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', t);
  END LOOP;
END $$;

-- Probe la aplicare (excepție → migrația nu se aplică).
DO $$
DECLARE r jsonb; c bilete_comenzi; v_a bigint; v_b bigint;
BEGIN
  IF has_table_privilege('anon', 'interurban_puncte_urcare', 'SELECT') OR has_table_privilege('authenticated', 'interurban_puncte_urcare_rute', 'SELECT') THEN
    RAISE EXCEPTION '490: tabelele punctelor sunt vizibile pentru anon/authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.interurban_puncte_urcare_aplica(jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.bilete_creeaza_comanda(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '490: funcțiile sunt executabile de anon';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.interurban_puncte_urcare_aplica(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '490: service_role nu poate aplica';
  END IF;
  -- două aplicări cu rangurile 2 ↔ 3 inversate: fără unique_violation, id-urile se păstrează
  r := interurban_puncte_urcare_aplica('{"sursa":"proba490","puncte":[
    {"localitate":"Probă490","lat":47.00000,"lon":28.80000,"rang":1,"nume_ro":"Unu","nume_ru":"Один","perechi":[{"crm_route_id":1,"going_north":false,"pondere":0.5}]},
    {"localitate":"Probă490","lat":47.01000,"lon":28.80000,"rang":2,"nume_ro":"Doi","nume_ru":"Два","perechi":[]},
    {"localitate":"Probă490","lat":47.02000,"lon":28.80000,"rang":3,"nume_ro":"Trei","nume_ru":"Три","perechi":[]}]}');
  SELECT id INTO v_a FROM interurban_puncte_urcare WHERE localitate = 'Probă490' AND nume_ro = 'Doi';
  r := interurban_puncte_urcare_aplica('{"sursa":"proba490","puncte":[
    {"localitate":"Probă490","lat":47.00000,"lon":28.80000,"rang":1,"nume_ro":"Unu","nume_ru":"Один","perechi":[]},
    {"localitate":"Probă490","lat":47.01001,"lon":28.80000,"rang":3,"nume_ro":"Doi","nume_ru":"Два","perechi":[]},
    {"localitate":"Probă490","lat":47.02000,"lon":28.80000,"rang":2,"nume_ro":"Trei","nume_ru":"Три","perechi":[]}]}');
  SELECT id INTO v_b FROM interurban_puncte_urcare WHERE localitate = 'Probă490' AND nume_ro = 'Doi' AND activ;
  IF v_a IS DISTINCT FROM v_b OR (r->>'noi')::int <> 0 OR (r->>'active')::int <> 3 THEN RAISE EXCEPTION '490: aplica nu păstrează id-urile: %', r; END IF;
  -- comanda cu punct: câmpurile ajung în rând
  c := bilete_creeaza_comanda(jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000490', 'trip_date', '2026-10-14',
        'crm_route_id', (SELECT id FROM crm_routes WHERE active ORDER BY id LIMIT 1), 'going_north', false, 'from_stop_order', 10,
        'to_stop_order', 340, 'from_name', 'Probă', 'to_name', 'Probă', 'departure_at', '2026-10-14T05:45:00+03:00', 'seats', 1,
        'price_per_seat', 100, 'total', 100, 'passenger_name', 'Probă 490', 'phone', '37360000490', 'ip_hash', 'proba490',
        'punct_urcare_id', v_b, 'punct_urcare_nume_ro', 'Doi', 'punct_urcare_nume_ru', 'Два', 'punct_urcare_lat', 47.01001, 'punct_urcare_lon', 28.8));
  IF c.punct_urcare_id IS DISTINCT FROM v_b OR c.punct_urcare_nume_ro <> 'Doi' THEN RAISE EXCEPTION '490: punctul nu ajunge în comandă'; END IF;
  DELETE FROM bilete_comenzi WHERE id = c.id;
  DELETE FROM interurban_puncte_urcare_rute WHERE punct_id IN (SELECT id FROM interurban_puncte_urcare WHERE localitate = 'Probă490');
  DELETE FROM interurban_puncte_urcare WHERE localitate = 'Probă490';
END $$;
