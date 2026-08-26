-- 283: returul implicit al unei rute — regula stă în DATE, nu în capul dispecerului
--
-- Ion, 26.08: «șoferul de pe 17:50 face returul la 10:40 — e ruta pe Briceni».
-- Exact asta stătea în daily_assignments pe 25 și 26.08 (ruta 2 → retur pe ruta 16),
-- dar pe 27.08 legătura lipsea: rândul se introduce manual în fiecare zi și pur și
-- simplu s-a uitat. Cursa de 10:40 Chișinău→Bălți rămânea fără șofer, iar pasagerul
-- n-o găsea nici pe site, nici la agentul vocal.
--
-- Cron-ul copy-assignments ȘTIE să care retur_route_id mai departe, dar nu apucă
-- niciodată: el se oprește dacă ziua următoare are deja rânduri, iar dispecerul o
-- completează manual peste zi. Deci regula nu poate trăi în cron.
--
-- O punem în date, cu trigger: orice cale de scriere (panoul /assignments, mini app,
-- cron, import) primește aceeași valoare implicită. Ca s-o rupi, ștergi rândul din
-- route_retur_defaults — nu se poate pierde din neatenție.

create table if not exists route_retur_defaults (
  crm_route_id    integer primary key references crm_routes(id) on delete cascade,
  retur_route_id  integer not null references crm_routes(id) on delete cascade,
  note            text,
  created_at      timestamptz not null default now(),
  constraint retur_default_nu_pe_sine check (crm_route_id <> retur_route_id)
);

comment on table route_retur_defaults is
  'Returul implicit al unei rute: cu ce plecare din Chișinău se întoarce șoferul ei. '
  'Aplicat automat de trigger la scrierea în daily_assignments când retur_route_id e NULL.';

create or replace function aplica_retur_implicit()
returns trigger
language plpgsql
as $$
begin
  if new.retur_route_id is null then
    select d.retur_route_id into new.retur_route_id
    from route_retur_defaults d
    where d.crm_route_id = new.crm_route_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_retur_implicit on daily_assignments;
create trigger trg_retur_implicit
before insert or update of crm_route_id, retur_route_id on daily_assignments
for each row execute function aplica_retur_implicit();

-- Regula cerută de Ion: ruta 2 (Chișinău–Briceni, plecare 17:50) își face returul
-- pe ruta 16 (Chișinău–Lipcani, plecare 10:40).
insert into route_retur_defaults (crm_route_id, retur_route_id, note)
values (2, 16, 'Ion 26.08: șoferul de pe 17:50 (Briceni) face returul la 10:40')
on conflict (crm_route_id) do update
  set retur_route_id = excluded.retur_route_id, note = excluded.note;

-- Rândurile deja introduse fără legătură — inclusiv gaura de mâine, 27.08.
update daily_assignments a
set retur_route_id = d.retur_route_id
from route_retur_defaults d
where a.crm_route_id = d.crm_route_id
  and a.retur_route_id is null
  and a.assignment_date >= current_date;
