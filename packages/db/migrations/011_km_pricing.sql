-- Migration 011: km-based pricing system
-- Replaces old segment-sum pricing with direct pair lookup

-- 1. Table for km/price pairs per tariff group
CREATE TABLE IF NOT EXISTS route_km_pairs (
  id SERIAL PRIMARY KEY,
  tariff_id INT NOT NULL,
  from_stop TEXT NOT NULL,
  to_stop TEXT NOT NULL,
  km DECIMAL(8,2) NOT NULL,
  price INT NOT NULL,
  UNIQUE(tariff_id, from_stop, to_stop)
);

CREATE INDEX IF NOT EXISTS idx_km_pairs_tariff_stops
  ON route_km_pairs(tariff_id, from_stop, to_stop);

-- 2. Add tariff IDs to crm_routes (tur and retur can use different km matrices)
ALTER TABLE crm_routes ADD COLUMN IF NOT EXISTS tariff_id_tur INT;
ALTER TABLE crm_routes ADD COLUMN IF NOT EXISTS tariff_id_retur INT;

-- 3. Add active column to localities for filtering
ALTER TABLE localities ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
