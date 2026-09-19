-- 381_sofer_identitate.sql
-- Identitatea șoferului din poza de la peron.
--
-- Ion, 19.09.2026: «hai toți șoferii să identificăm după trăsături față, deja
-- multe zile avem, ca ulterior să nu poată pune alt om în poză operatorul ca să
-- închidă. Dar identificarea la om trebuie de făcut nu tare rigidă».
--
-- Cum merge (apps/bot/src/services/driverIdentity.ts, driverReferences.ts):
--   * Fiecare șofer are câteva poze de REFERINȚĂ (max 4, din zile diferite),
--     copiate din pozele acceptate la peron în report-photos/soferi-referinta/
--     <driver_id>/<check_id>.jpg. Ștergerea după 30 de zile (photoRetention.ts)
--     umblă doar la storage_key din tabelele de verificări, deci copia rămâne.
--     Prima încărcare se face din pozele deja existente, comparate între ele
--     (fiecare cu celelalte): intră ca referință doar cele care se potrivesc.
--   * La fiecare poză nouă, după verdictul de aspect, modelul compară persoana
--     cu referințele: «da» / «nesigur» / «nu» + încredere + motiv. Se scriu aici,
--     pe rândul pozei (identity_*).
--   * «Nu rigid»: se refuză DOAR «nu» cu încredere mare, și cel mult O DATĂ pe
--     șofer pe zi. A doua poză cu același verdict trece, dar rămâne marcată și
--     adminul primește poza. «nesigur» trece întotdeauna. Modelul căzut → trece,
--     identity_verdict null.
--   * Poza refuzată NU dispare (ca la cadru incomplet): rândul rămâne cu
--     rejected_code='ALT_OM' și fișierul în bucket — e proba pentru admin.
--     GET /day și POST /report ignoră rândurile cu rejected_code.

alter table driver_appearance_checks
  add column if not exists identity_verdict text
    check (identity_verdict in ('da', 'nesigur', 'nu')),
  add column if not exists identity_confidence real,
  add column if not exists identity_reason text,
  add column if not exists identity_refs smallint,
  add column if not exists rejected_code text
    check (rejected_code in ('ALT_OM'));

comment on column driver_appearance_checks.identity_verdict is
  'Persoana din poză e șoferul din referințe? da / nesigur / nu (modelul). null = fără referințe sau modelul n-a răspuns.';
comment on column driver_appearance_checks.identity_confidence is
  'Încrederea modelului în identity_verdict, 0..1.';
comment on column driver_appearance_checks.identity_reason is
  'O propoziție a modelului: ce se potrivește / ce diferă.';
comment on column driver_appearance_checks.identity_refs is
  'Câte poze de referință a văzut modelul la comparație (0 = fără comparație).';
comment on column driver_appearance_checks.rejected_code is
  'ALT_OM = poza refuzată operatorului (persoana nu pare a fi șoferul); rândul și fișierul rămân ca probă. null = acceptată.';

create index if not exists idx_driver_appearance_checks_driver_day
  on driver_appearance_checks (driver_id, check_date)
  where driver_id is not null;

-- Pozele de referință ale șoferului (copii permanente în bucket).
create table if not exists driver_reference_photos (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id),
  storage_key text not null,
  source_check_id uuid references driver_appearance_checks(id),
  check_date date not null,
  -- 'bootstrap' = din pozele vechi, comparate între ele; 'single' = singura poză
  -- a șoferului, neconfirmată de nimic; 'match' = poză nouă, confirmată «da».
  source text not null check (source in ('bootstrap', 'single', 'match')),
  created_at timestamptz not null default now(),
  unique (driver_id, source_check_id)
);

create index if not exists idx_driver_reference_photos_driver
  on driver_reference_photos (driver_id, check_date desc);

alter table driver_reference_photos enable row level security;

comment on table driver_reference_photos is
  'Pozele de referință ale șoferului pentru identitate la peron (max 4, zile diferite). Copii în soferi-referinta/, nu se șterg la 30 de zile. Ion, 19.09.2026.';
