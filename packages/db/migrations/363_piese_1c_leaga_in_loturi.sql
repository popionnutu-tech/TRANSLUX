-- 363: Scrierea legăturilor cu 1C, în loturi.
--
-- Varianta dintâi actualiza rând cu rând: 9 440 de cereri REST pentru o singură rulare. Aici tot lotul
-- intră într-o singură instrucțiune, iar `p_ce` e verificat dintr-o listă închisă — numele de tabel nu
-- vine niciodată din afară.
--
-- Nu suprascrie o legătură existentă decât dacă e alta: `IS DISTINCT FROM` ține numărul raportat egal cu
-- numărul de rânduri chiar SCHIMBATE, ca o re-rulare să arate onest „0 modificate", nu „9283".
CREATE OR REPLACE FUNCTION piese_1c_set_guid(p_ce text, p_perechi jsonb)
RETURNS int LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE n int;
BEGIN
  IF p_ce = 'piese' THEN
    UPDATE piese_parts t SET guid_1c = (e->>'guid')::uuid
      FROM jsonb_array_elements(p_perechi) e
     WHERE t.id = (e->>'id')::bigint AND t.guid_1c IS DISTINCT FROM (e->>'guid')::uuid;
  ELSIF p_ce = 'masini' THEN
    UPDATE piese_vehicles t SET guid_1c_activitate = (e->>'guid')::uuid
      FROM jsonb_array_elements(p_perechi) e
     WHERE t.id = (e->>'id')::bigint AND t.guid_1c_activitate IS DISTINCT FROM (e->>'guid')::uuid;
  ELSIF p_ce = 'lacatusi' THEN
    UPDATE piese_mechanics t SET guid_1c = (e->>'guid')::uuid
      FROM jsonb_array_elements(p_perechi) e
     WHERE t.id = (e->>'id')::bigint AND t.guid_1c IS DISTINCT FROM (e->>'guid')::uuid;
  ELSE
    RAISE EXCEPTION 'BAD_TARGET';
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION piese_1c_set_guid(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_1c_set_guid(text, jsonb) TO service_role;
