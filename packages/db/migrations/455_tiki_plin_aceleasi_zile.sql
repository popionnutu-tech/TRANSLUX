-- 455: Bilete aparat — «Cât de plin (doar TIKI)» pe aceleași zile sus și jos (ION-159, 01.10).
-- Ruta 2, Chișinău → Nord, 08–09.2026: 57 de plecări, doar 5 cu locuri cunoscute; om × km al tuturor biletelor împărțit
-- la locurile celor 5 plecări dădea 438 %. Acum fracția se face doar pe zilele în care toate plecările au locuri, și se
-- arată numai dacă acestea sunt cel puțin jumătate din zilele cu plecări.

CREATE OR REPLACE FUNCTION public.get_tiki_orar(p_from date, p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
  WITH b AS (
    SELECT crm_route_id, leg, sum(bilete) bilete, sum(lei) lei, sum(om_km_min) om_km_min
    FROM tiki_leg_daily WHERE zi BETWEEN p_from AND p_to AND crm_route_id > 0 GROUP BY 1, 2
  ),
  p AS (
    SELECT crm_route_id, leg, sum(plecari) plecari, sum(plecari) - sum(plecari_cu_bilete) plecari_fara_bilete,
           bool_or(sursa = 'grafic') din_grafic, count(*) zile
    FROM tiki_plecari_daily WHERE zi BETWEEN p_from AND p_to GROUP BY 1, 2
  ),
  -- «Cât de plin (doar TIKI)»: numărătorul și numitorul pe ACELEAȘI zile — cele în care toate plecările au locuri
  pl AS (
    SELECT d.crm_route_id, d.leg, count(*) zile_cu_locuri, sum(d.locuri * d.km_picior) loc_km, sum(t.om) om
    FROM tiki_plecari_daily d
    JOIN (SELECT zi, crm_route_id, leg, sum(om_km_min) om FROM tiki_leg_daily
          WHERE zi BETWEEN p_from AND p_to AND crm_route_id > 0 GROUP BY 1, 2, 3) t
      ON t.zi = d.zi AND t.crm_route_id = d.crm_route_id AND t.leg = d.leg
    WHERE d.zi BETWEEN p_from AND p_to AND d.plecari_cu_locuri = d.plecari AND d.locuri > 0 AND d.km_picior > 0
    GROUP BY 1, 2
  ),
  dz AS (
    SELECT pd.crm_route_id, pd.leg, extract(isodow FROM pd.zi)::int dow,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY coalesce(t.n, 0)::numeric / greatest(pd.plecari, 1)) med
    FROM tiki_plecari_daily pd
    LEFT JOIN (SELECT zi, crm_route_id, leg, sum(bilete) n FROM tiki_leg_daily
               WHERE crm_route_id > 0 AND zi BETWEEN p_from AND p_to GROUP BY 1, 2, 3) t
      ON t.zi = pd.zi AND t.crm_route_id = pd.crm_route_id AND t.leg = pd.leg
    WHERE pd.zi BETWEEN p_from AND p_to GROUP BY 1, 2, 3
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
        'plin_tiki', CASE WHEN pl.loc_km > 0 AND pl.zile_cu_locuri * 2 >= p.zile THEN round(100 * pl.om / pl.loc_km, 1) END,
        'bilete_an_trecut', ly.bilete_an_trecut, 'eticheta_comuna', coalesce(ly.eticheta_comuna, false),
        'zile_sapt', (SELECT jsonb_object_agg(dow, round(med::numeric, 1)) FROM dz WHERE dz.crm_route_id = r.id AND dz.leg = l.leg),
        'saptamani', (SELECT jsonb_agg(jsonb_build_array(sapt, n) ORDER BY sapt) FROM w WHERE w.crm_route_id = r.id AND w.leg = l.leg)
      ) ORDER BY l.leg DESC)
      FROM (VALUES ('nord_chisinau'), ('chisinau_nord')) l(leg)
      LEFT JOIN b ON b.crm_route_id = r.id AND b.leg = l.leg
      LEFT JOIN p ON p.crm_route_id = r.id AND p.leg = l.leg
      LEFT JOIN pl ON pl.crm_route_id = r.id AND pl.leg = l.leg
      LEFT JOIN ly ON ly.crm_route_id = r.id AND ly.leg = l.leg)
  ) ORDER BY r.time_nord), '[]')
  FROM crm_routes r
  WHERE r.route_type = 'interurban' AND r.active
$$;

REVOKE EXECUTE ON FUNCTION public.get_tiki_orar(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tiki_orar(date, date) TO service_role;
