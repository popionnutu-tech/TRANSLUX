-- 409_analytics_mod_acum.sql — analitica site împărțită pe «Acum» / «Mai târziu» (ION-102, Ion 27.09.2026:
-- «În analitica site să fie divizat clicuri acum și mai târziu»).
-- mod = butonul prin care a venit omul: 'acum' (fereastra cu harta, ION-43) sau 'mai_tarziu' (calendarul → căutarea pe dată).
-- NULL = rânduri de dinainte de împărțire; fluxul lor e cel de azi al lui «Mai târziu», panoul le numără acolo.
-- Rândurile «Acum» vin din /api/analytics/track fără ip_hash, deci nu umplu anti-scraperul (cautari_recente, migr. 334).
BEGIN;

ALTER TABLE search_log  ADD COLUMN IF NOT EXISTS mod text CHECK (mod IN ('acum', 'mai_tarziu'));
ALTER TABLE call_clicks ADD COLUMN IF NOT EXISTS mod text CHECK (mod IN ('acum', 'mai_tarziu'));

COMMENT ON COLUMN search_log.mod  IS 'acum | mai_tarziu (ION-102); NULL = înainte de 27.09.2026, numărat ca mai_tarziu';
COMMENT ON COLUMN call_clicks.mod IS 'acum | mai_tarziu (ION-102); NULL = înainte de 27.09.2026, numărat ca mai_tarziu';

COMMIT;
