-- 516: livrarea automată a biletului în chatul Telegram — revendicare atomică și marcaj «livrat» (ION-274, «Telegram ultrafast» P10)
--
-- Botul trimite biletul în chat imediat după plată (endpoint «livreaza» chemat de panou) ȘI prin jobul de 1 min (plasa de
-- siguranță, ION-266). Ca să nu plece de două ori (job + livreaza + /start în aceeași secundă, sau două instanțe la
-- rollover), comanda se REVENDICĂ atomic înainte de trimitere:
--   * telegram_livrare_la — trimiterea e în curs (revendicarea); expiră după 2 min dacă trimiterea a picat fără anulare;
--   * telegram_livrat_la  — biletul a fost livrat automat O dată. Separat de telegram_mesaj_id, pe care botul îl golește
--     când clientul șterge mesajul (fixareBilet/uitaMesaj): un bilet șters de client NU se retrimite automat; proprietarul
--     îl poate cere oricând cu /start bilet_<cod>.
-- Backfill: comenzile deja livrate (dovada de până azi = telegram_mesaj_id) primesc telegram_livrat_la, altfel jobul nou
-- le-ar retrimite. Același UPDATE se rulează încă o dată după deploy-ul botului (fereastra dintre migrație și deploy).

ALTER TABLE bilete_comenzi
  ADD COLUMN IF NOT EXISTS telegram_livrare_la timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_livrat_la  timestamptz;

COMMENT ON COLUMN bilete_comenzi.telegram_livrare_la IS 'ION-274: trimiterea automată a biletului în chat e în curs (revendicare atomică; expiră în 2 min).';
COMMENT ON COLUMN bilete_comenzi.telegram_livrat_la  IS 'ION-274: biletul a fost livrat automat în chat o dată; nu se retrimite dacă clientul îl șterge.';

UPDATE bilete_comenzi
   SET telegram_livrat_la = coalesce(updated_at, now())
 WHERE telegram_mesaj_id IS NOT NULL AND telegram_livrat_la IS NULL;

-- Jobul «Bilete noi» caută: plătite, cu cont, nelivrate (ambele NULL în fereastra de tranziție).
CREATE INDEX IF NOT EXISTS bilete_comenzi_de_livrat_idx
  ON bilete_comenzi (paid_at)
  WHERE telegram_id IS NOT NULL AND telegram_livrat_la IS NULL AND telegram_mesaj_id IS NULL;
