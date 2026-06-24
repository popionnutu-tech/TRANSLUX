-- ============================================================================
-- MODUL LDE — faza 7: «Experimente» (§6 interviu)
-- Mecanism baseline → test → comparație cost → decizie Implementează/Anulează.
--
-- Flux (status):
--   baseline  → adminul definește perioada de referință și vehiculele monitorizate
--   test      → după «Închide baseline» (snapshot litri/lei/km) începe perioada de test
--   done      → după «Închide test» (snapshot test) — comparația e gata
--   cancelled → experiment abandonat
--
-- decision (NULL până la final): 'implement' (păstrează schimbarea) | 'cancel' (revine).
-- Snapshot-urile (baseline_* / test_*) sunt AGREGATE «înghețate» la închiderea fiecărei
-- faze (din lde_vehicle_gps_daily + lde_fuel_alimentari(+cash) pe vehicle_ids în perioadă),
-- ca să nu se schimbe retroactiv dacă datele GPS/fuel se re-importă ulterior.
--
-- Comparația cost/zi + extrapolare lei/lună trăiește în motorul PUR @translux/db
-- (lde-experiment-calc), NU în DB.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS lde_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                                    -- ex: «DAF→Sprinter pe Briceni-Lipcani»
  hypothesis text,                                       -- descrierea ipotezei (ce ne așteptăm să se întâmple)

  -- Ce se experimentează. 'vehicle_set' = doar un set de vehicule, fără rută anume.
  route_kind text CHECK (route_kind IN ('uzina_factory', 'interurban_v2', 'suburban', 'vehicle_set')),
  route_id uuid,                                         -- opțional (NULL pentru vehicle_set; polimorfic pe route_kind → fără FK)
  vehicle_ids uuid[] NOT NULL DEFAULT '{}',              -- vehiculele monitorizate (array Postgres)

  -- Perioade
  baseline_from date,
  baseline_to date,
  test_from date,                                        -- NULL până începe testul
  test_to date,                                          -- NULL până se închide testul

  status text NOT NULL DEFAULT 'baseline'
    CHECK (status IN ('baseline', 'test', 'done', 'cancelled')),
  decision text CHECK (decision IN ('implement', 'cancel')),  -- NULL până la final

  -- Snapshot agregat la închiderea BASELINE (litri, lei, km pe perioada baseline)
  baseline_litri numeric(12,2),
  baseline_lei numeric(14,2),
  baseline_km numeric(12,2),

  -- Snapshot agregat la închiderea TESTULUI (litri, lei, km pe perioada test)
  test_litri numeric(12,2),
  test_lei numeric(14,2),
  test_km numeric(12,2),

  created_by_admin_id uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Hot path: lista experimentelor active (baseline/test) în dashboard.
CREATE INDEX IF NOT EXISTS idx_lde_experiments_status ON lde_experiments(status);

COMMENT ON TABLE lde_experiments IS 'Experimente §6: baseline → test → comparație cost → decizie. Snapshot-urile baseline_*/test_* sunt agregate înghețate (GPS+fuel pe vehicle_ids) la închiderea fiecărei faze — nu se recalculează retroactiv. route_id e polimorfic pe route_kind (fără FK).';
COMMENT ON COLUMN lde_experiments.vehicle_ids IS 'Array de vehicle_id monitorizate. Agregarea litri/lei/km se face pe acest set în perioada respectivă (batch, fără N+1).';
COMMENT ON COLUMN lde_experiments.decision IS 'Decizia finală: implement = păstrăm schimbarea, cancel = revenim. NULL până status=done.';

-- ============================================================================
-- ROW LEVEL SECURITY (anon nu vede nimic; service_role bypassează; admin via getSupabase)
-- Aliniat cu 015_enable_rls + 203_lde_phase1 + 205_lde_dt_engine — pattern TRANSLUX standard
-- ============================================================================

ALTER TABLE lde_experiments ENABLE ROW LEVEL SECURITY;

COMMIT;
