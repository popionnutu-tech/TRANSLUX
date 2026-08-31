-- ============================================================================
-- LDE camioane — urma de audit + invariantul anti-suprapunere în BAZĂ (31.08.2026)
-- Două constatări din review-ul Etapei 1:
--  1) Specul cerea audit «cine + când + valoarea VECHE» (tiparul Piese), iar
--     migrația 300 avea doar created_by/updated_by: ultimul scriitor suprascria
--     tăcut ora, punctul sau camionul. Reutilizăm lde_audit_log (migr. 203), care
--     are deja exact forma before_data/after_data — nu inventăm un al doilea jurnal.
--     Trigger, nu cod de aplicație: urma trebuie să reziste și la scrierile din
--     afara aplicației (MCP, scripturi).
--  2) «Un camion, o singură cursă în interval» trăia doar în aplicație (citește →
--     scrie = TOCTOU: două file deschise pot salva simultan). Constrângerea EXCLUDE
--     mută invariantul în bază, unde nu poate fi ocolit.
-- ============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Cursele anulate nu ocupă intervalul (ele rămân doar ca istoric), la fel ca în
-- verificarea din aplicație (seSuprapune ignoră 'anulata').
-- Interval [load, unload): cursele lipite cap la cap (descărcare 18:00 → încărcare
-- 18:00) sunt permise intenționat — dispecerul planifică des așa.
ALTER TABLE lde_truck_trips
  DROP CONSTRAINT IF EXISTS lde_truck_trips_no_overlap;
ALTER TABLE lde_truck_trips
  ADD CONSTRAINT lde_truck_trips_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    tstzrange(load_planned_at, unload_planned_at, '[)') WITH &&
  ) WHERE (status <> 'anulata');
COMMENT ON CONSTRAINT lde_truck_trips_no_overlap ON lde_truck_trips IS
  'Un camion nu poate avea două curse care se suprapun în timp. Aplicația verifică și ea (mesaj prietenos), constrângerea prinde cursa dintre citire și scriere.';

-- Urma de audit pentru curse și stări de zi.
CREATE OR REPLACE FUNCTION lde_truck_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor uuid;
  actor_email text;
BEGIN
  -- Autorul vine din coloanele scrise de aplicație (updated_by/created_by = email-ul
  -- din sesiune). Îl traducem în id ca să se lege de admin_accounts; dacă nu se
  -- potrivește, păstrăm email-ul în notes — mai bine o urmă parțială decât niciuna.
  actor_email := COALESCE(
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) ->> 'updated_by' END,
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ->> 'created_by' ELSE to_jsonb(NEW) ->> 'created_by' END
  );
  SELECT id INTO actor FROM admin_accounts WHERE email = actor_email;

  INSERT INTO lde_audit_log (actor_admin_id, action, entity, entity_id, before_data, after_data, notes)
  VALUES (
    actor,
    lower(TG_OP),
    TG_TABLE_NAME,
    COALESCE(to_jsonb(NEW) ->> 'id', to_jsonb(OLD) ->> 'id'),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    CASE WHEN actor IS NULL AND actor_email IS NOT NULL THEN 'autor: ' || actor_email END
  );
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_lde_truck_trips_audit ON lde_truck_trips;
CREATE TRIGGER trg_lde_truck_trips_audit
  AFTER INSERT OR UPDATE OR DELETE ON lde_truck_trips
  FOR EACH ROW EXECUTE FUNCTION lde_truck_audit();

DROP TRIGGER IF EXISTS trg_lde_truck_day_states_audit ON lde_truck_day_states;
CREATE TRIGGER trg_lde_truck_day_states_audit
  AFTER INSERT OR UPDATE OR DELETE ON lde_truck_day_states
  FOR EACH ROW EXECUTE FUNCTION lde_truck_audit();

COMMIT;
