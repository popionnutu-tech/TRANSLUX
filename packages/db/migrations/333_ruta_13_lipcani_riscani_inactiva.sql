-- 333: ruta 13 (Lipcani (Rîșcani) – Chișinău) iese cu totul din circulație
--
-- Ion, 09.09, după migr. 332 (care ascundea doar plecarea de 15:00 din Lipcani):
-- «și cel de dimineață nu trebuie» — nici plecarea de 08:00 din Chișinău prin
-- Rîșcani nu se mai face. Ruta întreagă devine inactivă: dispare din căutare
-- (site, agent vocal), din grafic și din atribuiri. Rândurile din daily_assignments
-- care o mai referă (Bzovii pe tur, returul rutei 16 pe ea) rămân în istoric.

update crm_routes set active = false where id = 13;
