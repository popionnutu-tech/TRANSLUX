-- 253_curse_duble.sql
-- Curse DUBLE pe rută×schimb (Ion, 17.08): uneori în loc de 1 autocar pleacă 2 microbuze.
-- «+» pe rândul cursei adaugă un slot suplimentar (2, 3, …) care se materializează zilnic
-- de la valid_from înainte, cu mașina/șoferul lui; «−» șterge registrul + rândurile de azi
-- înainte (istoricul cu verificările GPS rămâne).

-- 1) registrul dublurilor active
CREATE TABLE IF NOT EXISTS lde_curse_duble (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_route_id uuid NOT NULL REFERENCES lde_factory_routes(id) ON DELETE CASCADE,
  shift_number     int  NOT NULL CHECK (shift_number IN (1, 2, 3)),
  slot             int  NOT NULL CHECK (slot >= 2),
  valid_from       date NOT NULL,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_admin uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factory_route_id, shift_number, slot)
);
ALTER TABLE lde_curse_duble ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE lde_curse_duble IS
  'Curse duble active pe rută×schimb (slot ≥2): materializate zilnic de la valid_from; «−» le șterge de azi înainte';

-- 2) slotul pe rândurile zilnice (1 = cursa de bază)
ALTER TABLE lde_atribuiri_zilnice
  ADD COLUMN IF NOT EXISTS slot int NOT NULL DEFAULT 1 CHECK (slot >= 1);

-- 3) route_key regenerat cu slotul (slot 1 păstrează forma veche — cheile existente nu se schimbă)
ALTER TABLE lde_atribuiri_zilnice DROP COLUMN IF EXISTS route_key; -- cascadă: uq_lde_atribuiri_date_key
ALTER TABLE lde_atribuiri_zilnice ADD COLUMN IF NOT EXISTS route_key text GENERATED ALWAYS AS (
  CASE
    WHEN route_kind = 'uzina' THEN
      'uzina:' || factory_route_id::text || ':' || shift_number::text ||
      CASE WHEN slot > 1 THEN ':' || slot::text ELSE '' END
    ELSE 'crm:' || crm_route_id::text
  END
) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lde_atribuiri_date_key ON lde_atribuiri_zilnice (date, route_key);

-- rewrite-ul a golit pg_stats pentru route_key/slot; fără ANALYZE, statistica ar reveni
-- singură abia după ~4 zile de trafic (regulă de proiect: orice migrație care rescrie
-- tabelul se termină cu ANALYZE)
ANALYZE lde_atribuiri_zilnice;
