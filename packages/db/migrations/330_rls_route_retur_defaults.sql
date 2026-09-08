-- 330_rls_route_retur_defaults.sql
-- Alerta Supabase din 06.09.2026 (rls_disabled_in_public): route_retur_defaults,
-- creată în migrația 283, rămăsese fără RLS — singura tabelă din public în starea
-- asta. Tiparul întregii scheme e RLS deny-all: backend-urile (admin, bot, worker)
-- merg pe service_role, care trece peste RLS; anon/authenticated nu au ce căuta aici.
--
-- Funcția de trigger care citește tabela (aplica_retur_implicit) rula cu drepturile
-- apelantului. Cu RLS pornit, o scriere în daily_assignments făcută vreodată cu un
-- rol fără drepturi ar fi găsit tabela GOALĂ, fără eroare, și returul implicit s-ar
-- fi pierdut tăcut — exact ce a reparat 283. De aceea funcția devine SECURITY
-- DEFINER, cu search_path fixat (regula Supabase pentru funcțiile definer).

alter table route_retur_defaults enable row level security;

create or replace function aplica_retur_implicit()
returns trigger
language plpgsql
security definer
set search_path = public
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

comment on table route_retur_defaults is
  'Returul implicit al unei rute: cu ce plecare din Chișinău se întoarce șoferul ei. '
  'Aplicat automat de trigger (SECURITY DEFINER) la scrierea în daily_assignments când retur_route_id e NULL. '
  'RLS deny-all: se scrie doar cu service_role.';

-- Funcția e apelată doar de trigger; ca SECURITY DEFINER nu trebuie să fie
-- executabilă prin /rest/v1/rpc de anon/authenticated (avertismentele
-- anon_/authenticated_security_definer_function_executable din linter).
revoke execute on function public.aplica_retur_implicit() from public, anon, authenticated;
-- service_role (admin, bot, worker) trebuie să poată declanșa trigger-ul la scrierea
-- în daily_assignments — verificat cu insert + rollback ca service_role.
grant execute on function public.aplica_retur_implicit() to service_role;
