-- 565: fiecare bilet vândut online ajunge în tabul «Bilete online» al grupei (Ion, 10.10.2026: «să îmi vie în grupă
-- ai Translux bilete toate biletele cumpărate»). Coloana marchează comanda anunțată; panoul o revendică atomic
-- (UPDATE … WHERE grupa_anuntat_la IS NULL), deci callback-ul și împăcarea nu trimit același bilet de două ori.
ALTER TABLE bilete_comenzi ADD COLUMN IF NOT EXISTS grupa_anuntat_la timestamptz;

-- Vânzările de dinainte nu se mai trimit: doar cele plătite de acum încolo.
UPDATE bilete_comenzi SET grupa_anuntat_la = now() WHERE grupa_anuntat_la IS NULL;

CREATE INDEX IF NOT EXISTS bilete_comenzi_grupa_neanuntate_idx ON bilete_comenzi (paid_at)
  WHERE grupa_anuntat_la IS NULL AND status = 'platita';
