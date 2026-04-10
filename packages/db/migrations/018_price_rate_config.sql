-- Config table for dynamic pricing + audit log + price update function
BEGIN;

-- 1. App config (stores current rate_per_km)
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_config (key, value)
VALUES ('rate_per_km', '0.94')
ON CONFLICT (key) DO NOTHING;

-- 2. Price update audit log
CREATE TABLE IF NOT EXISTS price_update_log (
  id SERIAL PRIMARY KEY,
  old_rate DECIMAL(6,4),
  new_rate DECIMAL(6,4) NOT NULL,
  rows_updated INT NOT NULL,
  source_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Atomic price recalculation function
CREATE OR REPLACE FUNCTION update_prices_by_rate(new_rate DECIMAL)
RETURNS INT AS $$
DECLARE
  updated_count INT;
BEGIN
  -- Recalculate all prices
  UPDATE route_km_pairs
  SET price = ROUND(km * new_rate);

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Balti -> Chisinau: -20 lei discount (one direction only)
  UPDATE route_km_pairs
  SET price = GREATEST(price - 20, 0)
  WHERE from_stop = 'balti' AND to_stop = 'chisinau';

  -- Save current rate
  INSERT INTO app_config (key, value, updated_at)
  VALUES ('rate_per_km', new_rate::TEXT, now())
  ON CONFLICT (key) DO UPDATE SET value = new_rate::TEXT, updated_at = now();

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;
