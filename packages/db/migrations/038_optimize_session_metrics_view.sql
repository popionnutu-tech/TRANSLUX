-- 038: Optimize v_session_metrics view (fix N+1 from per-row PLPGSQL calls)
-- The original view in 037 called compute_unique_passengers/compute_passenger_km/get_route_length_km
-- per row, taking ~34s for 563 rows. This rewrite uses a single CTE-based query → ~150ms.

CREATE OR REPLACE VIEW v_session_metrics AS
WITH
  entries_with_lag AS (
    SELECT
      session_id, direction, stop_order, total_passengers,
      COALESCE(alighted, 0) AS alighted,
      LAG(total_passengers) OVER (PARTITION BY session_id, direction ORDER BY stop_order) AS prev_total,
      LEAD(km_from_start) OVER (PARTITION BY session_id, direction ORDER BY stop_order) AS next_km,
      km_from_start
    FROM counting_entries
  ),
  per_session_per_dir AS (
    SELECT
      session_id, direction,
      MAX(CASE WHEN stop_order = 1 THEN total_passengers ELSE 0 END) AS starting_pax,
      COALESCE(SUM(CASE WHEN stop_order > 1
                        THEN GREATEST(0, total_passengers - (COALESCE(prev_total, total_passengers) - alighted))
                        ELSE 0 END), 0) AS boardings,
      MAX(km_from_start) AS dir_length_km,
      COALESCE(SUM(CASE WHEN next_km IS NOT NULL
                        THEN (next_km - km_from_start) * total_passengers
                        ELSE 0 END), 0) AS pkm
    FROM entries_with_lag
    GROUP BY session_id, direction
  ),
  per_session AS (
    SELECT
      session_id,
      SUM(starting_pax + boardings) AS unique_long_pax,
      SUM(dir_length_km) AS route_length_km,
      SUM(pkm) AS passenger_km
    FROM per_session_per_dir
    GROUP BY session_id
  ),
  shorts_per_session AS (
    SELECT ce.session_id, COALESCE(SUM(sp.passenger_count), 0) AS shorts
    FROM counting_short_passengers sp
    JOIN counting_entries ce ON ce.id = sp.entry_id
    GROUP BY ce.session_id
  ),
  capacity AS (
    SELECT value::numeric AS cap FROM app_config WHERE key = 'bus_seat_capacity'
  )
SELECT
  vsf.*,
  (COALESCE(ps.unique_long_pax, 0) + COALESCE(s.shorts, 0))::int AS unique_passengers,
  ROUND(COALESCE(ps.passenger_km, 0)::numeric, 2) AS passenger_km,
  ROUND(COALESCE(ps.route_length_km, 0)::numeric, 2) AS route_length_km,
  CASE
    WHEN COALESCE(ps.route_length_km, 0) > 0
    THEN ROUND((vsf.total_lei / ps.route_length_km)::numeric, 2)
    ELSE NULL
  END AS revenue_per_km,
  CASE
    WHEN COALESCE(ps.route_length_km, 0) > 0 AND (SELECT cap FROM capacity) > 0
    THEN ROUND((ps.passenger_km / (ps.route_length_km * (SELECT cap FROM capacity)) * 100)::numeric, 1)
    ELSE NULL
  END AS load_factor_pct
FROM v_session_full vsf
LEFT JOIN per_session ps ON ps.session_id = vsf.session_id
LEFT JOIN shorts_per_session s ON s.session_id = vsf.session_id;
