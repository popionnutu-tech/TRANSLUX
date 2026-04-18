-- 033: Sales Analytics — route baselines, weather, driver performance
-- Depends on: 021 (counting_sessions, counting_entries), 024 (crm_routes.route_type)

-- 1. Daily weather (historical fact from Open-Meteo)
CREATE TABLE IF NOT EXISTS daily_weather (
  date DATE PRIMARY KEY,
  temp_max DECIMAL(4,1),
  temp_min DECIMAL(4,1),
  precipitation_mm DECIMAL(6,1),
  rain_heavy BOOLEAN NOT NULL DEFAULT false,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Flattened view: one row = one completed counting session (full route tur+retur)
CREATE OR REPLACE VIEW v_session_full AS
SELECT
  cs.id AS session_id,
  cs.assignment_date,
  cs.crm_route_id,
  cr.dest_to_ro AS route_name,
  cr.time_chisinau,
  cr.time_nord,
  cr.route_type,
  cs.driver_id,
  d.full_name AS driver_name,
  cs.vehicle_id,
  v.plate_number,
  COALESCE(tur.pax, 0) + COALESCE(ret.pax, 0) AS total_passengers,
  COALESCE(cs.tur_total_lei, 0) + COALESCE(cs.retur_total_lei, 0) AS total_lei,
  COALESCE(tur.pax, 0) AS tur_passengers,
  COALESCE(ret.pax, 0) AS retur_passengers,
  cs.tur_total_lei,
  cs.retur_total_lei,
  EXTRACT(DOW FROM cs.assignment_date)::int AS dow,
  EXTRACT(MONTH FROM cs.assignment_date)::int AS month_num,
  CASE
    WHEN EXTRACT(MONTH FROM cs.assignment_date) IN (12, 1, 2) THEN 'winter'
    WHEN EXTRACT(MONTH FROM cs.assignment_date) IN (3, 4, 5) THEN 'spring'
    WHEN EXTRACT(MONTH FROM cs.assignment_date) IN (6, 7, 8) THEN 'summer'
    ELSE 'autumn'
  END AS season,
  COALESCE(w.rain_heavy, false) AS rain_heavy
FROM counting_sessions cs
JOIN crm_routes cr ON cr.id = cs.crm_route_id
LEFT JOIN drivers d ON d.id = cs.driver_id
LEFT JOIN vehicles v ON v.id = cs.vehicle_id
LEFT JOIN daily_weather w ON w.date = cs.assignment_date
LEFT JOIN LATERAL (
  SELECT SUM(total_passengers) AS pax
  FROM counting_entries WHERE session_id = cs.id AND direction = 'tur'
) tur ON true
LEFT JOIN LATERAL (
  SELECT SUM(total_passengers) AS pax
  FROM counting_entries WHERE session_id = cs.id AND direction = 'retur'
) ret ON true
WHERE cs.status = 'completed';

-- 3. Route baselines (etalon per route × season × day-of-week × weather)
CREATE TABLE IF NOT EXISTS route_baselines (
  id SERIAL PRIMARY KEY,
  crm_route_id INT NOT NULL REFERENCES crm_routes(id),
  season VARCHAR(10) NOT NULL CHECK (season IN ('winter', 'spring', 'summer', 'autumn')),
  dow INT NOT NULL CHECK (dow BETWEEN 0 AND 6),
  rain_heavy BOOLEAN NOT NULL,
  avg_passengers DECIMAL(8,2) NOT NULL DEFAULT 0,
  avg_revenue_lei DECIMAL(10,2) NOT NULL DEFAULT 0,
  sample_count INT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(crm_route_id, season, dow, rain_heavy)
);

-- 4. Function to recompute all baselines from counting data
CREATE OR REPLACE FUNCTION compute_route_baselines()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM route_baselines;
  INSERT INTO route_baselines (crm_route_id, season, dow, rain_heavy, avg_passengers, avg_revenue_lei, sample_count, computed_at)
  SELECT
    crm_route_id,
    season,
    dow,
    rain_heavy,
    ROUND(AVG(total_passengers)::numeric, 2),
    ROUND(AVG(total_lei)::numeric, 2),
    COUNT(*)::int,
    now()
  FROM v_session_full
  WHERE driver_id IS NOT NULL
  GROUP BY crm_route_id, season, dow, rain_heavy;
END;
$$;

-- 5. Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_cs_driver_date
  ON counting_sessions(driver_id, assignment_date)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_cs_route_date
  ON counting_sessions(crm_route_id, assignment_date)
  WHERE status = 'completed';
