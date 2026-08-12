-- 251_grafic_uzine.sql
-- Grafic uzine (grilă săptămânală în panoul web admin):
--  1) audit pentru editările din admin (admin_accounts ≠ users/Telegram);
--  2) rol admin nou UZINE — vede doar /lde/grafic-uzine (managerul uzinelor, Alexei).

ALTER TABLE lde_atribuiri_zilnice
  ADD COLUMN IF NOT EXISTS changed_by_admin uuid REFERENCES admin_accounts(id) ON DELETE SET NULL;

ALTER TABLE lde_weekly_template
  ADD COLUMN IF NOT EXISTS updated_by_admin uuid REFERENCES admin_accounts(id) ON DELETE SET NULL;

-- pattern identic cu 221_depozitar_manager_roles.sql (lista curentă live + UZINE)
DO $$
BEGIN
  ALTER TABLE admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_role_check;
  ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_role_check
    CHECK (role IN ('ADMIN', 'DISPATCHER', 'GRAFIC', 'OPERATOR_CAMERE', 'ADMIN_CAMERE',
                    'EVALUATOR_INCASARI', 'CONTABIL', 'DEPOZITAR', 'VINZATOR', 'MANAGER',
                    'GESTIONAR', 'UZINE'));
END$$;

COMMENT ON CONSTRAINT admin_accounts_role_check ON admin_accounts IS
  'Roluri admin: ADMIN, DISPATCHER, GRAFIC, OPERATOR_CAMERE, ADMIN_CAMERE, EVALUATOR_INCASARI, CONTABIL, DEPOZITAR, VINZATOR, MANAGER, GESTIONAR, UZINE (grafic uzine LDE).';
