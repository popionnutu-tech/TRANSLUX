-- Backfill pentru sesiunile suburban salvate înainte de commit bc86eac
-- (fix(numarare): compute suburban total_lei on save). Ele au counting_entries
-- dar tur_total_lei este NULL, așa că sumele nu apar în listă și nici în
-- raportul de vânzări (view-ul v_session_full).
--
-- Formula e aceeași cu cea din computeSuburbanSessionTotal (actions.ts):
--   pentru fiecare (session, schedule, cycle) sortat pe stop_order:
--     TUR  = SUM(total_passengers[i] × (km[i+1] − km[i]))   pentru i=0..n−2
--     RETUR = SUM(alighted[i] × (km[i] − km[i−1]))          pentru i=1..n−1
--   total = (TUR + RETUR) × rate_suburban   (rotunjit la lei)
WITH ordered AS (
  SELECT
    ce.session_id,
    ce.km_from_start,
    ce.total_passengers,
    COALESCE(ce.alighted, 0) AS alighted,
    LEAD(ce.km_from_start) OVER w AS next_km,
    LAG(ce.km_from_start) OVER w AS prev_km
  FROM public.counting_entries ce
  WINDOW w AS (PARTITION BY ce.session_id, ce.schedule_id, ce.cycle_number ORDER BY ce.stop_order)
),
computed AS (
  SELECT
    o.session_id,
    SUM(
      CASE WHEN o.next_km IS NOT NULL THEN o.total_passengers * (o.next_km - o.km_from_start) ELSE 0 END
      + CASE WHEN o.prev_km IS NOT NULL THEN o.alighted * (o.km_from_start - o.prev_km) ELSE 0 END
    ) AS pkm
  FROM ordered o
  GROUP BY o.session_id
),
targets AS (
  SELECT
    cs.id AS session_id,
    ROUND(c.pkm * tp.rate_suburban)::integer AS new_total
  FROM public.counting_sessions cs
  JOIN public.crm_routes cr ON cr.id = cs.crm_route_id
  JOIN computed c ON c.session_id = cs.id
  JOIN public.tariff_periods tp
    ON cs.assignment_date BETWEEN tp.period_start AND COALESCE(tp.period_end, '9999-12-31')
  WHERE cr.route_type = 'suburban'
    AND cs.tur_total_lei IS NULL
)
UPDATE public.counting_sessions cs
SET
  tur_total_lei = t.new_total,
  retur_total_lei = 0
FROM targets t
WHERE cs.id = t.session_id;
