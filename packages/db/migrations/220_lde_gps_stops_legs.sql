-- ============================================================================
-- MODUL LDE — baza reală de opriri + tronsoane învățate (fără Valhalla)
--
-- Decizie Ion 24.06.2026: la etapa actuală NU folosim Valhalla. km-ul vine
-- direct din traseul GPS curat; iar când GPS-ul sare, folosim BAZA NOASTRĂ
-- reală (distanțe măsurate de noi pe zile curate). Vezi memoria lde-data-connectors.
--
-- Două tabele:
--  • lde_gps_stops  = baza detaliată: fiecare oprire per mașină/zi, în ordine.
--  • lde_route_legs = referința care se învață singură: distanța reală mediană
--    pe fiecare tronson „localitate A → B", agregată din lde_gps_stops (zile curate).
--    Folosită ca fallback când GPS-ul sare pe un tronson.
-- ============================================================================

BEGIN;

-- ── OPRIRI DETALIATE (baza reală, din GPS) ──
CREATE TABLE IF NOT EXISTS lde_gps_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  date date NOT NULL,
  seq int NOT NULL,                                    -- ordinea opririi în zi (1,2,3…)
  locality text,                                       -- numele localității (NULL = necunoscut/câmp)
  locality_dist_km numeric(6,2),                       -- cât de aproape de centrul localității
  lat numeric(10,7) NOT NULL,                          -- poziția reală a opririi
  lon numeric(10,7) NOT NULL,
  arrival_at timestamptz NOT NULL,
  departure_at timestamptz,
  dwell_min int,                                       -- cât a stat (minute)
  km_from_prev numeric(7,2),                           -- distanța reală de la oprirea anterioară
  km_from_prev_source text NOT NULL DEFAULT 'gps'
    CHECK (km_from_prev_source IN ('gps', 'leg_db', 'straight_line')),
  is_base boolean NOT NULL DEFAULT false,              -- baza/garajul/casa șoferului (ex: Țaul)
  gps_quality text NOT NULL DEFAULT 'clean'
    CHECK (gps_quality IN ('clean', 'patched')),
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, date, seq)                       -- UNIQUE acoperă și indexul de FK pe vehicle_id (leftmost)
);

CREATE INDEX IF NOT EXISTS idx_lde_gps_stops_locality ON lde_gps_stops(locality);
CREATE INDEX IF NOT EXISTS idx_lde_gps_stops_driver ON lde_gps_stops(driver_id);

COMMENT ON TABLE lde_gps_stops IS 'Baza reală de opriri din GPS: per mașină/zi, în ordine. Sursă pentru km detaliat + învățarea tronsoanelor (lde_route_legs). km_from_prev_source: gps=măsurat curat, leg_db=cârpit din baza noastră, straight_line=provizoriu.';

-- ── TRONSOANE ÎNVĂȚATE (referința auto-îmbunătățită) ──
CREATE TABLE IF NOT EXISTS lde_route_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_locality text NOT NULL,
  to_locality text NOT NULL,
  km_real_median numeric(7,2) NOT NULL,               -- distanța reală mediană (din zile curate)
  km_real_min numeric(7,2),
  km_real_max numeric(7,2),
  observations int NOT NULL DEFAULT 0,                 -- câte măsurători curate stau în spate
  last_observed_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_locality, to_locality)
);

COMMENT ON TABLE lde_route_legs IS 'Referința care se învață: distanța reală pe tronson „A → B", agregată din lde_gps_stops (zile cu GPS curat). Fallback când GPS-ul sare. Generic (per drum, nu per mașină) — toate mașinile contribuie la învățare. Recalculat de worker.';

-- ROW LEVEL SECURITY (anon nu vede nimic; service_role bypassează; admin via getSupabase; worker VPS scrie cu service_role)
ALTER TABLE lde_gps_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_route_legs ENABLE ROW LEVEL SECURITY;

COMMIT;
