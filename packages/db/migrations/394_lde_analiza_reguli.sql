-- 394: raportul săptămânal al celor trei reguli de tăiere a kilometrilor goi (ION-48)
--
-- Ion, 24.09.2026: «acum acesta este modulul nostru de analiză, facem deploy la noi în lde, el
-- este pe LEAR, fiecare săptămână duminica lansează pe VPS cron de verificare rută și îmi dă
-- analitica în raportul care va fi în deploy sub lde».
--
-- Un rând pe uzină și pe săptămână, scris duminică seara de lear-analiza.mjs de pe VPS. Tot
-- raportul stă în `date`: mașinile cu rutele și cifrele lor, steagurile, deplasările peste 15 km
-- și controlul km-ilor față de lde_vehicle_gps_daily. Forma lui se schimbă odată cu workerul,
-- de asta e jsonb și nu coloane — pagina citește ultimul rând și îl desenează.
--
-- Raportul NU ține istorie a mașinilor sau a rutelor: alea stau în schelet (fișier fix în repo)
-- și în urma GPS. Aici e doar ce a ieșit dintr-o rulare, ca să se poată compara săptămânile.

CREATE TABLE IF NOT EXISTS lde_analiza_reguli (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'LEAR Ungheni' acum; coloana există ca să se poată adăuga Florești, SEBN Orhei ș.a.
  uzina       text NOT NULL,
  -- lunea săptămânii analizate; rerularea aceleiași săptămâni suprascrie rândul
  saptamina   date NOT NULL,
  rulat_la    timestamptz NOT NULL DEFAULT now(),
  -- { masini[], steaguri[], deplasari[], doar_trecute[], total{} } — vezi lear-analiza.mjs
  date        jsonb NOT NULL,
  note        text,
  UNIQUE (uzina, saptamina)
);

CREATE INDEX IF NOT EXISTS lde_analiza_reguli_uzina_sapt_idx
  ON lde_analiza_reguli (uzina, saptamina DESC);

COMMENT ON TABLE lde_analiza_reguli IS
  'Raportul săptămânal al celor trei reguli de economie la uzine (ION-48). Scris duminică seara '
  'de lear-analiza.mjs de pe VPS, citit de /lde/reguli. Un rând pe uzină și pe săptămână.';

ALTER TABLE lde_analiza_reguli ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lde_analiza_reguli FROM anon, authenticated;
