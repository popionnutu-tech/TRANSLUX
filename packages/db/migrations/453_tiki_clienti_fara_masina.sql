-- 453: Bilete aparat — «Cine merge pe rută» fără condiția «aceeași mașină» + Orarul pe un an sub 3 s (ION-159).
--
-- 1. Pe ruta 6 (Corjeuți), 08–09.2026, Numărarea are mașina din grafic LYY 735 (102 picioare), iar terminalul TIKI vinde
--    de pe YEK 283 (biletele atribuite rutei pe eticheta lunii): cu «aceeași mașină» TIKI ieșea 0 → «ceilalți» 100 %.
--    Biletele sunt deja atribuite rutei + piciorului, deci comparația se face pe (zi, rută, picior), toate mașinile.
--    Un picior numărat fără niciun bilet TIKI atribuit în ziua aceea e «necunoscut» (terminal oprit / nelegat), nu ceilalți.
-- 2. get_tiki_orar pe 12 luni: 9,7 s (etichetele rutei citite din tiki_ticket_attr). Tabela tiki_route_label_daily le ține
--    pe zi, refăcută de tiki_aggr_month.

CREATE TABLE IF NOT EXISTS tiki_route_label_daily (
  zi            date NOT NULL,
  crm_route_id  integer NOT NULL,
  leg           text NOT NULL,
  label         text NOT NULL,
  label_dir     text NOT NULL,
  bilete        integer NOT NULL,
  PRIMARY KEY (zi, crm_route_id, leg, label, label_dir)
);
ALTER TABLE tiki_route_label_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE tiki_route_label_daily FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE tiki_route_label_daily TO service_role;

INSERT INTO tiki_route_label_daily
SELECT zi, crm_route_id, leg, label, label_dir, count(*) FROM tiki_ticket_attr
WHERE crm_route_id IS NOT NULL AND leg IS NOT NULL GROUP BY 1, 2, 3, 4, 5
ON CONFLICT DO NOTHING;

-- tiki_aggr_month: + tiki_route_label_daily (restul neschimbat față de 452)
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
         count(*) FILTER (WHERE NOT coalesce(a.km_to > a.km_from, false))
  FROM tiki_ticket_attr a WHERE a.luna = v_from
  GROUP BY 1, 2, 3, 4;

  DELETE FROM tiki_label_daily WHERE zi BETWEEN v_from AND v_to;
  INSERT INTO tiki_label_daily
  SELECT a.zi, a.label, a.label_dir, tiki_coridor(a.label), count(*), sum(a.lei), bool_or(a.is_anulare)
  FROM tiki_ticket_attr a WHERE a.luna = v_from GROUP BY 1, 2, 3;

  DELETE FROM tiki_route_label_daily WHERE zi BETWEEN v_from AND v_to;
  INSERT INTO tiki_route_label_daily
  SELECT a.zi, a.crm_route_id, a.leg, a.label, a.label_dir, count(*)
  FROM tiki_ticket_attr a WHERE a.luna = v_from AND a.crm_route_id IS NOT NULL AND a.leg IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5;

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

-- count_aggr_days: TIKI pe (zi, rută, picior), toate mașinile; eligibil doar cu ≥ 1 bilet TIKI atribuit
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

  SELECT count(*) INTO v_n FROM count_leg_daily WHERE zi BETWEEN p_from AND p_to;
  RETURN v_n;
END $function$;

-- get_tiki_orar: etichetele rutei din tiki_route_label_daily (restul neschimbat față de 452)
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
  dz AS (
    SELECT pl.crm_route_id, pl.leg, extract(isodow FROM pl.zi)::int dow,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY coalesce(t.n, 0)::numeric / greatest(pl.plecari, 1)) med
    FROM tiki_plecari_daily pl
    LEFT JOIN (SELECT zi, crm_route_id, leg, sum(bilete) n FROM tiki_leg_daily
               WHERE crm_route_id > 0 AND zi BETWEEN p_from AND p_to GROUP BY 1, 2, 3) t
      ON t.zi = pl.zi AND t.crm_route_id = pl.crm_route_id AND t.leg = pl.leg
    WHERE pl.zi BETWEEN p_from AND p_to GROUP BY 1, 2, 3
  ),
  lb AS (
    SELECT crm_route_id, leg, label, label_dir, sum(bilete) n
    FROM tiki_route_label_daily WHERE zi BETWEEN p_from AND p_to GROUP BY 1, 2, 3, 4
  ),
  lc AS (SELECT label, label_dir, count(DISTINCT crm_route_id) rute FROM lb GROUP BY 1, 2),
  ly AS (
    SELECT lb.crm_route_id, lb.leg, sum(d.bilete) bilete_an_trecut, bool_or(lc.rute > 1) eticheta_comuna
    FROM lb JOIN lc USING (label, label_dir)
    LEFT JOIN tiki_label_daily d ON d.label = lb.label AND d.label_dir = lb.label_dir
         AND d.zi BETWEEN p_from - 364 AND p_to - 364
    GROUP BY 1, 2
  ),
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

REVOKE EXECUTE ON FUNCTION public.tiki_aggr_month(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiki_aggr_month(date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.count_aggr_days(date, date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_aggr_days(date, date, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_tiki_orar(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tiki_orar(date, date) TO service_role;
