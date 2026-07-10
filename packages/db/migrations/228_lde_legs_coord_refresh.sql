-- ============================================================================
-- MODUL LDE — (1) sursă nouă de cârpire 'leg_coord' + (2) refresh mediane coord.
--
-- Decizie Ion 10.07.2026 (review post-227):
-- 1. km_from_prev_source primește 'leg_coord' — cârpirea pe coordonate era
--    etichetată greșit 'leg_db'; pagina /lde/verificare-km va arăta sursa reală.
-- 2. lde_route_legs_coord NU se mai dotează incremental din worker (media
--    rulantă dubla observațiile la re-rulaj și transforma mediana în hibrid).
--    În loc: funcția lde_refresh_route_legs_coord() recalculează mediana REALĂ
--    din tot istoricul lde_gps_stops (~43k rânduri — sub-secundă). Idempotent:
--    re-rulajul unei zile (delete+insert stops) nu dublează nimic.
--    Worker-ul o cheamă o dată la finalul rulajului nocturn (RPC).
-- ============================================================================

BEGIN;

ALTER TABLE lde_gps_stops DROP CONSTRAINT lde_gps_stops_km_from_prev_source_check;
ALTER TABLE lde_gps_stops ADD CONSTRAINT lde_gps_stops_km_from_prev_source_check
  CHECK (km_from_prev_source IN ('gps', 'leg_db', 'leg_coord', 'straight_line'));

COMMENT ON TABLE lde_gps_stops IS 'Baza reală de opriri din GPS: per mașină/zi, în ordine. Sursă pentru km detaliat + învățarea tronsoanelor (lde_route_legs, lde_route_legs_coord). km_from_prev_source: gps=măsurat curat, leg_coord=cârpit pe coordonate (migrația 227), leg_db=cârpit pe nume, straight_line=provizoriu.';

-- Aceeași agregare ca backfill-ul din 227, dar cu DO UPDATE — sursa unică de
-- adevăr pentru medianele coord rămâne istoricul lde_gps_stops.
CREATE OR REPLACE FUNCTION lde_refresh_route_legs_coord() RETURNS integer
LANGUAGE sql AS $$
WITH legs AS (
  SELECT
    lag(s.lat)      OVER w AS flat,
    lag(s.lon)      OVER w AS flon,
    lag(s.locality) OVER w AS floc,
    s.lat, s.lon, s.locality, s.km_from_prev, s.km_from_prev_source, s.date
  FROM lde_gps_stops s
  WINDOW w AS (PARTITION BY s.vehicle_id, s.date ORDER BY s.seq)
), up AS (
  INSERT INTO lde_route_legs_coord
    (from_lat, from_lon, to_lat, to_lon, km_real_median, km_real_min, km_real_max,
     observations, from_locality, to_locality, last_observed_date)
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
  ON CONFLICT (from_lat, from_lon, to_lat, to_lon) DO UPDATE SET
    km_real_median     = excluded.km_real_median,
    km_real_min        = excluded.km_real_min,
    km_real_max        = excluded.km_real_max,
    observations       = excluded.observations,
    from_locality      = excluded.from_locality,
    to_locality        = excluded.to_locality,
    last_observed_date = excluded.last_observed_date,
    updated_at         = now()
  RETURNING 1
)
SELECT count(*)::int FROM up;
$$;

-- funcție de SCRIERE — doar worker-ul (service_role), nu prin API public
REVOKE ALL ON FUNCTION lde_refresh_route_legs_coord() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_refresh_route_legs_coord() TO service_role;

COMMIT;
