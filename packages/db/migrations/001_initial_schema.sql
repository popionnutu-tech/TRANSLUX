-- TRANSLUX: Initial database schema
-- Run this migration in Supabase SQL Editor

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('ADMIN', 'CONTROLLER');
CREATE TYPE point_enum AS ENUM ('CHISINAU', 'BALTI');
CREATE TYPE direction_enum AS ENUM ('CHISINAU_BALTI', 'BALTI_CHISINAU');
CREATE TYPE report_status AS ENUM ('OK', 'ABSENT');

-- ============================================================
-- TABLES
-- ============================================================

-- Admin accounts (web login)
CREATE TABLE admin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users (controllers authorized via Telegram)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE,
  username TEXT,
  role user_role NOT NULL DEFAULT 'CONTROLLER',
  point point_enum,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invite tokens
CREATE TABLE invite_tokens (
  token TEXT PRIMARY KEY,
  role user_role NOT NULL DEFAULT 'CONTROLLER',
  point point_enum NOT NULL,
  created_by UUID NOT NULL REFERENCES admin_accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by_user UUID REFERENCES users(id)
);

-- Routes
CREATE TABLE routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Drivers
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trips
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  direction direction_enum NOT NULL,
  departure_time TIME NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, direction, departure_time)
);

-- Reports
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL,
  point point_enum NOT NULL,
  trip_id UUID NOT NULL REFERENCES trips(id),
  driver_id UUID REFERENCES drivers(id),
  status report_status NOT NULL,
  passengers_count INTEGER,
  exterior_ok BOOLEAN,
  uniform_ok BOOLEAN,
  created_by_user UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES users(id)
);

-- Report photos
CREATE TABLE report_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  telegram_file_id TEXT NOT NULL,
  file_unique_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Partial unique: only one active report per date+point+trip
CREATE UNIQUE INDEX idx_reports_unique_active
  ON reports(report_date, point, trip_id)
  WHERE cancelled_at IS NULL;

-- Query indexes
CREATE INDEX idx_reports_date ON reports(report_date);
CREATE INDEX idx_reports_point ON reports(point);
CREATE INDEX idx_reports_driver ON reports(driver_id);
CREATE INDEX idx_reports_trip ON reports(trip_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_created_by ON reports(created_by_user);
CREATE INDEX idx_report_photos_report ON report_photos(report_id);
CREATE INDEX idx_trips_route_dir ON trips(route_id, direction);
CREATE INDEX idx_invite_tokens_expires ON invite_tokens(expires_at);
CREATE INDEX idx_users_telegram ON users(telegram_id);

-- ============================================================
-- STORAGE BUCKET
-- ============================================================

-- Run in Supabase dashboard or via API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('report-photos', 'report-photos', false);
