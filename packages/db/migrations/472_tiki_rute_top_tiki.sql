-- 472: get_tiki_rute întoarce și «top_tiki» — primele 3 perechi după biletele TIKI pe toate zilele, pentru rutele numărate
-- prea puțin (Ion, 02.10: tipul de clienți «exact pe fiecare grafic»; fără Numărare ruta nu rămâne fără clienți).

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
  ),
  tt AS (
    SELECT crm_route_id, jsonb_agg(jsonb_build_object('cheie', pereche_cheie, 'de_la', de_la, 'pana_la', pana_la, 'tiki', b)
                                   ORDER BY b DESC) FILTER (WHERE rn <= 3) top_tiki
    FROM (SELECT crm_route_id, pereche_cheie, min(de_la) de_la, min(pana_la) pana_la, sum(bilete) b,
                 row_number() OVER (PARTITION BY crm_route_id ORDER BY sum(bilete) DESC) rn
          FROM tiki_pereche_daily WHERE zi BETWEEN p_from AND p_to AND crm_route_id <> 0 AND pereche_cheie <> 'nedeterminat'
          GROUP BY 1, 2) z
    GROUP BY 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'route', st.crm_route_id, 'de_la', r.dest_from_ro, 'pana_la', r.dest_to_ro,
    'time_nord', r.time_nord, 'time_chisinau', r.time_chisinau,
    'zile_circulate', st.zc, 'zile_numarate', st.zk,
    'tiki', coalesce(tk.b, 0), 'lei', coalesce(tk.lei, 0),
    'tiki_c', coalesce(rk.tiki_c, 0), 'fara_c', round(coalesce(rk.fara_c, 0), 1), 'top', coalesce(top.top, '[]'), 'top_tiki', coalesce(tt.top_tiki, '[]')
  ) ORDER BY st.crm_route_id), '[]')
  FROM st JOIN crm_routes r ON r.id = st.crm_route_id
  LEFT JOIN tk ON tk.crm_route_id = st.crm_route_id
  LEFT JOIN rk ON rk.crm_route_id = st.crm_route_id
  LEFT JOIN top ON top.crm_route_id = st.crm_route_id
  LEFT JOIN tt ON tt.crm_route_id = st.crm_route_id
$function$;

REVOKE EXECUTE ON FUNCTION public.get_tiki_rute(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tiki_rute(date, date) TO service_role;
