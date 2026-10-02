-- 463: Bilete aparat — refacerea în pași mici, doar noaptea (ION-166, 01.10).
--
-- 01.10.2026 19:33–20:20 baza (instanța NANO, 0,5 GB) a încremenit după o zi cu 145 de pași tiki_refacere_pas × 17–87 s.
-- Pasul lunar (atribuire + agregate pe o lună întreagă într-o tranzacție) se împarte acum într-un plan de pași mici:
--   rute_opriri → atribuire pe bucăți de ~7 zile (×4) → atribuire pe etichetă pe lună → agregate pe bucăți (×4) → Numărarea
--   lunii pusă în coadă; Numărarea se reface cât încape în ~15 s pe pas.
-- Fiecare apel tiki_refacere_pas face UN singur pas din plan și îl scrie în tiki_refacere_jurnal (durata).
-- Fereastra de noapte e în ruta /api/cron/tiki-refacere (23:00–05:00 Chișinău, altfel doar cu ?force=1).
-- Rezultatul e același ca la tiki_attr_month / tiki_aggr_month (rămân în bază pentru comparație, nu se mai cheamă).

CREATE TABLE IF NOT EXISTS tiki_refacere_plan (
  id      bigserial PRIMARY KEY,
  luna    date NOT NULL,
  tip     text NOT NULL,          -- rute_opriri | atribuire | eticheta | agregate | numarare_luna
  d_from  date,
  d_to    date
);
CREATE TABLE IF NOT EXISTS tiki_refacere_jurnal (
  id      bigserial PRIMARY KEY,
  la      timestamptz NOT NULL DEFAULT clock_timestamp(),
  tip     text NOT NULL,
  luna    date,
  d_from  date,
  d_to    date,
  ms      integer NOT NULL,
  rezultat jsonb
);
ALTER TABLE tiki_refacere_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiki_refacere_jurnal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE tiki_refacere_plan, tiki_refacere_jurnal FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE tiki_refacere_plan, tiki_refacere_jurnal TO service_role;
REVOKE ALL ON SEQUENCE tiki_refacere_plan_id_seq, tiki_refacere_jurnal_id_seq FROM PUBLIC, anon, authenticated;

-- ── Atribuirea pe o bucată de zile (din aceeași lună): override → mașină / șofer; restul «nelegat» / «anulare» ──────────
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

  SELECT count(*) INTO v_n FROM _t;
  RETURN jsonb_build_object('bilete', v_n);
END $function$;

