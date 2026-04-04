-- 021_numarare_pasageri.sql
-- Modul numărare pasageri: sesiuni, intrări pe opriri, pasageri scurți

-- 1. Tabele noi

CREATE TABLE counting_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_date DATE NOT NULL,
  crm_route_id INT NOT NULL REFERENCES crm_routes(id),
  operator_id UUID NOT NULL REFERENCES admin_accounts(id),
  locked_by UUID REFERENCES admin_accounts(id),
  locked_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'tur_done', 'completed')),
  double_tariff BOOLEAN NOT NULL DEFAULT false,
  tur_total_lei INT,
  retur_total_lei INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(crm_route_id, assignment_date)
);

CREATE TABLE counting_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES counting_sessions(id) ON DELETE CASCADE,
  direction VARCHAR(5) NOT NULL CHECK (direction IN ('tur', 'retur')),
  stop_order INT NOT NULL,
  stop_name_ro VARCHAR(100) NOT NULL,
  km_from_start DECIMAL(8,2) NOT NULL DEFAULT 0,
  total_passengers INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, direction, stop_order)
);

CREATE TABLE counting_short_passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES counting_entries(id) ON DELETE CASCADE,
  boarded_stop_order INT NOT NULL,
  boarded_stop_name_ro VARCHAR(100) NOT NULL,
  km_distance DECIMAL(8,2) NOT NULL,
  passenger_count INT NOT NULL DEFAULT 1,
  amount_lei DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_counting_sessions_date ON counting_sessions(assignment_date);
CREATE INDEX idx_counting_sessions_route ON counting_sessions(crm_route_id, assignment_date);
CREATE INDEX idx_counting_entries_session ON counting_entries(session_id, direction);

-- 2. Chei noi în app_config pentru tarif dublu

INSERT INTO app_config (key, value)
VALUES
  ('rate_per_km_long', '0.94'),
  ('rate_per_km_short', '0.94')
ON CONFLICT (key) DO NOTHING;

-- 3. Dacă coloana role nu are valorile noi, actualizăm constraint-ul
-- (admin_accounts.role deja există cu ADMIN, DISPATCHER, GRAFIC)
-- Adăugăm OPERATOR_CAMERE și ADMIN_CAMERE

DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_role_check;
  -- Add updated constraint
  ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_role_check
    CHECK (role IN ('ADMIN', 'DISPATCHER', 'GRAFIC', 'OPERATOR_CAMERE', 'ADMIN_CAMERE'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
