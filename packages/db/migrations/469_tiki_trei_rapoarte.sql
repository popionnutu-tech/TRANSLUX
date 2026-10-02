-- 469 (aplicată pe 02.10 ca «466_tiki_trei_rapoarte», renumerotată: 466–468 sunt ale ION-171): Bilete aparat — trei rapoarte (ION-167): Comparație perioade, Rute, Șoferi.
-- Plan: docs/plans/2026-10-01-bilete-trei-rapoarte.md (v7, 3 runde Claude + Codex).
--
-- Totaluri zilnice precalculate în pașii de noapte (ION-166), ca paginile să nu mai citească tiki_tickets:
--   tiki_ticket_attr.pereche_* (în tiki_attr_range) și .sofer (în tiki_aggr_range, șoferul plecării mașinii biletului);
--   tiki_pereche_daily  — bilete TIKI pe zi × rută × picior × șofer × pereche (fără «Anulare»);
--   tiki_curse_sofer    — fiecare plecare (grafic, altfel sesiunea Numărării; înainte de 04.04.2026 din bilete) cu biletele ei;
--   omisi_pereche_daily — «fără bilet TIKI (numărați)» pe zi × rută × picior × pereche (după count_aggr_days).
-- RPC-uri noi (5 s): get_tiki_comparatie, get_tiki_rute, get_tiki_ruta_perechi, get_tiki_soferi_v2.
-- Cele vechi nu se ating. Migrația nu pune nimic în coadă: lunile se pun explicit și se refac noaptea.

ALTER TABLE tiki_ticket_attr
  ADD COLUMN IF NOT EXISTS pereche_cheie text,
  ADD COLUMN IF NOT EXISTS pereche_de_la text,
  ADD COLUMN IF NOT EXISTS pereche_pana_la text,
  ADD COLUMN IF NOT EXISTS pereche_sursa text,
  ADD COLUMN IF NOT EXISTS sofer text;

CREATE TABLE IF NOT EXISTS tiki_pereche_daily (
  zi date NOT NULL, crm_route_id integer NOT NULL, leg text NOT NULL, sofer text NOT NULL,
  pereche_cheie text NOT NULL, de_la text, pana_la text, pereche_sursa text NOT NULL,
  bilete integer NOT NULL, lei numeric NOT NULL
);
CREATE INDEX IF NOT EXISTS tiki_pereche_daily_zi ON tiki_pereche_daily (zi);
CREATE INDEX IF NOT EXISTS tiki_pereche_daily_ruta ON tiki_pereche_daily (crm_route_id, zi);

CREATE TABLE IF NOT EXISTS tiki_curse_sofer (
  zi date NOT NULL, crm_route_id integer NOT NULL, leg text NOT NULL, vkey text, sofer text NOT NULL,
  sursa text NOT NULL, bilete integer NOT NULL, lei numeric NOT NULL
);
CREATE INDEX IF NOT EXISTS tiki_curse_sofer_zi ON tiki_curse_sofer (zi);

CREATE TABLE IF NOT EXISTS omisi_pereche_daily (
  zi date NOT NULL, crm_route_id integer NOT NULL, leg text NOT NULL,
  pereche_cheie text NOT NULL, de_la text, pana_la text, oameni numeric NOT NULL
);
CREATE INDEX IF NOT EXISTS omisi_pereche_daily_zi ON omisi_pereche_daily (zi);
CREATE INDEX IF NOT EXISTS omisi_pereche_daily_ruta ON omisi_pereche_daily (crm_route_id, zi);

ALTER TABLE tiki_pereche_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiki_curse_sofer ENABLE ROW LEVEL SECURITY;
ALTER TABLE omisi_pereche_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE tiki_pereche_daily, tiki_curse_sofer, omisi_pereche_daily FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE tiki_pereche_daily, tiki_curse_sofer, omisi_pereche_daily TO service_role;

-- «fără bilet» pe pereche pentru o zi × rută (din tiki_ceilalti_od, scris de count_aggr_days)
CREATE OR REPLACE FUNCTION public.omisi_pereche_zi(p_zi date, p_route integer)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s'
AS $function$
DECLARE v_n int;
BEGIN
  DELETE FROM omisi_pereche_daily WHERE zi = p_zi AND crm_route_id = p_route;
  INSERT INTO omisi_pereche_daily (zi, crm_route_id, leg, pereche_cheie, de_la, pana_la, oameni)
  SELECT zi, crm_route_id, leg, k,
         min(CASE WHEN nf <= nd THEN de_la ELSE pana_la END), min(CASE WHEN nf <= nd THEN pana_la ELSE de_la END), sum(oameni)
  FROM (SELECT o.*, tiki_stop_norm(o.de_la) nf, tiki_stop_norm(o.pana_la) nd,
               least(tiki_stop_norm(o.de_la), tiki_stop_norm(o.pana_la)) || '|' || greatest(tiki_stop_norm(o.de_la), tiki_stop_norm(o.pana_la)) k
        FROM tiki_ceilalti_od o WHERE o.zi = p_zi AND o.crm_route_id = p_route) x
  GROUP BY zi, crm_route_id, leg, k;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

