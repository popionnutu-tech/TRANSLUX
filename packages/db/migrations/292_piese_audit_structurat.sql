-- 292: Aduce urma de audit a modulului „Piese" la forma deja folosită în proiect.
--
-- Migrația 291 a adăugat `admin_id`, dar a păstrat un `detail text` — adică descrierea schimbării
-- serializată în cuvinte. La review a ieșit că asta are trei defecte, toate evitabile:
--   • truncherea la 1000 de caractere putea TĂIA tăcut tocmai schimbarea totalului facturii
--     (un comentariu de 500 + „ → " + altul de 500 = 1015 caractere, singur peste plafon);
--   • un comentariu care conține „; furnizor: A → B" fabrica în urmă o schimbare care n-a avut loc;
--   • maparea manuală câmp-cu-câmp se strica tăcut la adăugarea unui câmp nou în antet.
--
-- Proiectul avea deja forma potrivită în `lde_audit_log` (migr. 203): `actor_admin_id uuid`,
-- `entity_id text`, `before_data jsonb`, `after_data jsonb`. O adoptăm și aici, în loc să inventăm alta.

alter table piese_audit_log
  -- Subiectul acțiunii când NU e un document cu id numeric (ex. un cont administrativ, care e uuid).
  -- `entity_id` rămâne BIGINT pentru istoricul existent; nu-l putem schimba fără a rescrie rândurile vechi.
  add column if not exists subject_id text,
  -- Starea ÎNAINTE și DUPĂ, structurat. Fără serializare în text: nimic de truncat, nimic de fabricat,
  -- iar un câmp nou apare automat în urmă fără să fie nevoie să-l adauge cineva într-o listă.
  add column if not exists before_data jsonb,
  add column if not exists after_data  jsonb;

comment on column piese_audit_log.subject_id is
  'Subiectul acțiunii când nu e un document numeric (ex. uuid-ul unui cont administrativ).';
comment on column piese_audit_log.before_data is 'Starea dinaintea modificării (doar câmpurile schimbate).';
comment on column piese_audit_log.after_data  is 'Starea de după modificare (doar câmpurile schimbate).';

create index if not exists idx_paudit_subject
  on piese_audit_log (entity, subject_id, created_at desc)
  where subject_id is not null;

-- Jurnalul devine APPEND-ONLY, ca `piese_stock_movements` (trg_pmov_immutable, migr. 200:74).
-- E ciudat ca într-un modul care își blochează explicit mișcările, dovada despre CINE le-a schimbat
-- să rămână editabilă. Aplicația nu are nicio cale de UPDATE/DELETE aici — dar urma trebuie să reziste
-- și la ce se întâmplă în afara aplicației, altfel nu e o urmă, e o notiță.
create or replace function piese_audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'piese_audit_log este append-only (urmă de audit)'; end $$;

drop trigger if exists trg_paudit_immutable on piese_audit_log;
create trigger trg_paudit_immutable before update or delete on piese_audit_log
  for each row execute function piese_audit_immutable();
