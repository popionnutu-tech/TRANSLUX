-- 535: lde_fuel_norm_nume (migr. 534) avea 7 litere sursă și 8 țintă în translate() → «ș» devenea «i»; testul cu ROLLBACK
-- (șofer legat prin foaia LDE) a prins-o înainte de prima încărcare. ă â î ș ş ț ţ → a a i s s t t.
CREATE OR REPLACE FUNCTION lde_fuel_norm_nume(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(translate(lower(coalesce(t, '')), 'ăâîșşțţ', 'aaisstt'), '[^a-z]', '', 'g')
$$;
REVOKE EXECUTE ON FUNCTION lde_fuel_norm_nume(text) FROM PUBLIC, anon, authenticated;
