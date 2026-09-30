-- 446: Bilete aparat — vânzările bătute de șoferi din terminalul TIKI (exporturile «carrier-2-sales-*.csv»).
-- Ion, 30.09: «creează în numărare pe central încă un meniu cu bilete fizic vândute din aparat … noi permitem asta
-- la șoferi fiindcă încasarea o verificăm cu numărare; pagina aditională cu aceste date, aranjate user friendly
-- și analitic corect». Tab-ul «Bilete aparat» (doar ADMIN) importă CSV-ul din browser, în bucăți, prin service_role.
--
-- Reguli de date (analiza exporturilor 2025–2026):
--  * cheia e numărul biletului; exporturile se suprapun și conțin dubluri → ON CONFLICT DO NOTHING;
--  * până în februarie 2026 exportul nu are stații («—»): perechea se DEDUCE din preț (pair_source='dedus_pret'),
--    învățând din rândurile care au stații. Tariful 2025–feb 2026 a fost fix; din martie 2026 prețul se schimbă
--    aproape săptămânal cu un indice comun (motorina) → prețul fiecărei zile se aduce la tariful vechi prin
--    raportul Chișinău→Bălți: 99,75 / prețul zilei (tiki_day_index);
--  * între 01.12.2025 și 17.01.2026 data din export e ziua sincronizării terminalului, nu a vânzării — marcat în UI.

-- ─── Importuri ───
CREATE TABLE IF NOT EXISTS tiki_import_batches (
  id               bigserial PRIMARY KEY,
  file_name        text NOT NULL,
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  uploaded_by      text,
  rows_in_file     integer NOT NULL DEFAULT 0,
  rows_excluded    jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {test, data_invalida, pret_invalid, fara_bilet}
  rows_dup_in_file integer NOT NULL DEFAULT 0,
  rows_sent        integer NOT NULL DEFAULT 0,
  rows_inserted    integer NOT NULL DEFAULT 0,          -- bilete noi; restul erau deja în bază
  date_min         date,
  date_max         date,
  status           text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'done', 'failed'))
);

