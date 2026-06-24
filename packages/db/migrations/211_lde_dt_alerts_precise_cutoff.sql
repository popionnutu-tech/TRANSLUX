-- ============================================================================
-- MODUL LDE — faza 7: marcaj «formulă uscată» pe alerte DT (§3.4 Regula 3)
-- Interviul cere ca o alertă DT să distingă măsurarea precisă (plin→plin cu
-- отсечкă) de estimarea «formula uscată» (litri/km×100 fără cutoff precis).
-- Motorul (lde-dt-calc) calculează deja has_precise_cutoff, dar nu era persistat:
-- adăugăm coloana ca să poată fi salvat + afișat în UI («≈ formulă uscată»).
-- ============================================================================

BEGIN;

-- true  = măsurare precisă (plin→plin cu отсечкă / lună cu eveniment «plin»)
-- false = estimare «formula uscată» (litri/km×100, fără cutoff precis) — §3.4
ALTER TABLE lde_dt_alerts ADD COLUMN IF NOT EXISTS has_precise_cutoff boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN lde_dt_alerts.has_precise_cutoff IS 'false = «formulă uscată» (litri/km×100, fără plin precis, §3.4). true = măsurare precisă plin→plin. Analistul vede estimare vs precis.';

COMMIT;
