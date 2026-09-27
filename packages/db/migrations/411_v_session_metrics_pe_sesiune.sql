-- 411_v_session_metrics_pe_sesiune.sql — v_session_metrics calculează doar sesiunile cerute (ION-104, Ion 27.09.2026:
-- «tare greu trece de la 3 la 7 și la alt număr de zile»).
-- Vechea formă avea CTE-ul per_session_per_dir folosit de două ori, deci materializat: la orice interogare
-- (chiar «ultimele 30 de zile») rula funcțiile fereastră peste TOATE cele 413.000 de counting_entries și
-- suma pasagerilor scurți peste tot counting_short_passengers — 6,6 s pe apel, iar Overview-ul din /analytics
-- îl cheamă de 5 ori. Acum aceeași aritmetică stă într-un LATERAL pe sesiune, deci filtrul pe
-- assignment_date ajunge înaintea calculului. Coloanele, ordinea, tipurile și formulele sunt aceleași;
-- ieșirea verificată rând cu rând (EXCEPT în ambele sensuri) contra formei vechi înainte de înlocuire.
BEGIN;

CREATE OR REPLACE VIEW v_session_metrics WITH (security_invoker = true) AS
WITH capacity AS (
  SELECT app_config.value::numeric AS cap FROM app_config WHERE app_config.key = 'bus_seat_capacity'::text
)
SELECT vsf.session_id,
  vsf.assignment_date,
  vsf.crm_route_id,
  vsf.route_name,
  vsf.time_chisinau,
  vsf.time_nord,
  vsf.route_type,
  vsf.driver_id,
  vsf.driver_name,
  vsf.vehicle_id,
  vsf.plate_number,
  vsf.total_passengers,
  vsf.total_lei,
  vsf.tur_passengers,
  vsf.retur_passengers,
  vsf.tur_total_lei,
  vsf.retur_total_lei,
  vsf.dow,
  vsf.month_num,
  vsf.season,
  vsf.rain_heavy,
  (COALESCE(ps.unique_long_pax, 0::numeric) + COALESCE(s.shorts, 0::bigint)::numeric)::integer AS unique_passengers,
  round(COALESCE(ps.passenger_km, 0::numeric), 2) AS passenger_km,
  round(COALESCE(ps.route_length_km, 0::numeric), 2) AS route_length_km,
  CASE
    WHEN COALESCE(ps.route_length_km, 0::numeric) > 0::numeric THEN round(vsf.total_lei::numeric / ps.route_length_km, 2)
    ELSE NULL::numeric
  END AS revenue_per_km,
  CASE
    WHEN COALESCE(ps.route_length_km, 0::numeric) > 0::numeric AND ((SELECT capacity.cap FROM capacity)) > 0::numeric
      THEN round(ps.passenger_km / (ps.route_length_km * ((SELECT capacity.cap FROM capacity))) * 100::numeric, 1)
    ELSE NULL::numeric
  END AS load_factor_pct,
  round(COALESCE(ps.tur_pkm, 0::numeric), 2) AS tur_passenger_km,
  round(COALESCE(ps.retur_pkm, 0::numeric), 2) AS retur_passenger_km,
  round(COALESCE(ps.tur_length_km, 0::numeric), 2) AS tur_length_km,
  round(COALESCE(ps.retur_length_km, 0::numeric), 2) AS retur_length_km,
  CASE
    WHEN COALESCE(ps.tur_length_km, 0::numeric) > 0::numeric AND ((SELECT capacity.cap FROM capacity)) > 0::numeric
      THEN round(ps.tur_pkm / (ps.tur_length_km * ((SELECT capacity.cap FROM capacity))) * 100::numeric, 1)
    ELSE NULL::numeric
  END AS tur_load_factor_pct,
  CASE
    WHEN COALESCE(ps.retur_length_km, 0::numeric) > 0::numeric AND ((SELECT capacity.cap FROM capacity)) > 0::numeric
      THEN round(ps.retur_pkm / (ps.retur_length_km * ((SELECT capacity.cap FROM capacity))) * 100::numeric, 1)
    ELSE NULL::numeric
  END AS retur_load_factor_pct
FROM v_session_full vsf
-- pe sesiune: întâi pe direcție (urcați, lungime, pasageri·km), apoi suma și pivotul tur/retur
LEFT JOIN LATERAL (
  SELECT
    sum(d.starting_pax + d.boardings) AS unique_long_pax,
    sum(d.dir_length_km) AS route_length_km,
    sum(d.pkm) AS passenger_km,
    max(CASE WHEN d.direction::text = 'tur'::text THEN d.dir_length_km ELSE NULL::numeric END) AS tur_length_km,
    max(CASE WHEN d.direction::text = 'retur'::text THEN d.dir_length_km ELSE NULL::numeric END) AS retur_length_km,
    max(CASE WHEN d.direction::text = 'tur'::text THEN d.pkm ELSE NULL::numeric END) AS tur_pkm,
    max(CASE WHEN d.direction::text = 'retur'::text THEN d.pkm ELSE NULL::numeric END) AS retur_pkm
  FROM (
    SELECT e.direction,
      max(CASE WHEN e.stop_order = 1 THEN e.total_passengers ELSE 0 END) AS starting_pax,
      COALESCE(sum(CASE WHEN e.stop_order > 1
        THEN GREATEST(0, e.total_passengers - (COALESCE(e.prev_total, e.total_passengers) - e.alighted)) ELSE 0 END), 0::bigint) AS boardings,
      max(e.km_from_start) AS dir_length_km,
      COALESCE(sum(CASE WHEN e.next_km IS NOT NULL
        THEN (e.next_km - e.km_from_start) * e.total_passengers::numeric ELSE 0::numeric END), 0::numeric) AS pkm
    FROM (
      SELECT ce.direction, ce.stop_order, ce.total_passengers,
        COALESCE(ce.alighted, 0) AS alighted,
        lag(ce.total_passengers) OVER (PARTITION BY ce.direction ORDER BY ce.stop_order) AS prev_total,
        lead(ce.km_from_start) OVER (PARTITION BY ce.direction ORDER BY ce.stop_order) AS next_km,
        ce.km_from_start
      FROM counting_entries ce
      WHERE ce.session_id = vsf.session_id
    ) e
    GROUP BY e.direction
  ) d
) ps ON true
LEFT JOIN LATERAL (
  SELECT sum(sp.passenger_count) AS shorts
  FROM counting_entries ce
  JOIN counting_short_passengers sp ON sp.entry_id = ce.id
  WHERE ce.session_id = vsf.session_id
) s ON true;

COMMIT;