-- ─── Biletele ───
CREATE TABLE IF NOT EXISTS tiki_tickets (
  ticket_no        text PRIMARY KEY,
  sale_ts          timestamp NOT NULL,                  -- ora locală (Chișinău), cum vine din export
  sale_date        date NOT NULL,
  route_raw        text NOT NULL,
  route_name       text NOT NULL,                       -- fără oră: «Chisinau - Criva/Larga», «Anulare»
  route_time       text,                                -- '06:00'
  direction        text NOT NULL CHECK (direction IN ('tur', 'retur', 'necunoscut')),
  from_station     text,                                -- doar când vine din export
  to_station       text,
  pair             text,                                -- «Chisinau - Balti» (fără sens)
  pair_source      text NOT NULL DEFAULT 'nedeterminat' CHECK (pair_source IN ('statii', 'dedus_pret', 'nedeterminat')),
  price            numeric(10,2) NOT NULL,
  payment          text,
  channel          text,
  seller           text,
  driver_name      text,
  vehicle          text,
  is_anulare       boolean NOT NULL DEFAULT false,
  import_batch_id  bigint REFERENCES tiki_import_batches(id) ON DELETE SET NULL,
  imported_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tiki_tickets_date ON tiki_tickets (sale_date);
CREATE INDEX IF NOT EXISTS tiki_tickets_source_date ON tiki_tickets (pair_source, sale_date);
CREATE INDEX IF NOT EXISTS tiki_tickets_route_price ON tiki_tickets (route_name, price);

COMMENT ON TABLE tiki_tickets IS
  '446: biletele bătute din aparat (TIKI), importate din CSV în tab-ul Numărare → Bilete aparat. Doar service_role.';

-- ─── Deducerea perechii din preț ───
-- Indicele zilei: cât valorează prețul zilei în tariful fix 2025 (Chișinău→Bălți = 99,75).
CREATE TABLE IF NOT EXISTS tiki_day_index (
  sale_date    date PRIMARY KEY,
  modal_price  numeric(10,2) NOT NULL,
  factor       numeric(12,8) NOT NULL
);

-- Tabela învățată: (rută sau '*', preț adus la tariful 2025) → pereche, din biletele cu stații.
CREATE TABLE IF NOT EXISTS tiki_price_pair_map (
  route_key   text NOT NULL,
  base_price  numeric(10,2) NOT NULL,
  pair        text NOT NULL,
  n           integer NOT NULL,
  PRIMARY KEY (route_key, base_price, pair)
);

-- ─── Totaluri zilnice (rapoartele citesc de aici, nu din ~600k de bilete) ───
CREATE TABLE IF NOT EXISTS tiki_daily_trip (
  sale_date      date NOT NULL,
  route_name     text NOT NULL,
  route_time     text NOT NULL DEFAULT '',
  direction      text NOT NULL,
  driver_name    text NOT NULL DEFAULT '',
  vehicle        text NOT NULL DEFAULT '',
  is_anulare     boolean NOT NULL,
  tickets        integer NOT NULL,
  lei            numeric(12,2) NOT NULL,
  tickets_card   integer NOT NULL,
  tickets_dedus  integer NOT NULL,
  tickets_nedet  integer NOT NULL,
  PRIMARY KEY (sale_date, route_name, route_time, direction, driver_name, vehicle, is_anulare)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tiki_import_batches','tiki_tickets','tiki_day_index','tiki_price_pair_map','tiki_daily_trip'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;
REVOKE ALL ON SEQUENCE tiki_import_batches_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE tiki_import_batches_id_seq TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1) Reface indicele zilelor și tabela prețurilor (o dată după fiecare import).
CREATE OR REPLACE FUNCTION tiki_rebuild_price_map()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_days int; v_keys int;
BEGIN
  DELETE FROM tiki_day_index;
  INSERT INTO tiki_day_index (sale_date, modal_price, factor)
  SELECT sale_date, p, 99.75 / p
  FROM (
    SELECT sale_date, mode() WITHIN GROUP (ORDER BY price) AS p
    FROM tiki_tickets
    WHERE from_station = 'Chisinau' AND to_station = 'Balti' AND price > 0
    GROUP BY sale_date
    HAVING count(*) >= 5
  ) x;
  GET DIAGNOSTICS v_days = ROW_COUNT;

  DELETE FROM tiki_price_pair_map;
  WITH dfac AS (
    SELECT d.sale_date,
           coalesce(
             (SELECT i.factor FROM tiki_day_index i WHERE i.sale_date <= d.sale_date ORDER BY i.sale_date DESC LIMIT 1),
             (SELECT i.factor FROM tiki_day_index i WHERE i.sale_date > d.sale_date ORDER BY i.sale_date ASC LIMIT 1),
             1) AS factor
    FROM (SELECT DISTINCT sale_date FROM tiki_tickets WHERE pair_source = 'statii') d
  ),
  src AS (
    SELECT t.route_name, t.pair, round(t.price * f.factor, 2) AS base
    FROM tiki_tickets t JOIN dfac f USING (sale_date)
    WHERE t.pair_source = 'statii' AND t.pair IS NOT NULL AND t.price > 0
  )
  INSERT INTO tiki_price_pair_map (route_key, base_price, pair, n)
  SELECT route_name, base, pair, count(*) FROM src GROUP BY route_name, base, pair
  UNION ALL
  SELECT '*', base, pair, count(*) FROM src GROUP BY base, pair;
  GET DIAGNOSTICS v_keys = ROW_COUNT;

  RETURN jsonb_build_object('zile_indice', v_days, 'chei', v_keys);
END $$;

-- 2) Completează perechea din preț pe un interval (lună cu lună din UI, ca să nu depășească timpul unei interogări).
CREATE OR REPLACE FUNCTION tiki_deduce_pairs(p_from date, p_to date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  WITH todo AS (
    SELECT DISTINCT t.route_name, t.sale_date, t.price
    FROM tiki_tickets t
    WHERE t.sale_date BETWEEN p_from AND p_to AND t.pair_source <> 'statii'
  ),
  dfac AS (  -- indicele fiecărei zile (sau al celei mai apropiate zile cu indice; 1 = tariful fix 2025)
    SELECT d.sale_date,
           coalesce(
             (SELECT i.factor FROM tiki_day_index i WHERE i.sale_date <= d.sale_date ORDER BY i.sale_date DESC LIMIT 1),
             (SELECT i.factor FROM tiki_day_index i WHERE i.sale_date > d.sale_date ORDER BY i.sale_date ASC LIMIT 1),
             1) AS factor
    FROM (SELECT DISTINCT sale_date FROM todo) d
  ),
  based AS (
    SELECT t.route_name, t.sale_date, t.price, round(t.price * f.factor, 2) AS base
    FROM todo t JOIN dfac f USING (sale_date)
  ),
  keys AS (SELECT route_name, base, greatest(0.2, 0.004 * base) AS tol, bool_and(sale_date < DATE '2026-03-01') AS old_tariff
            FROM based GROUP BY 1, 2),
  pick AS (
    SELECT k.route_name, k.base,
           coalesce(
             -- 0) Ion, 30.09: în tariful fix (până în martie 2026) 65,00 lei = Bălți ↔ Chișinău, pe ambele sensuri
             --    (promoția pe Bălți; din 22.09.2025 turul a trecut la 99,75, returul a rămas 65).
             CASE WHEN k.base = 65.00 AND k.old_tariff THEN 'Chisinau - Balti' END,
             -- a) aceeași cursă, același preț
             (SELECT m.pair FROM tiki_price_pair_map m
               WHERE m.route_key = k.route_name AND m.base_price = k.base ORDER BY m.n DESC, m.pair LIMIT 1),
             -- b) orice cursă, același preț (în tariful fix 2025 prețul exact e mai sigur decât unul apropiat)
             (SELECT m.pair FROM tiki_price_pair_map m
               WHERE m.route_key = '*' AND m.base_price = k.base ORDER BY m.n DESC, m.pair LIMIT 1),
             -- c) aceeași cursă, cel mai apropiat preț (rotunjiri după indice)
             (SELECT m.pair FROM tiki_price_pair_map m
               WHERE m.route_key = k.route_name AND m.base_price BETWEEN k.base - k.tol AND k.base + k.tol
               ORDER BY abs(m.base_price - k.base), m.n DESC, m.pair LIMIT 1),
             -- d) orice cursă, cel mai apropiat preț
             (SELECT m.pair FROM tiki_price_pair_map m
               WHERE m.route_key = '*' AND m.base_price BETWEEN k.base - k.tol AND k.base + k.tol
               ORDER BY abs(m.base_price - k.base), m.n DESC, m.pair LIMIT 1)
           ) AS pair
    FROM keys k
  ),
  fixed AS (
    -- Pe cursele Ocnița, Chișinău–Caracușenii Vechi are același preț ca Chișinău–Ocnița.
    SELECT b.route_name, b.sale_date, b.price,
           CASE WHEN p.pair = 'Chisinau - Caracusenii vechi' AND b.route_name ILIKE '%ocnita%'
                THEN 'Chisinau - Ocnita' ELSE p.pair END AS pair
    FROM based b JOIN pick p USING (route_name, base)
  )
  UPDATE tiki_tickets t
     SET pair = f.pair,
         pair_source = CASE WHEN f.pair IS NULL THEN 'nedeterminat' ELSE 'dedus_pret' END
    FROM fixed f
   WHERE t.sale_date BETWEEN p_from AND p_to
     AND t.pair_source <> 'statii'
     AND t.route_name = f.route_name AND t.sale_date = f.sale_date AND t.price = f.price
     AND (t.pair IS DISTINCT FROM f.pair
          OR t.pair_source IS DISTINCT FROM CASE WHEN f.pair IS NULL THEN 'nedeterminat' ELSE 'dedus_pret' END);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- 3) Reface totalurile zilnice pe interval.
