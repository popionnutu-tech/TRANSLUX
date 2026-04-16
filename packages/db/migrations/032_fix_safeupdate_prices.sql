-- Fix: pg_safeupdate blocks UPDATE without WHERE clause
-- Add "WHERE true" to route_km_pairs updates in update_prices_by_rate_v2

CREATE OR REPLACE FUNCTION update_prices_by_rate_v2(
  new_rate_interurban_long DECIMAL,
  new_rate_interurban_short DECIMAL DEFAULT NULL,
  new_rate_suburban DECIMAL DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  updated_count INT;
  balti_full_price INT;
  is_dual TEXT;
  threshold INT;
BEGIN
  -- Read settings
  SELECT value INTO is_dual FROM app_config WHERE key = 'dual_interurban_tariff';
  SELECT value::INT INTO threshold FROM app_config WHERE key = 'short_distance_threshold_km';
  IF threshold IS NULL THEN threshold := 65; END IF;

  -- Update route_km_pairs based on dual tariff mode
  IF is_dual = 'true' AND new_rate_interurban_short IS NOT NULL THEN
    UPDATE route_km_pairs
    SET price = CASE
      WHEN km <= threshold THEN ROUND(km * new_rate_interurban_short)
      ELSE ROUND(km * new_rate_interurban_long)
    END
    WHERE true;
  ELSE
    -- Single tariff: use interurban long rate for all
    UPDATE route_km_pairs
    SET price = ROUND(km * new_rate_interurban_long)
    WHERE true;
  END IF;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Balti-Chisinau offer (133 km, always uses interurban long rate)
  balti_full_price := ROUND(133 * new_rate_interurban_long);

  UPDATE offers
  SET original_price = balti_full_price,
      offer_price = GREATEST(balti_full_price - 20, 0)
  WHERE LOWER(from_locality) = 'bălți' AND LOWER(to_locality) = 'chișinău';

  IF NOT FOUND THEN
    INSERT INTO offers (from_locality, to_locality, original_price, offer_price, active)
    VALUES ('Bălți', 'Chișinău', balti_full_price, GREATEST(balti_full_price - 20, 0), true);
  END IF;

  -- Save all rate keys
  INSERT INTO app_config (key, value, updated_at)
  VALUES ('rate_per_km', new_rate_interurban_long::TEXT, now())
  ON CONFLICT (key) DO UPDATE SET value = new_rate_interurban_long::TEXT, updated_at = now();

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('rate_per_km_long', new_rate_interurban_long::TEXT, now())
  ON CONFLICT (key) DO UPDATE SET value = new_rate_interurban_long::TEXT, updated_at = now();

  IF new_rate_interurban_short IS NOT NULL THEN
    INSERT INTO app_config (key, value, updated_at)
    VALUES ('rate_per_km_short', new_rate_interurban_short::TEXT, now())
    ON CONFLICT (key) DO UPDATE SET value = new_rate_interurban_short::TEXT, updated_at = now();

    INSERT INTO app_config (key, value, updated_at)
    VALUES ('rate_per_km_interurban_short', new_rate_interurban_short::TEXT, now())
    ON CONFLICT (key) DO UPDATE SET value = new_rate_interurban_short::TEXT, updated_at = now();
  END IF;

  IF new_rate_suburban IS NOT NULL THEN
    INSERT INTO app_config (key, value, updated_at)
    VALUES ('rate_per_km_suburban', new_rate_suburban::TEXT, now())
    ON CONFLICT (key) DO UPDATE SET value = new_rate_suburban::TEXT, updated_at = now();
  END IF;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;
