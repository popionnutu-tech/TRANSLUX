-- 359: Verificarea GPS a atribuirilor de uzină se face pe poarta uzinei, nu pe oraș
--
-- Problema (sesiunea 16.09, compararea plan↔GPS pe ziua 08.09). Verdictul din verify.ts compara
-- opririle GPS ale mașinii cu NUMELE localității uzinei (lde_uzine.city + gps_localities).
-- Numele de localitate e prea gros în ambele sensuri:
--
--   * Draxelmaier Bălți: geocoderul botează poarta uzinei «Slobozia», nu «Bălți».
--     Pe 08.09, 38 din 39 de mașini ale uzinei au oprit în «Slobozia» (110 din cele 111
--     opriri ale zilei cu acest nume), dar doar 33 au atins «Bălți». Rezultat: 9 nepotriviri
--     false într-o singură zi; pe intervalul 01–08.09 — 74 din 103.
--   * Trox Briceni: Briceni e chiar parcul nostru. Pe 08.09 au oprit acolo 50+ de mașini
--     străine de Trox, iar 5 din cele 6 autobuze ale uzinei se «confirmau» stând în garaj.
--     Singura mașină prinsă (073BRAO) a fost prinsă doar fiindcă n-a intrat deloc în Briceni.
--
-- Soluția: poligoane-punct («porți») cu rază, măsurate din GPS-ul real. O uzină cu porți
-- se judecă DOAR pe porți; fără porți se cade înapoi pe nume (comportamentul de azi).
--
-- Coordonatele nu sunt ghicite — sunt centroizii clusterelor de opriri ale mașinilor
-- planificate pe uzină, 01–08.09.2026, grupate la 3 zecimale (~110 m). Criteriile:
-- multe mașini ale uzinei, aproape nicio mașină străină, durata staționării 15–60 min și
-- orele grupate exact în cele trei ferestre de schimb. Autobazele (staționare de ore,
-- zeci de mașini străine, toate orele zilei) au fost excluse explicit.
--
-- Verificat pe viu pe 01–08.09 înainte de a fixa razele: 74 de nepotriviri false la
-- Draxelmaier dispar, iar 18 rânduri trec din confirmat_auto în nepotrivire — toate reale:
-- 8× Draxelmaier și 2× Ungheni unde mașina a stat în autobază (cea mai apropiată oprire
-- a zilei: 0,72–0,75 km, respectiv 2,84 km de poartă) și 8× Trox unde 480BRAS n-a trecut
-- de autogara Briceni (1,42–1,60 km de poarta uzinei).

BEGIN;

CREATE TABLE IF NOT EXISTS lde_uzine_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uzina_id text NOT NULL REFERENCES lde_uzine(id) ON DELETE CASCADE,
  label text NOT NULL,                       -- intră în nota verdictului: «GPS: Poarta est 06:21»
  lat numeric(10,7) NOT NULL,
  lon numeric(10,7) NOT NULL,
  radius_km numeric(5,2) NOT NULL DEFAULT 0.5 CHECK (radius_km > 0 AND radius_km <= 5),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE lde_uzine_gates IS 'Porțile uzinelor (punct + rază) pentru verdictul GPS al atribuirilor. O uzină cu cel puțin o poartă activă se judecă NUMAI pe porți; fără porți — pe lde_uzine.city + gps_localities. Raza se alege ca poarta să nu atingă autobaza sau autogara orașului.';
COMMENT ON COLUMN lde_uzine_gates.radius_km IS 'Raza de acceptare în km. Măsurată din opririle reale; la Draxelmaier vest 0,5 km fiindcă autobaza Bălți e la 0,73 km de poartă.';

CREATE INDEX IF NOT EXISTS idx_lde_uzine_gates_uzina ON lde_uzine_gates (uzina_id) WHERE active;

-- RLS deny-all, ca tot modulul LDE (203/206/220/236): acces doar cu service-role.
ALTER TABLE lde_uzine_gates ENABLE ROW LEVEL SECURITY;

-- ── porțile măsurate ────────────────────────────────────────────────────────
-- (uzină, etichetă, lat, lon, rază, dovada din 01–08.09.2026)
INSERT INTO lde_uzine_gates (uzina_id, label, lat, lon, radius_km) VALUES
  -- 38 mașini, 351 opriri, staționare medie 37 min, ore 03–05 / 10–12 / 19–21, zero mașini străine
  ('DRAXELMAIER_BALTI', 'Poarta est (ZEL)',   47.7851300, 27.9430700, 0.6),
  -- 29 mașini, 247 opriri, staționare medie 38 min, ore 03 / 11–12 / 19–20, zero mașini străine.
  -- Raza 0,5: autobaza Bălți (47.7698/27.9233) e la 0,73 km și NU trebuie prinsă.
  ('DRAXELMAIER_BALTI', 'Poarta vest (ZEL)',  47.7740800, 27.9159300, 0.5),
  -- clusterele 47.3859–47.3872 / 28.8011–28.8017: 20+15+11 mașini, 441 opriri, 32–38 min
  ('SEBN_ORHEI',        'Poarta uzinei',      47.3864000, 28.8014000, 0.5),
  -- punctul de est, la 0,78 km de poartă: 26 mașini, 124 opriri, 17 min (coborâre/urcare)
  ('SEBN_ORHEI',        'Punct est (Bucuria)',47.3872400, 28.8115500, 0.4),
  -- singura mașină a uzinei: 18 opriri, 29 min, ore 02 / 10 / 19–20
  ('SEBN_STRASENI',     'Poarta uzinei',      47.1522500, 28.6268600, 0.5),
  -- 12 mașini, 150+38 opriri, 48–51 min, ore 02 / 10–11 / 19–20
  ('LEAR_UNGHENI',      'Poarta uzinei',      47.2230000, 27.8016000, 0.5),
  -- 5 mașini, 50+15 opriri, 27 min, ore 02 / 10–11 / 19–20, exclusiv mașinile uzinei
  ('LEAR_FLORESTI',     'Poarta uzinei',      47.8964500, 28.2998200, 0.5),
  -- 3 mașini, 45 opriri, 22 min, ore 02 / 10 / 18 și doar 5–6 mașini străine —
  -- singurul cluster din Briceni care NU e autogara/parcul (acolo 32–51 mașini străine)
  ('TROX_BRICENI',      'Poarta uzinei',      48.3464800, 27.0831800, 0.4);

-- Plasa de siguranță pe nume, dacă porțile ar fi vreodată dezactivate: numele real al
-- locului unde geocoderul pune poarta Draxelmaier. Lista COMPLETEAZĂ orașul (vezi verify.ts).
UPDATE lde_uzine
   SET gps_localities = (SELECT array_agg(DISTINCT x) FROM unnest(coalesce(gps_localities, '{}') || ARRAY['Slobozia']) AS x)
 WHERE id = 'DRAXELMAIER_BALTI';

COMMIT;
