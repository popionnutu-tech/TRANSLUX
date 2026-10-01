-- 458: Bilete aparat — «Cine merge pe rută» simplificat: de unde până unde merg clienții TIKI și ceilalți (ION-159, 01.10).
-- Ion: «asta tot e complicat și nu chiar ce trebuie; noi avem din tiki toți clienții de unde și până unde, acum
-- numărare − tiki ne dă nouă matematic restul clienților de unde și până unde pleacă ei».
-- Pe fiecare picior eligibil: încărcarea celorlalți pe tronson = numărat − TIKI (mijlocul intervalului TIKI);
-- unde crește, urcă ceilalți la oprirea aceea; unde scade, coboară — împărțiți între cei din autobuz proporțional cu
-- oprirea unde au urcat; la capăt coboară toți. Rezultatul: tiki_ceilalti_od (zi, rută, picior, de la, până la, oameni).

CREATE TABLE IF NOT EXISTS tiki_ceilalti_od (
  zi            date NOT NULL,
  crm_route_id  integer NOT NULL,
  leg           text NOT NULL,
  de_la_ord     integer NOT NULL,
  pana_la_ord   integer NOT NULL,
  de_la         text NOT NULL,
  pana_la       text NOT NULL,
  oameni        numeric NOT NULL,
  PRIMARY KEY (zi, crm_route_id, leg, de_la_ord, pana_la_ord)
);
ALTER TABLE tiki_ceilalti_od ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE tiki_ceilalti_od FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE tiki_ceilalti_od TO service_role;

CREATE OR REPLACE FUNCTION public.count_aggr_days(p_from date, p_to date, p_route integer DEFAULT NULL)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '120s'
AS $function$
DECLARE v_n int; rg record; rs record;
        v_on numeric[]; v_name text[]; v_k int; v_r numeric; v_prev numeric; v_d numeric; v_tot numeric; v_x numeric;
