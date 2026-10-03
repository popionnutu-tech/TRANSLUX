-- 491_bilete_alerte_notificat.sql — ION-207 (03.10.2026): alertele biletelor online ajung la Ion în Telegram.
-- Ion: «alertele să ajungă la mine». Împăcarea de la 10 min trimite alertele nenotificate și pune `notificat_la`.

ALTER TABLE bilete_alerte ADD COLUMN IF NOT EXISTS notificat_la timestamptz;

-- Alertele vechi (dinainte de această migrație) se consideră văzute: nu pleacă un val de mesaje la prima rulare.
UPDATE bilete_alerte SET notificat_la = now() WHERE notificat_la IS NULL;

CREATE INDEX IF NOT EXISTS bilete_alerte_nenotificate_idx ON bilete_alerte (id) WHERE notificat_la IS NULL;
