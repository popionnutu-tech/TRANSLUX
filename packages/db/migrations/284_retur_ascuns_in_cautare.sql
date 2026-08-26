-- 284: plecarea din Chișinău a unei rute poate fi ASCUNSĂ din căutare
--
-- Ion, 26.08: «aceasta rută, anume aceasta, nu trebuie să apară în căutare» —
-- despre plecarea de 17:50 a rutei 2 (Chișinău–Briceni).
--
-- De ce era nevoie: prin migrația 283 șoferul rutei 2 face returul la 10:40, deci
-- slotul propriu de 17:50 rămâne fără nimeni. Nu e o gaură de completat, ci o cursă
-- care nu se operează ca plecare din Chișinău. Înainte dispărea din listă din
-- întâmplare (regula «fără șofer = ascuns»); de ieri cursele fără șofer se ANUNȚĂ,
-- deci ar fi început să apară — o cursă pe care nimeni n-o face.
--
-- Ascundem DOAR direcția Chișinău→Nord. Turul rutei (plecarea de 05:45 din Briceni
-- spre Chișinău) e o cursă reală, cu șofer, și rămâne în căutare.

alter table crm_routes
  add column if not exists retur_ascuns boolean not null default false;

comment on column crm_routes.retur_ascuns is
  'true = plecarea din Chișinău a acestei rute NU apare în căutare (site și agent vocal). '
  'Turul Nord→Chișinău nu e afectat. Folosit când slotul nu se operează ca plecare separată.';

update crm_routes set retur_ascuns = true where id = 2;