BEGIN
  DELETE FROM count_leg_daily WHERE zi BETWEEN p_from AND p_to AND (p_route IS NULL OR crm_route_id = p_route);
  DELETE FROM leg_segment_load WHERE zi BETWEEN p_from AND p_to AND (p_route IS NULL OR crm_route_id = p_route);
  DELETE FROM tiki_ceilalti_od WHERE zi BETWEEN p_from AND p_to AND (p_route IS NULL OR crm_route_id = p_route);

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

  INSERT INTO count_leg_daily (zi, crm_route_id, leg, session_id, vkey, eligibil, oameni_min, om_km, km_picior)
  SELECT zi, crm_route_id, leg, session_id, max(vkey),
         CASE WHEN leg = 'nord_chisinau' THEN max(status) IN ('tur_done', 'completed')
              ELSE max(status) IN ('retur_done', 'completed') END AND count(*) >= 2,
         sum(urcari), sum(inc * coalesce(km_next - km, 0)), max(km)
  FROM _e GROUP BY zi, crm_route_id, leg, session_id
  ON CONFLICT (zi, crm_route_id, leg) DO NOTHING;

  UPDATE count_leg_daily c SET tiki_bilete = x.n, tiki_om_km_min = x.mn, tiki_om_km_max = x.mx FROM (
    SELECT a.zi, a.crm_route_id, a.leg, count(*) n,
           sum(CASE WHEN a.km_to > a.km_from THEN a.km_to - a.km_from ELSE 0 END) mn,
           sum(CASE WHEN a.km_to > a.km_from THEN a.km_to - a.km_from ELSE 0 END)
             + count(*) FILTER (WHERE NOT coalesce(a.km_to > a.km_from, false)) * coalesce(max(cl.km_picior), 0) mx
    FROM tiki_ticket_attr a JOIN count_leg_daily cl
      ON cl.zi = a.zi AND cl.crm_route_id = a.crm_route_id AND cl.leg = a.leg
    WHERE a.zi BETWEEN p_from AND p_to AND (p_route IS NULL OR a.crm_route_id = p_route)
    GROUP BY 1, 2, 3
  ) x WHERE c.zi = x.zi AND c.crm_route_id = x.crm_route_id AND c.leg = x.leg;

  -- fără niciun bilet TIKI atribuit pe picior în ziua aceea: «necunoscut», nu «ceilalți»
  UPDATE count_leg_daily SET eligibil = false
   WHERE zi BETWEEN p_from AND p_to AND (p_route IS NULL OR crm_route_id = p_route) AND tiki_bilete = 0;

  INSERT INTO leg_segment_load
  SELECT e.zi, e.crm_route_id, e.leg, e.stop_order, e.stop_name_ro, e.km, e.km_next, e.inc,
         (SELECT count(*) FROM tiki_ticket_attr a WHERE a.zi = e.zi AND a.crm_route_id = e.crm_route_id AND a.leg = e.leg
             AND a.km_to > a.km_from AND a.km_from <= e.km AND a.km_to > e.km),
         (SELECT count(*) FROM tiki_ticket_attr a WHERE a.zi = e.zi AND a.crm_route_id = e.crm_route_id AND a.leg = e.leg
             AND (NOT coalesce(a.km_to > a.km_from, false) OR (a.km_from <= e.km AND a.km_to > e.km)))
  FROM _e e
  JOIN count_leg_daily c ON c.zi = e.zi AND c.crm_route_id = e.crm_route_id AND c.leg = e.leg AND c.session_id = e.session_id
  WHERE c.eligibil AND e.km_next IS NOT NULL
  ON CONFLICT DO NOTHING;

  -- Ceilalți de unde până unde (Ion, 01.10: «noi avem din tiki toți clienții de unde și până unde; acum numărare − tiki
  -- ne dă nouă matematic restul clienților de unde și până unde pleacă ei»). Pe fiecare picior eligibil: încărcarea
  -- celorlalți pe tronson = numărat − TIKI; unde crește, urcă ceilalți; unde scade, coboară — împărțiți între cei din
  -- autobuz proporțional cu unde au urcat; la capăt coboară toți.
  FOR rg IN SELECT c.zi, c.crm_route_id, c.leg, c.session_id FROM count_leg_daily c
           WHERE c.zi BETWEEN p_from AND p_to AND (p_route IS NULL OR c.crm_route_id = p_route) AND c.eligibil LOOP
    v_on := '{}'; v_name := '{}'; v_k := 0; v_prev := 0;
    FOR rs IN SELECT e.stop_order, e.stop_name_ro,
                    greatest(coalesce(l.incarcare_numarata, 0) - round((coalesce(l.tiki_min, 0) + coalesce(l.tiki_max, 0)) / 2.0), 0) AS r
             FROM _e e LEFT JOIN leg_segment_load l
               ON l.zi = e.zi AND l.crm_route_id = e.crm_route_id AND l.leg = e.leg AND l.stop_order = e.stop_order
             WHERE e.session_id = rg.session_id AND e.leg = rg.leg ORDER BY e.stop_order LOOP
      v_k := v_k + 1;
      v_name := v_name || rs.stop_name_ro;
      v_on := v_on || 0::numeric;
      v_r := rs.r;
      v_d := v_r - v_prev;
      IF v_d < 0 THEN
        v_tot := 0;
        FOR o IN 1 .. v_k - 1 LOOP v_tot := v_tot + v_on[o]; END LOOP;
        IF v_tot > 0 THEN
          FOR o IN 1 .. v_k - 1 LOOP
            IF v_on[o] > 0 THEN
              v_x := v_on[o] * least(-v_d, v_tot) / v_tot;
              INSERT INTO tiki_ceilalti_od VALUES (rg.zi, rg.crm_route_id, rg.leg, o, v_k, v_name[o], rs.stop_name_ro, v_x)
                ON CONFLICT (zi, crm_route_id, leg, de_la_ord, pana_la_ord) DO UPDATE SET oameni = tiki_ceilalti_od.oameni + EXCLUDED.oameni;
              v_on[o] := v_on[o] - v_x;
            END IF;
          END LOOP;
        END IF;
      ELSIF v_d > 0 THEN
        v_on[v_k] := v_on[v_k] + v_d;
      END IF;
      v_prev := v_r;
    END LOOP;
    -- la ultima oprire coboară toți (încărcarea pe ultimul rând e 0: nu are tronson după el)
  END LOOP;

  SELECT count(*) INTO v_n FROM count_leg_daily WHERE zi BETWEEN p_from AND p_to;
  RETURN v_n;
