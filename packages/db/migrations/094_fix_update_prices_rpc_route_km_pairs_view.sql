-- 094_fix_update_prices_rpc_route_km_pairs_view.sql
-- Reparăm robotul ANTA: funcția update_prices_by_rate_v2 încerca `UPDATE route_km_pairs`,
-- dar route_km_pairs a devenit VIEW ne-actualizabil (derivat din interurban_v2_stops) →
-- eroare „cannot update view". Funcția e PRIMUL pas din executeAntaPriceUpdate, deci la
-- următoarea schimbare reală de tarif cronul de joi ar fi eșuat și nu ar fi scris noul
-- tariff_periods → reapărea bug-ul „0 LEI" pe site.
--
-- Fix: scoatem actualizarea route_km_pairs (oricum nu e citit de aplicație — prețurile sunt
-- calculate real-time din tariff_periods). Păstrăm scrierile în app_config (ratele) și în
-- offers (oferta Bălți–Chișinău). Restul fluxului (tariff_periods, price_nomenclator) e
-- scris de executeAntaPriceUpdate, în afara funcției.

CREATE OR REPLACE FUNCTION public.update_prices_by_rate_v2(
  new_rate_interurban_long numeric,
  new_rate_interurban_short numeric DEFAULT NULL::numeric,
  new_rate_suburban numeric DEFAULT NULL::numeric
)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  updated_count INT := 0;
  balti_full_price INT;
BEGIN
  -- route_km_pairs e acum VIEW ne-actualizabil și nu e citit de aplicație → nu-l mai atingem.
  -- Prețurile către pasageri se calculează real-time din tariff_periods (km × rată).

  -- Oferta Bălți–Chișinău (133 km, mereu la tariful interurban lung)
  balti_full_price := ROUND(133 * new_rate_interurban_long);

  UPDATE offers
  SET original_price = balti_full_price,
      offer_price = GREATEST(balti_full_price - 20, 0)
  WHERE LOWER(from_locality) = 'bălți' AND LOWER(to_locality) = 'chișinău';

  IF NOT FOUND THEN
    INSERT INTO offers (from_locality, to_locality, original_price, offer_price, active)
    VALUES ('Bălți', 'Chișinău', balti_full_price, GREATEST(balti_full_price - 20, 0), true);
  END IF;

  -- Salvăm toate cheile de rată în app_config
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
$function$;
