-- 051_incasare_day_confirmations.sql
-- Semnatura zilnica a evaluatorului: "Am verificat ziua X la data Y".
-- E doar audit trail - nu blocheaza editarea ulterioara.

CREATE TABLE IF NOT EXISTS public.incasare_day_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ziua date NOT NULL UNIQUE,
  confirmed_by uuid NOT NULL REFERENCES admin_accounts(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE INDEX IF NOT EXISTS idx_incasare_confirmations_ziua ON public.incasare_day_confirmations(ziua);

COMMENT ON TABLE public.incasare_day_confirmations IS
  'Semnatura evaluatorului ca o zi a fost verificata. Audit trail, nu blocheaza editarea.';
