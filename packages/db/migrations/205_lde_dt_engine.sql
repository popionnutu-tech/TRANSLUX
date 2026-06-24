-- ============================================================================
-- MODUL LDE — faza 3a: MOTOR DT (detectare furt motorină)
-- 7 tabele: GPS zilnic + alimentări Benzol + alimentări numerar + plinuri +
-- alerte DT + indicații soft + drivers-window.
--
-- Metodele de detectare:
--   A. between_alimentari_A  — diferență între 2 plinuri (km vs litri)
--   B. monthly_B             — cumul lunar per mașină (km total vs litri total)
--   C. cronic_pattern        — aceeași mașină cu perерасход similar (±0.3 l/100km) 2 luni la rând (§3.2)
--
-- Surse: Sinteza-interviuri-autopark.md + /tmp/analyst_full.txt
-- ============================================================================

BEGIN;

-- ── 1) GPS ZILNIC PER MAȘINĂ (din platforma GPS, import nightly) ──
CREATE TABLE IF NOT EXISTS lde_vehicle_gps_daily (
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date date NOT NULL,
  km_total numeric(8,2) NOT NULL DEFAULT 0,             -- km total ziua respectivă
  km_loaded numeric(8,2),                                -- km cu cursă (NULL = nu se distinge)
  km_aducere numeric(8,2),                               -- km „aducere/ducere" (gol → bază)
  speed_max_kmh int,                                     -- vârf de viteză
  speed_violations_count int NOT NULL DEFAULT 0,         -- nr. depășiri (peste limită)
  data_source text NOT NULL DEFAULT 'platform_gps',      -- 'platform_gps', 'manual', 'foaie'
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vehicle_id, date)
);

CREATE INDEX IF NOT EXISTS idx_lde_vehicle_gps_daily_date ON lde_vehicle_gps_daily(date);

COMMENT ON TABLE lde_vehicle_gps_daily IS 'GPS zilnic per mașină: km total, km cu pasageri, km gol, viteză. Sursa principală pentru detectare DT. Import nightly.';

-- ── 2) ALIMENTĂRI BENZOL (card auto, import via API) ──
CREATE TABLE IF NOT EXISTS lde_fuel_alimentari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  alimentat_at timestamptz NOT NULL,
  litri numeric(8,2) NOT NULL,
  suma_lei numeric(10,2) NOT NULL,
  statie text NOT NULL,                                  -- 'BRICENI', 'BALTI', 'UNGHENI', 'ORHEI', 'PETROM', etc.
  is_full boolean NOT NULL DEFAULT false,                -- true = plin (semnal pentru engine A)
  source text NOT NULL DEFAULT 'benzol',                 -- 'benzol' = card auto
  external_id text NOT NULL,                             -- id-ul din Benzol (pentru dedup)
  imported_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_lde_fuel_alimentari_vehicle_at ON lde_fuel_alimentari(vehicle_id, alimentat_at DESC);

COMMENT ON TABLE lde_fuel_alimentari IS 'Alimentări via card Benzol (import zilnic). is_full + plin_events = baza metodei A. UNIQUE (source, external_id) blochează dubluri la re-import.';

-- ── 3) ALIMENTĂRI NUMERAR (manual: șofer aduce bon → admin introduce) ──
CREATE TABLE IF NOT EXISTS lde_fuel_alimentari_cash (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  alimentat_at timestamptz NOT NULL,
  litri numeric(8,2) NOT NULL,
  suma_lei numeric(10,2) NOT NULL,
  statie text NOT NULL,
  ocr_source_file text,                                  -- path la bon foto (când e OCR-uit)
  ocr_confidence numeric(4,3),                           -- 0.000-1.000 (cât de sigur e OCR-ul)
  entered_by_admin_id uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lde_fuel_alimentari_cash_driver_at ON lde_fuel_alimentari_cash(driver_id, alimentat_at DESC);
CREATE INDEX IF NOT EXISTS idx_lde_fuel_alimentari_cash_vehicle_at ON lde_fuel_alimentari_cash(vehicle_id, alimentat_at DESC);

COMMENT ON TABLE lde_fuel_alimentari_cash IS 'Alimentări numerar (bon hârtie). Indexul pe driver_id + alimentat_at DESC alimentează pattern detection — șofer cronic „mereu numerar".';

-- ── 4) PLIN EVENTS (momentul când mașina e considerată plină — reset cumul) ──
CREATE TABLE IF NOT EXISTS lde_plin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  alimentare_id uuid NOT NULL,                           -- id-ul alimentării care a făcut plinul
  alimentare_source text NOT NULL CHECK (alimentare_source IN ('benzol', 'cash')),  -- de unde vine alimentare_id
  plin_at timestamptz NOT NULL,
  trigger_reason text NOT NULL CHECK (trigger_reason IN ('schimbare_sofer', 'sfarsit_luna', 'manual')),
  km_at_plin numeric(8,2),                               -- odometru/km cumulat la momentul plinului
  notes text
);

CREATE INDEX IF NOT EXISTS idx_lde_plin_events_vehicle_at ON lde_plin_events(vehicle_id, plin_at DESC);

