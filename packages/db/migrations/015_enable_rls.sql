-- Enable Row Level Security on all tables
-- service_role key bypasses RLS, so the web app continues to work
-- This protects against unauthorized access via anon key

-- Core tables
ALTER TABLE admin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_photos ENABLE ROW LEVEL SECURITY;

-- Validation tables
ALTER TABLE day_validations ENABLE ROW LEVEL SECURITY;

-- Vehicles & assignments
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_assignments ENABLE ROW LEVEL SECURITY;

-- SMM tables
ALTER TABLE smm_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE smm_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE smm_daily_stats ENABLE ROW LEVEL SECURITY;

-- Pricing tables
ALTER TABLE route_km_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

-- Legacy/CRM tables (if they exist)
DO $$ BEGIN
  EXECUTE 'ALTER TABLE localities ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE schedule ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE stop_prices ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE crm_routes ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE crm_stop_fares ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Public read access for tables needed by the public homepage (uses anon key indirectly via service_role, but just in case)
-- The public actions use service_role, so these are for defense-in-depth only
-- No policies = deny all for anon/authenticated roles (service_role always bypasses)

-- Allow anon read on public-facing data (prices, offers, localities, routes schedule)
CREATE POLICY "anon_read_route_km_pairs" ON route_km_pairs FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_offers" ON offers FOR SELECT TO anon USING (active = true);

DO $$ BEGIN
  EXECUTE 'CREATE POLICY "anon_read_localities" ON localities FOR SELECT TO anon USING (active = true)';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  EXECUTE 'CREATE POLICY "anon_read_crm_routes" ON crm_routes FOR SELECT TO anon USING (active = true)';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  EXECUTE 'CREATE POLICY "anon_read_crm_stop_fares" ON crm_stop_fares FOR SELECT TO anon USING (true)';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
