-- 452: Bilete aparat — atribuirea pe rută + picior, plecările, «Cine merge pe rută» (ION-159, plan
-- docs/plans/2026-10-01-bilete-aparat-design.md, versiunea 7 după 3 runde Claude + Codex).
--
-- Ziua = ziua cursei Mobilet (tiki_trips.trip_date, ION-160), nu a vânzării: blocurile sincronizate dispar. Un trip_id e o
-- deschidere de terminal, nu o plecare; atribuirea se face pe bilet (deschidere × sensul biletului), plecările vin din
-- grafic. Picior: 'nord_chisinau' (= «tur» în Numărare) / 'chisinau_nord' (= «tur» în TIKI) — sensurile «tur» sunt opuse.
-- Surse strict TIKI + Numărare (Ion, 01.10). Locurile: Ion, 01.10 «toate sunt de 20 de locuri, doar auto lui Boaghe
-- 23–27, și Fordurile 17».

-- ─── Locurile ───
UPDATE lde_vehicle_types SET passenger_seats = 20
 WHERE id IN ('INTERURBAN_MJW', 'SPRINTER_313', 'SPRINTER_316', 'SPRINTER_515', 'SPRINTER_516') AND passenger_seats IS NULL;
UPDATE lde_vehicle_types SET passenger_seats = 17 WHERE id = 'FORD' AND passenger_seats IS NULL;
-- WJQ 827 (Boaghe: 46 de zile TIKI / 60 în grafic pe 07–09.2026) — excepție pe mașină, fără schimbarea tipului (norma de motorină).
UPDATE vehicles SET passenger_seats = 27 WHERE upper(replace(plate_number, ' ', '')) IN ('827WJQ', 'WJQ827');

