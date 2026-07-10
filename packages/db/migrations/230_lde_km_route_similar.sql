-- ============================================================================
-- MODUL LDE — etalon km pe TRASEU SIMILAR (cerere Ion 10.07.2026).
--
-- Autobuzele repetă itinerarii. Etalonul corect al unei zile nu e integrala
-- vitezei (km_check — minte la găuri de semnal, caz 783MUM), ci mediana km a
-- zilelor ACELEIAȘI mașini cu traseu similar (Jaccard ≥ 0.6 pe mulțimea de
-- localități din opriri), doar zile curate (km_patched < 5, ne-suspecte).
-- Folosit de pagina /lde/km-zilnic în locul mesajului «Viteză anormală».
-- ============================================================================

CREATE OR REPLACE FUNCTION lde_km_route_similar(p_day date)
RETURNS TABLE(vehicle_id uuid, similar_days int, km_median numeric)
LANGUAGE sql STABLE AS $$
WITH day_locs AS (
  SELECT s.vehicle_id, array_agg(DISTINCT s.locality) AS locs
  FROM lde_gps_stops s
  WHERE s.date = p_day AND s.locality IS NOT NULL
  GROUP BY 1
),
hist AS (
  SELECT s.vehicle_id, s.date, array_agg(DISTINCT s.locality) AS locs
  FROM lde_gps_stops s
  WHERE s.date >= p_day - 60 AND s.date < p_day AND s.locality IS NOT NULL
  GROUP BY 1, 2
),
sim AS (
  SELECT h.vehicle_id, h.date
  FROM hist h
  JOIN day_locs d ON d.vehicle_id = h.vehicle_id
  CROSS JOIN LATERAL (
    SELECT (SELECT count(*) FROM unnest(h.locs) l WHERE l = ANY(d.locs))::numeric AS inter,
           cardinality(h.locs) + cardinality(d.locs) AS tot
  ) j
  -- Jaccard = inter/union; union = tot - inter ≥ 1 mereu (ambele mulțimi non-goale)
  WHERE j.inter / (j.tot - j.inter) >= 0.6
),
etalon AS (
  SELECT g.vehicle_id, g.km_total
  FROM sim
  JOIN lde_vehicle_gps_daily g ON g.vehicle_id = sim.vehicle_id AND g.date = sim.date
  WHERE g.km_patched < 5 AND COALESCE(g.suspect, false) = false  -- doar zile-etalon curate
)
SELECT e.vehicle_id, count(*)::int,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY e.km_total)::numeric, 1)
FROM etalon e
GROUP BY 1;
$$;

REVOKE ALL ON FUNCTION lde_km_route_similar(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_km_route_similar(date) TO service_role;
