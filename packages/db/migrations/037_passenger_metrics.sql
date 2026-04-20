-- 037: Passenger metrics — unique passengers, passenger-km, load factor
-- Adds real (unique) passenger count, passenger-km, and load factor to counting sessions.
-- Fixes the misleading "total_passengers" metric which sums passenger-stops, not unique passengers.
-- Depends on: 021 (counting tables), 025 (alighted column), 033 (v_session_full), 034 (single totals)

-- ─── 1. Bus seat capacity (default 20 for TRANSLUX fleet) ───
INSERT INTO app_config (key, value)
VALUES ('bus_seat_capacity', '20')
ON CONFLICT (key) DO NOTHING;

-- ─── 2. Function: unique passengers per session (tur + retur) ───
-- Formula: starting_pax (at stop 1) + sum of positive deltas (boardings) + short passengers
-- Uses alighted if available; fallback to positive deltas only.
CREATE OR REPLACE FUNCTION compute_unique_passengers(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total integer := 0;
  v_dir text;
  v_boardings integer;
  v_starting integer;
  v_shorts integer;
BEGIN
  FOR v_dir IN SELECT unnest(ARRAY['tur','retur'])
  LOOP
    -- Starting passengers at stop_order = 1
    SELECT COALESCE(total_passengers, 0)
      INTO v_starting
    FROM counting_entries
    WHERE session_id = p_session_id AND direction = v_dir AND stop_order = 1
    LIMIT 1;

    IF v_starting IS NULL THEN v_starting := 0; END IF;

    -- Boardings at subsequent stops:
    -- boarded_at_i = max(0, total[i] - (total[i-1] - COALESCE(alighted[i], 0)))
    WITH ordered AS (
      SELECT stop_order, total_passengers, COALESCE(alighted, 0) AS alighted,
             LAG(total_passengers) OVER (ORDER BY stop_order) AS prev_total
      FROM counting_entries
      WHERE session_id = p_session_id AND direction = v_dir
      ORDER BY stop_order
    )
    SELECT COALESCE(SUM(GREATEST(0, total_passengers - (COALESCE(prev_total, total_passengers) - alighted))), 0)
      INTO v_boardings
    FROM ordered
    WHERE stop_order > 1;

    -- Short passengers (ended their trip on entries of this direction)
    SELECT COALESCE(SUM(sp.passenger_count), 0)
      INTO v_shorts
    FROM counting_short_passengers sp
    JOIN counting_entries ce ON ce.id = sp.entry_id
    WHERE ce.session_id = p_session_id AND ce.direction = v_dir;

    v_total := v_total + v_starting + COALESCE(v_boardings, 0) + COALESCE(v_shorts, 0);
  END LOOP;

  RETURN v_total;
END;
$$;

-- ─── 3. Function: passenger-kilometers per session (tur + retur) ───
-- Formula: sum over tronsons [stop_i -> stop_i+1] of (km_diff * total_passengers[i])
CREATE OR REPLACE FUNCTION compute_passenger_km(p_session_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total numeric := 0;
BEGIN
  WITH tronsons AS (
    SELECT
      direction,
      stop_order,
      total_passengers,
      km_from_start,
      LEAD(km_from_start) OVER (PARTITION BY direction ORDER BY stop_order) AS next_km
    FROM counting_entries
    WHERE session_id = p_session_id
  )
  SELECT COALESCE(SUM((next_km - km_from_start) * total_passengers), 0)
    INTO v_total
  FROM tronsons
  WHERE next_km IS NOT NULL;

  RETURN ROUND(v_total, 2);
END;
$$;

-- ─── 4. Function: route length (km), both directions (tur + retur) ───
-- Derives from counting_entries.km_from_start which has real km values.
-- crm_stop_prices uses tariff-step distances, not absolute km, so we avoid it.
CREATE OR REPLACE FUNCTION get_route_length_km(p_crm_route_id integer)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT ROUND(COALESCE(SUM(dir_max), 0)::numeric, 2)
  FROM (
    SELECT ce.direction, AVG(max_km) AS dir_max
    FROM (
      SELECT ce2.session_id, ce2.direction, MAX(ce2.km_from_start) AS max_km
      FROM counting_entries ce2
      JOIN counting_sessions cs ON cs.id = ce2.session_id
      WHERE cs.crm_route_id = p_crm_route_id AND cs.status = 'completed'
      GROUP BY ce2.session_id, ce2.direction
    ) per_session
    JOIN counting_entries ce ON ce.session_id = per_session.session_id AND ce.direction = per_session.direction
    GROUP BY ce.direction
  ) dir_avgs;
$$;

-- ─── 5. View: session metrics (extends v_session_full) ───
-- One row per completed session with all computed metrics.
CREATE OR REPLACE VIEW v_session_metrics AS
SELECT
  vsf.*,
  compute_unique_passengers(vsf.session_id) AS unique_passengers,
  compute_passenger_km(vsf.session_id) AS passenger_km,
  get_route_length_km(vsf.crm_route_id) AS route_length_km,
  CASE
    WHEN get_route_length_km(vsf.crm_route_id) > 0 THEN
      ROUND((vsf.total_lei / NULLIF(get_route_length_km(vsf.crm_route_id), 0))::numeric, 2)
    ELSE NULL
  END AS revenue_per_km,
  CASE
    WHEN get_route_length_km(vsf.crm_route_id) > 0 THEN
      ROUND((compute_passenger_km(vsf.session_id) /
             NULLIF(get_route_length_km(vsf.crm_route_id) *
                    (SELECT value::numeric FROM app_config WHERE key = 'bus_seat_capacity'), 0) * 100)::numeric, 1)
    ELSE NULL
  END AS load_factor_pct
FROM v_session_full vsf;

-- ─── 6. Helpful indexes ───
CREATE INDEX IF NOT EXISTS idx_counting_entries_session_direction_order
  ON counting_entries(session_id, direction, stop_order);

CREATE INDEX IF NOT EXISTS idx_counting_short_passengers_entry
  ON counting_short_passengers(entry_id);
