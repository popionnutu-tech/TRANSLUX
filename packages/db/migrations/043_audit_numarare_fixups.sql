-- 043_audit_numarare_fixups.sql
-- Documents unique-constraint decision for audit tables (no DB constraint by design).
-- Depends on: 042

BEGIN;

COMMENT ON TABLE counting_audit_entries IS
  'Al doilea set independent de numărare (audit) — structură identică cu counting_entries. '
  'Accesibil doar via server actions pentru ADMIN/ADMIN_CAMERE. '
  'Fără UNIQUE constraint: saveAuditDirection (interurban) și saveSuburbanAuditCycle (suburban) '
  'folosesc pattern delete-then-insert per direction/ciclu, deci unicitatea este garantată de aplicație.';

COMMIT;
