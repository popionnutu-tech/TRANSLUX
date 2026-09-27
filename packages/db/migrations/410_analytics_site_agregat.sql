-- 410_analytics_site_agregat.sql — fila Site din /analytics numărată în bază, nu în JS (ION-104, Ion 27.09.2026:
-- «foarte greu lucrează analitica cu lag de 5-10 secunde»).
-- Până acum panoul trăgea rândurile brute câte 1000 (search_log de 2 ori, page_views de 3 ori, call_clicks o dată):
-- ~130 cereri la 30z, ~400 la 90z. Funcția întoarce tot ce arată fila într-un singur jsonb.
-- Zilele (și ziua săptămânii, 0 = luni) sunt pe UTC, ca în codul de dinainte, ca cifrele să rămână aceleași.
-- «Mai târziu» = mod 'mai_tarziu' sau NULL (rândurile de dinainte de ION-102).
-- Top rute: media pe zi a săptămânii = suma / zilele cu măcar o căutare (apel) pe ruta aceea în ziua aceea.
-- ::date, nu to_char: to_char pe 125k rânduri costa 1,6 s.
-- Doar service_role o cheamă (panoul, după verifySession ADMIN); PUBLIC/anon nu (vezi migr. 355–356).
BEGIN;

CREATE OR REPLACE FUNCTION analytics_site(since_ts timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH
  pv AS (SELECT (created_at AT TIME ZONE 'UTC')::date d, device, country FROM page_views WHERE created_at >= since_ts),
  sl AS (SELECT (created_at AT TIME ZONE 'UTC')::date d, mod, from_locality f, to_locality t FROM search_log WHERE created_at >= since_ts),
  cc AS (SELECT (created_at AT TIME ZONE 'UTC')::date d, mod, from_locality f, to_locality t FROM call_clicks WHERE created_at >= since_ts),
  rs AS (SELECT f, t, d, extract(isodow FROM d)::int - 1 w, count(*) n FROM sl GROUP BY 1, 2, 3),
  rc AS (SELECT f, t, d, extract(isodow FROM d)::int - 1 w, count(*) n FROM cc GROUP BY 1, 2, 3),
  top AS (SELECT f, t, sum(n) n FROM rs GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20),
  dows AS (SELECT generate_series(0, 6) w),
  -- medii pe (rută, zi a săptămânii) doar pentru top 20, dintr-o trecere; NULL-urile rutei se potrivesc între ele
  sw AS (SELECT rs.f, rs.t, rs.w, round(sum(rs.n)::numeric / count(DISTINCT rs.d)) a
         FROM rs JOIN top ON rs.f IS NOT DISTINCT FROM top.f AND rs.t IS NOT DISTINCT FROM top.t GROUP BY 1, 2, 3),
  cw AS (SELECT rc.f, rc.t, rc.w, sum(rc.n) n, round(sum(rc.n)::numeric / count(DISTINCT rc.d)) a
         FROM rc JOIN top ON rc.f IS NOT DISTINCT FROM top.f AND rc.t IS NOT DISTINCT FROM top.t GROUP BY 1, 2, 3),
  rt AS (SELECT top.f, top.t, top.n,
                COALESCE(sum(cw.n), 0) calls,
                jsonb_agg(COALESCE(sw.a, 0) ORDER BY dows.w) day_counts,
                jsonb_agg(COALESCE(cw.a, 0) ORDER BY dows.w) day_calls
         FROM top CROSS JOIN dows
         LEFT JOIN sw ON sw.f IS NOT DISTINCT FROM top.f AND sw.t IS NOT DISTINCT FROM top.t AND sw.w = dows.w
         LEFT JOIN cw ON cw.f IS NOT DISTINCT FROM top.f AND cw.t IS NOT DISTINCT FROM top.t AND cw.w = dows.w
         GROUP BY 1, 2, 3),
  dt AS (SELECT w, round(sum(n)::numeric / count(DISTINCT d)) a FROM rs GROUP BY 1)
  SELECT jsonb_build_object(
    'views_per_day', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', d, 'count', n) ORDER BY d)
      FROM (SELECT d, count(*) n FROM pv GROUP BY 1) x), '[]'::jsonb),
    'searches_per_day', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', d, 'acum', a, 'mai_tarziu', m) ORDER BY d)
      FROM (SELECT d, count(*) FILTER (WHERE mod = 'acum') a, count(*) FILTER (WHERE mod IS DISTINCT FROM 'acum') m
            FROM sl GROUP BY 1) x), '[]'::jsonb),
    'totals', jsonb_build_object(
      'views', (SELECT count(*) FROM pv),
      'searches', (SELECT count(*) FROM sl),
      'searches_acum', (SELECT count(*) FROM sl WHERE mod = 'acum'),
      'calls', (SELECT count(*) FROM cc),
      'calls_acum', (SELECT count(*) FROM cc WHERE mod = 'acum')),
    'devices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('device', k, 'count', n) ORDER BY n DESC)
      FROM (SELECT COALESCE(device, 'unknown') k, count(*) n FROM pv GROUP BY 1) x), '[]'::jsonb),
    'countries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('country', k, 'count', n) ORDER BY n DESC)
      FROM (SELECT COALESCE(country, '??') k, count(*) n FROM pv GROUP BY 1 ORDER BY 2 DESC LIMIT 10) x), '[]'::jsonb),
    'routes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('from_locality', f, 'to_locality', t, 'count', n, 'calls', calls,
                                          'day_counts', day_counts, 'day_calls', day_calls) ORDER BY n DESC)
      FROM rt), '[]'::jsonb),
    'day_totals', (SELECT jsonb_agg(COALESCE(dt.a, 0) ORDER BY dows.w) FROM dows LEFT JOIN dt ON dt.w = dows.w)
  );
$$;

REVOKE EXECUTE ON FUNCTION analytics_site(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_site(timestamptz) TO service_role;

COMMIT;
