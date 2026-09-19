-- 381: locurile de service — drumul la parc nu e navetă și nu e brambura
--
-- Ion, 19.09, după lista „brambura" de la Orhei: 11 din 18 zile ieșite din comun erau
-- drumuri la același punct din Bălți, 47.770 N / 27.923 E, între 07:00 și 16:00, cu 1–6
-- ore stat — punct în care din august au oprit 94 de mașini din toată flota: parcul de
-- reparații. Un drum acolo e SERVICE: nici al șoferului (navetă), nici ieșit din comun
-- (brambura), ci al mașinii.
--
-- Locurile se țin în tabelă, nu în cod: se pot adăuga (Briceni, Orhei…) fără redeploy.
CREATE TABLE IF NOT EXISTS lde_locuri_cunoscute (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nume       text NOT NULL,
  tip        text NOT NULL CHECK (tip IN ('service')),
  lat        numeric(9,6) NOT NULL,
  lon        numeric(9,6) NOT NULL,
  raza_km    numeric(4,2) NOT NULL DEFAULT 0.5,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE lde_locuri_cunoscute ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE lde_locuri_cunoscute IS
  'Locuri cu rol cunoscut pentru citirea urmei GPS (service). Un drum din afara rutei care '
  'oprește într-un asemenea loc se scrie ca km_service, nu ca navetă.';

INSERT INTO lde_locuri_cunoscute (nume, tip, lat, lon, raza_km)
VALUES ('Parcul Bălți', 'service', 47.770, 27.923, 0.5);

ALTER TABLE lde_route_run
  ADD COLUMN IF NOT EXISTS km_service numeric(8,2);
COMMENT ON COLUMN lde_route_run.km_service IS
  'Km din afara rutei ai unui drum care oprește într-un loc de service (lde_locuri_cunoscute). '
  'Scoși din km_livrare; nu intră nici în navetă, nici în brambura.';
