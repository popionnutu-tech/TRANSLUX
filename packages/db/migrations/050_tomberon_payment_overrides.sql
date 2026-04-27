-- 050_tomberon_payment_overrides.sql
-- Override-uri manuale facute de evaluator peste matching-ul automat
-- foaie <-> sofer din functia get_incasare_report.
--
-- Granularitate: (receipt_nr, ziua) - acelasi nivel ca agregarea raportului.
-- O singura decizie per (foaie, zi). Nu modifica datele brute Tomberon
-- si nici /grafic-ul dispecerului.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tomberon_override_action') THEN
    CREATE TYPE public.tomberon_override_action AS ENUM ('ASSIGN', 'IGNORE');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.tomberon_payment_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_nr text NOT NULL CHECK (receipt_nr <> ''),
  ziua date NOT NULL,
  action tomberon_override_action NOT NULL,
  driver_id uuid REFERENCES drivers(id) ON DELETE RESTRICT,
  note text,
  created_by uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES admin_accounts(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_nr, ziua),
  CONSTRAINT chk_assign_has_driver CHECK (
    (action = 'ASSIGN' AND driver_id IS NOT NULL) OR
    (action = 'IGNORE' AND driver_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_tomberon_overrides_ziua ON public.tomberon_payment_overrides(ziua);
CREATE INDEX IF NOT EXISTS idx_tomberon_overrides_driver ON public.tomberon_payment_overrides(driver_id) WHERE driver_id IS NOT NULL;

COMMENT ON TABLE public.tomberon_payment_overrides IS
  'Corecturi manuale pentru platile Tomberon care nu pot fi mapate automat (foaie lipsa, duplicat, format atipic). Facute de rolul EVALUATOR_INCASARI.';
COMMENT ON COLUMN public.tomberon_payment_overrides.action IS
  'ASSIGN = atribuie plata soferului din driver_id; IGNORE = exclude plata din raport (eroare casa, voucher test etc.)';
