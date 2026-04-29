-- 060_route_check_proposals.sql
-- Verificarea operatorilor a orarului rutelor interurbane.
-- Operatorul deschide o rută, parcurge fiecare oprire pe direcția "tur" (Nord → Chișinău,
-- foloseste crm_stop_fares.hour_from_nord), confirmă sau editează ora.
-- Apoi confirmă dacă "retur"-ul (Chișinău → Nord, hour_from_chisinau) merge la fel
-- sau nu — dacă nu, parcurge și retur-ul. Submisia ajunge admin-ului spre aprobare.
-- După aprobare, modificările se aplică automat în crm_stop_fares.

CREATE TABLE IF NOT EXISTS public.route_check_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_route_id integer NOT NULL REFERENCES public.crm_routes(id) ON DELETE CASCADE,
  retur_same boolean NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES public.admin_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_rcs_route_status
  ON public.route_check_submissions(crm_route_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rcs_status_created
  ON public.route_check_submissions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.route_check_stop_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.route_check_submissions(id) ON DELETE CASCADE,
  stop_id integer NOT NULL REFERENCES public.crm_stop_fares(id),
  direction text NOT NULL CHECK (direction IN ('tur','retur')),
  -- tur  → modifică crm_stop_fares.hour_from_nord (cursa Nord → Chișinău)
  -- retur → modifică crm_stop_fares.hour_from_chisinau (cursa Chișinău → Nord)
  old_time text,
  new_time text NOT NULL,
  UNIQUE (submission_id, stop_id, direction)
);

CREATE INDEX IF NOT EXISTS idx_rccs_submission
  ON public.route_check_stop_changes(submission_id);

COMMENT ON TABLE public.route_check_submissions IS
  'Sesiuni de verificare orar de către operatori — așteaptă aprobarea admin-ului.';
COMMENT ON TABLE public.route_check_stop_changes IS
  'Modificări de timp propuse per oprire/direcție în cadrul unei sesiuni.';