CREATE OR REPLACE FUNCTION tiki_refresh_agg(p_from date, p_to date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  DELETE FROM tiki_daily_trip WHERE sale_date BETWEEN p_from AND p_to;
  INSERT INTO tiki_daily_trip
  SELECT sale_date, route_name, coalesce(route_time, ''), direction, coalesce(driver_name, ''), coalesce(vehicle, ''),
         is_anulare, count(*), sum(price),
         count(*) FILTER (WHERE payment ILIKE 'card%'),
         count(*) FILTER (WHERE pair_source = 'dedus_pret'),
         count(*) FILTER (WHERE pair_source = 'nedeterminat')
  FROM tiki_tickets
  WHERE sale_date BETWEEN p_from AND p_to
  GROUP BY 1, 2, 3, 4, 5, 6, 7;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Rapoarte (jsonb). Filtrele opționale: cursa (route_name) și șoferul (driver_name).

-- Meta: intervalul cu date, cursele și șoferii (pentru filtre).
CREATE OR REPLACE FUNCTION get_tiki_meta()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'date_min', (SELECT min(sale_date) FROM tiki_daily_trip),
    'date_max', (SELECT max(sale_date) FROM tiki_daily_trip),
    'tickets',  (SELECT coalesce(sum(tickets), 0) FROM tiki_daily_trip),
    'routes',   coalesce((SELECT jsonb_agg(jsonb_build_object('name', route_name, 'tickets', n) ORDER BY n DESC)
                  FROM (SELECT route_name, sum(tickets) n FROM tiki_daily_trip WHERE NOT is_anulare GROUP BY 1) r), '[]'),
    'drivers',  coalesce((SELECT jsonb_agg(jsonb_build_object('name', driver_name, 'tickets', n) ORDER BY driver_name)
                  FROM (SELECT driver_name, sum(tickets) n FROM tiki_daily_trip WHERE driver_name <> '' GROUP BY 1) d), '[]')
  );
