-- ============================================================================
-- MODUL LDE — marsrut + abateri + viteză
-- Geometria curselor (polimorfic: uzine factory + interurban + suburban),
-- execuția zilnică (planned vs actual km, completion), abateri detectate,
-- evenimente de depășire viteză, alert lunar pentru abateri repetitive,
-- și locațiile de parcare (geofence).
--
-- Surse:
--   /Users/ionpop/Downloads/Sinteza-interviuri-autopark.md
--   /tmp/analyst_full.txt (interviu analist, 2020 linii)
--   /Users/ionpop/Downloads/Interviu-proprietar-ala.md
--
-- Pattern: prefix lde_*, RLS ENABLE la sfârșit (aliniat cu 015_enable_rls +
-- 201_piese_views_hardening + 203_lde_phase1_foundation).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. lde_route_geometry — POLIMORFIC pentru factory + interurban + suburban
-- ============================================================================
-- Geometria (GeoJSON) + opririle rezolvate + km estimat — generate Valhalla/OSRM
-- sau editate manual de admin. PRIMARY KEY compus (route_kind, route_id) —
-- NU foreign key, fiindcă route_id poate fi din 3 tabele diferite (lde_factory_routes,
-- interurban_v2_*, suburban_*). Integritatea referențială rămâne în mâna aplicației.
CREATE TABLE IF NOT EXISTS lde_route_geometry (
  route_kind text NOT NULL CHECK (route_kind IN ('uzina_factory', 'interurban_v2', 'suburban')),
  route_id uuid NOT NULL,                              -- polimorfic; NU foreign key
  geometry_source text NOT NULL DEFAULT 'valhalla_auto'
    CHECK (geometry_source IN ('valhalla_auto', 'osrm_auto', 'admin_manual')),
  geometry_geojson jsonb,                              -- LineString cu coordonate
  stops_resolved jsonb,                                -- listă opriri cu coords + ETA
  total_km_estimated numeric(7,2),
  generated_at timestamptz,
  manually_edited boolean NOT NULL DEFAULT false,
  notes text,
  PRIMARY KEY (route_kind, route_id)
);

COMMENT ON TABLE lde_route_geometry IS 'Geometrie polimorfică pentru curse (factory + interurban + suburban). route_id e uuid dar NU foreign key — integritatea o ține aplicația. Sursă: Valhalla/OSRM auto sau editare manuală admin.';

-- ============================================================================
-- 2. lde_daily_route_execution — execuția zilnică (planned vs actual)
-- ============================================================================
-- O rândă per (zi, mașină, schimb): câți km a făcut efectiv, dacă a terminat
-- cursa, motivul când e neterminată. Sursă: GPS + intrare admin.
CREATE TABLE IF NOT EXISTS lde_daily_route_execution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  route_kind text NOT NULL CHECK (route_kind IN ('uzina_factory', 'interurban_v2', 'suburban')),
  route_id uuid,                                       -- polimorfic (poate fi NULL la cursă anulată)
  shift_number int CHECK (shift_number IN (1, 2, 3)),
  planned_km numeric(7,2),
  actual_km numeric(7,2),
  matched_to_geometry boolean NOT NULL DEFAULT false,  -- true = GPS-ul s-a aliniat cu lde_route_geometry
  completion_status text NOT NULL DEFAULT 'no_data'
    CHECK (completion_status IN ('completed', 'unfinished', 'cancelled', 'no_data')),
  unfinished_reason text
    CHECK (unfinished_reason IN ('defectiune_masina', 'boala_sofer', 'cursa_anulata', 'accident', 'meteo', 'altul')),
  unfinished_notes text,
  entered_by_admin_id uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lde_daily_route_execution_date_vehicle
  ON lde_daily_route_execution(date, vehicle_id);

-- Index PARȚIAL doar pentru curse neterminate (hot path pentru rapoarte admin)
CREATE INDEX IF NOT EXISTS idx_lde_daily_route_execution_unfinished
  ON lde_daily_route_execution(date, vehicle_id)
  WHERE completion_status = 'unfinished';

COMMENT ON TABLE lde_daily_route_execution IS 'Execuția zilnică a curselor: planned vs actual km, completion status, motivul neterminării. O rândă per (zi, mașină, schimb).';

