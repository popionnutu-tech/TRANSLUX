-- 538_bilete_echipaj.sql — echipajul pe biletul online (Ion, 08.10.2026: «Pe bilet cum apare număr mașină și șofer final —
-- să se trimită în chat actualizat la client»; final = la bifa dispecerului; număr + prenume + telefon).
-- Planul: docs/plans/2026-10-08-echipaj-pe-bilet.md. Jobul G din împăcare (lib/bilete/impacare.ts) trimite mesajul și ține
-- aici ce a trimis ultima dată, ca să nu repete și să anunțe doar schimbarea.
ALTER TABLE bilete_comenzi
  ADD COLUMN IF NOT EXISTS echipaj_trimis text,
  ADD COLUMN IF NOT EXISTS echipaj_trimis_la timestamptz,
  ADD COLUMN IF NOT EXISTS echipaj_revendicat_la timestamptz,
  ADD COLUMN IF NOT EXISTS echipaj_mesaje smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS echipaj_refuzat_la timestamptz;
COMMENT ON COLUMN bilete_comenzi.echipaj_trimis IS 'Cheia echipajului din ultimul mesaj trimis clientului (538): «vehicle|driver|cu_tel» / «anulat» / «astept».';
COMMENT ON COLUMN bilete_comenzi.echipaj_revendicat_la IS 'Revendicarea trimiterii (538): un singur proces trimite; expiră după 2 min.';
COMMENT ON COLUMN bilete_comenzi.echipaj_mesaje IS 'Câte mesaje de echipaj au plecat (538); schimbările se opresc după 3.';
COMMENT ON COLUMN bilete_comenzi.echipaj_refuzat_la IS 'Telegram a spus că botul e blocat / contul șters / chat inexistent (538): nu se mai trimite.';
CREATE INDEX IF NOT EXISTS bilete_comenzi_echipaj_plecare ON bilete_comenzi (departure_at) WHERE status = 'platita' AND telegram_id IS NOT NULL;
