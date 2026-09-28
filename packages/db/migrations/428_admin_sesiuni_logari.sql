-- 428: sesiuni revocabile + jurnal de logări pentru panoul central-hub (ION-126, 28.09.2026).
--
-- Până acum sesiunea era un JWT de 24 h verificat doar după semnătură: schimbarea parolei,
-- dezactivarea contului sau schimbarea rolului NU închideau sesiunile deja deschise, iar
-- logările nu se scriau nicăieri. Declanșat de incidentul altei firme (sesiune vie folosită
-- din altă rețea, fără ca resetarea parolei s-o închidă).

-- 1. Versiunea sesiunii. JWT-ul poartă `sv`; middleware-ul și verifySession resping tokenul
--    când `sv` diferă de valoarea din bază. Tokenurile emise înainte de migrație n-au `sv`
--    și se citesc ca 0 — sesiunile de azi nu cad la desfășurare.
alter table public.admin_accounts
  add column if not exists session_version integer not null default 0;

-- Crește singură la schimbarea parolei, a stării sau a rolului — pe ORICE cale, inclusiv
-- un UPDATE făcut de mână în SQL (panoul n-are încă formular de schimbare a parolei).
create or replace function public.admin_accounts_bump_session_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.password_hash is distinct from old.password_hash
     or new.active is distinct from old.active
     or new.role is distinct from old.role then
    new.session_version := old.session_version + 1;
  end if;
  return new;
end;
$$;

-- Funcțiile noi sunt executabile de anon prin PUBLIC (vezi migr. 355/356) — închidem explicit.
revoke execute on function public.admin_accounts_bump_session_version() from public, anon, authenticated;

drop trigger if exists admin_accounts_session_version on public.admin_accounts;
create trigger admin_accounts_session_version
  before update on public.admin_accounts
  for each row execute function public.admin_accounts_bump_session_version();

-- 2. Jurnalul logărilor: fiecare încercare, reușită sau nu. Din el se calculează și blocarea
--    după parole greșite, și semnalul «ADMIN dintr-o rețea nouă».
create table if not exists public.admin_login_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  email       text not null,
  admin_id    uuid references public.admin_accounts(id) on delete set null,
  ok          boolean not null,
  motiv       text not null check (motiv in ('ok', 'parola', 'necunoscut', 'inactiv', 'blocat_email', 'blocat_ip')),
  ip          text,
  retea       text,          -- /24 la IPv4, /48 la IPv6: furnizorul mobil schimbă adresa zilnic
  user_agent  text,
  tara        text,          -- x-vercel-ip-country, doar pentru citit mesajul
  oras        text
);

comment on table public.admin_login_events is
  'ION-126: încercările de logare în central-hub. Blocare: 5 greșeli pe email / 30 pe IP în 15 min.';

create index if not exists admin_login_events_email_at on public.admin_login_events (email, created_at desc);
create index if not exists admin_login_events_ip_at on public.admin_login_events (ip, created_at desc);
create index if not exists admin_login_events_admin_ok on public.admin_login_events (admin_id, created_at desc) where ok;

-- Doar service role (panoul). Fără politici = închis pentru anon/authenticated.
alter table public.admin_login_events enable row level security;
revoke all on table public.admin_login_events from public, anon, authenticated;
revoke all on sequence public.admin_login_events_id_seq from public, anon, authenticated;