CREATE OR REPLACE FUNCTION public.tiki_attr_range(p_from date, p_to date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '60s'
AS $function$
DECLARE v_luna date := date_trunc('month', p_from)::date; v_n int;
BEGIN
  IF date_trunc('month', p_to)::date <> v_luna THEN
    RAISE EXCEPTION 'tiki_attr_range: % – % trece peste lună', p_from, p_to;
  END IF;

  DROP TABLE IF EXISTS _t, _c, _cd;
  -- biletele cu ziua cursei în bucată: prin cursă (tiki_trips.trip_date) sau, fără cursă validă, prin ziua vânzării
  CREATE TEMP TABLE _t ON COMMIT DROP AS
  SELECT t.ticket_key, t.trip_id, t.price, t.is_anulare, t.direction AS label_dir,
         trim(t.route_name || ' ' || coalesce(t.route_time, '')) AS label,
         t.route_time, t.from_station, t.to_station, t.pair,
         CASE WHEN c.trip_date BETWEEN t.sale_date - 60 AND t.sale_date + 1 THEN c.trip_date ELSE t.sale_date END AS zi,
         CASE WHEN c.trip_date BETWEEN t.sale_date - 60 AND t.sale_date + 1 THEN 'cursa' ELSE 'vanzare' END AS zi_sursa,
         tiki_plate_key(coalesce(c.vehicle, t.vehicle)) AS vkey,
         tiki_driver_key(coalesce(c.driver_name, t.driver_name)) AS dk,
         CASE WHEN tiki_stop_norm(t.from_station) = 'chisinau' THEN 'chisinau_nord'
              WHEN tiki_stop_norm(t.to_station) = 'chisinau' THEN 'nord_chisinau'
              WHEN t.direction = 'tur' THEN 'chisinau_nord'
              WHEN t.direction = 'retur' THEN 'nord_chisinau' END AS leg
  FROM tiki_tickets t LEFT JOIN tiki_trips c USING (trip_id)
  WHERE t.ticket_key IN (SELECT t2.ticket_key FROM tiki_trips c2 JOIN tiki_tickets t2 USING (trip_id)
                          WHERE c2.trip_date BETWEEN p_from AND p_to
                         UNION
                         SELECT t3.ticket_key FROM tiki_tickets t3 WHERE t3.sale_date BETWEEN p_from AND p_to);
  DELETE FROM _t WHERE zi < p_from OR zi > p_to;

  DELETE FROM tiki_ticket_attr WHERE zi BETWEEN p_from AND p_to;
  DELETE FROM tiki_ticket_attr a USING _t t WHERE a.ticket_key = t.ticket_key;   -- bilete mutate din altă zi

  CREATE TEMP TABLE _c ON COMMIT DROP AS
  SELECT d.assignment_date AS zi, tiki_plate_key(v.plate_number) AS vkey, d.crm_route_id, 'nord_chisinau'::text AS leg,
         tiki_min(split_part(r.time_nord, ' - ', 1)) AS t0
  FROM daily_assignments d JOIN vehicles v ON v.id = d.vehicle_id JOIN crm_routes r ON r.id = d.crm_route_id
  WHERE d.assignment_date BETWEEN p_from AND p_to AND r.route_type = 'interurban'
  UNION
  SELECT d.assignment_date, tiki_plate_key(v.plate_number), coalesce(d.retur_route_id, d.crm_route_id), 'chisinau_nord',
         tiki_min(split_part(r2.time_chisinau, ' - ', 1))
  FROM daily_assignments d JOIN vehicles v ON v.id = coalesce(d.vehicle_id_retur, d.vehicle_id)
  JOIN crm_routes r2 ON r2.id = coalesce(d.retur_route_id, d.crm_route_id)
  WHERE d.assignment_date BETWEEN p_from AND p_to AND r2.route_type = 'interurban' AND NOT coalesce(r2.retur_disabled, false)
  UNION
  SELECT s.assignment_date, tiki_plate_key(v.plate_number), s.crm_route_id, p.leg,
         tiki_min(split_part(CASE WHEN p.leg = 'nord_chisinau' THEN r.time_nord ELSE r.time_chisinau END, ' - ', 1))
  FROM counting_sessions s JOIN vehicles v ON v.id = s.vehicle_id JOIN crm_routes r ON r.id = s.crm_route_id
  CROSS JOIN (VALUES ('nord_chisinau'), ('chisinau_nord')) p(leg)
  WHERE s.assignment_date BETWEEN p_from AND p_to AND r.route_type = 'interurban';

  CREATE TEMP TABLE _cd ON COMMIT DROP AS
  SELECT d.assignment_date AS zi, tiki_driver_key(dr.full_name) AS dk, tiki_plate_key(v.plate_number) AS vkey,
         d.crm_route_id, 'nord_chisinau'::text AS leg, tiki_min(split_part(r.time_nord, ' - ', 1)) AS t0
  FROM daily_assignments d JOIN drivers dr ON dr.id = d.driver_id JOIN crm_routes r ON r.id = d.crm_route_id
  LEFT JOIN vehicles v ON v.id = d.vehicle_id
  WHERE d.assignment_date BETWEEN p_from AND p_to AND r.route_type = 'interurban'
  UNION
  SELECT d.assignment_date, tiki_driver_key(dr.full_name), tiki_plate_key(v.plate_number),
         coalesce(d.retur_route_id, d.crm_route_id), 'chisinau_nord', tiki_min(split_part(r2.time_chisinau, ' - ', 1))
  FROM daily_assignments d JOIN drivers dr ON dr.id = coalesce(d.driver_id_retur, d.driver_id)
  JOIN crm_routes r2 ON r2.id = coalesce(d.retur_route_id, d.crm_route_id)
  LEFT JOIN vehicles v ON v.id = coalesce(d.vehicle_id_retur, d.vehicle_id)
  WHERE d.assignment_date BETWEEN p_from AND p_to AND r2.route_type = 'interurban' AND NOT coalesce(r2.retur_disabled, false)
  UNION
  SELECT s.assignment_date, tiki_driver_key(dr.full_name), tiki_plate_key(v.plate_number), s.crm_route_id, p.leg,
         tiki_min(split_part(CASE WHEN p.leg = 'nord_chisinau' THEN r.time_nord ELSE r.time_chisinau END, ' - ', 1))
  FROM counting_sessions s JOIN drivers dr ON dr.id = s.driver_id JOIN crm_routes r ON r.id = s.crm_route_id
  LEFT JOIN vehicles v ON v.id = s.vehicle_id
  CROSS JOIN (VALUES ('nord_chisinau'), ('chisinau_nord')) p(leg)
  WHERE s.assignment_date BETWEEN p_from AND p_to AND r.route_type = 'interurban';

  INSERT INTO tiki_ticket_attr (ticket_key, zi, luna, zi_sursa, trip_id, vkey, label, label_dir, leg, crm_route_id, sursa,
                                lei, is_anulare)
  SELECT t.ticket_key, t.zi, v_luna, t.zi_sursa, t.trip_id, t.vkey, t.label, t.label_dir, o.leg, o.crm_route_id, 'override',
         t.price, t.is_anulare
  FROM _t t JOIN tiki_label_override o ON o.label = t.label AND o.label_dir = t.label_dir AND o.luna = v_luna;

  INSERT INTO tiki_ticket_attr (ticket_key, zi, luna, zi_sursa, trip_id, vkey, label, label_dir, leg, crm_route_id, sursa,
                                lei, is_anulare)
  SELECT DISTINCT ON (t.ticket_key) t.ticket_key, t.zi, v_luna, t.zi_sursa, t.trip_id, coalesce(nullif(c.vkey, ''), t.vkey),
         t.label, t.label_dir, c.leg, c.crm_route_id, c.src, t.price, t.is_anulare
  FROM _t t
  JOIN (SELECT zi, vkey, NULL::text[] AS dk, crm_route_id, leg, t0, 'masina'::text AS src FROM _c
        UNION ALL
        SELECT zi, vkey, dk, crm_route_id, leg, t0, 'sofer' FROM _cd) c
    ON c.zi = t.zi AND c.leg = t.leg
   AND CASE WHEN c.src = 'masina' THEN
          t.vkey <> '' AND (c.vkey = t.vkey
            OR (t.vkey ~ '^[0-9]+$' AND regexp_replace(c.vkey, '[A-Z]', '', 'g') = t.vkey
                AND (SELECT count(DISTINCT c2.vkey) FROM _c c2 WHERE c2.zi = t.zi
                       AND regexp_replace(c2.vkey, '[A-Z]', '', 'g') = t.vkey) = 1))
        ELSE cardinality(t.dk) > 0 AND cardinality(ARRAY(SELECT unnest(t.dk) INTERSECT SELECT unnest(c.dk))) >= 2
       END
  WHERE NOT EXISTS (SELECT 1 FROM tiki_ticket_attr a WHERE a.ticket_key = t.ticket_key)
  ORDER BY t.ticket_key,
           coalesce(least(abs(c.t0 - tiki_min(t.route_time)), 1440 - abs(c.t0 - tiki_min(t.route_time))), 9999),
           (c.src = 'masina') DESC, c.crm_route_id;

  -- restul: «nelegat» (eticheta se pune în pasul lunar tiki_attr_eticheta) sau «anulare»
  INSERT INTO tiki_ticket_attr (ticket_key, zi, luna, zi_sursa, trip_id, vkey, label, label_dir, leg, crm_route_id, sursa,
                                lei, is_anulare)
  SELECT t.ticket_key, t.zi, v_luna, t.zi_sursa, t.trip_id, t.vkey, t.label, t.label_dir, t.leg, NULL,
         CASE WHEN t.is_anulare THEN 'anulare' ELSE 'nelegat' END, t.price, t.is_anulare
  FROM _t t WHERE NOT EXISTS (SELECT 1 FROM tiki_ticket_attr a WHERE a.ticket_key = t.ticket_key);

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
   WHERE a.ticket_key = x.ticket_key AND a.crm_route_id IS NOT NULL;

  -- perechea (ION-167): din stații sau din perechea dedusă din preț; cheia fără sens, capetele în ordinea cheii
  UPDATE tiki_ticket_attr a
     SET pereche_sursa = y.src,
         pereche_cheie = CASE WHEN y.nf = '' OR y.nd = '' THEN 'nedeterminat' ELSE least(y.nf, y.nd) || '|' || greatest(y.nf, y.nd) END,
         pereche_de_la = CASE WHEN y.nf = '' OR y.nd = '' THEN NULL WHEN y.nf <= y.nd THEN y.f ELSE y.d END,
         pereche_pana_la = CASE WHEN y.nf = '' OR y.nd = '' THEN NULL WHEN y.nf <= y.nd THEN y.d ELSE y.f END
    FROM (
      SELECT x.ticket_key, x.f, x.d, tiki_stop_norm(x.f) nf, tiki_stop_norm(x.d) nd,
             CASE WHEN x.st THEN 'statii' WHEN x.f IS NOT NULL AND x.d IS NOT NULL THEN 'dedus' ELSE 'nedeterminat' END src
      FROM (
        SELECT t.ticket_key, (nullif(t.from_station, '') IS NOT NULL AND nullif(t.to_station, '') IS NOT NULL) st,
               nullif(coalesce(nullif(t.from_station, ''), CASE WHEN t.leg = 'chisinau_nord' AND split_part(t.pair, ' - ', 1) ILIKE 'chisinau%'
                                              THEN split_part(t.pair, ' - ', 1) ELSE split_part(t.pair, ' - ', 2) END), '') f,
               nullif(coalesce(nullif(t.to_station, ''), CASE WHEN t.leg = 'chisinau_nord' AND split_part(t.pair, ' - ', 1) ILIKE 'chisinau%'
                                            THEN split_part(t.pair, ' - ', 2) ELSE split_part(t.pair, ' - ', 1) END), '') d
        FROM _t t
      ) x
    ) y
   WHERE a.ticket_key = y.ticket_key;

  SELECT count(*) INTO v_n FROM _t;
  RETURN jsonb_build_object('bilete', v_n);
END $function$;

CREATE OR REPLACE FUNCTION public.tiki_aggr_range(p_from date, p_to date)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '60s'
AS $function$
DECLARE v_n int;
BEGIN
  DELETE FROM tiki_leg_daily WHERE zi BETWEEN p_from AND p_to;
  INSERT INTO tiki_leg_daily
  SELECT a.zi, coalesce(a.crm_route_id, 0), coalesce(a.leg, '?'), a.sursa, count(*), sum(a.lei),
         sum(CASE WHEN a.km_to > a.km_from THEN a.km_to - a.km_from ELSE 0 END),
         sum(CASE WHEN a.km_to > a.km_from THEN a.km_to - a.km_from
                  ELSE coalesce((SELECT max(km) FROM tiki_route_stops s WHERE s.crm_route_id = a.crm_route_id AND s.leg = a.leg), 0) END),
         count(*) FILTER (WHERE NOT coalesce(a.km_to > a.km_from, false))
  FROM tiki_ticket_attr a WHERE a.zi BETWEEN p_from AND p_to
  GROUP BY 1, 2, 3, 4;

  DELETE FROM tiki_label_daily WHERE zi BETWEEN p_from AND p_to;
  INSERT INTO tiki_label_daily
  SELECT a.zi, a.label, a.label_dir, tiki_coridor(a.label), count(*), sum(a.lei), bool_or(a.is_anulare)
  FROM tiki_ticket_attr a WHERE a.zi BETWEEN p_from AND p_to GROUP BY 1, 2, 3;

  DELETE FROM tiki_route_label_daily WHERE zi BETWEEN p_from AND p_to;
  INSERT INTO tiki_route_label_daily
  SELECT a.zi, a.crm_route_id, a.leg, a.label, a.label_dir, count(*)
  FROM tiki_ticket_attr a WHERE a.zi BETWEEN p_from AND p_to AND a.crm_route_id IS NOT NULL AND a.leg IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5;

  DELETE FROM tiki_plecari_daily WHERE zi BETWEEN p_from AND p_to;
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
    WHERE d.assignment_date BETWEEN greatest(p_from, DATE '2026-04-04') AND p_to AND r.route_type = 'interurban'
    UNION
    SELECT d.assignment_date, coalesce(d.retur_route_id, d.crm_route_id), 'chisinau_nord', tiki_plate_key(v.plate_number),
           coalesce(v.passenger_seats, t.passenger_seats)
    FROM daily_assignments d JOIN vehicles v ON v.id = coalesce(d.vehicle_id_retur, d.vehicle_id)
    JOIN crm_routes r ON r.id = coalesce(d.retur_route_id, d.crm_route_id)
    LEFT JOIN lde_vehicle_norms n ON n.vehicle_id = v.id LEFT JOIN lde_vehicle_types t ON t.id = n.vehicle_type_id
    WHERE d.assignment_date BETWEEN greatest(p_from, DATE '2026-04-04') AND p_to AND r.route_type = 'interurban'
      AND NOT coalesce(r.retur_disabled, false)
  ) g
  WHERE NOT EXISTS (SELECT 1 FROM route_cancellations c WHERE c.crm_route_id = g.crm_route_id AND c.ziua = g.zi)
  GROUP BY 1, 2, 3;

  INSERT INTO tiki_plecari_daily (zi, crm_route_id, leg, plecari, plecari_cu_bilete, locuri, plecari_cu_locuri, km_picior, sursa)
  SELECT a.zi, a.crm_route_id, a.leg, count(DISTINCT a.vkey), count(DISTINCT a.vkey), NULL, 0,
         (SELECT max(km) FROM tiki_route_stops s WHERE s.crm_route_id = a.crm_route_id AND s.leg = a.leg), 'bilete'
  FROM tiki_ticket_attr a
  WHERE a.zi BETWEEN p_from AND p_to AND a.crm_route_id IS NOT NULL AND a.leg IS NOT NULL
  GROUP BY 1, 2, 3
  ON CONFLICT (zi, crm_route_id, leg) DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- ION-167: plecările (o singură sursă): graficul, iar unde graficul n-are plecare pe picior — sesiunea Numărării
  DROP TABLE IF EXISTS _pl;
  CREATE TEMP TABLE _pl ON COMMIT DROP AS
  WITH g AS (
    SELECT d.assignment_date zi, d.crm_route_id, 'nord_chisinau'::text leg, tiki_plate_key(v.plate_number) vkey,
           dr.full_name sofer, 'grafic'::text sursa
    FROM daily_assignments d JOIN vehicles v ON v.id = d.vehicle_id JOIN crm_routes r ON r.id = d.crm_route_id
    LEFT JOIN drivers dr ON dr.id = d.driver_id
    WHERE d.assignment_date BETWEEN greatest(p_from, DATE '2026-04-04') AND p_to AND r.route_type = 'interurban'
    UNION
    SELECT d.assignment_date, coalesce(d.retur_route_id, d.crm_route_id), 'chisinau_nord', tiki_plate_key(v.plate_number),
           dr.full_name, 'grafic'
    FROM daily_assignments d JOIN vehicles v ON v.id = coalesce(d.vehicle_id_retur, d.vehicle_id)
    JOIN crm_routes r ON r.id = coalesce(d.retur_route_id, d.crm_route_id)
    LEFT JOIN drivers dr ON dr.id = coalesce(d.driver_id_retur, d.driver_id)
    WHERE d.assignment_date BETWEEN greatest(p_from, DATE '2026-04-04') AND p_to AND r.route_type = 'interurban'
      AND NOT coalesce(r.retur_disabled, false)
  ),
  s AS (
    SELECT s.assignment_date zi, s.crm_route_id, p.leg, tiki_plate_key(v.plate_number) vkey, dr.full_name sofer, 'numarare'::text sursa
    FROM counting_sessions s JOIN vehicles v ON v.id = s.vehicle_id JOIN crm_routes r ON r.id = s.crm_route_id
    LEFT JOIN drivers dr ON dr.id = s.driver_id
    CROSS JOIN (VALUES ('nord_chisinau'), ('chisinau_nord')) p(leg)
    WHERE s.assignment_date BETWEEN p_from AND p_to AND r.route_type = 'interurban'
  )
  SELECT DISTINCT ON (zi, crm_route_id, leg, vkey) zi, crm_route_id, leg, vkey, sofer, sursa
  FROM (SELECT * FROM g
        UNION ALL
        SELECT * FROM s WHERE NOT EXISTS (SELECT 1 FROM g WHERE g.zi = s.zi AND g.crm_route_id = s.crm_route_id AND g.leg = s.leg)) u
  WHERE NOT EXISTS (SELECT 1 FROM route_cancellations c WHERE c.crm_route_id = u.crm_route_id AND c.ziua = u.zi)
  ORDER BY zi, crm_route_id, leg, vkey, (sofer IS NULL), sursa;

  -- șoferul biletului = șoferul plecării mașinii lui; înainte de 04.04.2026 (fără grafic) — șoferul din TIKI
  UPDATE tiki_ticket_attr a SET sofer = NULL WHERE a.zi BETWEEN p_from AND p_to AND a.sofer IS NOT NULL;
  UPDATE tiki_ticket_attr a SET sofer = pl.sofer
    FROM _pl pl
   WHERE a.zi BETWEEN p_from AND p_to AND pl.zi = a.zi AND pl.crm_route_id = a.crm_route_id AND pl.leg = a.leg
     AND pl.vkey = a.vkey AND pl.sofer IS NOT NULL;
  IF p_from < DATE '2026-04-04' THEN
    UPDATE tiki_ticket_attr a SET sofer = nullif(trim(coalesce(c.driver_name, t.driver_name)), '')
      FROM tiki_tickets t LEFT JOIN tiki_trips c USING (trip_id)
     WHERE a.zi BETWEEN p_from AND least(p_to, DATE '2026-04-03') AND t.ticket_key = a.ticket_key AND a.crm_route_id IS NOT NULL;
  END IF;

  DELETE FROM tiki_pereche_daily WHERE zi BETWEEN p_from AND p_to;
  INSERT INTO tiki_pereche_daily (zi, crm_route_id, leg, sofer, pereche_cheie, de_la, pana_la, pereche_sursa, bilete, lei)
  SELECT a.zi, coalesce(a.crm_route_id, 0), coalesce(a.leg, '?'), coalesce(a.sofer, ''), coalesce(a.pereche_cheie, 'nedeterminat'),
         min(a.pereche_de_la), min(a.pereche_pana_la), coalesce(a.pereche_sursa, 'nedeterminat'), count(*), sum(a.lei)
  FROM tiki_ticket_attr a
  WHERE a.zi BETWEEN p_from AND p_to AND NOT a.is_anulare
  GROUP BY 1, 2, 3, 4, 5, 8;

  DELETE FROM tiki_curse_sofer WHERE zi BETWEEN p_from AND p_to;
  INSERT INTO tiki_curse_sofer (zi, crm_route_id, leg, vkey, sofer, sursa, bilete, lei)
  SELECT pl.zi, pl.crm_route_id, pl.leg, pl.vkey, pl.sofer, pl.sursa, count(a.ticket_key), coalesce(sum(a.lei), 0)
  FROM _pl pl
  LEFT JOIN tiki_ticket_attr a ON a.zi = pl.zi AND a.crm_route_id = pl.crm_route_id AND a.leg = pl.leg AND a.vkey = pl.vkey
                              AND NOT a.is_anulare
  WHERE pl.sofer IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5, 6;
  IF p_from < DATE '2026-04-04' THEN
    INSERT INTO tiki_curse_sofer (zi, crm_route_id, leg, vkey, sofer, sursa, bilete, lei)
    SELECT a.zi, a.crm_route_id, a.leg, a.vkey, a.sofer, 'bilete', count(*), sum(a.lei)
    FROM tiki_ticket_attr a
    WHERE a.zi BETWEEN p_from AND least(p_to, DATE '2026-04-03') AND NOT a.is_anulare
      AND a.crm_route_id IS NOT NULL AND a.leg IS NOT NULL AND a.sofer IS NOT NULL
    GROUP BY 1, 2, 3, 4, 5;
  END IF;

  RETURN v_n;
