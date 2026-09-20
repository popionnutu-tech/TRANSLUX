-- 383_concurenta_owners.sql
-- Concurența pe direcție (ION-13): proprietarii firmelor din graficul ANTA.
--
-- Ion, 20.09.2026: «în finalii proprietari ai tuturor companiilor, ca să văd numele proprietarului lângă
-- firmă și să pot filtra după el… pe toate rutele, toate companiile». Beneficiarii efectivi NU sunt
-- publici în Moldova; ce e public: fondatorii (cu cotele, unde le dă registrul) și administratorul.
-- Sursa: apps/admin/scripts/anta/owners.json, strâns din registrele deschise (srl.md, informer.md,
-- overit.md, infobiz.md), o dată; se reîncarcă cu apps/admin/scripts/anta-owners-import.mts.
-- Cheia e numele firmei așa cum apare în anta_courses.operator (o linie «A S.R.L., B S.R.L.» = două firme;
-- despărțirea o face apps/admin/src/lib/anta/names.ts splitOperator).

create table if not exists anta_companies (
  id            serial primary key,
  company       text not null unique,
  idno          text,
  official_name text,
  administrator text,
  founders      jsonb not null default '[]'::jsonb,
  source        text,
  note          text,
  fetched_at    date
);
comment on table anta_companies is 'Firmele din graficul ANTA cu fondatorii și administratorul din registrele publice (ION-13). founders = [{name, share}].';
comment on column anta_companies.company is 'Numele firmei exact ca în anta_courses.operator (după despărțirea la virgulă).';
comment on column anta_companies.note is 'De ce lipsesc date: S.A. fără acționari publici, Î.I. cu registrul ascuns, negăsită, Transnistria.';

alter table anta_companies enable row level security;
revoke all on anta_companies from anon, authenticated;
revoke all on sequence anta_companies_id_seq from anon, authenticated;

-- Toate firmele cu proprietarii lor, ca jsonb (un singur rând — PostgREST ar tăia un set la 1000).
create or replace function anta_companies_json()
returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'company', c.company, 'idno', c.idno, 'official_name', c.official_name, 'administrator', c.administrator,
    'founders', c.founders, 'source', c.source, 'note', c.note) order by c.company), '[]'::jsonb)
  from anta_companies c
$$;

revoke execute on function anta_companies_json() from public, anon, authenticated;
