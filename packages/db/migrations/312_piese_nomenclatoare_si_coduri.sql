-- 312: Nomenclatoare pentru producător și marca mașinii + mai multe coduri de bare pe o piesă.
--
-- Cerut de Eduard (Prihod, punctele 1 și 3):
--   „Добавить каталог на производителя, марки машин. То что вносил уже раз одно выдавать, с
--    возможностью добавить в каталог новую фирму или марку автомобиля."
--   „Возможность добавить несколько штрих-кодов в одну позицию"
--
-- ── De ce nomenclatoare, și nu doar câmpuri libere ─────────────────────────────
-- Câmpurile există de la început, dar sunt text liber — și se vede în date. Din 10.523 de piese, doar 141
-- au producător și 30 au marcă. Iar puținele completate arată exact ce face textul liber:
--   · „TRW" (10 piese) și „Trw" (1) — același producător, două valori;
--   · „Higer" și „HIGER NOU" — aceeași marcă;
--   · „Skoda Superb 2020" și „Scoda Octavia 2020" — a doua scrisă greșit;
--   · un producător numit „111".
-- Filtrele din ecranul „Stoc" (migr. 290) construiesc lista din valorile DISTINCTE, deci fiecare variantă
-- de scriere apare ca opțiune separată. Cine filtrează pe „TRW" pierde tăcut piesa scrisă „Trw".
--
-- Nomenclatorul nu înlocuiește coloanele: rămân text, dar ecranul propune ce s-a introdus deja și adaugă
-- în catalog doar la cerere explicită. Așa nu trebuie atinși toți cititorii (view-uri, filtre, căutare,
-- etichete), iar o piesă importată din afară nu e respinsă fiindcă producătorul ei nu e încă în listă.

