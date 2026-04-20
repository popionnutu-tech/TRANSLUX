-- 034_counting_single_totals.sql
-- Adaugă coloane pentru suma "single tariff" (cât ar fi fost dacă toți pasagerii ar fi fost
-- calculați cu tariful lung = rate_interurban_long).
-- Folosit de ADMIN / ADMIN_CAMERE pentru a vedea diferența pe fiecare cursă și totalul zilei.

ALTER TABLE counting_sessions
  ADD COLUMN IF NOT EXISTS tur_single_lei numeric,
  ADD COLUMN IF NOT EXISTS retur_single_lei numeric;

COMMENT ON COLUMN counting_sessions.tur_single_lei IS
  'Suma tur calculată cu un singur tarif (rate_interurban_long aplicat la toți pasagerii). Pentru afișarea diferenței vs dual tariff.';
COMMENT ON COLUMN counting_sessions.retur_single_lei IS
  'Suma retur calculată cu un singur tarif (rate_interurban_long aplicat la toți pasagerii). Pentru afișarea diferenței vs dual tariff.';
