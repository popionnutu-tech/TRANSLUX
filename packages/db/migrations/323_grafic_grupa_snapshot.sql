-- ============================================================================
-- Grafic → grupa Mejgorod: instantaneul trimis (Ion, 07.09.2026)
--
-- «Dacă după ce a fost făcut tick în box este vreo schimbare — vine imaginea
-- nouă, iar sub imagine vine schimbarea produsă.» Ca să scriem CE s-a schimbat,
-- trebuie să ținem minte ce a văzut grupa: cursele (șofer, mașină, retur,
-- anulată) la fiecare trimitere. Se compară cu starea curentă după orice
-- scriere în programările zilei; diferența devine textul de sub imagine.
-- ============================================================================
BEGIN;

ALTER TABLE grafic_group_posts
  ADD COLUMN IF NOT EXISTS snapshot jsonb;
COMMENT ON COLUMN grafic_group_posts.snapshot IS 'Cursele asa cum le-a vazut grupa la ultima trimitere (crm_route_id -> sofer/masina/retur/anulata). Diferenta fata de starea curenta = textul de sub imaginea urmatoare.';

COMMIT;
