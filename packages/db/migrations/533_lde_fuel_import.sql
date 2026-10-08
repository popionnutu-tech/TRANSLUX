-- 533: încărcarea fișierelor Petrom (.txt) și Intelect (.xls) de către Clava — tabelele.
-- Plan: docs/plans/2026-10-08-import-combustibil-petrom-peco.md (4 revizori Claude + 3 runde Codex, pass 9.0).
-- Ion, 08.10.2026: «2 standarte fișiere care Claudia trebuie să aibă posibilitatea să încarce în programul nostru cu DT»;
-- «un fișier e Petrom, xls e Intelect»; «să legăm QR codurile …, clientul parc, cu sistemul nostru»; fișierul devine
-- sursa; șofer → agreare, apoi foaia LDE a zilei; portofel de grup → GPS; rezervele într-un tabel cu perioade.
-- Toate tabelele: RLS fără politici, REVOKE de la anon/authenticated (scrie doar serverul, cu rol verificat).

-- fiecare încărcare (un fișier)
CREATE TABLE IF NOT EXISTS lde_fuel_import (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sursa        text NOT NULL CHECK (sursa IN ('petrom', 'intelect')),
  fisier_nume  text NOT NULL,
  sha256       text NOT NULL,
  de           date NOT NULL,
  pana         date NOT NULL CHECK (pana >= de),
  randuri      integer NOT NULL,
  litri_dt     numeric NOT NULL,
  incarcat_de  text NOT NULL,
  incarcat_la  timestamptz NOT NULL DEFAULT now(),
  anulat_de    text,
  anulat_la    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_lde_fuel_import_sha ON lde_fuel_import (sha256) WHERE anulat_la IS NULL;

-- fiecare tranzacție din fișiere; cheia e stabilă între fișiere suprapuse (sursa:cod:data-ora-sec:litri:ordinal)
CREATE TABLE IF NOT EXISTS lde_fuel_import_rand (
  external_id   text PRIMARY KEY,
  sursa         text NOT NULL CHECK (sursa IN ('petrom', 'intelect')),
  cod           text NOT NULL,                 -- numărul cardului Petrom / codul portofelului Intelect
  alimentat_at  timestamptz NOT NULL,           -- ora din fișier, citită ca Europe/Chisinau
  zi_local      date NOT NULL,
  litri         numeric NOT NULL CHECK (litri > 0),
  pret          numeric,
  reducere      numeric,
  suma          numeric,
  statie        text,
  produs        text NOT NULL,
  este_dt       boolean NOT NULL,               -- doar motorina intră în consumul mașinii
  vehicle_id    uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  driver_id     uuid REFERENCES drivers(id) ON DELETE SET NULL,
  stare         text NOT NULL DEFAULT 'de_legat' CHECK (stare IN ('legat', 'de_legat', 'strain', 'non_dt')),
  legat_prin    text CHECK (legat_prin IN ('portofel', 'agreare', 'foaie_lde', 'gps', 'rezerva', 'manual')),
  motiv         text,
  actualizat_la timestamptz NOT NULL DEFAULT now(),
  CHECK (stare <> 'legat' OR vehicle_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_lde_fuel_import_rand_zi ON lde_fuel_import_rand (zi_local);
CREATE INDEX IF NOT EXISTS idx_lde_fuel_import_rand_cod ON lde_fuel_import_rand (sursa, cod);
CREATE INDEX IF NOT EXISTS idx_lde_fuel_import_rand_veh ON lde_fuel_import_rand (vehicle_id, zi_local);

-- o tranzacție poate veni din două fișiere (săptămânal + lunar): e ACTIVĂ cât o susține un import neanulat
CREATE TABLE IF NOT EXISTS lde_fuel_import_leg (
  import_id    uuid NOT NULL REFERENCES lde_fuel_import(id) ON DELETE CASCADE,
  external_id  text NOT NULL REFERENCES lde_fuel_import_rand(external_id) ON DELETE CASCADE,
  PRIMARY KEY (import_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_lde_fuel_import_leg_ext ON lde_fuel_import_leg (external_id);

-- cardul / portofelul și ce reprezintă (tip NULL = încă nelegat de Clava)
CREATE TABLE IF NOT EXISTS lde_fuel_portofel (
  sursa             text NOT NULL CHECK (sursa IN ('petrom', 'intelect')),
  cod               text NOT NULL,
  nume_fisier       text NOT NULL,
  tip               text CHECK (tip IN ('sofer', 'masina', 'grup', 'rezerva', 'strain')),
  driver_id         uuid REFERENCES drivers(id) ON DELETE SET NULL,
  vehicle_id        uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  nume_lde          text,                       -- textul exact al șoferului pe foile LDE, confirmat de Clava
  categorie         text,                       -- la «strain»: ce e (ex. consum intern)
  propus_vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,  -- propunerea softului (din plăcuță)
  legat_de          text,
  legat_la          timestamptz,
  PRIMARY KEY (sursa, cod),
  CHECK (tip IS DISTINCT FROM 'masina' OR vehicle_id IS NOT NULL),
  CHECK (tip IS DISTINCT FROM 'sofer' OR driver_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS lde_fuel_portofel_istoric (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sursa      text NOT NULL, cod text NOT NULL,
  tip_vechi  text, tip_nou text,
  vehicle_vechi uuid, vehicle_nou uuid, driver_vechi uuid, driver_nou uuid,
  schimbat_de text, schimbat_la timestamptz NOT NULL DEFAULT now()
);

-- rezervele: cine le-a avut și când (Rezervă 8 = o mașină; Rezervă 3 = o persoană din afara flotei)
CREATE TABLE IF NOT EXISTS lde_fuel_rezerva_perioada (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sursa          text NOT NULL CHECK (sursa IN ('petrom', 'intelect')),
  cod            text NOT NULL,
  de             date NOT NULL,
  pana           date,                          -- NULL = încă în curs
  vehicle_id     uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  driver_id      uuid REFERENCES drivers(id) ON DELETE SET NULL,
  persoana_text  text,                          -- persoană din afara flotei
  nota           text,
  creat_de       text NOT NULL,
  creat_la       timestamptz NOT NULL DEFAULT now(),
  CHECK (pana IS NULL OR pana >= de),
  CHECK (vehicle_id IS NOT NULL OR driver_id IS NOT NULL OR nullif(btrim(persoana_text), '') IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_lde_fuel_rezerva ON lde_fuel_rezerva_perioada (sursa, cod, de);

-- coordonatele stațiilor din fișiere (pentru portofelul de grup, prin GPS); fără «confirmat» → nu se folosesc
CREATE TABLE IF NOT EXISTS lde_fuel_statie (
  sursa        text NOT NULL CHECK (sursa IN ('petrom', 'intelect')),
  nume_fisier  text NOT NULL,
  lat          numeric,
  lon          numeric,
  confirmat    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (sursa, nume_fisier)
);

-- «E dublură» pe (mașină, zi, sursă): poate doar să scadă restul foii, activă doar cât există un import care o susține
CREATE TABLE IF NOT EXISTS lde_fuel_foaie_decizie (
  vehicle_id  uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  zi          date NOT NULL,
  sursa       text NOT NULL CHECK (sursa IN ('petrom', 'intelect')),
  decizie     text NOT NULL DEFAULT 'dublura' CHECK (decizie = 'dublura'),
  decis_de    text NOT NULL,
  decis_la    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vehicle_id, zi, sursa)
);

-- cât din fiecare foaie LDE acoperă fișierele (calculat de lde_fuel_acoperire_calc, migr. 534)
CREATE TABLE IF NOT EXISTS lde_fuel_foaie_acoperire (
  foaie_external_id  text PRIMARY KEY,
  sursa              text NOT NULL,
  vehicle_id         uuid NOT NULL,
  zi                 date NOT NULL,
  acoperit           numeric NOT NULL,
  calculat_la        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lde_fuel_acoperire_veh ON lde_fuel_foaie_acoperire (vehicle_id, zi);

-- istoricul legării fiecărui rând (cine a mutat litrii și unde)
CREATE TABLE IF NOT EXISTS lde_fuel_import_rand_istoric (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_id  text NOT NULL,
  vehicle_vechi uuid, vehicle_nou uuid,
  stare_veche  text, stare_noua text,
  legat_prin   text, motiv text,
  schimbat_la  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lde_fuel_rand_istoric ON lde_fuel_import_rand_istoric (external_id);

-- ── triggere: istoricul portofelului, istoricul rândului, rezervele fără suprapuneri ──
CREATE OR REPLACE FUNCTION lde_fuel_portofel_ist() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.tip IS NOT DISTINCT FROM OLD.tip AND NEW.vehicle_id IS NOT DISTINCT FROM OLD.vehicle_id
     AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id THEN RETURN NEW; END IF;
  INSERT INTO lde_fuel_portofel_istoric (sursa, cod, tip_vechi, tip_nou, vehicle_vechi, vehicle_nou, driver_vechi, driver_nou, schimbat_de)
  VALUES (NEW.sursa, NEW.cod, CASE WHEN TG_OP = 'UPDATE' THEN OLD.tip END, NEW.tip,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.vehicle_id END, NEW.vehicle_id,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.driver_id END, NEW.driver_id, NEW.legat_de);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lde_fuel_portofel_ist ON lde_fuel_portofel;
CREATE TRIGGER trg_lde_fuel_portofel_ist AFTER INSERT OR UPDATE ON lde_fuel_portofel FOR EACH ROW EXECUTE FUNCTION lde_fuel_portofel_ist();

CREATE OR REPLACE FUNCTION lde_fuel_rand_ist() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id OR NEW.stare IS DISTINCT FROM OLD.stare THEN
    INSERT INTO lde_fuel_import_rand_istoric (external_id, vehicle_vechi, vehicle_nou, stare_veche, stare_noua, legat_prin, motiv)
    VALUES (NEW.external_id, OLD.vehicle_id, NEW.vehicle_id, OLD.stare, NEW.stare, NEW.legat_prin, NEW.motiv);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lde_fuel_rand_ist ON lde_fuel_import_rand;
CREATE TRIGGER trg_lde_fuel_rand_ist AFTER UPDATE ON lde_fuel_import_rand FOR EACH ROW EXECUTE FUNCTION lde_fuel_rand_ist();

CREATE OR REPLACE FUNCTION lde_fuel_rezerva_fara_suprapunere() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM lde_fuel_rezerva_perioada p
             WHERE p.sursa = NEW.sursa AND p.cod = NEW.cod AND p.id <> NEW.id
               AND daterange(p.de, coalesce(p.pana, 'infinity'::date), '[]') && daterange(NEW.de, coalesce(NEW.pana, 'infinity'::date), '[]')) THEN
    RAISE EXCEPTION 'Rezerva are deja pe cineva în perioada aceasta — închide întâi perioada veche' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lde_fuel_rezerva ON lde_fuel_rezerva_perioada;
CREATE TRIGGER trg_lde_fuel_rezerva BEFORE INSERT OR UPDATE ON lde_fuel_rezerva_perioada FOR EACH ROW EXECUTE FUNCTION lde_fuel_rezerva_fara_suprapunere();

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['lde_fuel_import','lde_fuel_import_rand','lde_fuel_import_leg','lde_fuel_portofel','lde_fuel_portofel_istoric',
    'lde_fuel_rezerva_perioada','lde_fuel_statie','lde_fuel_foaie_decizie','lde_fuel_foaie_acoperire','lde_fuel_import_rand_istoric'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
  END LOOP;
END $$;
REVOKE ALL ON SEQUENCE lde_fuel_portofel_istoric_id_seq, lde_fuel_import_rand_istoric_id_seq FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION lde_fuel_portofel_ist(), lde_fuel_rand_ist(), lde_fuel_rezerva_fara_suprapunere() FROM PUBLIC, anon, authenticated;
