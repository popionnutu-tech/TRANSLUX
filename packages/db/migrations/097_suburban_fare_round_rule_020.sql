-- 097: Suburban — regula de rotunjire 0.20 (decizie business 11.06.2026)
--
-- Tariful unui pasager pe un tronson se rotunjește la leu întreg după regula:
--   fracțiune ≤ 0.20 bani → în jos, > 0.20 → în sus (7.02→7, 7.20→7, 7.25→8).
-- Identic cu suburbanFareRound() din apps/admin .../numarare/calculation.ts.
--
-- Această migrare are 3 părți (aplicate live pe zqkzqpfdymddsywxjxow):
--   A. aliniază counting_entries.km_from_start la km actuali din orar
--      (direction-aware; repară tronsoanele retur 0 km salvate înainte de 08.06);
--   B. recalculează counting_sessions.tur_total_lei pe toate sesiunile suburbane;
--   C. rescrie funcția trigger recompute_suburban_session_total cu ACEEAȘI regulă
--      per-tronson (înainte folosea formula veche SUM(pax×km)×rate rotunjit o dată).
--      CRITIC: funcția trigger trebuie ținută mereu în sincron cu suburbanFareRound,
--      altfel la fiecare salvare de cursă suburbană suma corectă e suprascrisă cu cea veche.

-- ── A: km_from_start ← km actuali din orar (doar suburban) ──
WITH sched_stops AS (
  SELECT ss.schedule_id, ss.stop_order, s.direction,
    COALESCE(sp.km_from_nord, 0)::numeric AS seg,
    ROW_NUMBER() OVER (PARTITION BY ss.schedule_id ORDER BY ss.stop_order) AS rn
  FROM crm_route_schedule_stops ss
  JOIN crm_route_schedules s ON s.id = ss.schedule_id
  JOIN crm_stop_prices sp ON sp.id = ss.stop_id
),
cum AS (
  SELECT schedule_id, stop_order,
    ROUND((CASE WHEN direction = 'retur'
      THEN COALESCE(SUM(seg) OVER (PARTITION BY schedule_id ORDER BY rn ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)
      ELSE SUM(CASE WHEN rn > 1 THEN seg ELSE 0 END) OVER (PARTITION BY schedule_id ORDER BY rn)
    END) * 10) / 10 AS km_cur
  FROM sched_stops
)
UPDATE counting_entries e
SET km_from_start = c.km_cur
FROM cum c, counting_sessions cs, crm_routes r
WHERE e.schedule_id = c.schedule_id AND e.stop_order = c.stop_order
  AND cs.id = e.session_id AND r.id = cs.crm_route_id
  AND r.route_type = 'suburban'
  AND e.km_from_start IS DISTINCT FROM c.km_cur;

-- ── C: funcția trigger cu regula 0.20 per-tronson ──
CREATE OR REPLACE FUNCTION public.recompute_suburban_session_total(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_route_type text;
  v_date date;
  v_rate numeric;
  v_total numeric;
BEGIN
  SELECT r.route_type, cs.assignment_date INTO v_route_type, v_date
  FROM counting_sessions cs JOIN crm_routes r ON r.id = cs.crm_route_id
  WHERE cs.id = p_session_id;

  IF v_route_type IS DISTINCT FROM 'suburban' THEN RETURN; END IF;

  SELECT rate_suburban INTO v_rate FROM tariff_periods
  WHERE v_date BETWEEN period_start AND period_end
  ORDER BY period_start DESC LIMIT 1;

  IF v_rate IS NULL OR v_rate = 0 THEN RETURN; END IF;

  WITH ordered AS (
    SELECT ce.km_from_start::numeric AS km, ce.total_passengers,
           COALESCE(ce.alighted, 0) AS alighted,
           LEAD(ce.km_from_start::numeric) OVER w AS next_km,
           LAG(ce.km_from_start::numeric)  OVER w AS prev_km
    FROM counting_entries ce
    WHERE ce.session_id = p_session_id
    WINDOW w AS (PARTITION BY ce.schedule_id, ce.cycle_number ORDER BY ce.stop_order)
  ),
  per_tronson AS (
    SELECT
      (CASE WHEN next_km IS NOT NULL THEN total_passengers * (
         floor(round(abs(next_km - km) * v_rate * 100) / 100)
         + CASE WHEN mod(round(abs(next_km - km) * v_rate * 100), 100::numeric) > 20 THEN 1 ELSE 0 END
       ) ELSE 0 END)
      +
      (CASE WHEN prev_km IS NOT NULL THEN alighted * (
         floor(round(abs(km - prev_km) * v_rate * 100) / 100)
         + CASE WHEN mod(round(abs(km - prev_km) * v_rate * 100), 100::numeric) > 20 THEN 1 ELSE 0 END
       ) ELSE 0 END) AS lei
    FROM ordered
  )
  SELECT COALESCE(SUM(lei), 0) INTO v_total FROM per_tronson;

  UPDATE counting_sessions
  SET tur_total_lei = ROUND(v_total), retur_total_lei = 0
  WHERE id = p_session_id
    AND COALESCE(tur_total_lei, -1) IS DISTINCT FROM ROUND(v_total);
END;
$function$;

-- ── B: recalcul totaluri pe toate sesiunile suburbane (via funcția de mai sus) ──
SELECT public.recompute_suburban_session_total(cs.id)
FROM counting_sessions cs
JOIN crm_routes r ON r.id = cs.crm_route_id
WHERE r.route_type = 'suburban';
