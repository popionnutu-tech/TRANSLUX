-- 370: livrarea — drumul gol dintre casa șoferului și capătul rutei
--
-- E lucrul cerut de Ion în prima frază a acestei funcții («să minimizăm livrarea») și
-- tocmai el nu se socotea nicăieri. Segmentul de dimineață al unei mașini începe ACASĂ,
-- deci km-ii casă → prima stație stăteau înăuntrul `km_real` al cursei cu pasageri, iar
-- cei ultima stație → acasă înăuntrul returului.
--
-- Măsurat pe 01-17.09.2026, pe cursele cu ambele capete cunoscute: ~1.000 km/zi pe flotă.
--   Draxelmaier 431 km/zi · Orhei 335 · Ungheni 175 · Florești 63
-- Orhei e cazul care arată de ce conta: părea că are 3% km goi, fiindcă nu merge acasă
-- între ture (trei schimburi la rând) — dar tot pleacă de acasă dimineața și se întoarce
-- seara, iar acei 335 km/zi erau trecuți la „cu pasageri".
--
-- Tăietura se face la prima (respectiv ultima) oprire stabilă care nu e baza. La
-- segmentele de peste zi bucata iese zero, fiindcă ele încep deja în sat sau la poartă.
ALTER TABLE lde_route_run
  ADD COLUMN IF NOT EXISTS km_livrare numeric(8,2);
ALTER TABLE lde_route_day_contrib
  ADD COLUMN IF NOT EXISTS km_livrare numeric(8,2);

COMMENT ON COLUMN lde_route_run.km_livrare IS
  'Km goi între casa șoferului și capătul rutei, tăiați din km_real. NU se adună la km_goi '
  'al rândului: km_goi e pauza dintre ture (poartă ↔ acasă), livrarea e drumul de dimineață '
  'și cel de seară. Suma celor două = tot golul cursei.';
COMMENT ON COLUMN lde_route_day_contrib.km_livrare IS
  'Partea din km_gol care e livrare (casă ↔ capătul rutei). E un SUBSET al km_gol, nu un al '
  'patrulea termen: identitatea km_total = plin + gol + necunoscut + neatribuit rămâne.';
