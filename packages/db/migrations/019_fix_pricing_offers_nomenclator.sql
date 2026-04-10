-- Fix: move Balti-Chisinau -20 discount from route_km_pairs to offers table
-- Add: price_nomenclator table for saving ANTA price snapshots
BEGIN;

-- 1. Price nomenclator: snapshot of popular route prices after each ANTA update
CREATE TABLE IF NOT EXISTS price_nomenclator (
  id SERIAL PRIMARY KEY,
  rate_per_km DECIMAL(6,4) NOT NULL,
  prices JSONB NOT NULL,         -- [{from_ro, to_ro, from_ru, to_ru, price}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Fix DB function: no longer apply -20 in route_km_pairs, instead update offers
CREATE OR REPLACE FUNCTION update_prices_by_rate(new_rate DECIMAL)
RETURNS INT AS $$
DECLARE
  updated_count INT;
  balti_full_price INT;
BEGIN
  -- Recalculate ALL prices (including balti-chisinau at full rate)
  UPDATE route_km_pairs
  SET price = ROUND(km * new_rate);

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Calculate Balti-Chisinau full price (133 km)
  balti_full_price := ROUND(133 * new_rate);

  -- Update offers: Balti -> Chisinau = full_price - 20
  UPDATE offers
  SET original_price = balti_full_price,
      offer_price = GREATEST(balti_full_price - 20, 0)
  WHERE LOWER(from_locality) = 'bălți' AND LOWER(to_locality) = 'chișinău';

  -- If offer doesn't exist, create it
  IF NOT FOUND THEN
    INSERT INTO offers (from_locality, to_locality, original_price, offer_price, active)
    VALUES ('Bălți', 'Chișinău', balti_full_price, GREATEST(balti_full_price - 20, 0), true);
  END IF;

  -- Save current rate
  INSERT INTO app_config (key, value, updated_at)
  VALUES ('rate_per_km', new_rate::TEXT, now())
  ON CONFLICT (key) DO UPDATE SET value = new_rate::TEXT, updated_at = now();

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- 3. Fix current data: restore balti->chisinau to full price in route_km_pairs
UPDATE route_km_pairs
SET price = ROUND(km * 0.94)
WHERE from_stop = 'balti' AND to_stop = 'chisinau';

-- 4. Fix current offers row
UPDATE offers
SET original_price = 125, offer_price = 105
WHERE LOWER(from_locality) = 'bălți' AND LOWER(to_locality) = 'chișinău';

COMMIT;
