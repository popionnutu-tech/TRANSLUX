-- ============================================================================
-- Penalități pentru aspectul șoferilor → imaginea săptămânală în grupa șoferilor
-- (Ion, 14.09.2026): «automat ce îi aplicat să trimiți o imagine cu săptămâna
-- trecută penalități, mai jos de imagine să scrii — săptămâna asta încă nu se
-- aplică, începând de 01.10 se vor socoti».
--
-- Sumele NU se stochează: se calculează mereu din driver_appearance_checks
-- (apps/admin/src/lib/driver-penalties.ts) — o singură sursă, fără dubluri care
-- să se strice la o corectare. Tabela ține doar evidența TRIMITERII: ce
-- săptămână a plecat în grupă, când, cu ce message_id (ca retrimiterea să șteargă
-- imaginea veche — o săptămână = o imagine, același tipar ca grafic_group_posts)
-- și un instantaneu al rândurilor, ca să se poată vedea ulterior exact ce au
-- văzut șoferii, chiar dacă verdictele s-ar corecta după.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS driver_penalty_posts (
  -- luni a săptămânii trimise
  week_start date PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT now(),
  telegram_message_id bigint,
  -- de câte ori a plecat imaginea pe săptămâna asta (1 = prima dată)
  send_count integer NOT NULL DEFAULT 1,
  -- câți șoferi erau pe imagine / câți cu abateri / totalul în lei
  rows_count integer NOT NULL DEFAULT 0,
  violators_count integer NOT NULL DEFAULT 0,
  total_lei integer NOT NULL DEFAULT 0,
  -- true = săptămâna intră în reținere (se termină la/după 01.10.2026)
  applied boolean NOT NULL DEFAULT false,
  -- rândurile exact cum au fost pe imagine (DriverWeekRow[])
  snapshot jsonb
);
COMMENT ON TABLE driver_penalty_posts IS 'Imaginea saptamanala cu penalitatile de aspect trimisa in grupa soferilor (Ion, 14.09.2026). O saptamana = un rand; retrimiterea suprascrie si sterge imaginea veche.';
COMMENT ON COLUMN driver_penalty_posts.applied IS 'true = sumele se retin din salariu (saptamana se termina la/dupa 01.10.2026); false = doar aratate.';
COMMENT ON COLUMN driver_penalty_posts.snapshot IS 'DriverWeekRow[] — ce au vazut soferii pe imagine.';

ALTER TABLE driver_penalty_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY driver_penalty_posts_deny ON driver_penalty_posts USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Raportul citește pozele pe șofer și interval de zile; indexul existent e pe (check_date, trip_id).
CREATE INDEX IF NOT EXISTS idx_driver_appearance_checks_driver_day
  ON driver_appearance_checks (driver_id, check_date);

COMMIT;
