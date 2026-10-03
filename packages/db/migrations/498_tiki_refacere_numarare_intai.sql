-- 498: refacerea de noapte — zilele recente ale Numărării înaintea lunilor Mobilet (ION-219).
-- Ion, 03.10: «nu apar oamenii fără bilet» → «fă tot». omisi_pereche_daily (fila Rute, «Fără bilet») și count_leg_daily se
-- refac doar în pasul 3 al lui tiki_refacere_pas, care rulează abia după ce se termină planurile tuturor lunilor Mobilet
-- din coadă. Pe 03.10 coada avea 13 luni și 6.458 de zile ale Numărării; noaptea a lucrat doar ~20 min (cronul GitHub
-- întârziat ore întregi, apoi un 504), iar zilele numărate ale ultimei săptămâni n-au ajuns în rapoarte.
-- Acum pasul 0: zilele Numărării din ultimele 45 de zile (cele mai noi întâi) trec înaintea planurilor lunare, câte
-- ~15 s pe apel. Restul funcției e neschimbat (versiunea vie, cu piata_luni_murdare din migr. 470).

CREATE OR REPLACE FUNCTION public.tiki_refacere_pas()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
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

  -- 0. Numărarea recentă (ultimele 45 de zile, cele mai noi întâi) înaintea lunilor Mobilet (ION-219)
  FOR r IN SELECT zi, crm_route_id FROM count_refresh_queue WHERE zi >= current_date - 45 ORDER BY zi DESC LIMIT 200 LOOP
    EXIT WHEN clock_timestamp() - t0 > interval '15 seconds';
    DELETE FROM count_refresh_queue WHERE zi = r.zi AND crm_route_id = r.crm_route_id;
    PERFORM count_aggr_days(r.zi, r.zi, r.crm_route_id);
    PERFORM omisi_pereche_zi(r.zi, r.crm_route_id);
    v_zile := v_zile + 1;
    INSERT INTO piata_luni_murdare (luna, motiv) VALUES (date_trunc('month', r.zi)::date, 'numarare')
    ON CONFLICT (luna) DO UPDATE SET marcata_la = now(), motiv = 'numarare';
  END LOOP;
  IF v_zile > 0 THEN
    v_ms := (extract(epoch FROM clock_timestamp() - t0) * 1000)::int;
    INSERT INTO tiki_refacere_jurnal (tip, ms, rezultat) VALUES ('numarare', v_ms, jsonb_build_object('zile', v_zile, 'recente', true));
    RETURN jsonb_build_object('numarare_zile', v_zile, 'recente', true, 'ramase', (SELECT count(*) FROM count_refresh_queue));
  END IF;

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
      INSERT INTO piata_luni_murdare (luna, motiv) VALUES (date_trunc('month', p.d_from)::date, 'tiki')
      ON CONFLICT (luna) DO UPDATE SET marcata_la = now(), motiv = 'tiki';
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
    INSERT INTO piata_luni_murdare (luna, motiv) VALUES (date_trunc('month', r.zi)::date, 'numarare')
    ON CONFLICT (luna) DO UPDATE SET marcata_la = now(), motiv = 'numarare';
  END LOOP;
  IF v_zile > 0 THEN
    v_ms := (extract(epoch FROM clock_timestamp() - t0) * 1000)::int;
    INSERT INTO tiki_refacere_jurnal (tip, ms, rezultat) VALUES ('numarare', v_ms, jsonb_build_object('zile', v_zile));
  END IF;
  DELETE FROM tiki_refacere_jurnal WHERE la < now() - interval '30 days';
  RETURN jsonb_build_object('numarare_zile', v_zile, 'ramase', (SELECT count(*) FROM count_refresh_queue));
END $function$;

REVOKE EXECUTE ON FUNCTION public.tiki_refacere_pas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiki_refacere_pas() TO service_role;
