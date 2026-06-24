-- ============================================================================
-- MODUL LDE — faza 1: fundament (autopark autobuze)
-- Înlocuiește softul vechi LDE v1. Modul în central-hub (apps/admin).
-- Surse: Sinteza-interviuri-autopark.md + Interviu-autopark-FINAL-v2-clava.docx
-- ============================================================================

BEGIN;

-- ── TIPURI DE MAȘINI + NORME (14 tipuri pasageri + 2 camioane) ──
CREATE TABLE IF NOT EXISTS lde_vehicle_types (
  id text PRIMARY KEY,                                 -- 'SPRINTER_312', 'DAF', 'CRAFTER', 'FORD', 'CEREALE', 'CISTERNA'
  display_name text NOT NULL,                          -- 'Sprinter 312', 'DAF', etc.
  category text NOT NULL CHECK (category IN ('microbuz', 'autobuz_mic', 'autobuz_mare', 'camion_marfa')),
  norm_l_per_100km numeric(5,2) NOT NULL,              -- norma de bază (pentru camioane = gol)
  norm_l_per_100km_loaded numeric(5,2),                -- doar camioane (încărcat)
  passenger_seats int,                                 -- NULL pentru camioane
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE lde_vehicle_types IS 'Cele 14 tipuri de mașini din autopark + 2 camioane. Norma e per tip, nu per mașină.';

-- ── OVERRIDE NORMĂ PER MAȘINĂ (36 mașini cu consum real măsurat) ──
CREATE TABLE IF NOT EXISTS lde_vehicle_norms (
  vehicle_id uuid PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  vehicle_type_id text NOT NULL REFERENCES lde_vehicle_types(id),
  measured_consumption_l_per_100km numeric(5,2) NOT NULL,
  measurement_date date,
  in_repair boolean NOT NULL DEFAULT false,
  override_reason text CHECK (override_reason IN ('reparatie_tehnica', 'actualizare_norma', 'verificare_norma')),
  override_notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lde_vehicle_norms_type ON lde_vehicle_norms(vehicle_type_id);

COMMENT ON TABLE lde_vehicle_norms IS 'Override per mașină când consumul real ≠ norma tipului. Cele 36 cazuri din interviu.';

-- ── UZINE (5) ──
CREATE TABLE IF NOT EXISTS lde_uzine (
  id text PRIMARY KEY,                                 -- 'DRAXELMAIER_BALTI', 'LEAR_UNGHENI', 'SEBN_ORHEI', 'TROX_BRICENI', 'LEAR_FLORESTI'
  display_name text NOT NULL,                          -- 'Draxelmaier-Bălți'
  city text NOT NULL,                                  -- 'Bălți'
  shift_pattern text NOT NULL CHECK (shift_pattern IN ('S1_FIXED', 'S1_S2_FIXED', 'S1_S2_S3_FIXED', 'WEEKLY_ROTATION', 'MONTHLY_ROTATION')),
  shift1_time text,                                    -- '07:00-15:30'
  shift2_time text,                                    -- '15:30-00:00'
  shift3_time text,                                    -- '23:00-06:00'
  works_saturday boolean NOT NULL DEFAULT false,       -- "la nevoie"
  works_sunday boolean NOT NULL DEFAULT false,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE lde_uzine IS 'Cele 5 fabrici: Draxelmaier, LEAR-U, SEBN, Trox, LEAR-F. shift_pattern + CHECK list (sincronizare obligatorie cu codul TS — vezi pattern translux_counting_status_enum_sync).';

-- ── CURSE UZINE (110 curse) ──
CREATE TABLE IF NOT EXISTS lde_factory_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uzina_id text NOT NULL REFERENCES lde_uzine(id) ON DELETE RESTRICT,
  route_number int NOT NULL,                           -- 1, 2, 3 ... per uzina
  stops_in_order text NOT NULL,                        -- "Dondușeni → Tîrnova → Maramonovca → Mîndîc" (Faza 1: text; Faza 3 ar putea fi normalizat în tabel separat)
  total_passengers int,                                -- total (când nu e specificat per schimb)
  has_shift1 boolean NOT NULL DEFAULT true,
  has_shift2 boolean NOT NULL DEFAULT false,
  has_shift3 boolean NOT NULL DEFAULT false,
  rotation_note text,                                  -- 'rotație săpt cu cursa X', 'rotație 3 săpt'
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (uzina_id, route_number)
);

CREATE INDEX IF NOT EXISTS idx_lde_factory_routes_uzina ON lde_factory_routes(uzina_id);

COMMENT ON TABLE lde_factory_routes IS 'Cele 110 curse uzine cu lista de localități + schimburi + total persoane.';

-- ── DETALII PER SCHIMB (persoane + autobuze) ──
CREATE TABLE IF NOT EXISTS lde_factory_route_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES lde_factory_routes(id) ON DELETE CASCADE,
  shift_number int NOT NULL CHECK (shift_number IN (1, 2, 3)),
  passengers_count int NOT NULL,
  notes text,
  UNIQUE (route_id, shift_number)                      -- UNIQUE acoperă și indexul de FK pe route_id (leftmost prefix)
);

COMMENT ON TABLE lde_factory_route_shifts IS 'Per schimb: câți pasageri + note (ex: rotație săpt cu route X).';

-- ── ATRIBUIRE AUTOBUZE LA SCHIMB ──
CREATE TABLE IF NOT EXISTS lde_factory_route_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_shift_id uuid NOT NULL REFERENCES lde_factory_route_shifts(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT true,
  rotation_note text,                                  -- 'rotație săpt', 'comasare cu cursa 22'
  UNIQUE (route_shift_id, vehicle_id)                  -- UNIQUE acoperă și indexul de FK pe route_shift_id
);

CREATE INDEX IF NOT EXISTS idx_lde_factory_route_vehicles_vehicle ON lde_factory_route_vehicles(vehicle_id);

-- O singură mașină principală per schimb
CREATE UNIQUE INDEX IF NOT EXISTS uq_lde_factory_route_vehicles_primary
  ON lde_factory_route_vehicles(route_shift_id) WHERE is_primary = true;

COMMENT ON TABLE lde_factory_route_vehicles IS 'Un schimb poate avea 1+ autobuze; un autobuz poate fi pe 2+ rute. Există exact 1 mașină primary per schimb.';

-- ── EXTENSII LA DRIVERS (locații + categoria de salariu LDE) ──
CREATE TABLE IF NOT EXISTS lde_driver_extras (
  driver_id uuid PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  uzina_id text REFERENCES lde_uzine(id) ON DELETE SET NULL,  -- NULL = interurban/suburban
  home_address text,
  home_lat numeric(10,7),                              -- via Photon geocoding
  home_lon numeric(10,7),
  parking_location text NOT NULL DEFAULT 'HOME'
    CHECK (parking_location IN ('HOME', 'BASE_BRICENI', 'BASE_BALTI', 'BASE_UNGHENI', 'BASE_ORHEI', 'BASE_FLORESTI', 'OTHER')),
  -- Categoria de salariu doar pentru LDE (1-5 = șoferi uzine).
  -- Categoriile 6 (suburban dublu) și 7 (interurban) vor trăi în viitor în modul «numerar», cu propria coloană.
  lde_salary_category int CHECK (lde_salary_category BETWEEN 1 AND 5),
    -- 1=DAF uzine, 2=Microbuze uzine, 3=SEBN/LEAR pauză, 4=Admin Bălți→SEBN, 5=LEAR Florești
  shift1_start_address text,                           -- override punct plecare s1 (NULL = home)
  shift2_start_address text,                           -- override punct plecare s2
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lde_driver_extras_uzina ON lde_driver_extras(uzina_id);

COMMENT ON TABLE lde_driver_extras IS 'Extinde drivers cu LDE-specific (uzina, adresă, parcare, categorie salariu LDE 1-5). Șoferii suburban/interurban (cat 6/7) NU au rând aici sau au lde_salary_category=NULL — categoriile 6-7 vor fi în modul «numerar» viitor.';

-- ── ATRIBUIRE ACTIVĂ (cine pe ce mașină acum) ──
CREATE TABLE IF NOT EXISTS lde_active_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  route_id uuid REFERENCES lde_factory_routes(id) ON DELETE SET NULL,
  shift_number int CHECK (shift_number IN (1, 2, 3)),
  valid_from date NOT NULL,
  valid_to date,                                       -- NULL = atribuire activă
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Performanță: hot path pentru atribuiri active
CREATE INDEX IF NOT EXISTS idx_lde_active_assignments_driver_active ON lde_active_assignments(driver_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_lde_active_assignments_vehicle_active ON lde_active_assignments(vehicle_id) WHERE valid_to IS NULL;

-- INTEGRITATE BUSINESS: un șofer = o singură atribuire activă (confirmat SEBN/LEAR: șofer-mașină 1:1)
CREATE UNIQUE INDEX IF NOT EXISTS uq_lde_active_assignments_one_per_driver
  ON lde_active_assignments(driver_id) WHERE valid_to IS NULL;

-- INTEGRITATE BUSINESS: o mașină pe un schimb = un singur șofer activ
-- (1 mașină poate avea 1 șofer pe s1 + alt șofer pe s2 dacă există — dar același schimb e 1:1)
CREATE UNIQUE INDEX IF NOT EXISTS uq_lde_active_assignments_one_per_vehicle_shift
  ON lde_active_assignments(vehicle_id, COALESCE(shift_number, 0)) WHERE valid_to IS NULL;

COMMENT ON TABLE lde_active_assignments IS 'Atribuirea curentă (și istoric) șofer-mașină-cursă-schimb. valid_to NULL = activă acum. Unique partial garantează: 1 șofer activ = 1 mașină; 1 mașină + schimb = 1 șofer.';

-- ── ACTIVITY LOG (audit modificări LDE) ──
CREATE TABLE IF NOT EXISTS lde_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_admin_id uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  action text NOT NULL,                                -- 'create', 'update', 'delete', 'norm_override', 'inrepair'
  entity text NOT NULL,                                -- 'vehicle_norm', 'factory_route', 'driver_extras', etc.
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lde_audit_log_entity ON lde_audit_log(entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lde_audit_log_actor ON lde_audit_log(actor_admin_id, created_at DESC) WHERE actor_admin_id IS NOT NULL;

COMMENT ON TABLE lde_audit_log IS 'Cine a schimbat normă, atribuire, etc. — pentru transparență. TODO: retenție/partition după 1-2 ani de date.';

-- ============================================================================
-- ROW LEVEL SECURITY (anon nu vede nimic; service_role bypassează; admin via getSupabase)
-- Aliniat cu 015_enable_rls + 201_piese_views_hardening — pattern TRANSLUX standard
-- ============================================================================

ALTER TABLE lde_vehicle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_vehicle_norms ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_uzine ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_factory_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_factory_route_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_factory_route_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_driver_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_active_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_audit_log ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ============================================================================
-- Faza 2 vine în 204_lde_seed_data.sql (toate datele din interviu)
-- Faza 3 vine în 205+ (DT engine, GPS daily, alimentări, alerts, etc.)
-- ============================================================================
