-- 545_driver_instruire_bilete.sql — Ion, 10.10.2026: «fă pentru Iura un artifact care este unit cu Telegram-ul
-- șoferului. Pe fiecare șofer Iura trebuie să aibă checklist că a instruit fiecare șofer cum se scanează […] După ce
-- Iura bifează la șofer trebuie să apară confirmare». Plan: docs/plans/2026-10-10-instruire-bilete-soferi.md.
--  * driver_instruire_bilete — confirmarea șoferului în bot («✅ Подтверждаю»), pe versiunea punctelor.
--  * driver_legare_cereri    — cererea de legare manuală a unui Telegram la șofer, aprobată de Iurie din bot
--                              (Ion, 10.10: «Iurie leagă singur din bot»), și jurnalul ei.
-- Doar botul (service role) citește și scrie: RLS pornit, fără politici, drepturile anon/authenticated retrase.
-- Fără funcții sau triggere.

CREATE TABLE driver_instruire_bilete (
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
  versiune INTEGER NOT NULL CHECK (versiune > 0),
  telegram_id BIGINT NOT NULL,
  confirmat_la TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (driver_id, versiune)
);

CREATE TABLE driver_legare_cereri (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
  -- Telegram-ul care cere legarea și cel legat de șofer în momentul cererii (null = nelegat). Aprobarea leagă doar
  -- dacă șoferul are încă telegram_vechi — altfel s-a legat între timp și cererea nu mai e valabilă.
  telegram_id BIGINT NOT NULL,
  telegram_vechi BIGINT,
  nume_tg TEXT,
  -- Codul de 4 cifre arătat pe telefonul șoferului și în cererea lui Iurie: Iurie leagă doar dacă le vede egale.
  cod TEXT NOT NULL CHECK (cod ~ '^[0-9]{4}$'),
  stare TEXT NOT NULL DEFAULT 'asteapta' CHECK (stare IN ('asteapta', 'legat', 'refuzat', 'expirat')),
  creat_la TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_la TIMESTAMPTZ NOT NULL,
  decis_de BIGINT,
  decis_la TIMESTAMPTZ
);

-- O singură cerere în așteptare pe șofer și una pe Telegram (cele expirate trec întâi în 'expirat').
CREATE UNIQUE INDEX driver_legare_cereri_asteapta_sofer ON driver_legare_cereri (driver_id) WHERE stare = 'asteapta';
CREATE UNIQUE INDEX driver_legare_cereri_asteapta_tg ON driver_legare_cereri (telegram_id) WHERE stare = 'asteapta';
-- Plafonul de 3 cereri pe zi pe Telegram.
CREATE INDEX driver_legare_cereri_tg_zi ON driver_legare_cereri (telegram_id, creat_la DESC);

ALTER TABLE driver_instruire_bilete ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_legare_cereri ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON driver_instruire_bilete, driver_legare_cereri FROM anon, authenticated;
