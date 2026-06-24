-- ============================================================================
-- MODUL LDE — faza 5: motor salarii UZINE (categoriile 1-5)
-- Sursă formule: Sinteza-interviuri-autopark.md §2
-- Cat 6 (suburban) + cat 7 (interurban) = în modulul EXISTENT /numarare, NU aici.
-- ============================================================================

BEGIN;

-- ── HEADER PER EXECUȚIE LUNARĂ ──
CREATE TABLE IF NOT EXISTS lde_salary_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL,                          -- prima zi a lunii ('2026-06-01')
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by_admin_id uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approved_by_admin_id uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  paid_at timestamptz,
  notes text
);

-- Doar 1 run approved + 1 paid per lună (draft-uri multiple permise)
CREATE UNIQUE INDEX IF NOT EXISTS uq_lde_salary_runs_period_status
  ON lde_salary_runs(period_month, status) WHERE status IN ('approved', 'paid');
CREATE INDEX IF NOT EXISTS idx_lde_salary_runs_period ON lde_salary_runs(period_month DESC);

COMMENT ON TABLE lde_salary_runs IS 'Header per execuție lunară de salarii UZINE. draft → approved → paid.';

-- ── SALARIU PER ȘOFER PER LUNĂ ──
CREATE TABLE IF NOT EXISTS lde_salary_uzine_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salary_run_id uuid NOT NULL REFERENCES lde_salary_runs(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
  uzina_id text NOT NULL REFERENCES lde_uzine(id) ON DELETE RESTRICT,   -- snapshot
  salary_category int NOT NULL CHECK (salary_category BETWEEN 1 AND 5), -- snapshot
  -- Componente brute (+)
  base_lei numeric(10,2) NOT NULL DEFAULT 0,           -- baza (8500 DAF / 400×zile / 8000-8500 fix)
  km_surcharge_lei numeric(10,2) NOT NULL DEFAULT 0,   -- 1.5/1.2 lei/km peste prag (cat 1+2)
  weekend_double_lei numeric(10,2) NOT NULL DEFAULT 0, -- adaos weekend ×2
  extra_orders_lei numeric(10,2) NOT NULL DEFAULT 0,   -- curse extra (+200 Chișinău admin)
  school_lei numeric(10,2) NOT NULL DEFAULT 0,         -- transport școlar (100×zile)
  cash_orders_lei numeric(10,2) NOT NULL DEFAULT 0,    -- comenzi persoane fizice
  spalare_lei numeric(10,2) NOT NULL DEFAULT 0,        -- spălare mașină
  total_gross_lei numeric(10,2) NOT NULL DEFAULT 0,
  -- Reținări (−)
  deduction_pererashod_lei numeric(10,2) NOT NULL DEFAULT 0,  -- din lde_dt_alerts asignate
  deduction_damages_lei numeric(10,2) NOT NULL DEFAULT 0,     -- daune din vină
  deduction_other_lei numeric(10,2) NOT NULL DEFAULT 0,
  total_net_lei numeric(10,2) NOT NULL DEFAULT 0,
  -- Statistici
  km_total int NOT NULL DEFAULT 0,
  work_days int NOT NULL DEFAULT 0,
  weekend_days int NOT NULL DEFAULT 0,
  notes text,
  UNIQUE (salary_run_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_lde_salary_monthly_driver ON lde_salary_uzine_monthly(driver_id);
CREATE INDEX IF NOT EXISTS idx_lde_salary_monthly_uzina ON lde_salary_uzine_monthly(uzina_id);
-- NB: lookup pe salary_run_id e acoperit de UNIQUE (salary_run_id, driver_id) — leftmost prefix.

COMMENT ON TABLE lde_salary_uzine_monthly IS 'Salariul calculat per șofer per lună (categ 1-5). Toate componentele + reținări. snapshot uzina+category.';

-- ── DETALIU PE ZI (drill-down) ──
CREATE TABLE IF NOT EXISTS lde_salary_breakdown (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salary_monthly_id uuid NOT NULL REFERENCES lde_salary_uzine_monthly(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  route_id uuid REFERENCES lde_factory_routes(id) ON DELETE SET NULL,
  shift_number int CHECK (shift_number IN (1, 2, 3)),
  km_total numeric(8,2) NOT NULL DEFAULT 0,
  is_weekend boolean NOT NULL DEFAULT false,
  day_amount_lei numeric(10,2) NOT NULL DEFAULT 0,
  school_amount_lei numeric(10,2) NOT NULL DEFAULT 0,
  extra_order_amount_lei numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  UNIQUE (salary_monthly_id, work_date)
);

-- NB: lookup pe salary_monthly_id e acoperit de UNIQUE (salary_monthly_id, work_date) — leftmost prefix.

COMMENT ON TABLE lde_salary_breakdown IS 'Detaliul pe zi al salariului (km, weekend, suplimente). Pentru vizualizarea pe zile §2 sinteza.';

-- ── LUNILE CU TRANSPORT ȘCOLAR (admin toggle) ──
CREATE TABLE IF NOT EXISTS lde_school_periods (
  period_month date PRIMARY KEY,                       -- prima zi a lunii
  is_active boolean NOT NULL DEFAULT false,
  rate_per_day_lei numeric(7,2) NOT NULL DEFAULT 100,  -- default 100 lei/zi (50+50)
  set_by_admin_id uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

COMMENT ON TABLE lde_school_periods IS 'Per lună: dacă transport școlar e activ + rata/zi. Proprietarul fixează manual (anul școlar toamnă→primăvară).';

-- ── COMENZI SUPLIMENTARE ZILNICE (admin intro) ──
CREATE TABLE IF NOT EXISTS lde_extra_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  order_type text NOT NULL CHECK (order_type IN ('chisinau_admin', 'persoana_fizica', 'transport_extra', 'altul')),
  amount_lei numeric(10,2) NOT NULL,
  entered_by_admin_id uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lde_extra_orders_driver_date ON lde_extra_orders(driver_id, work_date);
CREATE INDEX IF NOT EXISTS idx_lde_extra_orders_date ON lde_extra_orders(work_date);

COMMENT ON TABLE lde_extra_orders IS 'Comenzi suplimentare pe zi (Chișinău admin, persoane fizice). Adunate la salariu lunar.';

-- ── AUDIT MODIFICĂRI MANUALE PE DRAFT ──
CREATE TABLE IF NOT EXISTS lde_salary_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salary_monthly_id uuid REFERENCES lde_salary_uzine_monthly(id) ON DELETE CASCADE,
  field_changed text NOT NULL,
  value_before numeric(10,2),
  value_after numeric(10,2),
  reason text,
  changed_by_admin_id uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lde_salary_audit_monthly ON lde_salary_audit(salary_monthly_id);

COMMENT ON TABLE lde_salary_audit IS 'Log modificări manuale pe salariu draft (override fix cat 3/5, corecturi). Pentru transparență.';

-- ============================================================================
-- RLS (anon nu vede nimic; service_role bypassează — pattern 015 + 203)
-- ============================================================================
ALTER TABLE lde_salary_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_salary_uzine_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_salary_breakdown ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_school_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_extra_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_salary_audit ENABLE ROW LEVEL SECURITY;

COMMIT;
