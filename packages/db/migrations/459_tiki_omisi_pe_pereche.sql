-- 459: Bilete aparat — «Tipuri bilet & direcții»: coloana oamenilor omiși de TIKI, dar numărați în Numărare (ION-159).
-- Ion, 01.10: «în tipul bilet și direcții să apară o coloană — oamenii omiși de TIKI dar fixați în numărare».
-- Din tiki_ceilalti_od (migr. 458: numărat − TIKI pe tronsoane, de unde până unde), pe pereche fără sens, cu numele
-- normalizate (tiki_stop_norm: fără diacritice, fără «GA»), ca să se potrivească cu perechile TIKI («Chisinau - Balti»).
-- Doar din 28.03.2026 (Numărarea) și doar zilele numărate în care cursa are și bilete TIKI.

CREATE OR REPLACE FUNCTION public.get_tiki_omisi(p_from date, p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
  SELECT jsonb_build_object(
    'zile', (SELECT count(DISTINCT zi) FROM count_leg_daily WHERE zi BETWEEN p_from AND p_to AND eligibil),
    'perechi', coalesce((SELECT jsonb_agg(jsonb_build_object('cheie', cheie, 'de_la', de_la, 'pana_la', pana_la,
                                                             'oameni', round(n), 'tur', round(tur), 'retur', round(retur))
                                          ORDER BY n DESC)
      FROM (
        SELECT least(tiki_stop_norm(de_la), tiki_stop_norm(pana_la)) || '|' || greatest(tiki_stop_norm(de_la), tiki_stop_norm(pana_la)) cheie,
               min(de_la) de_la, min(pana_la) pana_la, sum(oameni) n,
               sum(oameni) FILTER (WHERE leg = 'chisinau_nord') tur, sum(oameni) FILTER (WHERE leg = 'nord_chisinau') retur
        FROM tiki_ceilalti_od WHERE zi BETWEEN p_from AND p_to
        GROUP BY 1 HAVING sum(oameni) >= 0.5
      ) x), '[]'))
$$;

REVOKE EXECUTE ON FUNCTION public.get_tiki_omisi(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tiki_omisi(date, date) TO service_role;
