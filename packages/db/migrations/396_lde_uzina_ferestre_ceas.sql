-- 396: ferestrele de ceas ale curselor la uzine + marcajul mesajului de luni (ION-57)
--
-- Ion, 24.09.2026: «cum noi identificăm dacă pe viitor un șofer va vrea în timpul liber să
-- taxuiască? … am nevoie automatizat». Detectorul de timp liber (lear-timp-liber.mjs) are
-- nevoie de ferestrele de sosire/plecare la poartă: §3.3 din lde_uzine.reguli_livrare le are,
-- dar în PROZĂ, pe care Ion o editează liber pe /lde/livrare-reguli. Tabelul ăsta e copia
-- mașinală a §3.3; §3.3 rămâne sursa umană, iar cine schimbă una o schimbă și pe cealaltă.
--
-- Cheile diferă și se știe: aici uzina e lde_uzine.id ('LEAR_UNGHENI'); în lde_analiza_reguli
-- coloana `uzina` ține numele afișat ('LEAR Ungheni'). Workerul le leagă prin constante.
--
-- Schimbul 3 (23:00–06:00) NU are rânduri: reguli_livrare §2.1 «foarte rar și haotic, NU intră
-- în analiză». Fără rânduri pentru o uzină, detectorul se sare cu steag — niciodată ore în cod.

CREATE TABLE IF NOT EXISTS lde_uzina_ferestre_ceas (
  uzina_id      text NOT NULL REFERENCES lde_uzine(id) ON DELETE CASCADE,
  -- tur = cursa care ADUCE la poartă (se judecă SOSIREA); retur = ia de la poartă (PLECAREA)
  sens          text NOT NULL CHECK (sens IN ('tur', 'retur')),
  shift_number  int  NOT NULL CHECK (shift_number BETWEEN 1 AND 3),
  -- minute ale zilei, ora Chișinăului (ca minute_zi în 367); pana_la_min < de_la_min = trece
  -- de miezul nopții (retur s2: 21:30 → 02:30). Capătul e exclusiv.
  de_la_min     int  NOT NULL CHECK (de_la_min BETWEEN 0 AND 1439),
  pana_la_min   int  NOT NULL CHECK (pana_la_min BETWEEN 0 AND 1439),
  sursa         text NOT NULL DEFAULT 'declarat',
  PRIMARY KEY (uzina_id, sens, shift_number)
);

COMMENT ON TABLE lde_uzina_ferestre_ceas IS
  'Ferestrele de ceas ale curselor la poartă, pe uzină, sens și schimb (ION-57). Copia mașinală '
  'a §3.3 din lde_uzine.reguli_livrare; proza rămâne sursa umană. pana_la_min < de_la_min = '
  'fereastra trece de miezul nopții.';

INSERT INTO lde_uzina_ferestre_ceas (uzina_id, sens, shift_number, de_la_min, pana_la_min) VALUES
  ('LEAR_UNGHENI', 'tur',   1,  150,  450),   -- sosire 02:30–07:30
  ('LEAR_UNGHENI', 'tur',   2,  660,  870),   -- sosire 11:00–14:30
  ('LEAR_UNGHENI', 'retur', 1,  810, 1005),   -- plecare 13:30–16:45
  ('LEAR_UNGHENI', 'retur', 2, 1290,  150)    -- plecare 21:30–02:30
ON CONFLICT DO NOTHING;

ALTER TABLE lde_uzina_ferestre_ceas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lde_uzina_ferestre_ceas FROM anon, authenticated;

-- Mesajul de luni către ADMIN se trimite o dată pe săptămână: rândul raportului ține când s-a
-- trimis. Rescrierea raportului (rulat_la mai nou) redeschide trimiterea; rularea rutei o
-- revendică atomic (UPDATE … WHERE alerta_trimisa_la IS NULL OR alerta_trimisa_la < rulat_la).
ALTER TABLE lde_analiza_reguli ADD COLUMN IF NOT EXISTS alerta_trimisa_la timestamptz;
COMMENT ON COLUMN lde_analiza_reguli.alerta_trimisa_la IS
  'Când a plecat mesajul de luni către ADMIN pentru rândul ăsta (ION-57); NULL = netrimis.';