-- ─── Funcții mici ───
CREATE OR REPLACE FUNCTION public.tiki_plate_key(x text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(upper(coalesce(x, '')), '[^A-Z]', '', 'g') || regexp_replace(coalesce(x, ''), '[^0-9]', '', 'g')
$$;

-- Numele unei stații / opriri, comparabil între TIKI («Chisinau GA», «Peresecina ») și Numărare («Chișinău», «Beleavinți»).
CREATE OR REPLACE FUNCTION public.tiki_stop_norm(x text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(regexp_replace(regexp_replace(
           lower(translate(coalesce(x, ''), 'ăâîșşțţĂÂÎȘŞȚŢ', 'aaisstt' || 'aaisstt')),
           '\m(ga|gara|autogara)\M', '', 'g'), '[^a-z0-9]+', ' ', 'g'))
$$;

-- «HH:MM» → minute; NULL dacă nu e oră.
CREATE OR REPLACE FUNCTION public.tiki_min(x text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN x ~ '^\s*\d{1,2}:\d{2}' THEN
    split_part(trim(x), ':', 1)::int * 60 + left(split_part(trim(x), ':', 2), 2)::int END
$$;

-- Coridorul din capătul de nord al unei etichete / rute.
CREATE OR REPLACE FUNCTION public.tiki_coridor(x text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN n ~ '(criva|larga|tetcani)' THEN 'Criva'
    WHEN n ~ '(lipcani|brinzeni|riscani|viisoara)' THEN 'Lipcani'
    WHEN n ~ '(ocnita|otaci)' THEN 'Ocnița–Otaci'
    WHEN n ~ '(briceni|corjeuti|caracusenii)' THEN 'Briceni'
    WHEN n ~ 'grimancauti' THEN 'Grimăncăuți'
    WHEN n ~ 'sirauti' THEN 'Șirăuți'
    WHEN n ~ 'anulare' THEN 'Anulare'
    ELSE 'Altele' END
  FROM (SELECT public.tiki_stop_norm(x) AS n) s
$$;

-- ─── Alias-uri de stații (TIKI → numele opririi din Numărare) ───
CREATE TABLE IF NOT EXISTS tiki_stop_map (
  statie_norm text PRIMARY KEY,
  stop_norm   text NOT NULL
);
INSERT INTO tiki_stop_map VALUES ('beleavineti', 'beleavinti'), ('sl sirauti', 'sirauti') ON CONFLICT DO NOTHING;

-- ─── Atribuirea pe bilet ───
CREATE TABLE IF NOT EXISTS tiki_ticket_attr (
  ticket_key    text PRIMARY KEY,                  -- = tiki_tickets.ticket_key
  zi            date NOT NULL,                     -- ziua cursei (sau a vânzării, marcat, dacă lipsește / e absurdă)
  luna          date NOT NULL,
  zi_sursa      text NOT NULL CHECK (zi_sursa IN ('cursa', 'vanzare')),
  trip_id       bigint,
  vkey          text,                              -- tiki_plate_key(mașina)
  label         text NOT NULL,                     -- eticheta TIKI: «Chisinau - Lipcani 10:40»
  label_dir     text NOT NULL,                     -- sensul TIKI al etichetei: tur / retur / necunoscut
  leg           text CHECK (leg IN ('nord_chisinau', 'chisinau_nord')),
  crm_route_id  integer,
  sursa         text NOT NULL CHECK (sursa IN ('override', 'masina', 'eticheta_luna', 'eticheta_2026', 'nelegat', 'anulare')),
  bilete        integer NOT NULL DEFAULT 1,
  lei           numeric(10,2) NOT NULL,
  km_from       numeric,
  km_to         numeric,
  is_anulare    boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS tiki_ticket_attr_luna ON tiki_ticket_attr (luna);
CREATE INDEX IF NOT EXISTS tiki_ticket_attr_zi_ruta ON tiki_ticket_attr (zi, crm_route_id, leg);

CREATE TABLE IF NOT EXISTS tiki_label_override (
  label          text NOT NULL,
  label_dir      text NOT NULL,
  luna           date NOT NULL,
  crm_route_id   integer NOT NULL REFERENCES crm_routes(id),
  leg            text NOT NULL CHECK (leg IN ('nord_chisinau', 'chisinau_nord')),
  corectat_de    text,
  corectat_la    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (label, label_dir, luna)
);

-- Opririle de referință ale fiecărei rute × picior (ultima sesiune de Numărare completă): km-ul fiecărei stații TIKI.
CREATE TABLE IF NOT EXISTS tiki_route_stops (
  crm_route_id integer NOT NULL,
  leg          text NOT NULL,
  stop_order   integer NOT NULL,
  stop_norm    text NOT NULL,
  km           numeric NOT NULL,
  PRIMARY KEY (crm_route_id, leg, stop_order)
);

-- ─── Plecările (din grafic din 04.04.2026, altfel din bilete) ───
CREATE TABLE IF NOT EXISTS tiki_plecari_daily (
  zi            date NOT NULL,
  crm_route_id  integer NOT NULL,
  leg           text NOT NULL,
  plecari       integer NOT NULL,
  plecari_cu_bilete integer NOT NULL,
  locuri        integer,                           -- Σ locuri ale plecărilor cu locuri cunoscute
  plecari_cu_locuri integer NOT NULL DEFAULT 0,
  km_picior     numeric,
  sursa         text NOT NULL CHECK (sursa IN ('grafic', 'bilete')),
  PRIMARY KEY (zi, crm_route_id, leg)
);

-- ─── Biletele pe zi × rută × picior × sursă ───
CREATE TABLE IF NOT EXISTS tiki_leg_daily (
  zi            date NOT NULL,
  crm_route_id  integer NOT NULL,                  -- 0 = nelegat
  leg           text NOT NULL,                     -- '?' = sens necunoscut
  sursa         text NOT NULL,
  bilete        integer NOT NULL,
  lei           numeric(12,2) NOT NULL,
  om_km_min     numeric NOT NULL,
  om_km_max     numeric NOT NULL,
  bilete_nemapate integer NOT NULL,
  PRIMARY KEY (zi, crm_route_id, leg, sursa)
);

-- Etichetele pe zi (comparația cu anul trecut pe aceeași etichetă, fără atribuire) și coridorul.
CREATE TABLE IF NOT EXISTS tiki_label_daily (
  zi        date NOT NULL,
  label     text NOT NULL,
  label_dir text NOT NULL,
  coridor   text NOT NULL,
  bilete    integer NOT NULL,
  lei       numeric(12,2) NOT NULL,
  is_anulare boolean NOT NULL,
  PRIMARY KEY (zi, label, label_dir)
);

-- ─── Numărarea pe picior ───
CREATE TABLE IF NOT EXISTS count_leg_daily (
  zi            date NOT NULL,
  crm_route_id  integer NOT NULL,
  leg           text NOT NULL,
  session_id    uuid NOT NULL,
  vkey          text,
  eligibil      boolean NOT NULL,
  oameni_min    integer NOT NULL,                  -- Σ creșterilor încărcării (minim: urcă+coboară la aceeași oprire nu se vede)
  om_km         numeric NOT NULL,                  -- încărcare × km tronson (aceeași bază ca leii Numărării)
  km_picior     numeric,
  tiki_bilete   integer NOT NULL DEFAULT 0,        -- biletele TIKI ale aceleiași mașini pe acest picior
  tiki_om_km_min numeric NOT NULL DEFAULT 0,
  tiki_om_km_max numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (zi, crm_route_id, leg)
);

CREATE TABLE IF NOT EXISTS leg_segment_load (
  zi            date NOT NULL,
  crm_route_id  integer NOT NULL,
  leg           text NOT NULL,
  stop_order    integer NOT NULL,
  stop_name     text NOT NULL,
  km            numeric NOT NULL,
  km_next       numeric,
  incarcare_numarata integer NOT NULL,
  tiki_min      integer NOT NULL,
  tiki_max      integer NOT NULL,
  PRIMARY KEY (zi, crm_route_id, leg, stop_order)
);

-- ─── Cozile de refacere ───
CREATE TABLE IF NOT EXISTS tiki_refresh_queue (
  luna   date PRIMARY KEY,
  motiv  text,
  pus_la timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS count_refresh_queue (
  zi           date NOT NULL,
  crm_route_id integer NOT NULL,
  pus_la       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zi, crm_route_id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tiki_stop_map','tiki_ticket_attr','tiki_label_override','tiki_route_stops','tiki_plecari_daily',
                           'tiki_leg_daily','tiki_label_daily','count_leg_daily','leg_segment_load','tiki_refresh_queue',
                           'count_refresh_queue'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;

-- ─── Opririle de referință ───
CREATE OR REPLACE FUNCTION public.tiki_rebuild_route_stops()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '120s'
AS $function$
DECLARE v_n int;
BEGIN
  DELETE FROM tiki_route_stops WHERE true;
  WITH last_s AS (
    SELECT DISTINCT ON (s.crm_route_id, e.direction) s.id, s.crm_route_id, e.direction
    FROM counting_sessions s
    JOIN crm_routes r ON r.id = s.crm_route_id AND r.route_type = 'interurban'
    JOIN counting_entries e ON e.session_id = s.id
    WHERE s.status IN ('completed', 'tur_done', 'retur_done')
    ORDER BY s.crm_route_id, e.direction, s.assignment_date DESC
  )
  INSERT INTO tiki_route_stops (crm_route_id, leg, stop_order, stop_norm, km)
  SELECT l.crm_route_id, CASE WHEN e.direction = 'tur' THEN 'nord_chisinau' ELSE 'chisinau_nord' END,
         e.stop_order, tiki_stop_norm(e.stop_name_ro), e.km_from_start
  FROM last_s l JOIN counting_entries e ON e.session_id = l.id AND e.direction = l.direction
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

-- km-ul unei stații TIKI pe ruta × piciorul dat (prin alias dacă e nevoie); NULL dacă nu e pe rută.
CREATE OR REPLACE FUNCTION public.tiki_stop_km(p_route integer, p_leg text, p_statie text)
 RETURNS numeric LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT min(rs.km) FROM tiki_route_stops rs
  WHERE rs.crm_route_id = p_route AND rs.leg = p_leg
    AND rs.stop_norm = coalesce((SELECT m.stop_norm FROM tiki_stop_map m WHERE m.statie_norm = tiki_stop_norm(p_statie)),
                                tiki_stop_norm(p_statie))
$$;

-- ─── Atribuirea unei luni (luna = luna zilei cursei) ───
CREATE OR REPLACE FUNCTION public.tiki_attr_month(p_month date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '120s'
AS $function$
DECLARE v_from date := date_trunc('month', p_month)::date;
        v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
        v_n int;
BEGIN
  DELETE FROM tiki_ticket_attr WHERE luna = v_from;

  DROP TABLE IF EXISTS _t, _c, _r;
  CREATE TEMP TABLE _t ON COMMIT DROP AS
  SELECT t.ticket_key, t.trip_id, t.price, t.is_anulare, t.direction AS label_dir,
         trim(t.route_name || ' ' || coalesce(t.route_time, '')) AS label,
         t.route_time, t.from_station, t.to_station, t.pair,
         CASE WHEN c.trip_date BETWEEN t.sale_date - 60 AND t.sale_date + 1 THEN c.trip_date ELSE t.sale_date END AS zi,
         CASE WHEN c.trip_date BETWEEN t.sale_date - 60 AND t.sale_date + 1 THEN 'cursa' ELSE 'vanzare' END AS zi_sursa,
         tiki_plate_key(coalesce(c.vehicle, t.vehicle)) AS vkey,
         CASE WHEN tiki_stop_norm(t.from_station) = 'chisinau' THEN 'chisinau_nord'
              WHEN tiki_stop_norm(t.to_station) = 'chisinau' THEN 'nord_chisinau'
              WHEN t.direction = 'tur' THEN 'chisinau_nord'
              WHEN t.direction = 'retur' THEN 'nord_chisinau' END AS leg
  FROM tiki_tickets t LEFT JOIN tiki_trips c USING (trip_id)
  WHERE t.sale_date BETWEEN v_from - 1 AND v_to + 62;
  DELETE FROM _t WHERE zi < v_from OR zi > v_to;

  -- candidații din grafic: (zi, mașină) → rută + picior + ora de plecare a piciorului
  CREATE TEMP TABLE _c ON COMMIT DROP AS
  SELECT d.assignment_date AS zi, tiki_plate_key(v.plate_number) AS vkey, d.crm_route_id, 'nord_chisinau'::text AS leg,
         tiki_min(split_part(r.time_nord, ' - ', 1)) AS t0
  FROM daily_assignments d JOIN vehicles v ON v.id = d.vehicle_id JOIN crm_routes r ON r.id = d.crm_route_id
  WHERE d.assignment_date BETWEEN v_from AND v_to AND r.route_type = 'interurban'
  UNION
  SELECT d.assignment_date, tiki_plate_key(v.plate_number), coalesce(d.retur_route_id, d.crm_route_id), 'chisinau_nord',
         tiki_min(split_part(r2.time_chisinau, ' - ', 1))
  FROM daily_assignments d JOIN vehicles v ON v.id = coalesce(d.vehicle_id_retur, d.vehicle_id)
  JOIN crm_routes r2 ON r2.id = coalesce(d.retur_route_id, d.crm_route_id)
  WHERE d.assignment_date BETWEEN v_from AND v_to AND r2.route_type = 'interurban' AND NOT coalesce(r2.retur_disabled, false)
  UNION
  -- mașina sesiunii Numărării (corectată de operator) pe ambele picioare
  SELECT s.assignment_date, tiki_plate_key(v.plate_number), s.crm_route_id, p.leg,
         tiki_min(split_part(CASE WHEN p.leg = 'nord_chisinau' THEN r.time_nord ELSE r.time_chisinau END, ' - ', 1))
  FROM counting_sessions s JOIN vehicles v ON v.id = s.vehicle_id JOIN crm_routes r ON r.id = s.crm_route_id
  CROSS JOIN (VALUES ('nord_chisinau'), ('chisinau_nord')) p(leg)
  WHERE s.assignment_date BETWEEN v_from AND v_to AND r.route_type = 'interurban';

  -- 0) corectura ADMIN pe etichetă × lună
  INSERT INTO tiki_ticket_attr (ticket_key, zi, luna, zi_sursa, trip_id, vkey, label, label_dir, leg, crm_route_id, sursa,
                                lei, is_anulare)
  SELECT t.ticket_key, t.zi, v_from, t.zi_sursa, t.trip_id, t.vkey, t.label, t.label_dir, o.leg, o.crm_route_id, 'override',
         t.price, t.is_anulare
  FROM _t t JOIN tiki_label_override o ON o.label = t.label AND o.label_dir = t.label_dir AND o.luna = v_from;

  -- 1) mașina în grafic, același picior; la două rute, cea mai apropiată oră de plecare de ora etichetei
  INSERT INTO tiki_ticket_attr (ticket_key, zi, luna, zi_sursa, trip_id, vkey, label, label_dir, leg, crm_route_id, sursa,
                                lei, is_anulare)
  SELECT DISTINCT ON (t.ticket_key) t.ticket_key, t.zi, v_from, t.zi_sursa, t.trip_id, t.vkey, t.label, t.label_dir,
         c.leg, c.crm_route_id, 'masina', t.price, t.is_anulare
  FROM _t t JOIN _c c ON c.zi = t.zi AND c.vkey = t.vkey AND c.leg = t.leg
  WHERE t.vkey <> '' AND NOT EXISTS (SELECT 1 FROM tiki_ticket_attr a WHERE a.ticket_key = t.ticket_key)
  ORDER BY t.ticket_key,
           coalesce(least(abs(c.t0 - tiki_min(t.route_time)), 1440 - abs(c.t0 - tiki_min(t.route_time))), 9999),
           c.crm_route_id;

  -- 2) regula etichetei: majoritatea biletelor legate pe mașină în aceeași lună; înainte de 04.2026 — din 04.2026 încoace
  CREATE TEMP TABLE _r ON COMMIT DROP AS
  SELECT DISTINCT ON (label, label_dir, leg) label, label_dir, leg, crm_route_id
  FROM (
    SELECT a.label, a.label_dir, a.leg, a.crm_route_id, count(*) n
    FROM tiki_ticket_attr a
    WHERE a.sursa = 'masina' AND NOT a.is_anulare
      AND CASE WHEN v_from >= DATE '2026-04-01' THEN a.luna = v_from ELSE a.luna >= DATE '2026-04-01' END
    GROUP BY 1, 2, 3, 4
  ) x ORDER BY label, label_dir, leg, n DESC, crm_route_id;

  INSERT INTO tiki_ticket_attr (ticket_key, zi, luna, zi_sursa, trip_id, vkey, label, label_dir, leg, crm_route_id, sursa,
                                lei, is_anulare)
  SELECT t.ticket_key, t.zi, v_from, t.zi_sursa, t.trip_id, t.vkey, t.label, t.label_dir, r.leg, r.crm_route_id,
         CASE WHEN v_from >= DATE '2026-04-01' THEN 'eticheta_luna' ELSE 'eticheta_2026' END, t.price, t.is_anulare
  FROM _t t JOIN _r r ON r.label = t.label AND r.label_dir = t.label_dir AND r.leg = t.leg
  WHERE NOT t.is_anulare AND NOT EXISTS (SELECT 1 FROM tiki_ticket_attr a WHERE a.ticket_key = t.ticket_key);

  -- 3) restul: Anulare (vânzări fără cursă) și nelegate
  INSERT INTO tiki_ticket_attr (ticket_key, zi, luna, zi_sursa, trip_id, vkey, label, label_dir, leg, crm_route_id, sursa,
                                lei, is_anulare)
  SELECT t.ticket_key, t.zi, v_from, t.zi_sursa, t.trip_id, t.vkey, t.label, t.label_dir, t.leg, NULL,
         CASE WHEN t.is_anulare THEN 'anulare' ELSE 'nelegat' END, t.price, t.is_anulare
  FROM _t t WHERE NOT EXISTS (SELECT 1 FROM tiki_ticket_attr a WHERE a.ticket_key = t.ticket_key);

  -- km-ii biletului pe ruta atribuită (stații reale sau perechea dedusă din preț, orientată după picior)
  UPDATE tiki_ticket_attr a
     SET km_from = tiki_stop_km(a.crm_route_id, a.leg, x.f), km_to = tiki_stop_km(a.crm_route_id, a.leg, x.d)
    FROM (
      SELECT t.ticket_key,
             coalesce(t.from_station, CASE WHEN t.leg = 'chisinau_nord' AND split_part(t.pair, ' - ', 1) ILIKE 'chisinau%'
                                            THEN split_part(t.pair, ' - ', 1) ELSE split_part(t.pair, ' - ', 2) END) AS f,
             coalesce(t.to_station, CASE WHEN t.leg = 'chisinau_nord' AND split_part(t.pair, ' - ', 1) ILIKE 'chisinau%'
                                          THEN split_part(t.pair, ' - ', 2) ELSE split_part(t.pair, ' - ', 1) END) AS d
      FROM _t t
    ) x
   WHERE a.ticket_key = x.ticket_key AND a.luna = v_from AND a.crm_route_id IS NOT NULL;

  SELECT count(*) INTO v_n FROM tiki_ticket_attr WHERE luna = v_from;
  RETURN (SELECT jsonb_object_agg(sursa, n) || jsonb_build_object('total', v_n)
          FROM (SELECT sursa, count(*) n FROM tiki_ticket_attr WHERE luna = v_from GROUP BY 1) s);
END $function$;

-- ─── Agregatele TIKI ale unei luni ───
CREATE OR REPLACE FUNCTION public.tiki_aggr_month(p_month date)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '120s'
AS $function$
DECLARE v_from date := date_trunc('month', p_month)::date;
        v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
        v_n int;
BEGIN
  DELETE FROM tiki_leg_daily WHERE zi BETWEEN v_from AND v_to;
  INSERT INTO tiki_leg_daily
  SELECT a.zi, coalesce(a.crm_route_id, 0), coalesce(a.leg, '?'), a.sursa, count(*), sum(a.lei),
         sum(CASE WHEN a.km_to > a.km_from THEN a.km_to - a.km_from ELSE 0 END),
         sum(CASE WHEN a.km_to > a.km_from THEN a.km_to - a.km_from
                  ELSE coalesce((SELECT max(km) FROM tiki_route_stops s WHERE s.crm_route_id = a.crm_route_id AND s.leg = a.leg), 0) END),
         count(*) FILTER (WHERE NOT (a.km_to > a.km_from))
  FROM tiki_ticket_attr a WHERE a.luna = v_from
  GROUP BY 1, 2, 3, 4;

  DELETE FROM tiki_label_daily WHERE zi BETWEEN v_from AND v_to;
  INSERT INTO tiki_label_daily
  SELECT a.zi, a.label, a.label_dir, tiki_coridor(a.label), count(*), sum(a.lei), bool_or(a.is_anulare)
  FROM tiki_ticket_attr a WHERE a.luna = v_from GROUP BY 1, 2, 3;

  -- plecările: din grafic din 04.04.2026 (fără rutele anulate în ziua aceea), altfel mașinile distincte cu bilete
  DELETE FROM tiki_plecari_daily WHERE zi BETWEEN v_from AND v_to;
  INSERT INTO tiki_plecari_daily (zi, crm_route_id, leg, plecari, plecari_cu_bilete, locuri, plecari_cu_locuri, km_picior, sursa)
  SELECT g.zi, g.crm_route_id, g.leg, count(DISTINCT g.vkey),
         count(DISTINCT g.vkey) FILTER (WHERE EXISTS (SELECT 1 FROM tiki_ticket_attr a WHERE a.zi = g.zi
            AND a.crm_route_id = g.crm_route_id AND a.leg = g.leg AND a.vkey = g.vkey)),
         sum(g.locuri), count(g.locuri),
         (SELECT max(km) FROM tiki_route_stops s WHERE s.crm_route_id = g.crm_route_id AND s.leg = g.leg), 'grafic'
  FROM (
    SELECT d.assignment_date zi, d.crm_route_id, 'nord_chisinau' leg, tiki_plate_key(v.plate_number) vkey,
           coalesce(v.passenger_seats, t.passenger_seats) locuri
    FROM daily_assignments d JOIN vehicles v ON v.id = d.vehicle_id JOIN crm_routes r ON r.id = d.crm_route_id
    LEFT JOIN lde_vehicle_norms n ON n.vehicle_id = v.id LEFT JOIN lde_vehicle_types t ON t.id = n.vehicle_type_id
    WHERE d.assignment_date BETWEEN greatest(v_from, DATE '2026-04-04') AND v_to AND r.route_type = 'interurban'
    UNION
    SELECT d.assignment_date, coalesce(d.retur_route_id, d.crm_route_id), 'chisinau_nord', tiki_plate_key(v.plate_number),
           coalesce(v.passenger_seats, t.passenger_seats)
    FROM daily_assignments d JOIN vehicles v ON v.id = coalesce(d.vehicle_id_retur, d.vehicle_id)
    JOIN crm_routes r ON r.id = coalesce(d.retur_route_id, d.crm_route_id)
    LEFT JOIN lde_vehicle_norms n ON n.vehicle_id = v.id LEFT JOIN lde_vehicle_types t ON t.id = n.vehicle_type_id
    WHERE d.assignment_date BETWEEN greatest(v_from, DATE '2026-04-04') AND v_to AND r.route_type = 'interurban'
      AND NOT coalesce(r.retur_disabled, false)
  ) g
  WHERE NOT EXISTS (SELECT 1 FROM route_cancellations c WHERE c.crm_route_id = g.crm_route_id AND c.ziua = g.zi)
  GROUP BY 1, 2, 3;

  INSERT INTO tiki_plecari_daily (zi, crm_route_id, leg, plecari, plecari_cu_bilete, locuri, plecari_cu_locuri, km_picior, sursa)
  SELECT a.zi, a.crm_route_id, a.leg, count(DISTINCT a.vkey), count(DISTINCT a.vkey), NULL, 0,
         (SELECT max(km) FROM tiki_route_stops s WHERE s.crm_route_id = a.crm_route_id AND s.leg = a.leg), 'bilete'
  FROM tiki_ticket_attr a
  WHERE a.luna = v_from AND a.crm_route_id IS NOT NULL AND a.leg IS NOT NULL
  GROUP BY 1, 2, 3
  ON CONFLICT (zi, crm_route_id, leg) DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

-- ─── Numărarea pe zile (interurban), cu biletele TIKI ale aceleiași mașini ───
CREATE OR REPLACE FUNCTION public.count_aggr_days(p_from date, p_to date, p_route integer DEFAULT NULL)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '120s'
AS $function$
DECLARE v_n int;
BEGIN
  DELETE FROM count_leg_daily WHERE zi BETWEEN p_from AND p_to AND (p_route IS NULL OR crm_route_id = p_route);
  DELETE FROM leg_segment_load WHERE zi BETWEEN p_from AND p_to AND (p_route IS NULL OR crm_route_id = p_route);

  DROP TABLE IF EXISTS _e;
  CREATE TEMP TABLE _e ON COMMIT DROP AS
  SELECT s.assignment_date AS zi, s.crm_route_id, s.id AS session_id, s.status,
         CASE WHEN e.direction = 'tur' THEN 'nord_chisinau' ELSE 'chisinau_nord' END AS leg,
         tiki_plate_key(v.plate_number) AS vkey,
         e.stop_order, e.stop_name_ro, e.km_from_start AS km, e.total_passengers AS inc,
         lead(e.km_from_start) OVER w AS km_next,
         greatest(e.total_passengers - coalesce(lag(e.total_passengers) OVER w, 0), 0) AS urcari
  FROM counting_sessions s
  JOIN crm_routes r ON r.id = s.crm_route_id AND r.route_type = 'interurban'
  JOIN counting_entries e ON e.session_id = s.id
  LEFT JOIN vehicles v ON v.id = s.vehicle_id
  WHERE s.assignment_date BETWEEN p_from AND p_to AND (p_route IS NULL OR s.crm_route_id = p_route)
  WINDOW w AS (PARTITION BY s.id, e.direction ORDER BY e.stop_order);

  -- mașina sesiunii lipsă → mașina din grafic
  UPDATE _e SET vkey = x.vkey FROM (
    SELECT d.assignment_date zi, d.crm_route_id, tiki_plate_key(v.plate_number) vkey
    FROM daily_assignments d JOIN vehicles v ON v.id = d.vehicle_id
    WHERE d.assignment_date BETWEEN p_from AND p_to
  ) x WHERE (_e.vkey IS NULL OR _e.vkey = '') AND x.zi = _e.zi AND x.crm_route_id = _e.crm_route_id;

  INSERT INTO count_leg_daily (zi, crm_route_id, leg, session_id, vkey, eligibil, oameni_min, om_km, km_picior)
  SELECT zi, crm_route_id, leg, session_id, max(vkey),
         CASE WHEN leg = 'nord_chisinau' THEN max(status) IN ('tur_done', 'completed')
              ELSE max(status) IN ('retur_done', 'completed') END AND count(*) >= 2,
         sum(urcari), sum(inc * coalesce(km_next - km, 0)), max(km)
  FROM _e GROUP BY zi, crm_route_id, leg, session_id
  ON CONFLICT (zi, crm_route_id, leg) DO NOTHING;

  -- biletele TIKI ale aceleiași mașini pe același picior
  UPDATE count_leg_daily c SET tiki_bilete = x.n, tiki_om_km_min = x.mn, tiki_om_km_max = x.mx FROM (
    SELECT a.zi, a.crm_route_id, a.leg, a.vkey, count(*) n,
           sum(CASE WHEN a.km_to > a.km_from THEN a.km_to - a.km_from ELSE 0 END) mn,
           sum(CASE WHEN a.km_to > a.km_from THEN a.km_to - a.km_from ELSE coalesce(cl.km_picior, 0) END) mx
    FROM tiki_ticket_attr a JOIN count_leg_daily cl
      ON cl.zi = a.zi AND cl.crm_route_id = a.crm_route_id AND cl.leg = a.leg AND cl.vkey = a.vkey
    WHERE a.zi BETWEEN p_from AND p_to AND (p_route IS NULL OR a.crm_route_id = p_route)
    GROUP BY 1, 2, 3, 4
  ) x WHERE c.zi = x.zi AND c.crm_route_id = x.crm_route_id AND c.leg = x.leg AND c.vkey = x.vkey;

  -- încărcarea pe tronson: numărată vs TIKI (biletele care acoperă tronsonul [km, km_next))
  INSERT INTO leg_segment_load
  SELECT e.zi, e.crm_route_id, e.leg, e.stop_order, e.stop_name_ro, e.km, e.km_next, e.inc,
         (SELECT count(*) FROM tiki_ticket_attr a WHERE a.zi = e.zi AND a.crm_route_id = e.crm_route_id AND a.leg = e.leg
             AND a.vkey = e.vkey AND a.km_to > a.km_from AND a.km_from <= e.km AND a.km_to > e.km),
         (SELECT count(*) FROM tiki_ticket_attr a WHERE a.zi = e.zi AND a.crm_route_id = e.crm_route_id AND a.leg = e.leg
             AND a.vkey = e.vkey AND (NOT (a.km_to > a.km_from) OR (a.km_from <= e.km AND a.km_to > e.km)))
  FROM _e e
  JOIN count_leg_daily c ON c.zi = e.zi AND c.crm_route_id = e.crm_route_id AND c.leg = e.leg AND c.session_id = e.session_id
  WHERE c.eligibil AND e.km_next IS NOT NULL
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO v_n FROM count_leg_daily WHERE zi BETWEEN p_from AND p_to;
  RETURN v_n;
END $function$;

-- ─── Cozile: triggere pe Numărare (nu blochează niciodată salvarea din GO) ───
CREATE OR REPLACE FUNCTION public.count_enqueue_session()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      INSERT INTO count_refresh_queue (zi, crm_route_id) VALUES (OLD.assignment_date, OLD.crm_route_id) ON CONFLICT DO NOTHING;
      INSERT INTO tiki_refresh_queue (luna, motiv) VALUES (date_trunc('month', OLD.assignment_date)::date, 'numarare')
        ON CONFLICT DO NOTHING;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      INSERT INTO count_refresh_queue (zi, crm_route_id) VALUES (NEW.assignment_date, NEW.crm_route_id) ON CONFLICT DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.count_enqueue_entry()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    INSERT INTO count_refresh_queue (zi, crm_route_id)
    SELECT s.assignment_date, s.crm_route_id FROM counting_sessions s
    WHERE s.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.session_id ELSE NEW.session_id END
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS count_enqueue_session ON counting_sessions;
CREATE TRIGGER count_enqueue_session AFTER INSERT OR DELETE OR UPDATE OF status, vehicle_id, crm_route_id, assignment_date
  ON counting_sessions FOR EACH ROW EXECUTE FUNCTION count_enqueue_session();
DROP TRIGGER IF EXISTS count_enqueue_entry ON counting_entries;
CREATE TRIGGER count_enqueue_entry AFTER INSERT OR DELETE OR UPDATE OF total_passengers, km_from_start, stop_order
  ON counting_entries FOR EACH ROW EXECUTE FUNCTION count_enqueue_entry();

-- ─── Un pas de refacere: o lună TIKI (atribuire + agregate) sau un lot de zile ale Numărării ───
CREATE OR REPLACE FUNCTION public.tiki_refacere_pas()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '120s'
AS $function$
DECLARE v_luna date; v_attr jsonb; v_rows int; v_zile int := 0; r record;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('tiki_refacere')) THEN
    RETURN jsonb_build_object('ocupat', true);
  END IF;

  DELETE FROM tiki_refresh_queue
   WHERE luna = (SELECT luna FROM tiki_refresh_queue ORDER BY luna DESC LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING luna INTO v_luna;
  IF v_luna IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM tiki_route_stops) OR v_luna >= date_trunc('month', current_date - 40) THEN
      PERFORM tiki_rebuild_route_stops();
    END IF;
    v_attr := tiki_attr_month(v_luna);
    v_rows := tiki_aggr_month(v_luna);
    -- Numărarea lunii are nevoie de atribuirea refăcută (biletele aceleiași mașini)
    IF v_luna >= DATE '2026-03-01' THEN
      PERFORM count_aggr_days(v_luna, (v_luna + interval '1 month - 1 day')::date);
    END IF;
    RETURN jsonb_build_object('luna', v_luna, 'atribuire', v_attr, 'plecari', v_rows,
                              'ramase', (SELECT count(*) FROM tiki_refresh_queue));
  END IF;

  FOR r IN DELETE FROM count_refresh_queue
            WHERE (zi, crm_route_id) IN (SELECT zi, crm_route_id FROM count_refresh_queue ORDER BY pus_la LIMIT 200
                                         FOR UPDATE SKIP LOCKED)
           RETURNING zi, crm_route_id LOOP
    PERFORM count_aggr_days(r.zi, r.zi, r.crm_route_id);
    v_zile := v_zile + 1;
  END LOOP;
  RETURN jsonb_build_object('numarare_zile', v_zile, 'ramase', (SELECT count(*) FROM count_refresh_queue));
END $function$;

-- Lunile de refăcut după un import: lunile zilelor de cursă ale biletelor vândute în interval.
CREATE OR REPLACE FUNCTION public.tiki_enqueue_import(p_from date, p_to date)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '120s'
AS $function$
DECLARE v_n int;
BEGIN
  INSERT INTO tiki_refresh_queue (luna, motiv)
  SELECT DISTINCT date_trunc('month', CASE WHEN c.trip_date BETWEEN t.sale_date - 60 AND t.sale_date + 1
                                            THEN c.trip_date ELSE t.sale_date END)::date, 'import'
  FROM tiki_tickets t LEFT JOIN tiki_trips c USING (trip_id)
  WHERE t.sale_date BETWEEN p_from AND p_to
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

-- ─── Funcțiile paginii ───

-- Linia de calitate: biletele pe surse în interval (ziua cursei).
CREATE OR REPLACE FUNCTION public.get_tiki_calitate(p_from date, p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'surse', coalesce((SELECT jsonb_object_agg(sursa, n) FROM (SELECT sursa, sum(bilete) n FROM tiki_leg_daily
                       WHERE zi BETWEEN p_from AND p_to GROUP BY 1) s), '{}'),
    'zi_vanzare', (SELECT count(*) FROM tiki_ticket_attr WHERE zi BETWEEN p_from AND p_to AND zi_sursa = 'vanzare'),
    'coada', (SELECT count(*) FROM tiki_refresh_queue),
    'ultima_zi', (SELECT max(zi) FROM tiki_leg_daily))
$$;

-- Orar: pe rută × picior, în interval; anul trecut pe aceleași etichete (364 de zile).
CREATE OR REPLACE FUNCTION public.get_tiki_orar(p_from date, p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
  WITH b AS (
    SELECT crm_route_id, leg, sum(bilete) bilete, sum(lei) lei, sum(om_km_min) om_km_min
    FROM tiki_leg_daily WHERE zi BETWEEN p_from AND p_to AND crm_route_id > 0 GROUP BY 1, 2
  ),
  p AS (
    SELECT crm_route_id, leg, sum(plecari) plecari, sum(plecari) - sum(plecari_cu_bilete) plecari_fara_bilete,
           sum(locuri * km_picior) FILTER (WHERE plecari_cu_locuri = plecari) loc_km,
           bool_or(sursa = 'grafic') din_grafic
    FROM tiki_plecari_daily WHERE zi BETWEEN p_from AND p_to GROUP BY 1, 2
  ),
  -- bilete pe zi a săptămânii (mediana pe zilele cu plecări)
  dz AS (
    SELECT pl.crm_route_id, pl.leg, extract(isodow FROM pl.zi)::int dow,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY coalesce(t.n, 0)::numeric / greatest(pl.plecari, 1)) med
    FROM tiki_plecari_daily pl
    LEFT JOIN (SELECT zi, crm_route_id, leg, sum(bilete) n FROM tiki_leg_daily WHERE crm_route_id > 0 GROUP BY 1, 2, 3) t
      ON t.zi = pl.zi AND t.crm_route_id = pl.crm_route_id AND t.leg = pl.leg
    WHERE pl.zi BETWEEN p_from AND p_to GROUP BY 1, 2, 3
  ),
  -- etichetele rutei în interval și anul trecut pe aceleași etichete; eticheta comună = vândută pe ≥ 2 rute
  lb AS (
    SELECT a.crm_route_id, a.leg, a.label, a.label_dir, count(*) n
    FROM tiki_ticket_attr a WHERE a.zi BETWEEN p_from AND p_to AND a.crm_route_id IS NOT NULL GROUP BY 1, 2, 3, 4
  ),
  lc AS (SELECT label, label_dir, count(DISTINCT crm_route_id) rute FROM lb GROUP BY 1, 2),
  ly AS (
    SELECT lb.crm_route_id, lb.leg, sum(d.bilete) bilete_an_trecut, bool_or(lc.rute > 1) eticheta_comuna
    FROM lb JOIN lc USING (label, label_dir)
    LEFT JOIN tiki_label_daily d ON d.label = lb.label AND d.label_dir = lb.label_dir
         AND d.zi BETWEEN p_from - 364 AND p_to - 364
    GROUP BY 1, 2
  ),
  -- seria săptămânală pe 52 de săptămâni până la p_to (an curent și anul trecut)
  w AS (
    SELECT crm_route_id, leg, date_trunc('week', zi)::date sapt, sum(bilete) n
    FROM tiki_leg_daily WHERE crm_route_id > 0 AND zi BETWEEN p_to - 364 * 2 - 6 AND p_to GROUP BY 1, 2, 3
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'route_id', r.id, 'coridor', tiki_coridor(coalesce(nullif(r.dest_to_ro, 'Chișinău'), r.dest_from_ro)),
    'nume', CASE WHEN r.dest_to_ro ILIKE 'chi%' THEN r.dest_from_ro ELSE r.dest_to_ro END,
    'time_nord', r.time_nord, 'time_chisinau', r.time_chisinau,
    'picioare', (SELECT jsonb_agg(jsonb_build_object(
        'leg', l.leg, 'bilete', coalesce(b.bilete, 0), 'lei', coalesce(b.lei, 0),
        'plecari', coalesce(p.plecari, 0), 'plecari_fara_bilete', coalesce(p.plecari_fara_bilete, 0),
        'din_grafic', coalesce(p.din_grafic, false),
        'plin_tiki', CASE WHEN p.loc_km > 0 THEN round(100 * b.om_km_min / p.loc_km, 1) END,
        'bilete_an_trecut', ly.bilete_an_trecut, 'eticheta_comuna', coalesce(ly.eticheta_comuna, false),
        'zile_sapt', (SELECT jsonb_object_agg(dow, round(med::numeric, 1)) FROM dz WHERE dz.crm_route_id = r.id AND dz.leg = l.leg),
        'saptamani', (SELECT jsonb_agg(jsonb_build_array(sapt, n) ORDER BY sapt) FROM w WHERE w.crm_route_id = r.id AND w.leg = l.leg)
      ) ORDER BY l.leg DESC)
      FROM (VALUES ('nord_chisinau'), ('chisinau_nord')) l(leg)
      LEFT JOIN b ON b.crm_route_id = r.id AND b.leg = l.leg
      LEFT JOIN p ON p.crm_route_id = r.id AND p.leg = l.leg
      LEFT JOIN ly ON ly.crm_route_id = r.id AND ly.leg = l.leg)
  ) ORDER BY r.time_nord), '[]')
  FROM crm_routes r
  WHERE r.route_type = 'interurban' AND r.active
$$;

-- Față de anul trecut: lună × coridor (din eticheta TIKI), bilete și lei; Anulare separat.
CREATE OR REPLACE FUNCTION public.get_tiki_tendinta()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'luni', coalesce((SELECT jsonb_agg(jsonb_build_object('luna', luna, 'coridor', coridor, 'bilete', bilete, 'lei', lei,
                                                          'zile', zile, 'ultima_zi', ultima) ORDER BY luna, coridor)
      FROM (SELECT to_char(zi, 'YYYY-MM') luna, CASE WHEN is_anulare THEN 'Anulare' ELSE coridor END coridor,
                   sum(bilete) bilete, sum(lei) lei, count(DISTINCT zi) zile, max(zi) ultima
            FROM tiki_label_daily GROUP BY 1, 2) x), '[]'),
    'ultima_zi', (SELECT max(zi) FROM tiki_label_daily),
    'tarif', coalesce((SELECT jsonb_agg(jsonb_build_object('luna', luna, 'pret', pret) ORDER BY luna)
      FROM (SELECT to_char(sale_date, 'YYYY-MM') luna, round(avg(modal_price)::numeric, 1) pret FROM tiki_day_index GROUP BY 1) t), '[]'))
