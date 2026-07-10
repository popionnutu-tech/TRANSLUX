-- ============================================================================
-- MODUL LDE — tronsoane învățate pe COORDONATE (nu pe denumiri de localități).
--
-- Cerere Ion 10.07.2026: potrivirea pe nume e ambiguă (mai multe sate «Bucuria»)
-- și oarbă unde opririle n-au nume (38% la camioane — internațional). Ambele
-- sisteme GPS dau coordonate — cheia devine perechea de coordonate rotunjite
-- (3 zecimale ≈ 110 m), iar ORDINEA capetelor codifică sensul.
--
-- Numele de localități rămân doar etichete informative (mode() din istoric).
-- Backfill: tot istoricul lde_gps_stops, doar treceri GPS curate ≥ 0.5 km.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS lde_route_legs_coord (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_lat numeric(8,3) NOT NULL,
  from_lon numeric(8,3) NOT NULL,
  to_lat numeric(8,3) NOT NULL,
  to_lon numeric(8,3) NOT NULL,
  km_real_median numeric(7,2) NOT NULL,
  km_real_min numeric(7,2) NOT NULL,
  km_real_max numeric(7,2) NOT NULL,
  observations int NOT NULL,
  from_locality text,
  to_locality text,
  last_observed_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_lat, from_lon, to_lat, to_lon)
);

COMMENT ON TABLE lde_route_legs_coord IS 'Tronsoane învățate pe coordonate rotunjite (3 zecimale ≈ 110 m). Ordinea capetelor = sensul. Sursa: treceri GPS curate între opriri. Folosit la cârpirea găurilor GPS (căutare pe rază ~2 km la capete). Numele = doar etichete.';

-- Backfill din tot istoricul de opriri (doar leguri GPS curate, ≥ 0.5 km)
INSERT INTO lde_route_legs_coord
  (from_lat, from_lon, to_lat, to_lon, km_real_median, km_real_min, km_real_max,
   observations, from_locality, to_locality, last_observed_date)
WITH legs AS (
  SELECT
    lag(s.lat)      OVER w AS flat,
    lag(s.lon)      OVER w AS flon,
    lag(s.locality) OVER w AS floc,
    s.lat, s.lon, s.locality, s.km_from_prev, s.km_from_prev_source, s.date
  FROM lde_gps_stops s
  WINDOW w AS (PARTITION BY s.vehicle_id, s.date ORDER BY s.seq)
)
SELECT
  round(flat, 3), round(flon, 3), round(lat, 3), round(lon, 3),
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY km_from_prev)::numeric, 2),
  round(min(km_from_prev), 2),
  round(max(km_from_prev), 2),
  count(*)::int,
  mode() WITHIN GROUP (ORDER BY floc),
  mode() WITHIN GROUP (ORDER BY locality),
  max(date)
FROM legs
WHERE flat IS NOT NULL
  AND km_from_prev_source = 'gps'
  AND km_from_prev >= 0.5
GROUP BY 1, 2, 3, 4
ON CONFLICT (from_lat, from_lon, to_lat, to_lon) DO NOTHING;

COMMIT;
