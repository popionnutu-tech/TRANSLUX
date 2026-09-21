-- 384: naveta făcută cu ALTĂ mașină decât autobuzul rutei
--
-- Ion, 21.09.2026: «include in analitica si asta livrare».
--
-- Livrarea se numără azi pe autobuzul care face ruta (`lde_route_run.km_livrare`). Când
-- omul e dus la autobuz cu altă mașină, km-ii ăia nu apar nicăieri. Cazul verificat pe
-- GPS, 01–19.09: ruta 25 «Vatici → SEBN MD» e făcută de 820GXP, care DOARME la Vatici —
-- livrare 0 în fiecare zi, linie curată. Dar 073BRAO (Sprinter 312) face Ocnița-Răzeși ↔
-- Vatici de trei ori pe zi, ~210 km/zi, și așteaptă lângă autobuz exact cât ține schimbul
-- (18.09: la Vatici 04:46–06:34, 13:05–15:18, 21:42–23:36; schimburile autobuzului
-- 05:02–06:32, 13:39–15:14, 22:06–23:33). ~4.500 km/lună, invizibili.
--
-- Invizibili din două motive, amândouă în date: în graficul zilnic 073BRAO e pus pe TROX
-- Briceni ruta 1 — o rută la 200 km de unde umblă — deci `lde_route_run` îi iese cu
-- `km_real` null; și n-are nicio oprire cu `is_base = true`, deci nici n-ar avea de unde
-- se calcula o navetă pe el.
--
-- Tabelul ăsta ține faptul, o linie pe (zi, mașină de navetă, rută servită). Îl scrie
-- `etalon-aggregate.mjs` din opririle deja botezate (`lde_gps_stops`), fără urma brută:
-- opririle navetei la punctul rutei țin 100–135 min, cu mult peste pragul de 90 s al
-- tabelei de opriri.
CREATE TABLE IF NOT EXISTS lde_naveta_sofer (
  run_date          date NOT NULL,
  vehicle_id        uuid NOT NULL REFERENCES vehicles(id),
  factory_route_id  uuid NOT NULL REFERENCES lde_factory_routes(id),
  km                numeric(8,2) NOT NULL DEFAULT 0,
  drumuri           int NOT NULL DEFAULT 0,
  autobuz_id        uuid REFERENCES vehicles(id),
  locul             text,
  casa              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_date, vehicle_id, factory_route_id)
);

COMMENT ON TABLE lde_naveta_sofer IS
  'Naveta șoferului făcută cu altă mașină decât autobuzul rutei: km-ii mașinii care duce '
  'omul la autobuz și îl aduce înapoi. Se adună la livrarea rutei în posterul de livrare. '
  'Scris de etalon-aggregate.mjs din lde_gps_stops.';
COMMENT ON COLUMN lde_naveta_sofer.vehicle_id IS 'Mașina care FACE naveta (Sprinterul), nu autobuzul rutei.';
COMMENT ON COLUMN lde_naveta_sofer.factory_route_id IS
  'Ruta servită — a autobuzului lângă care a așteptat. Când ziua s-a potrivit cu mai '
  'multe rute, fiecare drum merge la ruta autobuzului de la capătul lui, nu la o medie.';
COMMENT ON COLUMN lde_naveta_sofer.km IS
  'Km-ii drumurilor care leagă baza mașinii de punctul rutei, în ziua aia. Un ocol care '
  'nu se termină la punctul rutei NU intră.';
COMMENT ON COLUMN lde_naveta_sofer.drumuri IS 'Câte drumuri bază ↔ punctul rutei au fost în ziua aia (18.09 la 073BRAO: 6).';
COMMENT ON COLUMN lde_naveta_sofer.autobuz_id IS 'Mașina rutei, lângă care a așteptat — proba potrivirii.';
COMMENT ON COLUMN lde_naveta_sofer.locul IS 'Localitatea punctului de așteptare («Vatici»).';
COMMENT ON COLUMN lde_naveta_sofer.casa IS
  'Localitatea celei mai lungi staționări a mașinii navetei în ziua aia («Ocnița-Răzeși») '
  '— de acolo pleacă drumul. Mașina navetei poate să n-aibă nicio oprire cu is_base, deci '
  'casa ei nu se poate lua din lde_gps_stops.is_base.';

CREATE INDEX IF NOT EXISTS lde_naveta_sofer_ruta_idx ON lde_naveta_sofer (factory_route_id, run_date);

-- Citit de admin cu cheia de service; anon n-are ce căuta aici (migr. 355/356).
ALTER TABLE lde_naveta_sofer ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lde_naveta_sofer FROM anon, authenticated;
