-- Suburban sessions stay on status='tur_done' when not all planned schedules
-- for the day have been counted (bus breakdown, cancelled run, operator forgot).
-- Their saved cycles still represent real collected revenue, so they must show
-- up in sales analytics. Interurban keeps the strict 'completed'-only rule,
-- because 'tur_done' there means retur is still pending.
CREATE OR REPLACE VIEW public.v_session_full AS
SELECT cs.id AS session_id,
    cs.assignment_date,
    cs.crm_route_id,
        CASE
            WHEN cr.route_type::text = 'suburban'::text THEN (cr.dest_to_ro::text || ' - '::text) || cr.dest_from_ro::text
            ELSE cr.dest_to_ro::text
        END::character varying(60) AS route_name,
    cr.time_chisinau,
    cr.time_nord,
    cr.route_type,
    cs.driver_id,
    d.full_name AS driver_name,
    cs.vehicle_id,
    v.plate_number,
    COALESCE(tur.pax, 0::bigint) + COALESCE(ret.pax, 0::bigint) AS total_passengers,
    COALESCE(cs.tur_total_lei, 0) + COALESCE(cs.retur_total_lei, 0) AS total_lei,
    COALESCE(tur.pax, 0::bigint) AS tur_passengers,
    COALESCE(ret.pax, 0::bigint) AS retur_passengers,
    cs.tur_total_lei,
    cs.retur_total_lei,
    EXTRACT(dow FROM cs.assignment_date)::integer AS dow,
    EXTRACT(month FROM cs.assignment_date)::integer AS month_num,
        CASE
            WHEN EXTRACT(month FROM cs.assignment_date) = ANY (ARRAY[12::numeric, 1::numeric, 2::numeric]) THEN 'winter'::text
            WHEN EXTRACT(month FROM cs.assignment_date) = ANY (ARRAY[3::numeric, 4::numeric, 5::numeric]) THEN 'spring'::text
            WHEN EXTRACT(month FROM cs.assignment_date) = ANY (ARRAY[6::numeric, 7::numeric, 8::numeric]) THEN 'summer'::text
            ELSE 'autumn'::text
        END AS season,
    COALESCE(w.rain_heavy, false) AS rain_heavy
   FROM counting_sessions cs
     JOIN crm_routes cr ON cr.id = cs.crm_route_id
     LEFT JOIN drivers d ON d.id = cs.driver_id
     LEFT JOIN vehicles v ON v.id = cs.vehicle_id
     LEFT JOIN daily_weather w ON w.date = cs.assignment_date
     LEFT JOIN LATERAL ( SELECT sum(counting_entries.total_passengers) AS pax
           FROM counting_entries
          WHERE counting_entries.session_id = cs.id AND counting_entries.direction::text = 'tur'::text) tur ON true
     LEFT JOIN LATERAL ( SELECT sum(counting_entries.total_passengers) AS pax
           FROM counting_entries
          WHERE counting_entries.session_id = cs.id AND counting_entries.direction::text = 'retur'::text) ret ON true
  WHERE cs.status::text = 'completed'::text
     OR (cs.status::text = 'tur_done'::text AND cr.route_type::text = 'suburban'::text);