END $function$;

CREATE OR REPLACE FUNCTION public.tiki_refacere_pas()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '60s'
AS $function$
DECLARE v_luna date; v_last date; p record; r record; v_res jsonb; v_zile int := 0;
        t0 timestamptz := clock_timestamp(); v_ms int;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('tiki_refacere')) THEN
    RETURN jsonb_build_object('ocupat', true);
  END IF;

  WITH ev AS (DELETE FROM tiki_refresh_log WHERE true RETURNING luna, zi, crm_route_id),
       l AS (INSERT INTO tiki_refresh_queue (luna, motiv)
             SELECT DISTINCT luna, 'jurnal' FROM ev WHERE luna IS NOT NULL
             ON CONFLICT DO NOTHING)
  INSERT INTO count_refresh_queue (zi, crm_route_id)
  SELECT DISTINCT zi, crm_route_id FROM ev WHERE zi IS NOT NULL AND crm_route_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  -- 1. un pas din planul în curs
  DELETE FROM tiki_refacere_plan WHERE id = (SELECT min(id) FROM tiki_refacere_plan)
  RETURNING luna, tip, d_from, d_to INTO p;
  IF p.tip IS NOT NULL THEN
    IF p.tip = 'rute_opriri' THEN
      v_res := jsonb_build_object('opriri', tiki_rebuild_route_stops());
    ELSIF p.tip = 'atribuire' THEN
      v_res := tiki_attr_range(p.d_from, p.d_to);
    ELSIF p.tip = 'eticheta' THEN
      v_res := tiki_attr_eticheta(p.luna);
    ELSIF p.tip = 'eticheta_km' THEN
      v_res := jsonb_build_object('km', tiki_attr_eticheta_km(p.d_from, p.d_to));
    ELSIF p.tip = 'agregate' THEN
      v_res := jsonb_build_object('randuri', tiki_aggr_range(p.d_from, p.d_to));
    ELSIF p.tip = 'numarare_luna' THEN
      INSERT INTO count_refresh_queue (zi, crm_route_id)
      SELECT DISTINCT s.assignment_date, s.crm_route_id FROM counting_sessions s
      WHERE s.assignment_date BETWEEN p.d_from AND p.d_to
      ON CONFLICT DO NOTHING;
      v_res := jsonb_build_object('zile_puse', (SELECT count(*) FROM count_refresh_queue));
    END IF;
    v_ms := (extract(epoch FROM clock_timestamp() - t0) * 1000)::int;
    INSERT INTO tiki_refacere_jurnal (tip, luna, d_from, d_to, ms, rezultat) VALUES (p.tip, p.luna, p.d_from, p.d_to, v_ms, v_res);
    RETURN jsonb_build_object('pas', p.tip, 'luna', p.luna, 'd_from', p.d_from, 'd_to', p.d_to, 'ms', v_ms, 'rezultat', v_res,
                              'ramase', (SELECT count(*) FROM tiki_refacere_plan) + (SELECT count(*) FROM tiki_refresh_queue));
  END IF;

  -- 2. planul unei luni noi (cea mai recentă întâi)
  DELETE FROM tiki_refresh_queue
   WHERE luna = (SELECT luna FROM tiki_refresh_queue ORDER BY luna DESC LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING luna INTO v_luna;
  IF v_luna IS NOT NULL THEN
    v_last := (v_luna + interval '1 month - 1 day')::date;
    IF NOT EXISTS (SELECT 1 FROM tiki_route_stops) OR v_luna >= date_trunc('month', current_date - 40) THEN
      INSERT INTO tiki_refacere_plan (luna, tip) VALUES (v_luna, 'rute_opriri');
    END IF;
    INSERT INTO tiki_refacere_plan (luna, tip, d_from, d_to)
    SELECT v_luna, 'atribuire', v_luna + b, least(v_luna + b + 6, v_last) FROM unnest(ARRAY[0, 7, 14, 21]) b
    UNION ALL SELECT v_luna, 'atribuire', v_luna + 28, v_last WHERE v_luna + 28 <= v_last
    ORDER BY 3;
    INSERT INTO tiki_refacere_plan (luna, tip) VALUES (v_luna, 'eticheta');
    INSERT INTO tiki_refacere_plan (luna, tip, d_from, d_to)
    SELECT v_luna, 'eticheta_km', v_luna + b, least(v_luna + b + 6, v_last) FROM unnest(ARRAY[0, 7, 14, 21]) b
    UNION ALL SELECT v_luna, 'eticheta_km', v_luna + 28, v_last WHERE v_luna + 28 <= v_last
    ORDER BY 3;
    INSERT INTO tiki_refacere_plan (luna, tip, d_from, d_to)
    SELECT v_luna, 'agregate', v_luna + b, least(v_luna + b + 6, v_last) FROM unnest(ARRAY[0, 7, 14, 21]) b
    UNION ALL SELECT v_luna, 'agregate', v_luna + 28, v_last WHERE v_luna + 28 <= v_last
    ORDER BY 3;
    INSERT INTO tiki_refacere_plan (luna, tip, d_from, d_to) VALUES (v_luna, 'numarare_luna', v_luna, v_last);
    RETURN jsonb_build_object('planificat', v_luna, 'pasi', (SELECT count(*) FROM tiki_refacere_plan WHERE luna = v_luna),
                              'ramase', (SELECT count(*) FROM tiki_refacere_plan) + (SELECT count(*) FROM tiki_refresh_queue));
  END IF;

  -- 3. Numărarea: zile × rute cât încap în ~15 s
  FOR r IN SELECT zi, crm_route_id FROM count_refresh_queue ORDER BY pus_la LIMIT 200 LOOP
    EXIT WHEN clock_timestamp() - t0 > interval '15 seconds';
    DELETE FROM count_refresh_queue WHERE zi = r.zi AND crm_route_id = r.crm_route_id;
    PERFORM count_aggr_days(r.zi, r.zi, r.crm_route_id);
    PERFORM omisi_pereche_zi(r.zi, r.crm_route_id);
    v_zile := v_zile + 1;
  END LOOP;
  IF v_zile > 0 THEN
    v_ms := (extract(epoch FROM clock_timestamp() - t0) * 1000)::int;
    INSERT INTO tiki_refacere_jurnal (tip, ms, rezultat) VALUES ('numarare', v_ms, jsonb_build_object('zile', v_zile));
  END IF;
  DELETE FROM tiki_refacere_jurnal WHERE la < now() - interval '30 days';
  RETURN jsonb_build_object('numarare_zile', v_zile, 'ramase', (SELECT count(*) FROM count_refresh_queue));
END $function$;

-- RPC

-- Zilele circulate ale fiecărei rute în perioadă și dacă ziua e «complet numărată»: toate picioarele circulate după grafic
-- au picior numărat eligibil (count_leg_daily). Înainte de 04.04.2026 (fără grafic) — zilele cu bilete TIKI, nenumărate.
CREATE OR REPLACE FUNCTION public.tiki_zile_ruta(p_from date, p_to date)
 RETURNS TABLE (zi date, crm_route_id integer, complet boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH cl AS (
    SELECT p.zi, p.crm_route_id, p.leg FROM tiki_plecari_daily p
    WHERE p.zi BETWEEN p_from AND p_to AND p.sursa = 'grafic' AND p.plecari > 0
  ),
  el AS (
    SELECT DISTINCT l.zi, l.crm_route_id, l.leg FROM count_leg_daily l
    WHERE l.zi BETWEEN p_from AND p_to AND l.eligibil
  )
  SELECT cl.zi, cl.crm_route_id, bool_and(el.leg IS NOT NULL)
  FROM cl LEFT JOIN el ON el.zi = cl.zi AND el.crm_route_id = cl.crm_route_id AND el.leg = cl.leg
  GROUP BY 1, 2
  UNION ALL
  SELECT DISTINCT t.zi, t.crm_route_id, false FROM tiki_pereche_daily t
  WHERE t.zi BETWEEN p_from AND least(p_to, DATE '2026-04-03') AND t.crm_route_id <> 0
$function$;

-- Raportul «Rute»: pe fiecare rută zilele circulate / complet numărate, biletele TIKI (toate zilele), TIKI și «fără bilet»
-- pe zilele complet numărate și primele 3 perechi pe care se ține ruta (TIKI + fără bilet, zilele complet numărate).
CREATE OR REPLACE FUNCTION public.get_tiki_rute(p_from date, p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s'
AS $function$
  WITH d AS (SELECT * FROM tiki_zile_ruta(p_from, p_to)),
  st AS (SELECT crm_route_id, count(*) zc, count(*) FILTER (WHERE complet) zk FROM d GROUP BY 1),
  tk AS (SELECT crm_route_id, sum(bilete) b, sum(lei) lei FROM tiki_pereche_daily
         WHERE zi BETWEEN p_from AND p_to AND crm_route_id <> 0 GROUP BY 1),
  pk AS (
    SELECT u.crm_route_id, u.pereche_cheie, min(u.de_la) de_la, min(u.pana_la) pana_la, sum(u.b) tiki, sum(u.o) fara
    FROM (
      SELECT t.crm_route_id, t.pereche_cheie, t.de_la, t.pana_la, t.bilete::numeric b, 0::numeric o
      FROM tiki_pereche_daily t JOIN d ON d.zi = t.zi AND d.crm_route_id = t.crm_route_id AND d.complet
      WHERE t.zi BETWEEN p_from AND p_to
      UNION ALL
      SELECT o.crm_route_id, o.pereche_cheie, o.de_la, o.pana_la, 0, o.oameni
      FROM omisi_pereche_daily o JOIN d ON d.zi = o.zi AND d.crm_route_id = o.crm_route_id AND d.complet
      WHERE o.zi BETWEEN p_from AND p_to
    ) u GROUP BY 1, 2
  ),
  rk AS (SELECT crm_route_id, sum(tiki) tiki_c, sum(fara) fara_c FROM pk GROUP BY 1),
  top AS (
    SELECT crm_route_id,
           jsonb_agg(jsonb_build_object('cheie', pereche_cheie, 'de_la', de_la, 'pana_la', pana_la,
                                        'tiki', tiki, 'fara', round(fara, 1)) ORDER BY tiki + fara DESC) FILTER (WHERE rn <= 3) top
    FROM (SELECT pk.*, row_number() OVER (PARTITION BY crm_route_id ORDER BY tiki + fara DESC) rn FROM pk
          WHERE pereche_cheie <> 'nedeterminat') z
    GROUP BY 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'route', st.crm_route_id, 'de_la', r.dest_from_ro, 'pana_la', r.dest_to_ro,
    'time_nord', r.time_nord, 'time_chisinau', r.time_chisinau,
    'zile_circulate', st.zc, 'zile_numarate', st.zk,
    'tiki', coalesce(tk.b, 0), 'lei', coalesce(tk.lei, 0),
    'tiki_c', coalesce(rk.tiki_c, 0), 'fara_c', round(coalesce(rk.fara_c, 0), 1), 'top', coalesce(top.top, '[]')
  ) ORDER BY st.crm_route_id), '[]')
  FROM st JOIN crm_routes r ON r.id = st.crm_route_id
  LEFT JOIN tk ON tk.crm_route_id = st.crm_route_id
  LEFT JOIN rk ON rk.crm_route_id = st.crm_route_id
  LEFT JOIN top ON top.crm_route_id = st.crm_route_id
$function$;

-- Clic pe o rută: toate perechile ei, pe sens: TIKI pe toate zilele, TIKI și fără bilet pe zilele complet numărate.
CREATE OR REPLACE FUNCTION public.get_tiki_ruta_perechi(p_from date, p_to date, p_route integer)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s'
AS $function$
  WITH d AS (SELECT * FROM tiki_zile_ruta(p_from, p_to) WHERE crm_route_id = p_route),
  u AS (
    SELECT t.leg, t.pereche_cheie, t.de_la, t.pana_la, t.bilete::numeric tiki, 0::numeric tiki_c, 0::numeric fara
    FROM tiki_pereche_daily t WHERE t.crm_route_id = p_route AND t.zi BETWEEN p_from AND p_to
    UNION ALL
    SELECT t.leg, t.pereche_cheie, t.de_la, t.pana_la, 0, t.bilete, 0
    FROM tiki_pereche_daily t JOIN d ON d.zi = t.zi AND d.complet
    WHERE t.crm_route_id = p_route AND t.zi BETWEEN p_from AND p_to
    UNION ALL
    SELECT o.leg, o.pereche_cheie, o.de_la, o.pana_la, 0, 0, o.oameni
    FROM omisi_pereche_daily o JOIN d ON d.zi = o.zi AND d.complet
    WHERE o.crm_route_id = p_route AND o.zi BETWEEN p_from AND p_to
  )
  SELECT jsonb_build_object(
    'zile_circulate', (SELECT count(*) FROM d), 'zile_numarate', (SELECT count(*) FROM d WHERE complet),
    'perechi', coalesce((SELECT jsonb_agg(jsonb_build_object('leg', leg, 'cheie', pereche_cheie, 'de_la', de_la, 'pana_la', pana_la,
                                                            'tiki', tiki, 'tiki_c', tiki_c, 'fara', round(fara, 1))
                                          ORDER BY tiki_c + fara DESC, tiki DESC)
                         FROM (SELECT leg, pereche_cheie, min(de_la) de_la, min(pana_la) pana_la, sum(tiki) tiki, sum(tiki_c) tiki_c, sum(fara) fara
                               FROM u GROUP BY 1, 2) z), '[]'))
$function$;

-- «Comparație perioade»: pe fiecare pereche (fără sens) biletele TIKI (toate rutele) și «fără bilet» estimat pe rută
-- (fără bilet în zilele complet numărate × zile circulate / zile complet numărate), doar pe rutele cu ≥ 50 % zile complet
-- numărate în AMBELE perioade (aceeași mulțime de rute în A și B).
CREATE OR REPLACE FUNCTION public.get_tiki_comparatie(a_from date, a_to date, b_from date, b_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s'
AS $function$
  WITH da AS (SELECT * FROM tiki_zile_ruta(a_from, a_to)),
  db AS (SELECT * FROM tiki_zile_ruta(b_from, b_to)),
  sa AS (SELECT crm_route_id, count(*) zc, count(*) FILTER (WHERE complet) zk FROM da GROUP BY 1),
  sb AS (SELECT crm_route_id, count(*) zc, count(*) FILTER (WHERE complet) zk FROM db GROUP BY 1),
  inc AS (SELECT sa.crm_route_id, sa.zc zca, sa.zk zka, sb.zc zcb, sb.zk zkb FROM sa JOIN sb USING (crm_route_id)
          WHERE sa.zk > 0 AND sb.zk > 0 AND sa.zk::numeric / sa.zc >= 0.5 AND sb.zk::numeric / sb.zc >= 0.5),
  ta AS (SELECT pereche_cheie, min(de_la) de_la, min(pana_la) pana_la, sum(bilete) b FROM tiki_pereche_daily
         WHERE zi BETWEEN a_from AND a_to GROUP BY 1),
  tb AS (SELECT pereche_cheie, min(de_la) de_la, min(pana_la) pana_la, sum(bilete) b FROM tiki_pereche_daily
         WHERE zi BETWEEN b_from AND b_to GROUP BY 1),
  fa AS (SELECT o.pereche_cheie, min(o.de_la) de_la, min(o.pana_la) pana_la, sum(o.oameni * i.zca / i.zka) f
         FROM omisi_pereche_daily o JOIN da ON da.zi = o.zi AND da.crm_route_id = o.crm_route_id AND da.complet
         JOIN inc i ON i.crm_route_id = o.crm_route_id WHERE o.zi BETWEEN a_from AND a_to GROUP BY 1),
  fb AS (SELECT o.pereche_cheie, min(o.de_la) de_la, min(o.pana_la) pana_la, sum(o.oameni * i.zcb / i.zkb) f
         FROM omisi_pereche_daily o JOIN db ON db.zi = o.zi AND db.crm_route_id = o.crm_route_id AND db.complet
         JOIN inc i ON i.crm_route_id = o.crm_route_id WHERE o.zi BETWEEN b_from AND b_to GROUP BY 1),
  k AS (SELECT pereche_cheie FROM ta UNION SELECT pereche_cheie FROM tb UNION SELECT pereche_cheie FROM fa UNION SELECT pereche_cheie FROM fb)
  SELECT jsonb_build_object(
    'zile_a', a_to - a_from + 1, 'zile_b', b_to - b_from + 1,
    'numarare_a', EXISTS (SELECT 1 FROM da WHERE complet), 'numarare_b', EXISTS (SELECT 1 FROM db WHERE complet),
    'rute_circulate', (SELECT count(*) FROM (SELECT crm_route_id FROM sa UNION SELECT crm_route_id FROM sb) x),
    'rute_incluse', (SELECT count(*) FROM inc),
    'rute_excluse', coalesce((SELECT jsonb_agg(jsonb_build_object('route', x.crm_route_id, 'de_la', r.dest_from_ro,
                                                                'acop_a', x.pa, 'acop_b', x.pb) ORDER BY x.crm_route_id)
                              FROM (SELECT coalesce(sa.crm_route_id, sb.crm_route_id) crm_route_id,
                                           round(100.0 * sa.zk / nullif(sa.zc, 0)) pa, round(100.0 * sb.zk / nullif(sb.zc, 0)) pb
                                    FROM sa FULL JOIN sb USING (crm_route_id)
                                    WHERE coalesce(sa.crm_route_id, sb.crm_route_id) NOT IN (SELECT crm_route_id FROM inc)) x
                              JOIN crm_routes r ON r.id = x.crm_route_id), '[]'),
    'perechi', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'cheie', k.pereche_cheie,
        'de_la', coalesce(ta.de_la, tb.de_la, fa.de_la, fb.de_la), 'pana_la', coalesce(ta.pana_la, tb.pana_la, fa.pana_la, fb.pana_la),
        'tiki_a', coalesce(ta.b, 0), 'tiki_b', coalesce(tb.b, 0),
        'fara_a', round(coalesce(fa.f, 0), 1), 'fara_b', round(coalesce(fb.f, 0), 1)))
      FROM k LEFT JOIN ta USING (pereche_cheie) LEFT JOIN tb USING (pereche_cheie)
             LEFT JOIN fa USING (pereche_cheie) LEFT JOIN fb USING (pereche_cheie)), '[]'))
