-- ============================================================================
-- MODUL LDE — km/zi: aceleași reguli de plauzibilitate și la ÎNVĂȚARE, nu doar la citire.
--
-- Regresia 10.07.2026 (reparată în worker 13.08, km-core.mjs): cârpirea sărea la
-- orice tremurat GPS, iar tronsoanele-buclă din lde_route_legs_coord (capete la
-- <2 km, km_real_median 100–180 km — ture întregi dus-întors) puneau zeci de km
-- la fiecare tremurat. Flota: 2.15 mln km în iulie față de ~1.03 mln reali.
--
-- Fixul din worker filtrează la CITIRE. Migrația asta închide cealaltă jumătate:
--   1. RPC-ul nu mai învață tronsoane implauzibile (km > 2.5 × linia dreaptă + 2)
--      — altfel buclele reapar în fiecare noapte și fixul ține doar cât ține filtrul.
--   2. 'gps_filtrat' = tronson măsurat curat, dar peste puncte aruncate ca glitch:
--      km-ul e bun de raportat, dar NU e etalon de învățat.
--   3. gps_points_dropped — câte puncte a aruncat worker-ul în ziua respectivă.
--      Fără el, un tracker stricat devine invizibil: km-ul iese curat, dar nimeni
--      nu mai vede că jumătate din puncte erau gunoi.
--   4. work_mem = 64MB pe funcție — sortarea din refresh se ducea pe disc.
--      ATENȚIE (măsurat 13.08): `SET statement_timeout` pe funcție NU are efect —
--      cronometrul e armat la începutul comenzii și nu se re-citește când se
--      schimbă GUC-ul înăuntru; plafonul rolului `authenticator` (8 s) rămâne în
--      vigoare. Îl lăsăm scris doar ca urmă a intenției. Nu e o problemă azi:
--      RPC-ul rulează în ~0.5 s (cele „2–3.5 s" erau artefactul EXPLAIN ANALYZE,
--      care umflă de ~10×); 8 s se ating abia pe la ~1.3 mln rânduri de opriri.
--      Când se apropie, refresh-ul se cheamă pe conexiunea pg directă a
--      worker-ului, nu prin PostgREST.
-- ============================================================================

BEGIN;

ALTER TABLE lde_vehicle_gps_daily
  ADD COLUMN IF NOT EXISTS gps_points_dropped integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN lde_vehicle_gps_daily.gps_points_dropped IS 'Puncte GPS aruncate ca glitch (săritură fără gaură de semnal). Pondere mare = tracker de verificat, chiar dacă km_total arată curat.';

ALTER TABLE lde_gps_stops DROP CONSTRAINT lde_gps_stops_km_from_prev_source_check;
ALTER TABLE lde_gps_stops ADD CONSTRAINT lde_gps_stops_km_from_prev_source_check
  CHECK (km_from_prev_source IN ('gps', 'gps_filtrat', 'leg_db', 'leg_coord', 'straight_line'));

COMMENT ON TABLE lde_gps_stops IS 'Baza reală de opriri din GPS: per mașină/zi, în ordine. Sursă pentru km detaliat + învățarea tronsoanelor (lde_route_legs, lde_route_legs_coord). km_from_prev_source: gps=măsurat curat (singurul care se învață), gps_filtrat=măsurat peste puncte aruncate ca glitch, leg_coord=cârpit pe coordonate (migrația 227), leg_db=cârpit pe nume, straight_line=provizoriu.';

-- Aceeași agregare ca în migrația 228, plus filtrul de plauzibilitate: un drum nu
-- poate fi de 2.5 ori mai lung decât linia dreaptă dintre capete (+2 km toleranță
-- pentru tronsoanele scurte din localitate). Pragul e identic cu MAX_DETOUR din
-- lde-geo-worker/km-core.mjs — dacă se schimbă acolo, se schimbă și aici.
CREATE OR REPLACE FUNCTION lde_refresh_route_legs_coord() RETURNS integer
LANGUAGE sql
SET statement_timeout = '60s'
SET work_mem = '64MB'
AS $$
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
    -- buclele (tur dus-întors în același punct) sunt km reali, dar nu sunt tronsoane:
    -- lipite pe o gaură de semnal ele au fost sursa regresiei din 10.07
    AND km_from_prev <= 2.5 * (
      6371 * 2 * asin(sqrt(
        power(sin(radians(lat - flat) / 2), 2) +
        cos(radians(flat)) * cos(radians(lat)) * power(sin(radians(lon - flon) / 2), 2)
      ))
    ) + 2
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
  -- fără no-op: rescrierea a ~9k rânduri neschimbate pe noapte = churn/bloat degeaba
  WHERE lde_route_legs_coord.km_real_median IS DISTINCT FROM excluded.km_real_median
     OR lde_route_legs_coord.observations   IS DISTINCT FROM excluded.observations
  RETURNING 1
)
SELECT count(*)::int FROM up;
$$;

REVOKE ALL ON FUNCTION lde_refresh_route_legs_coord() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_refresh_route_legs_coord() TO service_role;

-- tronsoanele-buclă deja învățate (1144 rânduri la 13.08) nu mai au ce căuta în
-- referință: worker-ul le refuză oricum, iar RPC-ul nu le mai re-creează
DELETE FROM lde_route_legs_coord
WHERE km_real_median > 2.5 * (
  6371 * 2 * asin(sqrt(
    power(sin(radians(to_lat - from_lat) / 2), 2) +
    cos(radians(from_lat)) * cos(radians(to_lat)) * power(sin(radians(to_lon - from_lon) / 2), 2)
  ))
) + 2;

COMMIT;