$$;

-- Rezumatul unei perioade: KPI + seria zilnică + tur/retur + calitatea datelor.
CREATE OR REPLACE FUNCTION get_tiki_summary(p_from date, p_to date, p_route text DEFAULT NULL, p_driver text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH f AS (
    SELECT * FROM tiki_daily_trip
    WHERE sale_date BETWEEN p_from AND p_to
      AND (p_route IS NULL OR route_name = p_route)
      AND (p_driver IS NULL OR driver_name = p_driver)
  )
  SELECT jsonb_build_object(
    'tickets',   coalesce(sum(tickets), 0),
    'lei',       coalesce(sum(lei), 0),
    'card',      coalesce(sum(tickets_card), 0),
    'dedus',     coalesce(sum(tickets_dedus), 0),
    'nedet',     coalesce(sum(tickets_nedet), 0),
    'anulare',   coalesce(sum(tickets) FILTER (WHERE is_anulare), 0),
    'tur',       coalesce(sum(tickets) FILTER (WHERE direction = 'tur'), 0),
    'retur',     coalesce(sum(tickets) FILTER (WHERE direction = 'retur'), 0),
    'lei_tur',   coalesce(sum(lei) FILTER (WHERE direction = 'tur'), 0),
    'lei_retur', coalesce(sum(lei) FILTER (WHERE direction = 'retur'), 0),
    'trip_days', (SELECT count(*) FROM (SELECT DISTINCT sale_date, route_name, route_time, direction FROM f WHERE NOT is_anulare) x),
    'trip_tickets', coalesce(sum(tickets) FILTER (WHERE NOT is_anulare), 0),
    'days',      (SELECT count(DISTINCT sale_date) FROM f),
    'drivers',   (SELECT count(DISTINCT driver_name) FROM f WHERE driver_name <> ''),
    'daily',     coalesce((SELECT jsonb_agg(jsonb_build_object('d', d, 'tickets', n, 'lei', l) ORDER BY d)
                   FROM (SELECT sale_date d, sum(tickets) n, sum(lei) l FROM f GROUP BY 1) z), '[]')
  )
  FROM f;
$$;

-- Șoferii: volum + indicele «ține clienții» (bilete reale / bilete așteptate pe aceleași curse).
-- Unitatea e cursa-zi a șoferului (zi + rută + oră + direcție); media fiecărei curse se ia pe perioadă.
CREATE OR REPLACE FUNCTION get_tiki_drivers(p_from date, p_to date, p_route text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH f AS (
    SELECT * FROM tiki_daily_trip
    WHERE sale_date BETWEEN p_from AND p_to AND NOT is_anulare AND driver_name <> ''
      AND (p_route IS NULL OR route_name = p_route)
  ),
  dt AS (  -- cursa-zi a șoferului
    SELECT driver_name, sale_date, route_name, route_time, direction,
           sum(tickets) tickets, sum(lei) lei, sum(tickets_card) card
    FROM f GROUP BY 1, 2, 3, 4, 5
  ),
  slot AS (
    SELECT route_name, route_time, direction, sum(tickets)::numeric / count(*) AS avg_per_trip
    FROM dt GROUP BY 1, 2, 3
  ),
  per AS (
    SELECT dt.driver_name,
           count(*) trip_days, sum(dt.tickets) tickets, sum(dt.lei) lei, sum(dt.card) card,
           sum(s.avg_per_trip) expected,
           count(DISTINCT dt.sale_date) days
    FROM dt JOIN slot s USING (route_name, route_time, direction)
    GROUP BY 1
  ),
  top AS (
    SELECT driver_name, jsonb_agg(jsonb_build_object('route', r, 'tickets', n) ORDER BY n DESC) FILTER (WHERE rn <= 3) routes,
           count(*) routes_n
    FROM (SELECT driver_name, route_name || coalesce(' ' || nullif(route_time, ''), '') r, sum(tickets) n,
                 row_number() OVER (PARTITION BY driver_name ORDER BY sum(tickets) DESC) rn
          FROM dt GROUP BY 1, 2) z
    GROUP BY 1
  ),
  veh AS (
    SELECT driver_name, count(DISTINCT vehicle) FILTER (WHERE vehicle <> '') vehicles FROM f GROUP BY 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'driver', p.driver_name, 'trip_days', p.trip_days, 'days', p.days, 'tickets', p.tickets, 'lei', p.lei,
    'card', p.card, 'expected', round(p.expected, 2), 'routes', t.routes, 'routes_n', t.routes_n, 'vehicles', v.vehicles
  ) ORDER BY p.tickets DESC), '[]')
  FROM per p JOIN top t USING (driver_name) JOIN veh v USING (driver_name);
