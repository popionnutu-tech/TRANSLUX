-- 372: golul care POATE fi optimizat, separat de cel care nu poate
--
-- Ion, 18.09.2026: «trebuie să facem distincție între km goi care pot fi optimizați și goi
-- care nu pot fi optimizați». Are dreptate, iar până acum totul era într-o singură cifră,
-- care nu spunea nimic despre ce se poate face.
--
-- Cele trei feluri, după CINE le decide:
--
--  1. LIVRAREA (km_livrare, migr. 370) — casa șoferului ↔ capătul rutei. O decide
--     REPARTIZAREA: un șofer din zonă o face aproape zero. Optimizabilă.
--  2. GOLUL PRIN CASĂ (coloana de aici) — pauza dintre ture făcută pe acasă. Tot de
--     repartizare ține: cine stă lângă poartă face un drum scurt, cine stă departe unul
--     lung. Optimizabilă, dar cu grijă — Ion, 17.09: «des e ok să ducem auto în gol, în
--     special dacă nu avem în aceea zonă încă o rută în alt schimb».
--  3. REPOZIȚIONAREA — restul: mașina se întoarce goală de la poartă în zona de unde ia
--     oamenii schimbului următor, fără să treacă pe acasă. Asta o decide UZINA, prin felul
--     în care își împarte rutele pe schimburi. Noi n-o putem tăia fără să tăiem serviciul.
--     Ion, 18.09: «Orhei e unica uzină cu aproape maximală optimizare datorită împărțirii
--     rutelor de către uzină corect».
--
-- Se derivă: repoziționare = km_gol − km_livrare − km_gol_acasa.
ALTER TABLE lde_route_run
  ADD COLUMN IF NOT EXISTS km_gol_acasa numeric(8,2);
ALTER TABLE lde_route_day_contrib
  ADD COLUMN IF NOT EXISTS km_gol_acasa numeric(8,2);

COMMENT ON COLUMN lde_route_run.km_gol_acasa IS
  'Partea din km_goi în care mașina a trecut pe la baza ei (1 km). Subset al km_goi, ca și '
  'km_livrare — restul e repoziționare impusă de împărțirea rutelor pe schimburi.';
COMMENT ON COLUMN lde_route_day_contrib.km_gol_acasa IS
  'Idem, pe ziua GPS. Identitatea km_total = plin + gol + necunoscut + neatribuit rămâne: '
  'km_livrare și km_gol_acasa sunt felii DIN km_gol, nu termeni noi.';