$function$;

-- «Șoferi»: fiecare plecare a șoferului față de colegii de pe aceeași rută × sens (fără el), cu indicele zilei săptămânii
-- (bilete pe plecare în ziua z / media, ultimele 90 de zile, toți șoferii; 1 sub 3 plecări). Baza colegilor e normalizată:
-- Σ biletele lor / Σ indicii zilelor lor; așteptarea unei plecări = baza × indicele zilei ei. Comparabilă doar cu ≥ 5
-- plecări ale colegilor pe rută × sens; diferența = Σ (bilete − așteptare) pe plecările comparabile.
CREATE OR REPLACE FUNCTION public.get_tiki_soferi_v2(p_from date, p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s'
AS $function$
  WITH w AS (SELECT * FROM tiki_curse_sofer WHERE zi BETWEEN p_to - 89 AND p_to),
  ib AS (SELECT crm_route_id, leg, sum(bilete)::numeric / count(*) bpc FROM w GROUP BY 1, 2),
  iz AS (SELECT crm_route_id, leg, extract(isodow FROM zi)::int dw, sum(bilete)::numeric / count(*) bpc, count(*) n
         FROM w GROUP BY 1, 2, 3),
  c AS (
    SELECT cs.*, CASE WHEN iz.n >= 3 AND ib.bpc > 0 THEN iz.bpc / ib.bpc ELSE 1 END ix
    FROM tiki_curse_sofer cs
    LEFT JOIN ib ON ib.crm_route_id = cs.crm_route_id AND ib.leg = cs.leg
    LEFT JOIN iz ON iz.crm_route_id = cs.crm_route_id AND iz.leg = cs.leg AND iz.dw = extract(isodow FROM cs.zi)::int
    WHERE cs.zi BETWEEN p_from AND p_to
  ),
  rl AS (SELECT crm_route_id, leg, sum(bilete) tb, sum(ix) ti, count(*) tn FROM c GROUP BY 1, 2),
  dr AS (SELECT sofer, crm_route_id, leg, sum(bilete) ob, sum(ix) oi, count(*) n FROM c GROUP BY 1, 2, 3),
  cmp AS (
    SELECT dr.*, CASE WHEN rl.tn - dr.n >= 5 AND rl.ti - dr.oi > 0 THEN (rl.tb - dr.ob) / (rl.ti - dr.oi) END base
    FROM dr JOIN rl USING (crm_route_id, leg)
  ),
  per AS (
    SELECT sofer, sum(n) curse, sum(ob) bilete,
           coalesce(sum(n) FILTER (WHERE base IS NOT NULL), 0) curse_comp,
           coalesce(sum(ob) FILTER (WHERE base IS NOT NULL), 0) bilete_comp,
           coalesce(sum(base * oi) FILTER (WHERE base IS NOT NULL), 0) asteptat
    FROM cmp GROUP BY 1
  ),
  zl AS (SELECT sofer, count(DISTINCT zi) zile, sum(lei) lei FROM c GROUP BY 1),
  rp AS (
    SELECT DISTINCT ON (sofer) sofer, crm_route_id FROM (SELECT sofer, crm_route_id, count(*) n FROM c GROUP BY 1, 2) x
    ORDER BY sofer, n DESC, crm_route_id
  )
  SELECT jsonb_build_object(
    'soferi', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'sofer', per.sofer, 'zile', zl.zile, 'curse', per.curse, 'bilete', per.bilete, 'lei', zl.lei,
        'curse_comp', per.curse_comp, 'bilete_comp', per.bilete_comp, 'asteptat', round(per.asteptat, 1),
        'ruta', rp.crm_route_id, 'ruta_de_la', r.dest_from_ro, 'ruta_ora', r.time_nord) ORDER BY per.bilete_comp - per.asteptat)
      FROM per JOIN zl USING (sofer) JOIN rp USING (sofer) LEFT JOIN crm_routes r ON r.id = rp.crm_route_id), '[]'),
    'bilete_fara_sofer', (SELECT coalesce(sum(bilete), 0) FROM tiki_pereche_daily
                          WHERE zi BETWEEN p_from AND p_to AND sofer = '' AND crm_route_id <> 0),
    'bilete_fara_ruta', (SELECT coalesce(sum(bilete), 0) FROM tiki_pereche_daily
                         WHERE zi BETWEEN p_from AND p_to AND crm_route_id = 0),
    'bilete_total', (SELECT coalesce(sum(bilete), 0) FROM tiki_pereche_daily WHERE zi BETWEEN p_from AND p_to))
$function$;

REVOKE EXECUTE ON FUNCTION public.tiki_attr_range(date, date), public.tiki_aggr_range(date, date), public.tiki_refacere_pas(),
  public.omisi_pereche_zi(date, integer), public.tiki_zile_ruta(date, date), public.get_tiki_rute(date, date),
  public.get_tiki_ruta_perechi(date, date, integer), public.get_tiki_comparatie(date, date, date, date),
  public.get_tiki_soferi_v2(date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiki_attr_range(date, date), public.tiki_aggr_range(date, date), public.tiki_refacere_pas(),
  public.omisi_pereche_zi(date, integer), public.tiki_zile_ruta(date, date), public.get_tiki_rute(date, date),
  public.get_tiki_ruta_perechi(date, date, integer), public.get_tiki_comparatie(date, date, date, date),
  public.get_tiki_soferi_v2(date, date)
  TO service_role;
