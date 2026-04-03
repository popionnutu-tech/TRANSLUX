-- Enable Row Level Security on all tables
-- service_role key bypasses RLS, so the web app continues to work
-- This protects against unauthorized access via anon key

-- Helper: safely enable RLS (skips if table doesn't exist)
CREATE OR REPLACE FUNCTION _tmp_enable_rls(tbl text) RETURNS void AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
EXCEPTION WHEN undefined_table THEN NULL;
END;
$$ LANGUAGE plpgsql;

-- Core tables
SELECT _tmp_enable_rls('admin_accounts');
SELECT _tmp_enable_rls('users');
SELECT _tmp_enable_rls('invite_tokens');
SELECT _tmp_enable_rls('routes');
SELECT _tmp_enable_rls('drivers');
SELECT _tmp_enable_rls('trips');
SELECT _tmp_enable_rls('reports');
SELECT _tmp_enable_rls('report_photos');
SELECT _tmp_enable_rls('day_validations');

-- Vehicles & assignments
SELECT _tmp_enable_rls('vehicles');
SELECT _tmp_enable_rls('daily_assignments');

-- SMM tables
SELECT _tmp_enable_rls('smm_accounts');
SELECT _tmp_enable_rls('smm_posts');
SELECT _tmp_enable_rls('smm_daily_stats');

-- Pricing tables
SELECT _tmp_enable_rls('route_km_pairs');
SELECT _tmp_enable_rls('offers');

-- Legacy/CRM tables
SELECT _tmp_enable_rls('localities');
SELECT _tmp_enable_rls('schedule');
SELECT _tmp_enable_rls('stop_prices');
SELECT _tmp_enable_rls('crm_routes');
SELECT _tmp_enable_rls('crm_stop_fares');

-- Cleanup helper
DROP FUNCTION _tmp_enable_rls(text);

-- Helper: safely create policy (skips if table doesn't exist)
CREATE OR REPLACE FUNCTION _tmp_create_policy(policy_name text, tbl text, condition text) RETURNS void AS $$
BEGIN
  EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO anon USING (%s)', policy_name, tbl, condition);
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_object THEN NULL;
END;
$$ LANGUAGE plpgsql;

-- Allow anon read on public-facing data
SELECT _tmp_create_policy('anon_read_route_km_pairs', 'route_km_pairs', 'true');
SELECT _tmp_create_policy('anon_read_offers', 'offers', 'active = true');
SELECT _tmp_create_policy('anon_read_localities', 'localities', 'active = true');
SELECT _tmp_create_policy('anon_read_crm_routes', 'crm_routes', 'active = true');
SELECT _tmp_create_policy('anon_read_crm_stop_fares', 'crm_stop_fares', 'true');

-- Cleanup helper
DROP FUNCTION _tmp_create_policy(text, text, text);