-- ── Atribuirea pe etichetă pentru biletele «nelegat» ale lunii (regulile lunii; înainte de 04.2026, regulile din 2026) ──
CREATE OR REPLACE FUNCTION public.tiki_attr_eticheta(p_month date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '60s'
AS $function$
DECLARE v_from date := date_trunc('month', p_month)::date; v_n int;
BEGIN
  DROP TABLE IF EXISTS _r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
  SELECT DISTINCT ON (label, label_dir, leg) label, label_dir, leg, crm_route_id
  FROM (
    SELECT a.label, a.label_dir, a.leg, a.crm_route_id, count(*) n
    FROM tiki_ticket_attr a
    WHERE a.sursa IN ('masina', 'sofer') AND NOT a.is_anulare
      AND CASE WHEN v_from >= DATE '2026-04-01' THEN a.luna = v_from ELSE a.luna >= DATE '2026-04-01' END
    GROUP BY 1, 2, 3, 4
  ) x ORDER BY label, label_dir, leg, n DESC, crm_route_id;

  UPDATE tiki_ticket_attr a
     SET crm_route_id = r.crm_route_id,
         sursa = CASE WHEN v_from >= DATE '2026-04-01' THEN 'eticheta_luna' ELSE 'eticheta_2026' END
    FROM _r r
   WHERE a.luna = v_from AND a.sursa = 'nelegat'
     AND r.label = a.label AND r.label_dir = a.label_dir AND r.leg = a.leg;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE tiki_ticket_attr a
     SET km_from = tiki_stop_km(a.crm_route_id, a.leg, x.f), km_to = tiki_stop_km(a.crm_route_id, a.leg, x.d)
    FROM (
      SELECT t.ticket_key,
             coalesce(t.from_station, CASE WHEN b.leg = 'chisinau_nord' AND split_part(t.pair, ' - ', 1) ILIKE 'chisinau%'
                                            THEN split_part(t.pair, ' - ', 1) ELSE split_part(t.pair, ' - ', 2) END) AS f,
             coalesce(t.to_station, CASE WHEN b.leg = 'chisinau_nord' AND split_part(t.pair, ' - ', 1) ILIKE 'chisinau%'
                                          THEN split_part(t.pair, ' - ', 2) ELSE split_part(t.pair, ' - ', 1) END) AS d
      FROM tiki_ticket_attr b JOIN tiki_tickets t ON t.ticket_key = b.ticket_key
      WHERE b.luna = v_from AND b.sursa LIKE 'eticheta%'
    ) x
   WHERE a.ticket_key = x.ticket_key;

  RETURN (SELECT jsonb_object_agg(sursa, n) || jsonb_build_object('eticheta_puse', v_n)
          FROM (SELECT sursa, count(*) n FROM tiki_ticket_attr WHERE luna = v_from GROUP BY 1) s);
END $function$;

-- ── Agregatele zilnice pe o bucată de zile (aceleași formule ca tiki_aggr_month, pe ziua biletului) ─────────────────────
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
  RETURN v_n;
END $function$;

-- ── Un pas: jurnal → cozi; apoi un pas din plan, sau planul unei luni noi, sau Numărarea (~15 s) ─────────────────────────
CREATE OR REPLACE FUNCTION public.tiki_refacere_pas()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '60s'
AS $function$
DECLARE v_luna date; v_last date; p record; r record; v_res jsonb; v_zile int := 0;
        t0 timestamptz := clock_timestamp(); v_ms int;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('tiki_refacere')) THEN
    RETURN jsonb_build_object('ocupat', true);
  END IF;

  WITH ev AS (DELETE FROM tiki_refresh_log RETURNING luna, zi, crm_route_id),
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
    SELECT v_luna, 'agregate', v_luna + b, least(v_luna + b + 6, v_last) FROM unnest(ARRAY[0, 7, 14, 21]) b
    UNION ALL SELECT v_luna, 'agregate', v_luna + 28, v_last WHERE v_luna + 28 <= v_last
    ORDER BY 3;
    INSERT INTO tiki_refacere_plan (luna, tip, d_from, d_to) VALUES (v_luna, 'numarare_luna', v_luna, v_last);
    RETURN jsonb_build_object('planificat', v_luna, 'pasi', (SELECT count(*) FROM tiki_refacere_plan WHERE luna = v_luna),
                              'ramase', (SELECT count(*) FROM tiki_refacere_plan) + (SELECT count(*) FROM tiki_refresh_queue));
  END IF;

  -- 3. Numărarea: zile × rute cât încap în ~15 s
  FOR r IN SELECT zi, crm_route_id FROM count_refresh_queue ORDER BY pus_la LIMIT 60 LOOP
    EXIT WHEN clock_timestamp() - t0 > interval '15 seconds';
    DELETE FROM count_refresh_queue WHERE zi = r.zi AND crm_route_id = r.crm_route_id;
    PERFORM count_aggr_days(r.zi, r.zi, r.crm_route_id);
    v_zile := v_zile + 1;
  END LOOP;
  IF v_zile > 0 THEN
    v_ms := (extract(epoch FROM clock_timestamp() - t0) * 1000)::int;
    INSERT INTO tiki_refacere_jurnal (tip, ms, rezultat) VALUES ('numarare', v_ms, jsonb_build_object('zile', v_zile));
  END IF;
  DELETE FROM tiki_refacere_jurnal WHERE la < now() - interval '30 days';
  RETURN jsonb_build_object('numarare_zile', v_zile, 'ramase', (SELECT count(*) FROM count_refresh_queue));
END $function$;

-- ── Starea refacerii, pentru pagina Bilete aparat ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_tiki_refacere_stare()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s'
AS $function$
  SELECT jsonb_build_object(
    'luni_in_asteptare', coalesce((SELECT jsonb_agg(DISTINCT luna ORDER BY luna) FROM (
        SELECT luna FROM tiki_refresh_queue UNION SELECT luna FROM tiki_refacere_plan
        UNION SELECT luna FROM tiki_refresh_log WHERE luna IS NOT NULL) x), '[]'),
    'zile_numarare', (SELECT count(*) FROM count_refresh_queue)
                     + (SELECT count(*) FROM tiki_refresh_log WHERE luna IS NULL),
    'ultimul_pas', (SELECT jsonb_build_object('la', la, 'tip', tip, 'luna', luna, 'ms', ms)
                    FROM tiki_refacere_jurnal ORDER BY id DESC LIMIT 1),
    'pas_maxim_ms_24h', (SELECT max(ms) FROM tiki_refacere_jurnal WHERE la > now() - interval '24 hours')
  )
$function$;

REVOKE EXECUTE ON FUNCTION public.tiki_attr_range(date, date), public.tiki_attr_eticheta(date),
  public.tiki_aggr_range(date, date), public.tiki_refacere_pas(), public.get_tiki_refacere_stare()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiki_attr_range(date, date), public.tiki_attr_eticheta(date),
  public.tiki_aggr_range(date, date), public.tiki_refacere_pas(), public.get_tiki_refacere_stare() TO service_role;