$$;

-- Cine merge pe rută: rezumat pe rută (doar picioarele eligibile) și, pentru o rută, zilele și profilul pe tronsoane.
CREATE OR REPLACE FUNCTION public.get_tiki_clienti(p_from date, p_to date, p_route integer DEFAULT NULL)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
  SELECT jsonb_build_object(
    'rute', coalesce((SELECT jsonb_agg(y.x ORDER BY y.x->>'nume') FROM (
      SELECT jsonb_build_object(
        'route_id', r.id, 'nume', CASE WHEN r.dest_to_ro ILIKE 'chi%' THEN r.dest_from_ro ELSE r.dest_to_ro END,
        'coridor', tiki_coridor(coalesce(nullif(r.dest_to_ro, 'Chișinău'), r.dest_from_ro)),
        'picioare_numarate', count(*), 'picioare_eligibile', count(*) FILTER (WHERE c.eligibil),
        'plecari', (SELECT coalesce(sum(plecari), 0) FROM tiki_plecari_daily pl WHERE pl.crm_route_id = r.id AND pl.zi BETWEEN p_from AND p_to),
        'oameni_numarati', sum(c.oameni_min) FILTER (WHERE c.eligibil),
        'oameni_tiki', sum(c.tiki_bilete) FILTER (WHERE c.eligibil),
        'om_km_numarat', round(sum(c.om_km) FILTER (WHERE c.eligibil)),
        'om_km_tiki_min', round(sum(least(c.tiki_om_km_min, c.om_km)) FILTER (WHERE c.eligibil)),
        'om_km_tiki_max', round(sum(least(c.tiki_om_km_max, c.om_km)) FILTER (WHERE c.eligibil)),
        'neconcordante', count(*) FILTER (WHERE c.eligibil AND c.tiki_bilete > c.oameni_min)) x
      FROM count_leg_daily c JOIN crm_routes r ON r.id = c.crm_route_id
      WHERE c.zi BETWEEN p_from AND p_to GROUP BY r.id) y), '[]'),
    'zile', CASE WHEN p_route IS NOT NULL THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
        'zi', c.zi, 'leg', c.leg, 'eligibil', c.eligibil, 'oameni_numarati', c.oameni_min, 'oameni_tiki', c.tiki_bilete,
        'om_km', round(c.om_km), 'om_km_tiki_min', round(least(c.tiki_om_km_min, c.om_km)),
        'om_km_tiki_max', round(least(c.tiki_om_km_max, c.om_km))) ORDER BY c.zi, c.leg DESC)
      FROM count_leg_daily c WHERE c.crm_route_id = p_route AND c.zi BETWEEN p_from AND p_to), '[]') END,
    'tronsoane', CASE WHEN p_route IS NOT NULL THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
        'leg', leg, 'stop_order', stop_order, 'stop', stop_name, 'km', km, 'km_next', km_next,
        'numarat', numarat, 'tiki_min', tiki_min, 'tiki_max', tiki_max, 'zile', zile) ORDER BY leg DESC, stop_order)
      FROM (SELECT leg, stop_order, min(stop_name) stop_name, round(avg(km), 1) km, round(avg(km_next), 1) km_next,
                   round(avg(incarcare_numarata), 1) numarat, round(avg(tiki_min), 1) tiki_min, round(avg(tiki_max), 1) tiki_max,
                   count(*) zile
            FROM leg_segment_load WHERE crm_route_id = p_route AND zi BETWEEN p_from AND p_to GROUP BY 1, 2) s), '[]') END)
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'tiki_plate_key(text)', 'tiki_stop_norm(text)', 'tiki_min(text)', 'tiki_coridor(text)', 'tiki_stop_km(integer, text, text)',
    'tiki_rebuild_route_stops()', 'tiki_attr_month(date)', 'tiki_aggr_month(date)', 'count_aggr_days(date, date, integer)',
    'count_enqueue_session()', 'count_enqueue_entry()', 'tiki_refacere_pas()', 'tiki_enqueue_import(date, date)',
    'get_tiki_calitate(date, date)', 'get_tiki_orar(date, date)', 'get_tiki_tendinta()', 'get_tiki_clienti(date, date, integer)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

-- Însămânțarea: toată istoria în coadă (cele mai noi întâi — regulile lunii din 04.2026 se fac înaintea istoriei).
INSERT INTO tiki_refresh_queue (luna, motiv)
SELECT DISTINCT date_trunc('month', trip_date)::date, 'instalare' FROM tiki_trips WHERE trip_date >= DATE '2024-12-01'
ON CONFLICT DO NOTHING;
