-- ============================================================================
-- LDE camioane — urma de audit completă (31.08.2026, security review)
-- Două goluri găsite după migrația 301:
--  1) lde_dispatch_points și lde_truck_profile nu aveau audit, deși coordonatele
--     și raza punctului sunt exact intrarea din care workerul nocturn calculează
--     metricile GPS: dispecerul le putea muta fără nicio urmă.
--  2) La DELETE, autorul se citea din created_by (updated_by e NULL), deci
--     ștergerea unei stări apărea în jurnal pe seama celui care o CREASE.
--     Aplicația transmite acum autorul prin app.actor_email (SET LOCAL), iar
--     triggerul îl preferă când există.
-- ============================================================================
BEGIN;

ALTER TABLE lde_dispatch_points
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by text;
COMMENT ON COLUMN lde_dispatch_points.updated_by IS 'Ultimul autor; istoricul complet e în lde_audit_log (trigger).';

CREATE OR REPLACE FUNCTION lde_truck_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor uuid;
  actor_email text;
BEGIN
  -- Autorul acțiunii CURENTE, pus de aplicație înainte de scriere. La DELETE e
  -- singura sursă corectă: rândul șters poartă doar autorii lui anteriori.
  actor_email := NULLIF(current_setting('app.actor_email', true), '');
  IF actor_email IS NULL THEN
    actor_email := COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) ->> 'updated_by' END,
      CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ->> 'created_by' ELSE to_jsonb(NEW) ->> 'created_by' END
    );
  END IF;
  SELECT id INTO actor FROM admin_accounts WHERE email = actor_email;

  INSERT INTO lde_audit_log (actor_admin_id, action, entity, entity_id, before_data, after_data, notes)
  VALUES (
    actor,
    lower(TG_OP),
    TG_TABLE_NAME,
    COALESCE(to_jsonb(NEW) ->> 'id', to_jsonb(OLD) ->> 'id',
             to_jsonb(NEW) ->> 'vehicle_id', to_jsonb(OLD) ->> 'vehicle_id'),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    CASE WHEN actor IS NULL AND actor_email IS NOT NULL THEN 'autor: ' || actor_email END
  );
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_lde_dispatch_points_audit ON lde_dispatch_points;
CREATE TRIGGER trg_lde_dispatch_points_audit
  AFTER INSERT OR UPDATE OR DELETE ON lde_dispatch_points
  FOR EACH ROW EXECUTE FUNCTION lde_truck_audit();

DROP TRIGGER IF EXISTS trg_lde_truck_profile_audit ON lde_truck_profile;
CREATE TRIGGER trg_lde_truck_profile_audit
  AFTER INSERT OR UPDATE OR DELETE ON lde_truck_profile
  FOR EACH ROW EXECUTE FUNCTION lde_truck_audit();

COMMIT;
