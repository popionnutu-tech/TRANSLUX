-- 460: Bilete aparat — numele perechii la «Omiși de TIKI» (ION-159, 01.10). get_tiki_omisi (459) lua min(de_la) și
-- min(pana_la) separat peste ambele sensuri, deci perechea «Briceni – Bălți» apărea «Bălți → Bălți» la rândurile care
-- există doar în Numărare. Acum capetele vin în ordinea cheii (cel mai mic nume normalizat primul).

CREATE OR REPLACE FUNCTION public.get_tiki_omisi(p_from date, p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
  SELECT jsonb_build_object(
    'zile', (SELECT count(DISTINCT zi) FROM count_leg_daily WHERE zi BETWEEN p_from AND p_to AND eligibil),
    'perechi', coalesce((SELECT jsonb_agg(jsonb_build_object('cheie', cheie, 'de_la', a, 'pana_la', b,
                                                             'oameni', round(n), 'tur', round(tur), 'retur', round(retur))
                                          ORDER BY n DESC)
      FROM (
        SELECT least(tiki_stop_norm(de_la), tiki_stop_norm(pana_la)) || '|' || greatest(tiki_stop_norm(de_la), tiki_stop_norm(pana_la)) cheie,
               min(CASE WHEN tiki_stop_norm(de_la) <= tiki_stop_norm(pana_la) THEN de_la ELSE pana_la END) a,
               min(CASE WHEN tiki_stop_norm(de_la) <= tiki_stop_norm(pana_la) THEN pana_la ELSE de_la END) b,
               sum(oameni) n,
               sum(oameni) FILTER (WHERE leg = 'chisinau_nord') tur, sum(oameni) FILTER (WHERE leg = 'nord_chisinau') retur
        FROM tiki_ceilalti_od WHERE zi BETWEEN p_from AND p_to
        GROUP BY 1 HAVING sum(oameni) >= 0.5
      ) x), '[]'))
$$;

REVOKE EXECUTE ON FUNCTION public.get_tiki_omisi(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tiki_omisi(date, date) TO service_role;
