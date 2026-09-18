-- 374: drumul acasă DIN PAUZĂ, separat de naveta de dimineață și de seară
--
-- Regula lui Ion, 18.09: «dacă auto nu are alte ture decât una pe zi și se întoarce înapoi
-- acasă în sat — neglijență, trebuie să aștepte». Corectă, dar prima mea implementare o
-- aplica pe TOT golul care atinge casa, deci prindea și naveta.
--
-- Cazul care a arătat diferența, 17.09:
--   912RNK (Vleju Igor) — 06:38 la poartă, 07:25 ACASĂ (42 km), stă 6 ore, 15:02 înapoi la
--     poartă (72 km). 114 km între două atingeri de poartă, fără să ducă pe nimeni. Asta e.
--   293QVT — stă acasă peste noapte (03:40-13:16), pleacă 70 km la lucru, se întoarce 73 km
--     noaptea. Aceea e naveta: mașina TREBUIE să ajungă de acasă la lucru și înapoi. Nu e
--     neglijență, e livrare — și se rezolvă altfel: cu un șofer care stă mai aproape.
--
-- Deci se numără separat golul care atinge casa ÎNTRE prima și ultima atingere de poartă a
-- zilei. `km_gol_acasa` rămâne ce era (tot golul prin casă), fiindcă pe el stă împărțirea
-- „ține de repartizare / impus de uzină".
ALTER TABLE lde_route_run
  ADD COLUMN IF NOT EXISTS km_gol_pauza numeric(8,2);

COMMENT ON COLUMN lde_route_run.km_gol_pauza IS
  'Km goi prin casă făcuți ÎNTRE prima și ultima atingere de poartă a zilei — plimbarea din '
  'pauză, care se evită așteptând. Subset al km_gol_acasa; restul lui e naveta de dimineață '
  'și de seară, care se rezolvă cu alt șofer, nu cu așteptare.';
