-- 040_suburban_schedules.sql
-- Adaugă infrastructura pentru numărarea suburbană:
--   1. crm_route_schedules: o linie per "cursă" (tur sau retur la o oră specifică, pe anumite zile)
--   2. crm_route_schedule_stops: stațiile + ore per cursă (stațiile sărite = lipsesc)
--   3. counting_entries: cycle_number + schedule_id pentru a permite multiple cicluri tur/retur
--      pe aceeași sesiune
-- Nu sparge fluxul interurban existent (cycle_number default 1, schedule_id nullable).

BEGIN;

-- 1. Orarul fix al rutei (tur/retur cu ora, valabil pe anumite zile ale săptămânii)
CREATE TABLE IF NOT EXISTS crm_route_schedules (
  id SERIAL PRIMARY KEY,
  route_id INT NOT NULL REFERENCES crm_routes(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('tur','retur')),
  sequence_no INT NOT NULL,
  days_of_week SMALLINT[] NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_schedules_route_dir
  ON crm_route_schedules(route_id, direction, active);

COMMENT ON TABLE crm_route_schedules IS
  'Orarul fix al rutelor (principal folosit pentru suburban). O linie per cursă (tur/retur cu oră).';
COMMENT ON COLUMN crm_route_schedules.days_of_week IS
  'Array ISO zile săptămânii: 1=luni ... 7=duminică. Ex. {2,4,7} = MARTI/JOI/DUMINICA.';
COMMENT ON COLUMN crm_route_schedules.sequence_no IS
  'Numărul cursei în ordinea cronologică a zilei (1, 2, 3...).';

-- 2. Stațiile per cursă cu ora de plecare/sosire (stații sărite = nu apar)
CREATE TABLE IF NOT EXISTS crm_route_schedule_stops (
  schedule_id INT NOT NULL REFERENCES crm_route_schedules(id) ON DELETE CASCADE,
  stop_id INT NOT NULL REFERENCES crm_stop_prices(id) ON DELETE CASCADE,
  stop_time TIME NOT NULL,
  stop_order INT NOT NULL,
  PRIMARY KEY (schedule_id, stop_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_stops_schedule
  ON crm_route_schedule_stops(schedule_id, stop_order);

COMMENT ON TABLE crm_route_schedule_stops IS
  'Stațiile și orele pentru o cursă specifică. Stațiile sărite de acea cursă pur și simplu lipsesc.';

-- 3. Extindem counting_entries cu cycle_number și schedule_id
ALTER TABLE counting_entries
  ADD COLUMN IF NOT EXISTS cycle_number INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS schedule_id INT REFERENCES crm_route_schedules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_counting_entries_cycle
  ON counting_entries(session_id, cycle_number);

COMMENT ON COLUMN counting_entries.cycle_number IS
  'Numărul ciclului în sesiune. Pentru rutele interurbane = 1 (un singur tur + retur/zi). Pentru suburban = 1..N (multiple cicluri/zi).';
COMMENT ON COLUMN counting_entries.schedule_id IS
  'FK la cursă specifică din crm_route_schedules. NULL pentru rute interurbane sau entries dinaintea feature-ului.';

COMMIT;
