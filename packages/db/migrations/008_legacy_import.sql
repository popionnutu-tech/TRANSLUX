-- Migration: Import legacy data structure from old translux.md MySQL database
-- Tables: localities, schedule, prices (linked to localities and schedule)

-- ============================================================
-- Localities (all 82 stops with RO/RU names)
-- ============================================================
CREATE TABLE IF NOT EXISTS localities (
  id SERIAL PRIMARY KEY,
  name_ro VARCHAR(60) NOT NULL,
  name_ru VARCHAR(60) NOT NULL,
  is_major BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Schedule (departures from Chisinau and return trips)
-- ============================================================
CREATE TABLE IF NOT EXISTS schedule (
  id SERIAL PRIMARY KEY,
  destination_ro VARCHAR(60) NOT NULL,
  destination_ru VARCHAR(60) NOT NULL,
  departure_chisinau TIME,          -- ora plecare din Chisinau
  arrival_destination VARCHAR(13),   -- ora sosire la destinatie (text range)
  departure_destination TIME,        -- ora plecare din destinatie (nord)
  arrival_chisinau VARCHAR(13),      -- ora sosire la Chisinau
  duration_display_c VARCHAR(15),    -- "06:55 - 11:05"
  duration_display_n VARCHAR(15),    -- "14:10 - 18:30"
  sunday_only BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Prices per stop per route (linked to schedule)
-- ============================================================
CREATE TABLE IF NOT EXISTS stop_prices (
  id SERIAL PRIMARY KEY,
  schedule_id INT NOT NULL REFERENCES schedule(id) ON DELETE CASCADE,
  locality_id INT NOT NULL REFERENCES localities(id) ON DELETE CASCADE,
  stop_order INT NOT NULL DEFAULT 0,
  price_from_chisinau SMALLINT NOT NULL DEFAULT 0,  -- lei
  time_from_chisinau VARCHAR(5),                      -- "11:20"
  price_from_north SMALLINT NOT NULL DEFAULT 0,       -- lei
  time_from_north VARCHAR(5),                          -- "7:00"
  is_visible BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Legacy drivers (from old DB, separate from bot-managed drivers)
-- ============================================================
-- We'll import into existing `drivers` table, adding phone field

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS phone VARCHAR(15);
