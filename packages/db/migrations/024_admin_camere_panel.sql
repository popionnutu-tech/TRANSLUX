-- 024_admin_camere_panel.sql
-- Admin Camere panel: operator management, salary config, tariff periods, dual-tariff support
BEGIN;

-- 1. admin_accounts: add name and active columns
ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- 2. crm_routes: classify as interurban or suburban
ALTER TABLE crm_routes ADD COLUMN IF NOT EXISTS route_type VARCHAR(20)
  NOT NULL DEFAULT 'interurban'
  CHECK (route_type IN ('interurban', 'suburban'));

-- 3. Tariff periods table (ANTA tariff history by week)
CREATE TABLE IF NOT EXISTS tariff_periods (
  id SERIAL PRIMARY KEY,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  rate_interurban_long DECIMAL(6,4) NOT NULL,   -- interrațional confort II
  rate_interurban_short DECIMAL(6,4) NOT NULL,  -- interrațional confort I
  rate_suburban DECIMAL(6,4) NOT NULL,           -- raional confort I
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tariff_periods_dates ON tariff_periods(period_start, period_end);

-- 4. Operator salary config: price per route by type
CREATE TABLE IF NOT EXISTS operator_salary_config (
  id SERIAL PRIMARY KEY,
  route_type VARCHAR(20) NOT NULL UNIQUE CHECK (route_type IN ('interurban', 'suburban')),
  price_per_route DECIMAL(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO operator_salary_config (route_type, price_per_route) VALUES
  ('interurban', 0),
  ('suburban', 0)
ON CONFLICT (route_type) DO NOTHING;

-- 5. New app_config keys
INSERT INTO app_config (key, value) VALUES
  ('rate_per_km_suburban', '1.20'),
  ('rate_per_km_interurban_short', '1.06'),
  ('dual_interurban_tariff', 'true'),
  ('short_distance_threshold_km', '65')
ON CONFLICT (key) DO NOTHING;

-- 6. Seed initial tariff periods
INSERT INTO tariff_periods (period_start, period_end, rate_interurban_long, rate_interurban_short, rate_suburban)
VALUES
  ('2026-03-28', '2026-04-03', 0.90, 0.90, 1.15),
  ('2026-04-04', '2026-04-09', 0.94, 1.06, 1.20);

-- 7. Extend price_update_log for multi-rate tracking
ALTER TABLE price_update_log ADD COLUMN IF NOT EXISTS rate_interurban_short DECIMAL(6,4);
ALTER TABLE price_update_log ADD COLUMN IF NOT EXISTS rate_suburban DECIMAL(6,4);

-- 8. New DB function: update_prices_by_rate_v2
-- Accepts 3 rates, respects dual_interurban_tariff toggle
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
    END;
  ELSE
    -- Single tariff: use interurban long rate for all
    UPDATE route_km_pairs
    SET price = ROUND(km * new_rate_interurban_long);
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

COMMIT;
