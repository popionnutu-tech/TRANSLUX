-- 221_depozitar_manager_roles.sql
-- Roluri noi pentru modulul „Piese":
--   DEPOZITAR — intrări (prihod), inventariere, nomenclator furnizori.
--   VINZATOR  — ieșiri (rashod), vânzări (magazin), mutări între depozite, inventariere, e-Factura.
--   MANAGER   — doar citire (documente + rapoarte).
-- (CONTABIL există deja din 060 — read-only + e-Factura/1C export.)
-- Pattern identic cu 060_contabil_role.sql.

DO $$
BEGIN
  ALTER TABLE admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_role_check;
  ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_role_check
    CHECK (role IN ('ADMIN', 'DISPATCHER', 'GRAFIC', 'OPERATOR_CAMERE', 'ADMIN_CAMERE', 'EVALUATOR_INCASARI', 'CONTABIL', 'DEPOZITAR', 'VINZATOR', 'MANAGER'));
END$$;

COMMENT ON CONSTRAINT admin_accounts_role_check ON admin_accounts IS
  'Roluri admin: ADMIN, DISPATCHER, GRAFIC, OPERATOR_CAMERE, ADMIN_CAMERE, EVALUATOR_INCASARI, CONTABIL (citire + fiscal/1C), DEPOZITAR (intrări), VINZATOR (ieșiri/vânzări/mutări), MANAGER (citire).';
