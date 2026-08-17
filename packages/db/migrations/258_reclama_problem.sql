-- 258: tipul defectului de reclamă, stocat structurat pe sarcină.
--
-- De ce: dedup-ul sarcinilor de reclamă se făcea după `description`, un text pe care adminul îl
-- poate edita din Mini App — după orice redactare, același defect ar fi creat un dublu. Iar
-- «ambele» (reclamă + panou) era tratat ca un al treilea tip separat, deci pe o mașină se
-- puteau aduna 3 sarcini deschise pentru aceeași stricăciune (Ion, 17.08.2026).
--
-- Cu coloana asta, defectul e o mulțime de componente: bus → {bus}, panou_ruta → {panou},
-- ambele → {bus, panou}. Se creează sarcină doar pentru componentele NEacoperite de sarcinile
-- deschise ale mașinii.

alter table obligations add column if not exists reclama_problem text;

comment on column obligations.reclama_problem is
  'Doar pentru source=reclama: bus | panou_ruta | ambele. Cheia stabilă de dedup (description e editabil).';

-- Backfill din text pentru sarcinile existente. Ordinea contează: eticheta pentru «ambele»
-- («reclamă + panou rută») conține și cuvântul «panou».
update obligations set reclama_problem =
  case
    when description ilike '%reclamă + panou rută%' then 'ambele'
    when description ilike '%panou cu ruta%'        then 'panou_ruta'
    when description ilike '%reclamă pe autobuz%'   then 'bus'
    else null
  end
where source = 'reclama' and reclama_problem is null;
