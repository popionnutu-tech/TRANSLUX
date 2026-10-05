-- 504_bilete_email_resend_id.sql — ION-250 (05.10.2026): webhook-ul Resend leagă evenimentele (bounce, spam, eșec,
-- livrat) de comanda al cărei bilet a plecat pe e-mail. Ion: «finisează dacă e ceva nefinisat în Resend».
ALTER TABLE bilete_comenzi
  ADD COLUMN IF NOT EXISTS email_resend_id text,
  ADD COLUMN IF NOT EXISTS email_livrat_la timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS bilete_comenzi_email_resend_id_uniq
  ON bilete_comenzi (email_resend_id) WHERE email_resend_id IS NOT NULL;
