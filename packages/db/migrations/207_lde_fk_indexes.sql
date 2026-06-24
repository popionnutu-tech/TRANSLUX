-- ============================================================================
-- MODUL LDE — indexuri FK lipsă (performance fix din review 22.06)
--
-- Probleme identificate de performance-reviewer pe migrațiile 203/205/206:
--   • FK fără index → DELETE pe parent face seq-scan pe child
--   • Rapoarte „per șofer / per cursă / per vehicul" → seq-scan complet
--   • La 96k+ rânduri/an în lde_daily_route_execution + multe events per rând,
--     un DELETE simplu devine secunde de scan
--
-- Indexuri parțiale (WHERE col IS NOT NULL) pentru FK-uri nullable —
-- evită bloat-ul de NULL-uri și păstrează indexul compact.
-- ============================================================================

BEGIN;

-- ── 203: lde_active_assignments.route_id (FK SET NULL, fără index) ──
-- Acoperă DELETE pe lde_factory_routes + reverse lookup „cine e atribuit la cursa X acum"
CREATE INDEX IF NOT EXISTS idx_lde_active_assignments_route_active
  ON lde_active_assignments(route_id)
  WHERE valid_to IS NULL AND route_id IS NOT NULL;

-- ── 205: lde_fuel_alimentari.driver_id (FK SET NULL, fără index) ──
-- Engine cronic_pattern: șofer cu „mereu numerar/mereu card" — citește pe driver_id
CREATE INDEX IF NOT EXISTS idx_lde_fuel_alimentari_driver_at
  ON lde_fuel_alimentari(driver_id, alimentat_at DESC)
  WHERE driver_id IS NOT NULL;

-- ── 205: lde_dt_drivers_window.driver_id (PK e (alert,driver) → leftmost=alert) ──
-- Hot path „fișa șoferului → toate alertele DT care îl implică"
CREATE INDEX IF NOT EXISTS idx_lde_dt_drivers_window_driver
  ON lde_dt_drivers_window(driver_id);

-- ── 206: lde_deviation_events.daily_execution_id (FK CASCADE, fără index) ──
-- CRITIC: DELETE pe lde_daily_route_execution face seq-scan; la 50k+ events = secunde
CREATE INDEX IF NOT EXISTS idx_lde_deviation_events_execution
  ON lde_deviation_events(daily_execution_id);

-- ── 206: lde_deviation_events.driver_id (rapoarte per șofer) ──
CREATE INDEX IF NOT EXISTS idx_lde_deviation_events_driver_detected
  ON lde_deviation_events(driver_id, detected_at DESC)
  WHERE driver_id IS NOT NULL;

-- ── 206: lde_daily_route_execution.driver_id + .route_id (ambele FK fără index) ──
-- La 96k rânduri/an: „câte curse a făcut șoferul X" / „cine a făcut cursa Y luna asta"
CREATE INDEX IF NOT EXISTS idx_lde_daily_route_execution_driver_date
  ON lde_daily_route_execution(driver_id, date DESC)
  WHERE driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lde_daily_route_execution_route_date
  ON lde_daily_route_execution(route_id, date DESC)
  WHERE route_id IS NOT NULL;

-- ── 206: lde_daily_route_execution.vehicle_id (FK RESTRICT, fără index dedicat) ──
-- Indexul existent (date, vehicle_id) are date leftmost → nu acoperă lookup pe vehicle_id singur.
-- Acoperă FK RESTRICT check + hot-path „toate execuțiile mașinii X în perioada Y".
CREATE INDEX IF NOT EXISTS idx_lde_daily_route_execution_vehicle_date
  ON lde_daily_route_execution(vehicle_id, date DESC);

-- ── 203: indexuri NEpartiale pentru FK CASCADE/SET NULL pe istoric ──
-- Indexurile parțiale (WHERE valid_to IS NULL) NU acoperă DELETE pe parent (drivers/vehicles/routes)
-- fiindcă Postgres trebuie să găsească TOATE rândurile (inclusiv istoric valid_to NOT NULL).
-- Cost mic (~5k rânduri/an istoric × 58 șoferi); DELETE-uri admin de șofer/mașină sunt rare dar lente garantat fără asta.
CREATE INDEX IF NOT EXISTS idx_lde_active_assignments_driver
  ON lde_active_assignments(driver_id);

CREATE INDEX IF NOT EXISTS idx_lde_active_assignments_vehicle
  ON lde_active_assignments(vehicle_id);

CREATE INDEX IF NOT EXISTS idx_lde_active_assignments_route
  ON lde_active_assignments(route_id)
  WHERE route_id IS NOT NULL;

-- ============================================================================
-- TODO retenție (NU se aplică acum, doar comentariu pentru future me):
--
-- • lde_speed_events: la 5 ani × ~200k/an = 1M rânduri → greoi
--   Plan: cron lunar `DELETE FROM lde_speed_events WHERE event_at < now() - interval '18 months'`
--   sau pg_partman partition monthly pe event_at. Decizie în 12-18 luni.
--
-- • lde_deviation_events.gps_segment_geojson (JSONB, 1-10 KB/rând):
--   La drill-down se încarcă; la listă NU. Audit în actions/queries:
--   `.select('id, vehicle_id, driver_id, deviation_km, level, detected_at, status')`
--   (fără gps_segment_geojson). Geometria veche de 1+ an poate fi ștearsă.
--
-- • lde_route_geometry.stops_resolved (JSONB): GIN index doar dacă apar query-uri
--   pe „cursele care trec prin localitatea Y". Acum NU e nevoie (Faza 4).
-- ============================================================================

COMMIT;
