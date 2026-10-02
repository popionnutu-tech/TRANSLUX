-- 471: Bilete aparat — «Rute» cu un grafic pe fiecare rută (ION-167, Ion 02.10: «nu am nevoie pe coridor, am nevoie pe
-- fiecare grafic în parte și tipul de clienți pe care se ține exact pe fiecare grafic»). Pe rută × lună, ultimele 24 de luni
-- până la luna lui p_to: bilete TIKI, zile circulate, zile complet numărate, TIKI și «fără bilet» pe zilele complet numărate.
-- Citește doar totalurile zilnice (migr. 469). Doar definiția funcției.

CREATE OR REPLACE FUNCTION public.get_tiki_rute_lunar(p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s'
AS $function$
  WITH b AS (SELECT (date_trunc('month', p_to) - interval '23 months')::date d0,
                    (date_trunc('month', p_to) + interval '1 month - 1 day')::date d1),
  d AS (SELECT z.* FROM b, tiki_zile_ruta(b.d0, b.d1) z),
  st AS (SELECT crm_route_id, date_trunc('month', zi)::date luna, count(*) zc, count(*) FILTER (WHERE complet) zk
         FROM d GROUP BY 1, 2),
  tk AS (SELECT t.crm_route_id, date_trunc('month', t.zi)::date luna, sum(t.bilete) b
         FROM tiki_pereche_daily t, b WHERE t.zi BETWEEN b.d0 AND b.d1 AND t.crm_route_id <> 0 GROUP BY 1, 2),
  tc AS (SELECT t.crm_route_id, date_trunc('month', t.zi)::date luna, sum(t.bilete) b
         FROM tiki_pereche_daily t JOIN d ON d.zi = t.zi AND d.crm_route_id = t.crm_route_id AND d.complet
         GROUP BY 1, 2),
  fc AS (SELECT o.crm_route_id, date_trunc('month', o.zi)::date luna, sum(o.oameni) f
         FROM omisi_pereche_daily o JOIN d ON d.zi = o.zi AND d.crm_route_id = o.crm_route_id AND d.complet
         GROUP BY 1, 2)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'route', st.crm_route_id, 'luna', to_char(st.luna, 'YYYY-MM'), 'zile_circulate', st.zc, 'zile_numarate', st.zk,
    'tiki', coalesce(tk.b, 0), 'tiki_c', coalesce(tc.b, 0), 'fara_c', round(coalesce(fc.f, 0), 1)
  ) ORDER BY st.crm_route_id, st.luna), '[]')
  FROM st
  LEFT JOIN tk ON tk.crm_route_id = st.crm_route_id AND tk.luna = st.luna
  LEFT JOIN tc ON tc.crm_route_id = st.crm_route_id AND tc.luna = st.luna
  LEFT JOIN fc ON fc.crm_route_id = st.crm_route_id AND fc.luna = st.luna
$function$;

REVOKE EXECUTE ON FUNCTION public.get_tiki_rute_lunar(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tiki_rute_lunar(date) TO service_role;
