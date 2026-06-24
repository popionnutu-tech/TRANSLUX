-- ============================================================================
-- MODUL LDE — faza 6: перерасход real + snapshot «în reparație» pe alerte DT
-- Fix HIGH review: dashboard rankează după depășirea reală (actual − normă),
-- nu după consumul brut. Plus snapshot in_repair pentru context.
-- ============================================================================

BEGIN;

-- Depășirea reală față de normă (actual − normă efectivă). Motorul (lde-dt-calc) o calculează deja.
ALTER TABLE lde_dt_alerts ADD COLUMN IF NOT EXISTS pererashod_l_per_100km numeric(5,2);

-- Snapshot: mașina era marcată «în reparație» la momentul generării alertei.
-- Soft-tag (NU exclude alerta) — consumul poate fi afectat de testarea motorului; adminul vede contextul.
ALTER TABLE lde_dt_alerts ADD COLUMN IF NOT EXISTS vehicle_in_repair boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN lde_dt_alerts.pererashod_l_per_100km IS 'Depășire reală = actual − normă efectivă (l/100km). Pozitiv = peste normă. Sortare/ranking corect (NU consumul brut).';
COMMENT ON COLUMN lde_dt_alerts.vehicle_in_repair IS 'Snapshot: mașina era în reparație la generare. Soft-tag de context, NU exclude alerta.';

COMMIT;
