-- 450: Bilete aparat — «Comparație lunară» filtrată pe direcție din tiki_daily_pair (ION-156, 01.10).
-- Cu o direcție aleasă (ex. «Chisinau - Balti») get_tiki_monthly citea toate cele 555.749 de bilete și pagina
-- arăta «canceling statement due to statement timeout» (captura lui Ion, 01.10 14:18). tiki_daily_pair (migr. 449)
-- are aceleași coloane de filtru; era ultima funcție a paginii care citea tiki_tickets.

CREATE OR REPLACE FUNCTION public.get_tiki_monthly(p_route text DEFAULT NULL, p_driver text DEFAULT NULL, p_pair text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH days AS (
    SELECT sale_date d, sum(tickets)::bigint tickets, sum(lei) lei FROM tiki_daily_trip
    WHERE p_pair IS NULL
      AND (p_route IS NULL OR route_name = p_route) AND (p_driver IS NULL OR driver_name = p_driver)
    GROUP BY 1
    UNION ALL
    SELECT sale_date, sum(tickets)::bigint, sum(lei) FROM tiki_daily_pair
    WHERE p_pair IS NOT NULL AND pair = p_pair
      AND (p_route IS NULL OR route_name = p_route) AND (p_driver IS NULL OR driver_name = p_driver)
    GROUP BY 1
  ),
  mx AS (SELECT max(d) v_max FROM days)
  SELECT jsonb_build_object(
    'date_max', (SELECT v_max FROM mx),
    'months', coalesce((SELECT jsonb_agg(jsonb_build_object('m', m, 'tickets', t, 'lei', l, 'days', n, 'last', last) ORDER BY m)
      FROM (SELECT to_char(d, 'YYYY-MM') m, sum(tickets) t, sum(lei) l, count(*) n, max(d) last FROM days GROUP BY 1) x), '[]'),
    'weeks', coalesce((SELECT jsonb_agg(jsonb_build_object('w', w, 'tickets', t, 'lei', l, 'days', n) ORDER BY w)
      FROM (SELECT date_trunc('week', d)::date w, sum(tickets) t, sum(lei) l, count(*) n FROM days, mx
            WHERE d > v_max - 26 * 7 GROUP BY 1) y), '[]')
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_tiki_monthly(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tiki_monthly(text, text, text) TO service_role;

-- «Chisinau - Balti» fără alt filtru: 4,5 s fără index (183.034 de bilete, egal cu numărătoarea din tiki_tickets).
CREATE INDEX IF NOT EXISTS tiki_daily_pair_pair ON tiki_daily_pair (pair, sale_date);
