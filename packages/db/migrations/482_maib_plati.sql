-- 482_maib_plati.sql — ION-188 (02.10.2026): evidența plăților prin maib Checkout.
-- maib a trimis cheile de sandbox și cere două teste (plată + refund). Tabelele de aici sunt fundația
-- vânzării reale de bilete (tichet separat): fiecare sesiune de checkout cu starea, plata, refund-ul
-- și callback-ul brut; plus jurnalul TUTUROR callback-urilor primite (și al celor respinse), ca să
-- putem arăta băncii exact ce a venit când semnătura nu bate.
-- Doar service_role (tiparul migr. 446); anon/authenticated nu văd nimic. Nimic greu la aplicare.

CREATE TABLE IF NOT EXISTS maib_checkouts (
  checkout_id      uuid PRIMARY KEY,
  order_id         text NOT NULL UNIQUE,
  mediu            text NOT NULL CHECK (mediu IN ('sandbox', 'prod')),
  amount           numeric(10,2) NOT NULL CHECK (amount > 0),
  currency         text NOT NULL DEFAULT 'MDL',
  description      text,
  status           text NOT NULL DEFAULT 'WaitingForInit',
  checkout_url     text,
  payment_id       uuid,
  payment_status   text,
  refunded_amount  numeric(10,2) NOT NULL DEFAULT 0,
  refund_id        uuid,
  refund_status    text,
  refund_reason    text,
  callback         jsonb,
  callback_at      timestamptz,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE maib_checkouts IS 'Sesiuni maib Checkout (ION-188): stare, plată, refund, callback. Doar service_role.';
COMMENT ON COLUMN maib_checkouts.mediu IS 'sandbox = chei de test maib; prod = chei de producție';
COMMENT ON COLUMN maib_checkouts.status IS 'starea sesiunii la maib: WaitingForInit, Initialized, PaymentMethodSelected, Completed, Expired, Abandoned, Cancelled, Failed (capitalizarea variază, compară fără ea)';
COMMENT ON COLUMN maib_checkouts.payment_status IS 'Executed, PartiallyRefunded, Refunded, Failed';
COMMENT ON COLUMN maib_checkouts.refund_status IS 'Created, Requested, Accepted, Rejected, Manual';
CREATE INDEX IF NOT EXISTS maib_checkouts_created_idx ON maib_checkouts (created_at DESC);

CREATE TABLE IF NOT EXISTS maib_callbacks (
  id                bigserial PRIMARY KEY,
  primit_la         timestamptz NOT NULL DEFAULT now(),
  checkout_id       uuid,
  semnatura_valida  boolean NOT NULL,
  motiv             text,
  headers           jsonb,
  body              text
);
COMMENT ON TABLE maib_callbacks IS 'Jurnalul brut al callback-urilor maib (valide și respinse) — pentru depanare cu banca. Doar service_role.';
CREATE INDEX IF NOT EXISTS maib_callbacks_checkout_idx ON maib_callbacks (checkout_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['maib_checkouts', 'maib_callbacks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;
REVOKE ALL ON SEQUENCE maib_callbacks_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE maib_callbacks_id_seq TO service_role;
