-- ============================================================================
-- LDE — dispecerat camioane (Ion, 31.08.2026)
-- Dispecerul planifică din memorie și greșește logistic: camionul din Bălți e
-- trimis la Constanța după diesel, iar cel din Chișinău la Berdichev după
-- biodiesel. Aici intră cursa ca unitate de planificare (multi-zi), nomenclatorul
-- punctelor cu coordonate, stările de zi (DOAR reparație/odihnă — decizia Ion)
-- și metricile calculate noaptea din GPS.
-- Flota rămâne discriminată de vehicles.directions @> {camioane} (de el depinde
-- lde-geo-worker/wialon-worker.mjs) — tabela vehicles NU se atinge, tipul
-- cisternă/zernovoz stă separat în lde_truck_profile.
-- «Fără șofer» NU e tip și NU e stare stocată: se derivă din lipsa unui rând
-- activ în lde_active_assignments; camionul iese din planificare, dar dacă GPS-ul
-- îi arată km substanțiali, kanbanul cere atribuirea unui șofer.
-- ============================================================================
BEGIN;

-- Rol nou pentru dispecer (tiparul 251_grafic_uzine.sql: drop + re-add cu lista completă)
ALTER TABLE admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_role_check;
ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_role_check CHECK (role IN (
  'ADMIN','DISPATCHER','GRAFIC','OPERATOR_CAMERE','ADMIN_CAMERE','EVALUATOR_INCASARI',
  'CONTABIL','DEPOZITAR','VINZATOR','MANAGER','GESTIONAR','UZINE','DISPECER'
));
COMMENT ON CONSTRAINT admin_accounts_role_check ON admin_accounts IS
  'DISPECER (31.08.2026): planifică cursele camioanelor în /lde/camioane; analitica rămâne la ADMIN.';

-- Tipul camionului. Tabel separat, nu coloană pe vehicles: vehicles e partajată
-- cu autobuzele și cu workerul GPS.
CREATE TABLE IF NOT EXISTS lde_truck_profile (
  vehicle_id uuid PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  fleet_type text NOT NULL CHECK (fleet_type IN ('cisterna','zernovoz')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
COMMENT ON TABLE lde_truck_profile IS 'Tipul camionului (cisternă/zernovoz). «Fără șofer» NU e tip — se derivă din lipsa unui rând activ în lde_active_assignments.';

-- Nomenclatorul punctelor de încărcare/descărcare.
CREATE TABLE IF NOT EXISTS lde_dispatch_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text,
  lat double precision,
  lng double precision,
  radius_m integer NOT NULL DEFAULT 500,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);
COMMENT ON TABLE lde_dispatch_points IS 'Puncte de încărcare/descărcare. Fără lat/lng punctul rămâne valid, dar cursele lui nu primesc metrici GPS (insignă «fără coordonate»).';
CREATE UNIQUE INDEX IF NOT EXISTS uq_lde_dispatch_points_name ON lde_dispatch_points (lower(name)) WHERE active;

-- Cursa: unitatea de planificare, poate ține mai multe zile.
CREATE TABLE IF NOT EXISTS lde_truck_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  cargo text,
  client text,
  load_point_id uuid REFERENCES lde_dispatch_points(id) ON DELETE RESTRICT,
  load_planned_at timestamptz NOT NULL,
  unload_point_id uuid REFERENCES lde_dispatch_points(id) ON DELETE RESTRICT,
  unload_planned_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'planificata' CHECK (status IN
    ('planificata','spre_incarcare','la_incarcare','spre_descarcare','la_descarcare','incheiata','anulata')),
  cancel_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT lde_truck_trips_window CHECK (unload_planned_at >= load_planned_at),
  CONSTRAINT lde_truck_trips_cancel_reason CHECK (status <> 'anulata' OR cancel_reason IS NOT NULL)
);
COMMENT ON TABLE lde_truck_trips IS 'Cursa camionului: încărcare → descărcare, multi-zi. Stările le mută MANUAL dispecerul (decizia Ion 31.08); GPS-ul verifică post-factum. Cursele nu se șterg — se anulează cu motiv.';
CREATE INDEX IF NOT EXISTS idx_lde_truck_trips_vehicle_time ON lde_truck_trips (vehicle_id, load_planned_at);
CREATE INDEX IF NOT EXISTS idx_lde_truck_trips_window ON lde_truck_trips (load_planned_at, unload_planned_at) WHERE status <> 'anulata';

-- Stările de zi în afara curselor.
CREATE TABLE IF NOT EXISTS lde_truck_day_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date date NOT NULL,
  state text NOT NULL CHECK (state IN ('reparatie','odihna')),
  reason text,
  expected_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);
COMMENT ON TABLE lde_truck_day_states IS 'Reparație / odihnă șofer pe zi. Alte stări NU există (decizia Ion 31.08).';
CREATE UNIQUE INDEX IF NOT EXISTS uq_lde_truck_day_states ON lde_truck_day_states (vehicle_id, date);

-- Metricile scrise de workerul nocturn.
CREATE TABLE IF NOT EXISTS lde_truck_trip_metrics (
  trip_id uuid PRIMARY KEY REFERENCES lde_truck_trips(id) ON DELETE CASCADE,
  km_real double precision,
  km_ideal double precision,
  km_deviation double precision,
  stops_over_30min integer,
  stops_detail jsonb,
  load_actual_at timestamptz,
  unload_actual_at timestamptz,
  load_delay_min integer,
  unload_delay_min integer,
  empty_km double precision,
  computed_at timestamptz NOT NULL DEFAULT now(),
  note text
);
COMMENT ON TABLE lde_truck_trip_metrics IS 'Adevărul GPS post-factum, o linie per cursă. km_ideal NULL = furnizor de rutare indisponibil (ROUTING_URL) — analitica scrie «traseu ideal indisponibil», nu inventează.';

-- RLS deny-all pe tot ce e nou (tiparul întregii scheme: backend-urile merg pe service_role).
ALTER TABLE lde_truck_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_dispatch_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_truck_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_truck_day_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_truck_trip_metrics ENABLE ROW LEVEL SECURITY;

COMMIT;
