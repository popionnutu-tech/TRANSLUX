-- 049_evaluator_incasari_role.sql
-- Adaugă rolul EVALUATOR_INCASARI pentru utilizatorul care revizuiește
-- plățile zilnice de la Tomberon (asignare manuală + confirmare zi).

DO $$
BEGIN
  ALTER TABLE admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_role_check;
  ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_role_check
    CHECK (role IN ('ADMIN', 'DISPATCHER', 'GRAFIC', 'OPERATOR_CAMERE', 'ADMIN_CAMERE', 'EVALUATOR_INCASARI'));
END$$;

COMMENT ON CONSTRAINT admin_accounts_role_check ON admin_accounts IS
  'Roluri admin: ADMIN, DISPATCHER, GRAFIC, OPERATOR_CAMERE (operator camere video), ADMIN_CAMERE (admin numarare), EVALUATOR_INCASARI (revizie zilnica plati Tomberon).';
