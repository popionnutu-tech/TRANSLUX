-- 037_driver_cashin_receipts.sql
-- Mapping: numarul chitantei casei automate → soferul care a primit chitanta
-- in ziua respectiva. Introdus de dispecer pe pagina /grafic.
--
-- O chitanta e unica pe zi (un sofer = o chitanta = un autobuz).

CREATE TABLE IF NOT EXISTS public.driver_cashin_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  ziua date NOT NULL,
  receipt_nr text NOT NULL CHECK (receipt_nr <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES admin_accounts(id),
  UNIQUE (driver_id, ziua),
  UNIQUE (ziua, receipt_nr)
);

CREATE INDEX IF NOT EXISTS idx_dcr_ziua       ON driver_cashin_receipts(ziua);
CREATE INDEX IF NOT EXISTS idx_dcr_receipt_nr ON driver_cashin_receipts(receipt_nr);

COMMENT ON TABLE  public.driver_cashin_receipts IS
  'Mapare chitanta casa automata → sofer pentru o zi. Introdus de dispecer in /grafic.';
COMMENT ON COLUMN public.driver_cashin_receipts.receipt_nr IS
  'Codul _account din cash-in.payments (ex: "0945125").';