create table if not exists piese_manufacturers (
  id bigserial primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Unicitate INSENSIBILĂ la litere mari/mici: fără ea, „TRW" și „Trw" ar reintra amândouă în catalog și
-- n-am fi rezolvat nimic — doar am fi mutat problema din câmpul liber în listă.
create unique index if not exists idx_pmanuf_name_ci on piese_manufacturers (lower(name));

create table if not exists piese_car_models (
  id bigserial primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_pcarmodel_name_ci on piese_car_models (lower(name));

comment on table piese_manufacturers is
  'Nomenclator de producători de piese (Mann, Bosch, TRW). Propus la introducere; se adaugă la cerere.';
comment on table piese_car_models is
  'Nomenclator de mărci/modele de mașini pentru care e piesa (DAF SB220, Higer). Idem.';

-- ── Populare din ce s-a introdus deja ──────────────────────────────────────────
-- Ortografia păstrată e cea MAI FOLOSITĂ: din „TRW" (10 piese) și „Trw" (1) rămâne „TRW". La egalitate
-- decide ordinea alfabetică, ca rezultatul să fie același indiferent când se rulează migrația.
insert into piese_manufacturers (name)
select name from (
  select manufacturer as name, count(*) as n,
         row_number() over (partition by lower(manufacturer) order by count(*) desc, manufacturer) as rn
    from piese_parts
   where manufacturer is not null and btrim(manufacturer) <> ''
   group by manufacturer
) t where rn = 1
on conflict do nothing;

insert into piese_car_models (name)
select name from (
  select model as name, count(*) as n,
         row_number() over (partition by lower(model) order by count(*) desc, model) as rn
    from piese_parts
   where model is not null and btrim(model) <> ''
   group by model
) t where rn = 1
on conflict do nothing;

-- Aliniem și piesele la ortografia canonică, altfel filtrul din „Stoc" ar arăta în continuare două
-- intrări pentru același producător: una din nomenclator, alta din piesa scrisă altfel.
update piese_parts p
   set manufacturer = m.name
  from piese_manufacturers m
 where lower(p.manufacturer) = lower(m.name) and p.manufacturer <> m.name;

update piese_parts p
   set model = c.name
  from piese_car_models c
 where lower(p.model) = lower(c.name) and p.model <> c.name;

-- ── Mai multe coduri de bare pe aceeași piesă ─────────────────────────────────
-- Aceeași piesă vine de la furnizori diferiți, fiecare cu ambalajul și codul lui. Cu o singură coloană,
-- al doilea cod îl ștergea pe primul — iar scanarea vechiului ambalaj nu mai găsea nimic.
--
-- Tabelul e SURSA UNICĂ. `piese_parts.barcode` rămâne oglinda codului PRINCIPAL (cel de pe etichetă),
-- fiindcă îl citesc deja view-urile, filtrele, căutarea și modulul de etichete; sincronizarea o ține
-- triggerul de mai jos, ca să nu existe două adevăruri întreținute manual.
create table if not exists piese_part_barcodes (
  id bigserial primary key,
  part_id bigint not null references piese_parts(id) on delete cascade,
  barcode text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

-- Un cod de bare identifică o SINGURĂ piesă. Fără asta, scanarea ar returna două rezultate și
-- depozitarul ar trebui să ghicească — exact ce scanarea trebuie să elimine.
-- Unicitatea e INSENSIBILĂ la litere, ca și comparațiile din aplicație. Altfel „abc" și „ABC" ar fi fost
-- două piese diferite, iar cine schimba doar litera mare vedea modificarea ignorată tăcut.
create unique index if not exists idx_ppbc_code_ci on piese_part_barcodes (lower(barcode));
create index if not exists idx_ppbc_part on piese_part_barcodes (part_id);
-- Cel mult un cod principal per piesă.
create unique index if not exists idx_ppbc_primary on piese_part_barcodes (part_id) where is_primary;

comment on table piese_part_barcodes is
  'Codurile de bare ale unei piese. `is_primary` = cel de pe etichetă, oglindit în piese_parts.barcode.';

-- RLS pe toate trei, ca pe orice tabel `piese_*` (migr. 201). Grant-urile de la final blochează deja anon,
-- dar regula proiectului e ca RLS să fie stratul de bază, nu privilegiile — altfel un GRANT viitor
-- (script, migrație, mână de om) redeschide accesul fără nicio plasă dedesubt.
alter table piese_manufacturers enable row level security;
alter table piese_car_models enable row level security;
alter table piese_part_barcodes enable row level security;

-- Codurile existente devin principale. `distinct on` fiindcă în date pot exista duplicate între piese, iar
-- indexul unic le-ar respinge: păstrăm prima piesă (cea mai veche) și lăsăm restul pe coloana veche —
-- se rezolvă manual, nu tăcut.
insert into piese_part_barcodes (part_id, barcode, is_primary)
select distinct on (btrim(barcode)) id, btrim(barcode), true
  from piese_parts
 where barcode is not null and btrim(barcode) <> ''
 order by btrim(barcode), id
on conflict do nothing;

-- Sincronizarea coloanei-oglindă. Scrisă ca trigger, nu lăsată în seama aplicației: `piese_parts.barcode`
-- e citit din opt locuri, iar dacă s-ar actualiza doar din formularul de piesă, orice altă cale de scriere
-- (import, corecție, script) ar lăsa eticheta cu un cod care nu mai există.
create or replace function piese_sync_primary_barcode() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
DECLARE v_part bigint; v_code text; v_all text;
BEGIN
  v_part := COALESCE(NEW.part_id, OLD.part_id);
  SELECT max(barcode) FILTER (WHERE is_primary),
         string_agg(barcode, ' ' ORDER BY is_primary DESC, id)
    INTO v_code, v_all
    FROM piese_part_barcodes WHERE part_id = v_part;
  UPDATE piese_parts
     SET barcode = v_code, barcodes_all = v_all
   WHERE id = v_part
     AND (barcode IS DISTINCT FROM v_code OR barcodes_all IS DISTINCT FROM v_all);
  RETURN NULL;
END $$;

drop trigger if exists trg_ppbc_sync on piese_part_barcodes;
create trigger trg_ppbc_sync
  after insert or update or delete on piese_part_barcodes
  for each row execute function piese_sync_primary_barcode();

revoke all on function piese_sync_primary_barcode() from public, anon, authenticated;

-- ── Căutarea trebuie să găsească piesa după ORICARE dintre coduri ─────────────
-- Altfel tabelul ar fi doar depozitare: scanarea celui de-al doilea ambalaj n-ar returna nimic, adică
-- exact problema pentru care s-a cerut.
--
-- `barcodes_all` e COLOANĂ REALĂ, nu subinterogare în view. Prima variantă o calcula corelat, per rând —
-- iar view-ul e citit de căutarea din TOATE formularele (prihod, rashod, mutări, inventar), la fiecare
-- tastă. `ORDER BY` se aplică după filtru, deci se executau ~10.500 de subinterogări la fiecare căutare,
-- fără nicio ieșire devreme. Ca și coloană, filtrul costă exact cât costa înainte pe `barcode` și, în plus,
-- poate folosi un index trigram.
alter table piese_parts add column if not exists barcodes_all text;

comment on column piese_parts.barcodes_all is
  'Oglinda LISTEI de coduri (toate, separate prin spațiu), ținută de trg_ppbc_sync. Doar pentru căutare.';

update piese_parts p
   set barcodes_all = s.all_codes
  from (select part_id, string_agg(barcode, ' ' order by is_primary desc, id) as all_codes
          from piese_part_barcodes group by part_id) s
 where s.part_id = p.id and p.barcodes_all is distinct from s.all_codes;

-- Piesele fără rânduri în tabel (import direct, înainte de migrația asta) — lista = codul lor.
update piese_parts set barcodes_all = barcode
 where barcodes_all is null and barcode is not null and btrim(barcode) <> '';

create index if not exists idx_pparts_barcodes_trgm
  on piese_parts using gin (barcodes_all gin_trgm_ops);

-- `barcode` rămâne codul principal (afișat, tipărit pe etichetă); `barcodes_all` e câmpul pe care cade
-- căutarea — așa cititorii existenți nu se schimbă deloc.
CREATE OR REPLACE VIEW piese_catalog_rows AS
  SELECT p.id, p.group_id, p.name_long, p.manufacturer, p.model, p.article_code, p.oem_code,
    p.barcode, p.unit, p.is_for_sale, p.active, p.created_at,
    g.name_ro AS group_name, p.name_ro, p.barcodes_all
  FROM piese_parts p
  JOIN piese_part_groups g ON g.id = p.group_id
  WHERE p.active;

-- Și ecranul „Stoc" caută după cod: fără asta, scanarea celui de-al doilea ambalaj ar fi funcționat
-- în unele ecrane și nu în altele.
CREATE OR REPLACE VIEW piese_stock_rows AS
  SELECT p.id AS part_id, w.id AS warehouse_id, g.id AS group_id, g.name_ro AS group_name,
    p.name_long, p.manufacturer, p.model, p.barcode, p.unit, w.name AS warehouse_name,
    loc.location_label, COALESCE(loc.min_qty, (0)::real) AS min_qty, cs.qty,
    CASE WHEN cs.qty > (0)::double precision THEN (cs.value / cs.qty) ELSE (0)::real END AS avg_cost,
    cs.value, p.name_ro, p.article_code, p.oem_code, p.barcodes_all
  FROM piese_parts p
  JOIN piese_part_groups g ON g.id = p.group_id
  CROSS JOIN piese_warehouses w
  LEFT JOIN piese_part_locations loc ON loc.part_id = p.id AND loc.warehouse_id = w.id
  JOIN piese_current_stock cs ON cs.part_id = p.id AND cs.warehouse_id = w.id
  WHERE p.active AND (cs.qty <> (0)::double precision OR loc.id IS NOT NULL);

-- ── Setarea codurilor unei piese, ATOMIC ──────────────────────────────────────
-- Prima variantă făcea patru cereri separate din aplicație, deci patru tranzacții — iar prima ridica
-- marcajul de „principal", ceea ce golea imediat codul de pe etichetă. Dacă a treia eșua (cazul cel mai
-- banal: codul introdus aparține altei piese), piesa rămânea PERMANENT fără niciun cod, iar omul vedea
-- doar „cod duplicat". Pierdere de date dintr-o greșeală de tastare.
CREATE OR REPLACE FUNCTION piese_set_part_barcodes(p_part bigint, p_codes text[])
RETURNS void LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_owner bigint; v_dup text;
BEGIN
  IF p_part IS NULL THEN RAISE EXCEPTION 'BAD_PART'; END IF;
  PERFORM 1 FROM piese_parts WHERE id = p_part FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAD_PART'; END IF;

  -- Lista dorită: curățată, fără goale, deduplicată INSENSIBIL la litere, cu ordinea păstrată.
  -- Primul rămâne cel principal (cel de pe etichetă).
  CREATE TEMP TABLE _want ON COMMIT DROP AS
  SELECT code, row_number() OVER (ORDER BY ord) AS rn FROM (
    SELECT DISTINCT ON (lower(code)) code, ord FROM (
      SELECT btrim(c) AS code, ord FROM unnest(p_codes) WITH ORDINALITY AS t(c, ord)
       WHERE btrim(c) <> ''
    ) x ORDER BY lower(code), ord
  ) y;

  -- Un cod ținut de ALTĂ piesă: oprim cu un mesaj clar, în loc să lăsăm indexul unic să arunce
  -- o eroare de bază pe care omul n-o poate interpreta.
  SELECT b.barcode, b.part_id INTO v_dup, v_owner
    FROM piese_part_barcodes b JOIN _want w ON lower(w.code) = lower(b.barcode)
   WHERE b.part_id <> p_part LIMIT 1;
  IF v_dup IS NOT NULL THEN RAISE EXCEPTION 'BARCODE_TAKEN:%', v_dup; END IF;

  DELETE FROM piese_part_barcodes b
   WHERE b.part_id = p_part
     AND NOT EXISTS (SELECT 1 FROM _want w WHERE lower(w.code) = lower(b.barcode));

  -- Marcajul de principal se ridică ÎNAINTE de a-l pune pe cel nou: indexul unic parțial nu permite două.
  UPDATE piese_part_barcodes SET is_primary = false WHERE part_id = p_part AND is_primary;

  INSERT INTO piese_part_barcodes (part_id, barcode, is_primary)
  SELECT p_part, w.code, false FROM _want w
   WHERE NOT EXISTS (SELECT 1 FROM piese_part_barcodes b
                      WHERE b.part_id = p_part AND lower(b.barcode) = lower(w.code));

  -- Ortografia trimisă acum câștigă (cine schimbă doar litera mare vede efectul).
  UPDATE piese_part_barcodes b SET barcode = w.code
    FROM _want w
   WHERE b.part_id = p_part AND lower(b.barcode) = lower(w.code) AND b.barcode <> w.code;

  UPDATE piese_part_barcodes b SET is_primary = true
    FROM _want w
   WHERE b.part_id = p_part AND w.rn = 1 AND lower(b.barcode) = lower(w.code);

  -- Fără coduri, triggerul nu s-a declanșat (nu s-a schimbat nimic în tabel) — golim oglinzile explicit.
  IF NOT EXISTS (SELECT 1 FROM _want) THEN
    UPDATE piese_parts SET barcode = NULL, barcodes_all = NULL
     WHERE id = p_part AND (barcode IS NOT NULL OR barcodes_all IS NOT NULL);
  END IF;

  DROP TABLE IF EXISTS _want;
END $$;

REVOKE ALL ON FUNCTION piese_set_part_barcodes(bigint, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_set_part_barcodes(bigint, text[]) TO service_role;

-- Nomenclatoarele se citesc prin service_role, ca tot modulul (vezi migr. 289).
revoke all on piese_manufacturers from public, anon, authenticated;
revoke all on piese_car_models from public, anon, authenticated;
revoke all on piese_part_barcodes from public, anon, authenticated;
grant select, insert, update, delete on piese_manufacturers to service_role;
grant select, insert, update, delete on piese_car_models to service_role;
grant select, insert, update, delete on piese_part_barcodes to service_role;
-- Și secvențele: `ALTER DEFAULT PRIVILEGES` al proiectului le acoperă și pe ele.
revoke all on sequence piese_manufacturers_id_seq from public, anon, authenticated;
revoke all on sequence piese_car_models_id_seq from public, anon, authenticated;
revoke all on sequence piese_part_barcodes_id_seq from public, anon, authenticated;
grant usage, select on sequence piese_manufacturers_id_seq to service_role;
grant usage, select on sequence piese_car_models_id_seq to service_role;
grant usage, select on sequence piese_part_barcodes_id_seq to service_role;
