-- 035_operator_prudence.sql
-- RPC pentru analiza prudenței operatorilor de numărare.
--
-- Pentru fiecare rută calculăm mediana pasagerilor scurți pe sesiune (toți operatorii) = baseline.
-- Pentru fiecare operator × rută calculăm media operatorului și abaterea față de baseline.
-- Agregăm pe operator (ponderat după numărul de sesiuni ale operatorului pe acea rută).
--
-- Perioada: ultimele p_days zile.

CREATE OR REPLACE FUNCTION public.get_operator_prudence(p_days integer)
RETURNS TABLE (
  operator_id uuid,
  email text,
  name text,
  sessions bigint,
  routes_covered bigint,
  op_avg_short_pax numeric,
  baseline_avg_short_pax numeric,
  deviation_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH per_session AS (
    SELECT cs.id AS session_id,
           cs.operator_id,
           cs.crm_route_id,
           COALESCE(SUM(sp.passenger_count), 0)::numeric AS short_pax
    FROM counting_sessions cs
    LEFT JOIN counting_entries ce ON ce.session_id = cs.id
    LEFT JOIN counting_short_passengers sp ON sp.entry_id = ce.id
    WHERE cs.status IN ('completed', 'tur_done')
      AND cs.assignment_date >= CURRENT_DATE - (p_days || ' days')::interval
      AND cs.operator_id IS NOT NULL
    GROUP BY cs.id, cs.operator_id, cs.crm_route_id
  ),
  route_baseline AS (
    SELECT crm_route_id,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY short_pax)::numeric AS median_short,
           COUNT(*) AS route_sessions
    FROM per_session
    GROUP BY crm_route_id
    -- Baseline reliabil doar dacă ruta are minim 3 sesiuni în perioadă
    HAVING COUNT(*) >= 3
  ),
  per_op_route AS (
    SELECT p.operator_id,
           p.crm_route_id,
           COUNT(*) AS sess_cnt,
           AVG(p.short_pax)::numeric AS op_avg,
           rb.median_short AS route_median
    FROM per_session p
    JOIN route_baseline rb ON rb.crm_route_id = p.crm_route_id
    GROUP BY p.operator_id, p.crm_route_id, rb.median_short
  ),
  per_operator AS (
    SELECT operator_id,
           SUM(sess_cnt) AS total_sessions,
           COUNT(DISTINCT crm_route_id) AS routes_covered,
           -- ponderat după numărul de sesiuni
           SUM(op_avg * sess_cnt) / NULLIF(SUM(sess_cnt), 0) AS op_avg_weighted,
           SUM(route_median * sess_cnt) / NULLIF(SUM(sess_cnt), 0) AS baseline_weighted
    FROM per_op_route
    GROUP BY operator_id
  )
  SELECT po.operator_id,
         aa.email::text,
         aa.name::text,
         po.total_sessions AS sessions,
         po.routes_covered,
         ROUND(po.op_avg_weighted, 2) AS op_avg_short_pax,
         ROUND(po.baseline_weighted, 2) AS baseline_avg_short_pax,
         ROUND(
           CASE WHEN po.baseline_weighted > 0
                THEN ((po.op_avg_weighted - po.baseline_weighted) / po.baseline_weighted) * 100
                ELSE 0
           END,
           2
         ) AS deviation_pct
  FROM per_operator po
  JOIN admin_accounts aa ON aa.id = po.operator_id
  WHERE po.total_sessions >= 5  -- filtrăm operatorii cu prea puține sesiuni
  ORDER BY deviation_pct ASC;  -- cei mai "ne prudenți" sus
$$;

GRANT EXECUTE ON FUNCTION public.get_operator_prudence(integer) TO authenticated, service_role;