COMMENT ON TABLE lde_plin_events IS 'Momente cheie pentru engine A: schimbare șofer / sfârșit lună / manual. Între 2 plin_events = fereastra de calcul (km vs litri). alimentare_id e polimorfic (benzol|cash) — fără FK, validat via alimentare_source.';

-- ── 5) ALERTE DT (output engine — Critical/High pentru admin) ──
CREATE TABLE IF NOT EXISTS lde_dt_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  alert_date date NOT NULL,                              -- ziua când a fost generată alerta
  method text NOT NULL CHECK (method IN ('between_alimentari_A', 'monthly_B', 'cronic_pattern')),
  period_from timestamptz NOT NULL,                      -- începutul ferestrei analizate
  period_to timestamptz NOT NULL,                        -- sfârșitul ferestrei analizate
  km_in_period numeric(8,2) NOT NULL,                    -- km parcurși în fereastră
  litri_alimentati numeric(8,2) NOT NULL,                -- litri în fereastră
  litri_norma numeric(8,2) NOT NULL,                     -- cât ar fi trebuit (norma × km)
  actual_consumption_l_per_100km numeric(6,2) NOT NULL,  -- consum efectiv L/100km (calculat: litri × 100 / km)
  level text NOT NULL CHECK (level IN ('verde', 'galben', 'rosu')),
  drivers_involved jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{driver_id, km, proportion}, ...] — copie din lde_dt_drivers_window
  status text NOT NULL DEFAULT 'nou' CHECK (status IN ('nou', 'in_analiza', 'raportat', 'rezolvat')),
  resolution_action text CHECK (resolution_action IN ('mustrare', 'penalizare_lei', 'concediere', 'norma_ajustata', 'fals_pozitiv', 'altul')),
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by_admin_id uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lde_dt_alerts_vehicle_date ON lde_dt_alerts(vehicle_id, alert_date DESC);
-- Hot path: lista alertelor noi în dashboard
CREATE INDEX IF NOT EXISTS idx_lde_dt_alerts_open ON lde_dt_alerts(alert_date DESC) WHERE status = 'nou';

COMMENT ON TABLE lde_dt_alerts IS 'Output principal al motorului DT. drivers_involved e snapshot (jsonb) — sursa normalizată e lde_dt_drivers_window. Indexul parțial WHERE status=nou alimentează lista de alerte din dashboard.';

-- ── 6) INDICAȚII DT (semnale soft — nu sunt alerte, doar atenționări) ──
CREATE TABLE IF NOT EXISTS lde_dt_indications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  indication_type text NOT NULL CHECK (indication_type IN (
    'timp_de_alimentare',    -- alimentare la oră ciudată (noaptea, etc.)
    'timp_strange',          -- diferență suspectă între 2 alimentări consecutive
    'loc_strange',           -- stație neobișnuită (nu pe traseu)
    'nu_alimentat_de_mult',  -- mașina nu a primit alimentare X zile dar circulă
    'numerar_des'            -- șofer alimentează des în numerar (preferă cash vs card)
  )),
  generated_at timestamptz NOT NULL DEFAULT now(),
  message_ro text NOT NULL,                              -- mesaj prietenos în română pentru admin
  context_data jsonb,                                    -- date contextuale pentru drill-down
  dismissed_at timestamptz,
  dismissed_by_admin_id uuid REFERENCES admin_accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lde_dt_indications_vehicle_at ON lde_dt_indications(vehicle_id, generated_at DESC);

COMMENT ON TABLE lde_dt_indications IS 'Indicații soft (nu DT confirmat — doar suspiciune). Admin le poate dismiss. Tipurile sunt enum CHECK — sincronizare cu codul TS obligatorie (vezi pattern translux_counting_status_enum_sync).';

-- ── 7) DRIVERS-WINDOW (cine a condus mașina în fereastra alertei) ──
CREATE TABLE IF NOT EXISTS lde_dt_drivers_window (
  dt_alert_id uuid NOT NULL REFERENCES lde_dt_alerts(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
  km_in_window numeric(8,2) NOT NULL DEFAULT 0,
  proportion numeric(5,4) NOT NULL CHECK (proportion >= 0 AND proportion <= 1),  -- procent din km total
  PRIMARY KEY (dt_alert_id, driver_id)
);

COMMENT ON TABLE lde_dt_drivers_window IS 'Per alertă, ce șoferi au folosit mașina și cât (proportion 0..1). Sursa normalizată pentru drivers_involved jsonb din lde_dt_alerts. PK acoperă FK pe dt_alert_id (leftmost prefix).';

-- ============================================================================
-- ROW LEVEL SECURITY (anon nu vede nimic; service_role bypassează)
-- Aliniat cu 015_enable_rls + 201_piese_views_hardening + 203_lde_phase1
-- ============================================================================

ALTER TABLE lde_vehicle_gps_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_fuel_alimentari ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_fuel_alimentari_cash ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_plin_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_dt_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_dt_indications ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_dt_drivers_window ENABLE ROW LEVEL SECURITY;

COMMIT;