-- ============================================================================
-- 3. lde_deviation_events — abateri detectate (GPS != geometrie planificată)
-- ============================================================================
-- Eveniment de abatere: șoferul a deviat de la traseul planificat cu X km.
-- Trei nivele de severitate: subliniere (mic), suspect (mediu), alert (mare).
-- Status workflow: nou → in_analiza → sunat_sofer → raportat → rezolvat.
CREATE TABLE IF NOT EXISTS lde_deviation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_execution_id uuid NOT NULL REFERENCES lde_daily_route_execution(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  deviation_km numeric(6,2) NOT NULL,
  level text NOT NULL CHECK (level IN ('subliniere', 'suspect', 'alert')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  gps_segment_geojson jsonb,                           -- segmentul GPS al abaterii (~1-10 KB/row, vezi COMMENT mai jos)
  status text NOT NULL DEFAULT 'nou'
    CHECK (status IN ('nou', 'in_analiza', 'sunat_sofer', 'raportat', 'rezolvat')),
  decision_required_by text CHECK (decision_required_by IN ('analist', 'proprietar')),
  explanation text,                                    -- explicația șoferului / decizia
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lde_deviation_events_vehicle_detected
  ON lde_deviation_events(vehicle_id, detected_at DESC);

COMMENT ON TABLE lde_deviation_events IS 'Abateri detectate de la traseul planificat. Trei nivele (subliniere/suspect/alert). Workflow: nou → in_analiza → sunat_sofer → raportat → rezolvat.';
COMMENT ON COLUMN lde_deviation_events.gps_segment_geojson IS 'JSONB segment GPS (~1-10 KB per row). NICIODATĂ SELECT * în liste — folosește explicit lista de coloane (id, vehicle_id, driver_id, deviation_km, level, detected_at, status). Geometria se încarcă DOAR la drill-down detail.';

-- ============================================================================
-- 4. lde_speed_events — evenimente depășire viteză
-- ============================================================================
-- Punct GPS unde viteza efectivă a depășit limita drumului. Două nivele:
-- subliniere (mic) și alert (mare). Folosit pentru rapoarte per șofer + alerte.
CREATE TABLE IF NOT EXISTS lde_speed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  event_at timestamptz NOT NULL,
  lat numeric(10,7) NOT NULL,
  lon numeric(10,7) NOT NULL,
  actual_speed_kmh numeric(5,2) NOT NULL,
  limit_kmh numeric(5,2) NOT NULL,
  over_kmh numeric(5,2) NOT NULL,                      -- actual - limit (precomputat)
  level text NOT NULL CHECK (level IN ('subliniere', 'alert')),
  road_name text,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_lde_speed_events_vehicle_at
  ON lde_speed_events(vehicle_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_lde_speed_events_driver
  ON lde_speed_events(driver_id, event_at DESC);

COMMENT ON TABLE lde_speed_events IS 'Depășiri de viteză punctuale (GPS). Două nivele (subliniere/alert). Indexat pe driver pentru rapoarte lunare per șofer.';

-- ============================================================================
-- 5. lde_marsrut_repeat_alert — alert lunar pentru abateri repetitive
-- ============================================================================
-- Când un șofer acumulează multe abateri într-o lună, se emite un alert
-- pentru raportare la proprietar. UNIQUE (driver, lună) — un singur alert/lună.
CREATE TABLE IF NOT EXISTS lde_marsrut_repeat_alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  month_year date NOT NULL,                            -- primul al lunii (ex: 2026-06-01)
  deviation_count int NOT NULL,
  alert_triggered_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'nou'
    CHECK (status IN ('nou', 'raportat_proprietar', 'rezolvat')),
  UNIQUE (driver_id, month_year)                       -- UNIQUE acoperă și indexul pe driver_id (leftmost)
);

COMMENT ON TABLE lde_marsrut_repeat_alert IS 'Alert lunar când un șofer are abateri repetitive (count peste prag). O rândă per (șofer, lună). Status: nou → raportat_proprietar → rezolvat.';

-- ============================================================================
-- 6. lde_parking_locations — locații de parcare (geofence)
-- ============================================================================
-- Punctele unde mașinile parchează (baze + acasă + altul). Folosit pentru:
-- detecția "mașina e parcată la bază vs acasă", calcul km de la origine,
-- definiția punctelor de plecare schimb1/schimb2 din lde_driver_extras.
CREATE TABLE IF NOT EXISTS lde_parking_locations (
  id text PRIMARY KEY
    CHECK (id IN ('BRICENI', 'BALTI', 'UNGHENI', 'ORHEI', 'FLORESTI', 'HOME', 'OTHER')),
  display_name text NOT NULL,
  lat numeric(10,7),
  lon numeric(10,7),
  radius_m int NOT NULL DEFAULT 200,                   -- raza geofence în metri
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE lde_parking_locations IS 'Locații de parcare (geofence). Cele 5 baze + HOME (per șofer, lat/lon din driver_extras) + OTHER. radius_m = raza de detecție în metri. id CHECK list trebuie sincronizat cu lde_driver_extras.parking_location.';

-- ============================================================================
-- ROW LEVEL SECURITY (anon nu vede nimic; service_role bypassează)
-- Aliniat cu 015_enable_rls + 203_lde_phase1_foundation — pattern TRANSLUX standard
-- ============================================================================

ALTER TABLE lde_route_geometry ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_daily_route_execution ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_deviation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_speed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_marsrut_repeat_alert ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_parking_locations ENABLE ROW LEVEL SECURITY;

COMMIT;
