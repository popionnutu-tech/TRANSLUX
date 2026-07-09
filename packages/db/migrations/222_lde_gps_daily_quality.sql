-- ============================================================================
-- MODUL LDE — etapa 1 «km de încredere»: coloane de calitate pe km-ul zilnic.
--
-- Cerere Ion 09.07.2026: să se VADĂ că km-ul se numără corect la fiecare mașină
-- (mai ales când GPS-ul sare) și că informația se stochează.
--
--  • km_patched  = câți km din zi au fost cârpiți (teleport / gaură GPS,
--                  punte prin lde_route_legs sau linie dreaptă). 0 = zi curată.
--  • km_check    = verificare INDEPENDENTĂ a km_total: integrarea vitezei
--                  (Σ viteză×timp, dt plafonat 60s). Divergență mare vs km_total
--                  = zi suspectă, de revizuit.
--  • gps_points  = câte puncte GPS valide a avut ziua (context de calitate).
-- ============================================================================

BEGIN;

ALTER TABLE lde_vehicle_gps_daily
  ADD COLUMN IF NOT EXISTS km_patched numeric(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS km_check numeric(7,2),
  ADD COLUMN IF NOT EXISTS gps_points int;

COMMENT ON COLUMN lde_vehicle_gps_daily.km_patched IS 'Km cârpiți la sărituri/găuri GPS (leg_db/linie dreaptă). 0 = traseu curat. Pondere mare = încredere mică în km_total.';
COMMENT ON COLUMN lde_vehicle_gps_daily.km_check IS 'Verificare independentă: km din integrarea vitezei (Σ v×dt, dt≤60s). Divergență >15% vs km_total = zi de revizuit.';
COMMENT ON COLUMN lde_vehicle_gps_daily.gps_points IS 'Nr. puncte GPS valide în zi (după filtre bbox/timp).';

COMMIT;
