-- 365: Blocul de reguli de conversie, păstrat exact cum vine din 1C.
--
-- În fișierele lor, `<ПравилаОбмена>` ocupă 66% din conținut (~106 KB). Nu-l inventăm și nu-l scriem de
-- mână: se extrage din orice export primit de la contabilă și se pune la loc, neschimbat, în fișierele pe
-- care le trimitem înapoi. Regulile sunt ale lor; noi doar le cărăm.
--
-- Un singur rând (id = 1). Nu e „configurare" cu multe chei — e un text lung care are nevoie de un loc.
CREATE TABLE IF NOT EXISTS piese_1c_config (
  id           int PRIMARY KEY DEFAULT 1,
  reguli       text,
  sursa        text,          -- din ce fișier au fost luate, ca să se știe ce versiune e
  actualizat   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT piese_1c_config_un_rand CHECK (id = 1)
);
INSERT INTO piese_1c_config(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE piese_1c_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON piese_1c_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON piese_1c_config TO service_role;
