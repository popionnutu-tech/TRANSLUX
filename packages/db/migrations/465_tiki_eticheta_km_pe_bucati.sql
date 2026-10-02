-- 465: pasul «eticheta» pe lunile dinainte de 04.2026 dura 36 s (11.2025: 24.014 bilete pe etichetă, km pe stații ~9 s pe
-- săptămână). Km-ii biletelor puse pe etichetă se calculează acum în pași separați pe bucăți de ~7 zile («eticheta_km»).
-- tiki_attr_eticheta face doar regulile și sursa (~3–5 s). Numărarea: până la 200 de zile × rute pe pas (60 luau ~2 s), tot cu plafonul de 15 s.

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

  RETURN (SELECT jsonb_object_agg(sursa, n) || jsonb_build_object('eticheta_puse', v_n)
          FROM (SELECT sursa, count(*) n FROM tiki_ticket_attr WHERE luna = v_from GROUP BY 1) s);
END $function$;

CREATE OR REPLACE FUNCTION public.tiki_attr_eticheta_km(p_from date, p_to date)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '60s'
AS $function$
DECLARE v_n int;
BEGIN
  UPDATE tiki_ticket_attr a
     SET km_from = tiki_stop_km(a.crm_route_id, a.leg, x.f), km_to = tiki_stop_km(a.crm_route_id, a.leg, x.d)
    FROM (
      SELECT t.ticket_key,
             coalesce(t.from_station, CASE WHEN b.leg = 'chisinau_nord' AND split_part(t.pair, ' - ', 1) ILIKE 'chisinau%'
                                            THEN split_part(t.pair, ' - ', 1) ELSE split_part(t.pair, ' - ', 2) END) AS f,
             coalesce(t.to_station, CASE WHEN b.leg = 'chisinau_nord' AND split_part(t.pair, ' - ', 1) ILIKE 'chisinau%'
                                          THEN split_part(t.pair, ' - ', 2) ELSE split_part(t.pair, ' - ', 1) END) AS d
      FROM tiki_ticket_attr b JOIN tiki_tickets t ON t.ticket_key = b.ticket_key
      WHERE b.zi BETWEEN p_from AND p_to AND b.sursa LIKE 'eticheta%'
    ) x
   WHERE a.ticket_key = x.ticket_key;
  GET DIAGNOSTICS v_n = ROW_COUNT;
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
    v_zile := v_zile + 1;
  END LOOP;
  IF v_zile > 0 THEN
    v_ms := (extract(epoch FROM clock_timestamp() - t0) * 1000)::int;
    INSERT INTO tiki_refacere_jurnal (tip, ms, rezultat) VALUES ('numarare', v_ms, jsonb_build_object('zile', v_zile));
  END IF;
  DELETE FROM tiki_refacere_jurnal WHERE la < now() - interval '30 days';
  RETURN jsonb_build_object('numarare_zile', v_zile, 'ramase', (SELECT count(*) FROM count_refresh_queue));
END $function$;

REVOKE EXECUTE ON FUNCTION public.tiki_refacere_pas(), public.tiki_attr_eticheta(date), public.tiki_attr_eticheta_km(date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiki_refacere_pas(), public.tiki_attr_eticheta(date), public.tiki_attr_eticheta_km(date, date)
  TO service_role;
