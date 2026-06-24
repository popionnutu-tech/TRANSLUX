-- 221_depozitar_manager_roles.sql
-- Adaugă rolurile:
--   DEPOZITAR — vânzător-depozitar: operează modulul „Piese" (prihod/rashod/mutări/inventar/magazin),
--               dar NU vede restul firmei de transport.
--   MANAGER   — doar citire pe modulul „Piese" (tablou/stoc/catalog/hartă/rapoarte).
-- Pattern identic cu 060_contabil_role.sql.

DO $$
BEGIN
  ALTER TABLE admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_role_check;
  ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_role_check
    CHECK (role IN ('ADMIN', 'DISPATCHER', 'GRAFIC', 'OPERATOR_CAMERE', 'ADMIN_CAMERE', 'EVALUATOR_INCASARI', 'CONTABIL', 'DEPOZITAR', 'MANAGER'));
END$$;

COMMENT ON CONSTRAINT admin_accounts_role_check ON admin_accounts IS
  'Roluri admin: ADMIN, DISPATCHER, GRAFIC, OPERATOR_CAMERE, ADMIN_CAMERE, EVALUATOR_INCASARI, CONTABIL (citire Piese + Fiscal/1C), DEPOZITAR (operează Piese), MANAGER (citire Piese).';
