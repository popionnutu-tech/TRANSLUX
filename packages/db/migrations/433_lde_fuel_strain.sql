-- 433: combustibilul alimentat în afara flotei noastre (ION-134)
--
-- Ion, 29.09.2026, după ION-132: «trebuie de adăugat tot maximal posibil». În 2026 s-au alimentat 146.217 l pe plăcuțe
-- sau nume care NU sunt în `vehicles` (benzol 124.428, benzol2 14.330, foi LDE 7.459) — față de 973.951 l ai flotei.
-- Importurile de până acum (fuel-worker → lde_fuel_alimentari, lde-alim-worker → lde_fuel_foaie) le aruncau.
-- Aici stă FIECARE astfel de alimentare, cu plăcuța ca text: mașini care lucrează pentru noi dar lipsesc din flotă,
-- mașini de serviciu, străini care alimentează la stația noastră, și nume (VINZARE, CONSUMINTE, COMBINA, PROTOCOL…).
-- Când o plăcuță intră în `vehicles`, rularea următoare a lde-geo-worker/fuel-strain-worker.mjs îi scoate rândurile
-- de aici, iar fuel-worker / lde-alim-worker le pun la mașină — aceeași alimentare nu stă în două locuri.

CREATE TABLE IF NOT EXISTS lde_fuel_strain (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sursa         text NOT NULL CHECK (sursa IN ('benzol', 'benzol2', 'foaie')),
  external_id   text NOT NULL,                 -- benzol: id-ul rândului; foaie: '<pz_*>:<id>'
  placuta       text NOT NULL,                 -- așa cum e scrisă la sursă
  placuta_norm  text NOT NULL,                 -- majuscule, fără spații/cratime — cheia de grupare
  categorie     text NOT NULL CHECK (categorie IN ('masina', 'nume')),
  zi            date NOT NULL,                 -- ora locală Chișinău
  alimentat_at  timestamptz,                   -- doar benzol are oră; foaia n-are
  litri         numeric(10,2) NOT NULL,
  foaie         text,                          -- tabelul LDE pentru sursa 'foaie'
  sofer         text,
  observatii    text,
  imported_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sursa, external_id)
);

CREATE INDEX IF NOT EXISTS idx_lde_fuel_strain_zi ON lde_fuel_strain (zi);
CREATE INDEX IF NOT EXISTS idx_lde_fuel_strain_placuta_zi ON lde_fuel_strain (placuta_norm, zi DESC);

COMMENT ON TABLE lde_fuel_strain IS
  'Alimentări (benzol, benzol2, foi LDE) ale plăcuțelor/numelor care NU sunt în vehicles (ION-134). '
  'Import: lde-geo-worker/fuel-strain-worker.mjs; o plăcuță adăugată în flotă își mută rândurile la mașină.';

ALTER TABLE lde_fuel_strain ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lde_fuel_strain FROM anon, authenticated;
