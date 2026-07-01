-- 224_gestionar_role.sql
-- Rol nou pentru modulul „Piese":
--   GESTIONAR — „depozitar intern": AMBELE funcții (intrări/prihod + ieșiri/rashod + mutări + vânzare magazin + inventar)
--   + nomenclator (furnizori/clienți/mecanici/motive). Vede costul (face prihod → introduce costul de achiziție). Fără e-Factura/1C.
-- Pentru omul care la depozitele interne (Bălți, Remzona) face și recepția, și eliberarea, dintr-un singur cont.
-- (VINZATOR = doar ieșiri/vânzări; DEPOZITAR = doar intrări. GESTIONAR = ambele.)
-- Pattern identic cu 221_depozitar_manager_roles.sql.

DO $$
BEGIN
  ALTER TABLE admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_role_check;
  ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_role_check
    CHECK (role IN ('ADMIN', 'DISPATCHER', 'GRAFIC', 'OPERATOR_CAMERE', 'ADMIN_CAMERE', 'EVALUATOR_INCASARI', 'CONTABIL', 'DEPOZITAR', 'VINZATOR', 'MANAGER', 'GESTIONAR'));
END$$;

COMMENT ON CONSTRAINT admin_accounts_role_check ON admin_accounts IS
  'Roluri admin: ADMIN, DISPATCHER, GRAFIC, OPERATOR_CAMERE, ADMIN_CAMERE, EVALUATOR_INCASARI, CONTABIL (citire + fiscal/1C), DEPOZITAR (intrări), VINZATOR (ieșiri/vânzări/mutări), MANAGER (citire), GESTIONAR (depozitar intern: intrări + ieșiri, vede cost).';
