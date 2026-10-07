-- 528: panoul normelor pentru Clava (plan docs/plans/2026-10-07-panou-norme-clava.md, 3 runde Claude + Codex)
--
-- Ion, 07.10.2026: «facem un panou lui Clava în care lunar se propun normele la auto și șoferi, și ea fie acceptă, fie nu
-- acceptă și scrie comentariu de ce»; pe luna ÎNCHISĂ («după ce luna s-a închis») softul propune două cifre — norma tipului
-- și media mașinii pe 3 luni («verificarea se face strict tipuri mașini și media 3 luni la această mașină») — Clava alege
-- una sau «pune norma pe care o crede și comentariu de ce, ca să învățăm sistemul». Posterul de combustibil pleacă în grupă
-- «doar după confirmarea mea» (Ion).
--  * lde_norma_luna — decizia Clavei pe mașină și lună, cu reperele înghețate la decizie;
--  * lde_norma_luna_istoric — fiecare decizie și fiecare schimbare (trigger, nu poate lipsi);
--  * lde_norma_luna_confirmare — confirmarea lui Ion pe lună + starea posterului pe bucăți (album / general / introducere).

CREATE TABLE IF NOT EXISTS lde_norma_luna (
  luna        date NOT NULL CHECK (date_trunc('month', luna) = luna),
  vehicle_id  uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  norma_tip   numeric,
  medie3      numeric,
  km3         numeric,
  ales        text NOT NULL CHECK (ales IN ('tip', 'medie3', 'clava')),
  norma       numeric NOT NULL CHECK (norma > 0 AND norma < 100),
  comentariu  text CHECK (comentariu IS NULL OR length(comentariu) <= 1000),
  decis_de    text NOT NULL,
  decis_la    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (luna, vehicle_id),
  CHECK (ales <> 'clava' OR (comentariu IS NOT NULL AND length(btrim(comentariu)) >= 5)),
  CHECK (ales <> 'tip' OR norma = norma_tip),
  CHECK (ales <> 'medie3' OR norma = medie3)
);
COMMENT ON TABLE lde_norma_luna IS
  'Norma lunii pe mașină aleasă de Clava pe /lde/agreare/norme: tip | medie3 (media mașinii pe 3 luni închise) | clava (cifra ei + motiv). '
  'Contează în poster și /lde/combustibil doar după confirmarea lui Ion (lde_norma_luna_confirmare).';
ALTER TABLE lde_norma_luna ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lde_norma_luna FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS lde_norma_luna_istoric (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  luna        date NOT NULL,
  vehicle_id  uuid NOT NULL,
  norma_tip   numeric,
  medie3      numeric,
  km3         numeric,
  ales        text NOT NULL,
  norma       numeric NOT NULL,
  comentariu  text,
  decis_de    text NOT NULL,
  decis_la    timestamptz NOT NULL,
  scris_la    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lde_norma_luna_istoric ON lde_norma_luna_istoric (vehicle_id, luna);
ALTER TABLE lde_norma_luna_istoric ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lde_norma_luna_istoric FROM anon, authenticated;

CREATE OR REPLACE FUNCTION lde_norma_luna_istoric_scrie() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO lde_norma_luna_istoric (luna, vehicle_id, norma_tip, medie3, km3, ales, norma, comentariu, decis_de, decis_la)
  VALUES (NEW.luna, NEW.vehicle_id, NEW.norma_tip, NEW.medie3, NEW.km3, NEW.ales, NEW.norma, NEW.comentariu, NEW.decis_de, NEW.decis_la);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION lde_norma_luna_istoric_scrie() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_lde_norma_luna_istoric ON lde_norma_luna;
CREATE TRIGGER trg_lde_norma_luna_istoric AFTER INSERT OR UPDATE ON lde_norma_luna
  FOR EACH ROW EXECUTE FUNCTION lde_norma_luna_istoric_scrie();

-- poster_rezultat: {"album": s, "general": s, "introducere": s}, s ∈ netrimis | in_curs | ok | refuzat | incert
--   (in_curs scris ÎNAINTE de trimitere; incert = timeout / rețea — nu se retrimite automat, Ion verifică în grupă)
CREATE TABLE IF NOT EXISTS lde_norma_luna_confirmare (
  luna             date PRIMARY KEY CHECK (date_trunc('month', luna) = luna),
  confirmat_de     text NOT NULL,
  confirmat_la     timestamptz NOT NULL DEFAULT now(),
  poster_rezultat  jsonb NOT NULL DEFAULT '{"album":"netrimis","general":"netrimis","introducere":"netrimis"}'::jsonb,
  poster_motiv     text,
  poster_trimis_la timestamptz
);
ALTER TABLE lde_norma_luna_confirmare ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lde_norma_luna_confirmare FROM anon, authenticated;
