-- ============================================================================
-- MODUL LDE — șoferul în atribuirea zilnică (cerere Ion 13.07.2026).
--
-- Managerul/dispecerul alege și ȘOFERUL per cursă (lista relevantă direcției,
-- drivers.directions). Foaia de parcurs NU se stochează aici — rămâne în
-- driver_cashin_receipts (șofer×zi, «cum este acum» în grafic); mini app-ul
-- o citește/scrie direct acolo pentru interurban/suburban.
-- ============================================================================

ALTER TABLE lde_atribuiri_zilnice
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL;
