-- 060_contabil_role.sql
-- Adaugă rolul CONTABIL (contabil-șef) — acces de CITIRE la modulul „Piese"
-- (Stoc, Catalog, Hartă, Rapoarte, Tablou) + Fiscal/e-Factura și export 1C.
-- Operațiunile de depozit (prihod/rashod/mutări/inventar/magazin) rămân doar ADMIN.

DO $$
BEGIN
  ALTER TABLE admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_role_check;
  ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_role_check
    CHECK (role IN ('ADMIN', 'DISPATCHER', 'GRAFIC', 'OPERATOR_CAMERE', 'ADMIN_CAMERE', 'EVALUATOR_INCASARI', 'CONTABIL'));
END$$;

COMMENT ON CONSTRAINT admin_accounts_role_check ON admin_accounts IS
  'Roluri admin: ADMIN, DISPATCHER, GRAFIC, OPERATOR_CAMERE, ADMIN_CAMERE, EVALUATOR_INCASARI, CONTABIL (contabil-șef — citire modul Piese + Fiscal/1C).';
