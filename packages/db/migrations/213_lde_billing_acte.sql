-- ============================================================================
-- MODUL LDE — faza 8: Acte de recepție (facturare săptămânală către uzine) +
-- model de facturare per uzină.
--
-- Fluxul:
--   1) Adminul setează modelul de facturare per uzină (lde_uzina_billing):
--      per_cursa | per_pasager | per_km | fix_saptamanal + rate_lei.
--   2) Săptămânal generează un Act de recepție (lde_receptie_acts) cu agregatele
--      (km / curse / pasageri) + valoarea calculată (motorul PUR lde-receptie-calc).
--      status: draft → trimis (după ce e expediat uzinei).
--
-- TABELE GOALE: tarifele le completează adminul; datele de test vin în demo-seed.
-- Valoarea (total_value_lei) o calculează motorul PUR @translux/db
-- (lde-receptie-calc), NU în DB.
-- ============================================================================

BEGIN;

-- ── MODEL DE FACTURARE PER UZINĂ ──
CREATE TABLE IF NOT EXISTS lde_uzina_billing (
  uzina_id text PRIMARY KEY REFERENCES lde_uzine(id) ON DELETE CASCADE,
  billing_model text NOT NULL
    CHECK (billing_model IN ('per_cursa', 'per_pasager', 'per_km', 'fix_saptamanal')),
  rate_lei numeric(10,2) NOT NULL,                       -- tariful (interpretat după billing_model)
  active boolean NOT NULL DEFAULT true,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE lde_uzina_billing IS 'Modelul de facturare per uzină: per_cursa | per_pasager | per_km | fix_saptamanal + rate_lei. Tabel gol — adminul completează tarifele. billing_model e enum CHECK — sincronizare cu codul TS obligatorie (vezi pattern translux_counting_status_enum_sync).';
COMMENT ON COLUMN lde_uzina_billing.rate_lei IS 'Tariful, interpretat după billing_model: lei/cursă, lei/pasager, lei/km sau lei/săptămână (fix).';

-- ── ACTE DE RECEPȚIE (săptămânale, către uzine) ──
CREATE TABLE IF NOT EXISTS lde_receptie_acts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uzina_id text NOT NULL REFERENCES lde_uzine(id) ON DELETE RESTRICT,
  week_from date NOT NULL,                                -- începutul săptămânii facturate
  week_to date NOT NULL,                                  -- sfârșitul săptămânii facturate
  total_km numeric(10,2) NOT NULL DEFAULT 0,             -- agregat km în săptămână
  total_curse int NOT NULL DEFAULT 0,                    -- agregat nr. curse în săptămână
  total_passengers int NOT NULL DEFAULT 0,              -- agregat nr. pasageri în săptămână
  total_value_lei numeric(12,2) NOT NULL DEFAULT 0,     -- valoarea actului (lde-receptie-calc)
  billing_model text,                                    -- snapshot model la generare (poate diferi de cel curent)
  rate_lei numeric(10,2),                                -- snapshot tarif la generare
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'trimis')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by_admin_id uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  notes text,
  UNIQUE (uzina_id, week_from)                            -- un singur act per uzină per săptămână
);

-- Hot path: lista actelor unei uzine, cele mai recente primele.
CREATE INDEX IF NOT EXISTS idx_lde_receptie_acts_uzina_week ON lde_receptie_acts(uzina_id, week_from DESC);

COMMENT ON TABLE lde_receptie_acts IS 'Acte de recepție săptămânale către uzine. Agregatele (km/curse/pasageri) + valoarea calculată (lde-receptie-calc). billing_model/rate_lei sunt snapshot la generare (nu se schimbă dacă tariful uzinei se modifică ulterior). UNIQUE(uzina_id, week_from) acoperă și indexul de FK pe uzina_id (leftmost prefix), dar păstrăm indexul dedicat pe (uzina_id, week_from DESC) pentru sortarea descrescătoare.';
COMMENT ON COLUMN lde_receptie_acts.status IS 'draft = în lucru (recalculabil) | trimis = expediat uzinei. Enum CHECK — sincronizare cu codul TS obligatorie.';

-- ============================================================================
-- ROW LEVEL SECURITY (anon nu vede nimic; service_role bypassează; admin via getSupabase)
-- Aliniat cu 015_enable_rls + 203_lde_phase1 + 205_lde_dt_engine + 212_lde_experiments
-- ============================================================================

ALTER TABLE lde_uzina_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_receptie_acts ENABLE ROW LEVEL SECURITY;

COMMIT;