$$;

-- Cursele: pe rută + oră + direcție; șoferii cei mai buni pe fiecare (bilete pe cursă-zi, min. 3 curse).
CREATE OR REPLACE FUNCTION get_tiki_routes(p_from date, p_to date, p_driver text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH f AS (
    SELECT * FROM tiki_daily_trip
    WHERE sale_date BETWEEN p_from AND p_to
      AND (p_driver IS NULL OR driver_name = p_driver)
  ),
  r AS (
    SELECT route_name, route_time, direction, bool_or(is_anulare) anulare,
           count(DISTINCT sale_date) trip_days, sum(tickets) tickets, sum(lei) lei, sum(tickets_card) card,
           sum(tickets_dedus) dedus, sum(tickets_nedet) nedet, count(DISTINCT driver_name) FILTER (WHERE driver_name <> '') drivers_n
    FROM f GROUP BY 1, 2, 3
  ),
  d AS (
    SELECT route_name, route_time, direction, driver_name,
           count(DISTINCT sale_date) trips, sum(tickets) tickets
    FROM f WHERE driver_name <> '' AND NOT is_anulare GROUP BY 1, 2, 3, 4
  ),
  best AS (
    SELECT route_name, route_time, direction,
           jsonb_agg(jsonb_build_object('driver', driver_name, 'trips', trips, 'per_trip', round(tickets::numeric / trips, 1))
                     ORDER BY tickets::numeric / trips DESC) FILTER (WHERE rn <= 3) top_drivers
    FROM (SELECT *, row_number() OVER (PARTITION BY route_name, route_time, direction
                                       ORDER BY (trips >= 3) DESC, tickets::numeric / trips DESC) rn FROM d) z
    GROUP BY 1, 2, 3
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'route', r.route_name, 'time', nullif(r.route_time, ''), 'direction', r.direction, 'anulare', r.anulare,
    'trip_days', r.trip_days, 'tickets', r.tickets, 'lei', r.lei, 'card', r.card, 'dedus', r.dedus, 'nedet', r.nedet,
    'drivers_n', r.drivers_n, 'top_drivers', coalesce(b.top_drivers, '[]')
  ) ORDER BY r.tickets DESC), '[]')
  FROM r LEFT JOIN best b USING (route_name, route_time, direction);
