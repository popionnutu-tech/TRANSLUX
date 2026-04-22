-- 042_audit_numarare.sql
-- Adaugă suport pentru audit paralel al sesiunilor de numărare.
-- Depends on: 021 (counting_sessions), 040 (suburban schedules)

-- 1. Coloane noi pe counting_sessions (păstrăm originalul intact)
ALTER TABLE counting_sessions
  ADD COLUMN IF NOT EXISTS audit_status VARCHAR(20) CHECK (audit_status IN ('new', 'tur_done', 'completed')),
  ADD COLUMN IF NOT EXISTS audit_tur_total_lei INT,
  ADD COLUMN IF NOT EXISTS audit_retur_total_lei INT,
  ADD COLUMN IF NOT EXISTS audit_tur_single_lei INT,
  ADD COLUMN IF NOT EXISTS audit_retur_single_lei INT,
  ADD COLUMN IF NOT EXISTS audit_operator_id UUID REFERENCES admin_accounts(id),
  ADD COLUMN IF NOT EXISTS audit_locked_by UUID REFERENCES admin_accounts(id),
  ADD COLUMN IF NOT EXISTS audit_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS audit_last_edited_at TIMESTAMPTZ;

-- 2. Tabele paralele identice ca structură cu counting_entries/counting_short_passengers
CREATE TABLE IF NOT EXISTS counting_audit_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES counting_sessions(id) ON DELETE CASCADE,
  direction VARCHAR(5) NOT NULL CHECK (direction IN ('tur', 'retur')),
  stop_order INT NOT NULL,
  stop_name_ro VARCHAR(100) NOT NULL,
  km_from_start DECIMAL(8,2) NOT NULL DEFAULT 0,
  total_passengers INT NOT NULL DEFAULT 0,
  alighted INT NOT NULL DEFAULT 0,
  schedule_id INT REFERENCES crm_route_schedules(id),
  cycle_number INT,
  alt_driver_id UUID REFERENCES drivers(id),
  alt_vehicle_id UUID REFERENCES vehicles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_counting_audit_entries_session
  ON counting_audit_entries(session_id, direction);
CREATE INDEX IF NOT EXISTS idx_counting_audit_entries_suburban
  ON counting_audit_entries(session_id, schedule_id, cycle_number)
  WHERE schedule_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS counting_audit_short_passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES counting_audit_entries(id) ON DELETE CASCADE,
  boarded_stop_order INT NOT NULL,
  boarded_stop_name_ro VARCHAR(100) NOT NULL,
  km_distance DECIMAL(8,2) NOT NULL,
  passenger_count INT NOT NULL DEFAULT 1,
  amount_lei DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_counting_audit_short_passengers_entry
  ON counting_audit_short_passengers(entry_id);

-- 3. RLS: doar ADMIN și ADMIN_CAMERE pot accesa tabele audit
ALTER TABLE counting_audit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE counting_audit_short_passengers ENABLE ROW LEVEL SECURITY;

-- Nota: în acest proiect, server actions folosesc service-role cheie, deci RLS nu filtrează.
-- Politica e "fail-closed" pentru client anonim / viitor — server actions fac verificarea prin requireRole.
CREATE POLICY counting_audit_entries_admin_only ON counting_audit_entries
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY counting_audit_short_passengers_admin_only ON counting_audit_short_passengers
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

COMMENT ON TABLE counting_audit_entries IS
  'Al doilea set independent de numărare (audit) — structură identică cu counting_entries. Accesibil doar via server actions pentru ADMIN/ADMIN_CAMERE.';
COMMENT ON TABLE counting_audit_short_passengers IS
  'Pasageri scurți pentru audit — structură identică cu counting_short_passengers.';
COMMENT ON COLUMN counting_sessions.audit_status IS
  'NULL = no audit started; tur_done/completed = audit progres; structure mirrors session.status.';
