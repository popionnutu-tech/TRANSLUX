-- 231_admin_warehouse_binding.sql
-- Etapa 2 (modulul „Piese"): leagă un cont administrativ de UN depozit.
-- NULL = toate depozitele (ADMIN sau cont cu drepturi extinse). Coloană ADITIVĂ,
-- sigură pentru codul vechi de pe main (care pur și simplu o ignoră).
-- ON DELETE SET NULL: dacă un depozit e șters, contul redevine „toate" (nu se blochează).
BEGIN;

ALTER TABLE admin_accounts
  ADD COLUMN IF NOT EXISTS warehouse_id bigint REFERENCES piese_warehouses(id) ON DELETE SET NULL;

COMMENT ON COLUMN admin_accounts.warehouse_id IS
  'Depozitul (piese_warehouses) de care e legat contul. NULL = toate depozitele (drepturi extinse). Restricționează prihod/rashod/mutări/inventar la acest depozit.';

CREATE INDEX IF NOT EXISTS idx_admin_accounts_warehouse ON admin_accounts(warehouse_id);

COMMIT;