$$;

-- Tipurile de bilet (perechi de stații), cu tur/retur și sursa perechii. Citește biletele (filtru pe dată indexat).
CREATE OR REPLACE FUNCTION get_tiki_pairs(p_from date, p_to date, p_route text DEFAULT NULL, p_driver text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH f AS (
    SELECT coalesce(pair, 'Nedeterminat') pair, direction, pair_source, price
    FROM tiki_tickets
    WHERE sale_date BETWEEN p_from AND p_to
      AND (p_route IS NULL OR route_name = p_route)
      AND (p_driver IS NULL OR driver_name = p_driver)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'pair', pair, 'tickets', tickets, 'lei', lei, 'tur', tur, 'retur', retur, 'fara_sens', fara_sens,
    'statii', statii, 'dedus', dedus
  ) ORDER BY tickets DESC), '[]')
  FROM (
    SELECT pair, count(*) tickets, sum(price) lei,
           count(*) FILTER (WHERE direction = 'tur') tur,
           count(*) FILTER (WHERE direction = 'retur') retur,
           count(*) FILTER (WHERE direction = 'necunoscut') fara_sens,
           count(*) FILTER (WHERE pair_source = 'statii') statii,
           count(*) FILTER (WHERE pair_source = 'dedus_pret') dedus
    FROM f GROUP BY 1
  ) z;
$$;

-- Pe luni (toată istoria) și pe săptămâni (ultimele 26), cu filtre opționale.
CREATE OR REPLACE FUNCTION get_tiki_monthly(p_route text DEFAULT NULL, p_driver text DEFAULT NULL, p_pair text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH days AS (
    SELECT sale_date d, sum(tickets)::bigint tickets, sum(lei) lei FROM tiki_daily_trip
    WHERE p_pair IS NULL
      AND (p_route IS NULL OR route_name = p_route) AND (p_driver IS NULL OR driver_name = p_driver)
    GROUP BY 1
    UNION ALL
    SELECT sale_date, count(*), sum(price) FROM tiki_tickets
    WHERE p_pair IS NOT NULL AND coalesce(pair, 'Nedeterminat') = p_pair
      AND (p_route IS NULL OR route_name = p_route) AND (p_driver IS NULL OR driver_name = p_driver)
    GROUP BY 1
  ),
  mx AS (SELECT max(d) v_max FROM days)
  SELECT jsonb_build_object(
    'date_max', (SELECT v_max FROM mx),
    'months', coalesce((SELECT jsonb_agg(jsonb_build_object('m', m, 'tickets', t, 'lei', l, 'days', n, 'last', last) ORDER BY m)
      FROM (SELECT to_char(d, 'YYYY-MM') m, sum(tickets) t, sum(lei) l, count(*) n, max(d) last FROM days GROUP BY 1) x), '[]'),
    'weeks', coalesce((SELECT jsonb_agg(jsonb_build_object('w', w, 'tickets', t, 'lei', l, 'days', n) ORDER BY w)
      FROM (SELECT date_trunc('week', d)::date w, sum(tickets) t, sum(lei) l, count(*) n FROM days, mx
            WHERE d > v_max - 26 * 7 GROUP BY 1) y), '[]')
  );
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'tiki_rebuild_price_map()',
    'tiki_deduce_pairs(date, date)',
    'tiki_refresh_agg(date, date)',
    'get_tiki_meta()',
    'get_tiki_summary(date, date, text, text)',
    'get_tiki_drivers(date, date, text)',
    'get_tiki_routes(date, date, text)',
    'get_tiki_pairs(date, date, text, text)',
    'get_tiki_monthly(text, text, text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
