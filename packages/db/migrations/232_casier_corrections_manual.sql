-- 232: Corecții de sume + rânduri manuale pentru Documentul de casier (modul GO / numarare).
--
-- Context: get_casier_document (vezi 226) listează plățile brute din tomberon.transactions.
-- Evaluatorul trebuie să poată (a) corecta sumele unei foi când șoferul a greșit, și
-- (b) adăuga foi fizice care au ajuns la el fără să fie în tomberon.
--
-- Două tabele separate fiindcă au semantică de NULL diferită:
--   - corecții: NULL pe o coloană = "păstrează valoarea brută din tomberon";
--   - rânduri manuale: linie întreagă nouă, sumele NULL n-au sens (DEFAULT 0).
--
-- Fără RLS (ca tomberon_payment_overrides / incasare_day_confirmations): gărzile de rol
-- se aplică în server action (isEditor = doar EVALUATOR_INCASARI). Cash-ul (incasare_numerar)
-- NU se corectează — nu are coloană aici.

-- ─────────────────────────────────────────────────────────────────────────────
-- (a) Corecții peste foi tomberon existente
-- Cheie logică (ziua, norm_nr) = corespunde row_key 'casier-'||norm_nr||'-'||kiosk_ziua
-- din get_casier_document (unde kiosk_ziua = p_date, fiindcă agg filtrează t.ziua = p_date).
CREATE TABLE IF NOT EXISTS public.casier_amount_corrections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ziua                  date NOT NULL,                        -- ziua plății la casă (kiosk) = p_date
  norm_nr               text NOT NULL CHECK (norm_nr <> ''),  -- norm_foaie(sofer_id); leagă de rândul tomberon
  -- Override-uri de sume: NULL = păstrează valoarea BRUTĂ din tomberon.
  diagrama              numeric,
  ligotniki0_suma       numeric,
  ligotniki_vokzal_suma numeric,
  dt_suma               numeric,
  dop_rashodi           numeric,
  comment               text,   -- NULL = necorectat; '' sau text = corectat (Postgres distinge NULL de '')
  created_by            uuid NOT NULL REFERENCES admin_accounts(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES admin_accounts(id),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ziua, norm_nr),
  -- O corecție goală (toate NULL) n-are sens: server-ul o șterge, dar apărăm și în DB.
  CONSTRAINT chk_casier_corr_at_least_one CHECK (
    diagrama IS NOT NULL OR ligotniki0_suma IS NOT NULL OR
    ligotniki_vokzal_suma IS NOT NULL OR dt_suma IS NOT NULL OR
    dop_rashodi IS NOT NULL OR comment IS NOT NULL
  )
);
-- Fără index separat pe ziua: UNIQUE(ziua, norm_nr) are ziua ca prim câmp → acoperă și
-- JOIN-ul pe (ziua, norm_nr), și căutarea doar pe ziua.

COMMENT ON TABLE public.casier_amount_corrections IS
  'Corecții de sume peste foile din tomberon, per (ziua, norm_nr). NULL pe o coloană = păstrează valoarea brută. Sursă unică: get_casier_document (COALESCE).';

-- ─────────────────────────────────────────────────────────────────────────────
-- (b) Rânduri manuale = foi fizice care au ajuns la evaluator fără să fie în tomberon.
-- Nu au cash (incasare_numerar) — se afișează 0. Rută/șofer/mașină păstrate ca snapshot text
-- (UI-ul lucrează cu text), plus id-uri best-effort pentru integritate.
CREATE TABLE IF NOT EXISTS public.casier_manual_rows (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ziua                  date NOT NULL,                 -- ziua documentului de casier (p_date)
  foaie_nr              text,
  data_foaie            date,
  driver_id             uuid REFERENCES drivers(id) ON DELETE SET NULL,
  driver_name           text,   -- snapshot afișat
  crm_route_id          int  REFERENCES crm_routes(id) ON DELETE SET NULL,
  route_name            text,   -- snapshot afișat
  vehicle_plate         text,   -- snapshot afișat
  -- Sume (fără cash). NOT NULL DEFAULT 0.
  diagrama              numeric NOT NULL DEFAULT 0,
  ligotniki0_suma       numeric NOT NULL DEFAULT 0,
  ligotniki_vokzal_suma numeric NOT NULL DEFAULT 0,
  dt_suma               numeric NOT NULL DEFAULT 0,
  dop_rashodi           numeric NOT NULL DEFAULT 0,
  comment               text,
  created_by            uuid NOT NULL REFERENCES admin_accounts(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES admin_accounts(id),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_casier_manual_ziua ON public.casier_manual_rows(ziua);

COMMENT ON TABLE public.casier_manual_rows IS
  'Foi fizice adăugate manual în Documentul de casier (nu există în tomberon). Fără cash. get_casier_document le adaugă prin UNION ALL cu is_manual=true.';
