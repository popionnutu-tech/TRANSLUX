-- 332: plecarea din Nord a unei rute poate fi ASCUNSĂ din căutare (perechea lui 284)
--
-- Ion, 09.09: «la moment cursa dată nu mai este, dar ea apare în internet» — despre
-- plecarea de 15:00 din Lipcani prin Rîșcani (ruta 13, Lipcani (Rîșcani) – Chișinău).
-- O clientă a găsit-o pe site (Cuconeștii Noi 16:50), l-a sunat pe șofer, iar el i-a
-- spus că de demult nu mai merge. Reclamația a intrat prin agentul vocal.
--
-- Ascundem DOAR direcția Nord→Chișinău. Plecarea de 08:00 din Chișinău spre Lipcani
-- prin Rîșcani e cursă reală: șoferul rutei 16 face returul pe ea (retur_route_id = 13
-- în graficul zilnic), deci rămâne în căutare. `active = false` ar fi tăiat-o și pe ea.

alter table crm_routes
  add column if not exists tur_ascuns boolean not null default false;

comment on column crm_routes.tur_ascuns is
  'true = plecarea din Nord (turul) a acestei rute NU apare în căutare (site și agent vocal). '
  'Returul Chișinău→Nord nu e afectat. Perechea lui retur_ascuns (migr. 284).';

update crm_routes set tur_ascuns = true where id = 13;