END $function$;

-- De unde până unde, pe zi: clienții TIKI (din bilete) și ceilalți (Numărare − TIKI). p_route NULL = toate rutele.
CREATE OR REPLACE FUNCTION public.get_tiki_od(p_from date, p_to date, p_route integer DEFAULT NULL)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
  WITH zile AS (
    SELECT count(DISTINCT zi) n FROM count_leg_daily
    WHERE zi BETWEEN p_from AND p_to AND eligibil AND (p_route IS NULL OR crm_route_id = p_route)
  ),
  zile_tiki AS (
    SELECT count(DISTINCT zi) n FROM tiki_leg_daily
    WHERE zi BETWEEN p_from AND p_to AND crm_route_id > 0 AND (p_route IS NULL OR crm_route_id = p_route)
  ),
  t AS (
    SELECT initcap(lower(trim(regexp_replace(coalesce(tt.from_station, split_part(tt.pair, ' - ', 1)), '\s+GA$', '')))) de_la,
           initcap(lower(trim(regexp_replace(coalesce(tt.to_station, split_part(tt.pair, ' - ', 2)), '\s+GA$', '')))) pana_la,
           count(*) n, sum(a.lei) lei
    FROM tiki_ticket_attr a JOIN tiki_tickets tt USING (ticket_key)
    WHERE a.zi BETWEEN p_from AND p_to AND a.crm_route_id IS NOT NULL AND (p_route IS NULL OR a.crm_route_id = p_route)
      AND coalesce(tt.from_station, tt.pair) IS NOT NULL
    GROUP BY 1, 2
  ),
  c AS (
    SELECT de_la, pana_la, sum(oameni) n FROM tiki_ceilalti_od
    WHERE zi BETWEEN p_from AND p_to AND (p_route IS NULL OR crm_route_id = p_route)
    GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'zile_numarare', (SELECT n FROM zile),
    'zile_tiki', (SELECT n FROM zile_tiki),
    'tiki', coalesce((SELECT jsonb_agg(jsonb_build_object('de_la', de_la, 'pana_la', pana_la, 'calatorii', n,
              'pct', round(100.0 * n / nullif((SELECT sum(n) FROM t), 0), 1),
              'pe_zi', round(n::numeric / greatest((SELECT n FROM zile_tiki), 1), 1), 'lei', round(lei))
              ORDER BY n DESC) FROM (SELECT * FROM t ORDER BY n DESC LIMIT 80) x), '[]'),
    'tiki_total', (SELECT sum(n) FROM t),
    'tiki_total_pe_zi', (SELECT round(sum(n)::numeric / greatest((SELECT n FROM zile_tiki), 1), 1) FROM t),
    'ceilalti', coalesce((SELECT jsonb_agg(jsonb_build_object('de_la', de_la, 'pana_la', pana_la, 'calatorii', round(n),
              'pct', round(100.0 * n / nullif((SELECT sum(n) FROM c), 0), 1),
              'pe_zi', round(n / greatest((SELECT n FROM zile), 1), 1)) ORDER BY n DESC)
              FROM (SELECT * FROM c WHERE n >= 0.5 ORDER BY n DESC LIMIT 80) x), '[]'),
    'ceilalti_total', (SELECT round(sum(n)) FROM c),
    'ceilalti_total_pe_zi', (SELECT round(sum(n) / greatest((SELECT n FROM zile), 1), 1) FROM c))
$$;

REVOKE EXECUTE ON FUNCTION public.count_aggr_days(date, date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_aggr_days(date, date, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_tiki_od(date, date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tiki_od(date, date, integer) TO service_role;

-- calculul pentru zilele deja numărate: la importul de dimineață (Numărarea din 28.03.2026)
INSERT INTO tiki_refresh_queue (luna, motiv)
SELECT DISTINCT date_trunc('month', assignment_date)::date, 'migr. 458' FROM counting_sessions WHERE assignment_date >= DATE '2026-03-01'
ON CONFLICT DO NOTHING;
