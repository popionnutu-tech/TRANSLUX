-- 524: o corecție poate fi DOAR de identitate (foaie, ziua foii, șofer, rută, mașină).
--
-- Migr. 520 a adăugat coloanele de identitate pe casier_amount_corrections, dar a lăsat
-- neatinsă garda veche chk_casier_corr_at_least_one, care cere măcar o sumă sau comentariul.
-- Cazul pentru care s-a făcut 520 — plata unui șofer ajunsă pe foaia celui dinainte — se
-- repară schimbând foaia și șoferul, fără nicio sumă, iar garda veche îl respingea.
-- Prins pe 06.10 la proba ION-281, înainte ca pagina să ajungă la casier.
ALTER TABLE public.casier_amount_corrections
  DROP CONSTRAINT IF EXISTS chk_casier_corr_at_least_one;
ALTER TABLE public.casier_amount_corrections
  ADD CONSTRAINT chk_casier_corr_at_least_one CHECK (
    diagrama IS NOT NULL OR ligotniki0_suma IS NOT NULL OR ligotniki_vokzal_suma IS NOT NULL
    OR dt_suma IS NOT NULL OR dop_rashodi IS NOT NULL OR comment IS NOT NULL
    OR foaie_nr IS NOT NULL OR data_foaie IS NOT NULL OR driver_id IS NOT NULL
    OR driver_name IS NOT NULL OR crm_route_id IS NOT NULL OR route_name IS NOT NULL
    OR vehicle_plate IS NOT NULL
  );
