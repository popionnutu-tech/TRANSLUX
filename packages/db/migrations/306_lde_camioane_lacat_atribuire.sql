-- ============================================================================
-- LDE camioane — lacăt pe camion în timpul atribuirii (01.09.2026, securitate)
--
-- Gardienii citeau cu SELECT simplu, apoi urma UPDATE. La READ COMMITTED, o
-- scriere concurentă din /lde/atribuiri putea intra între verificare și scriere:
-- atribuirea de salariu tocmai creată se închidea tăcut — exact ce trebuia să
-- oprească gardianul. Fereastra e de milisecunde, dar e reală.
--
-- Lacătul e consultativ, pe tranzacție, cu cheia = camionul: două atribuiri pe
-- camioane diferite nu se așteaptă una pe alta.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION lde_atribuie_sofer_camion(
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_actor text,
  p_azi date
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_este_camion boolean;
  v_placa_straina text;
  v_curent uuid;
BEGIN
  PERFORM set_config('app.actor_email', COALESCE(p_actor, ''), true);
  PERFORM pg_advisory_xact_lock(hashtext(p_vehicle_id::text));

  SELECT true INTO v_este_camion
    FROM vehicles
   WHERE id = p_vehicle_id
     AND active AND is_lde
     AND directions @> ARRAY['camioane']::text[];
  IF v_este_camion IS NOT TRUE THEN
    RAISE EXCEPTION 'nu_e_camion' USING ERRCODE = 'P0001';
  END IF;

  -- FOR UPDATE: rândurile verificate rămân ale noastre până la COMMIT, deci
  -- nimeni nu strecoară o atribuire nouă între gardian și UPDATE.
  SELECT driver_id INTO v_curent
    FROM lde_active_assignments
   WHERE vehicle_id = p_vehicle_id AND valid_to IS NULL
   LIMIT 1
   FOR UPDATE;

  IF p_driver_id IS NOT NULL AND v_curent IS NOT DISTINCT FROM p_driver_id THEN
    RETURN 'neschimbat';
  END IF;

  IF EXISTS (
    SELECT 1 FROM lde_active_assignments
     WHERE vehicle_id = p_vehicle_id AND valid_to IS NULL
       AND lde_e_sofer_salarizat(driver_id)
  ) THEN
    RAISE EXCEPTION 'titular_salarizat' USING ERRCODE = 'P0001';
  END IF;

  IF p_driver_id IS NOT NULL THEN
    PERFORM 1 FROM lde_camion_soferi WHERE driver_id = p_driver_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'nu_e_in_nomenclator' USING ERRCODE = 'P0001';
    END IF;

    IF lde_e_sofer_salarizat(p_driver_id) THEN
      RAISE EXCEPTION 'e_sofer_de_uzina' USING ERRCODE = 'P0001';
    END IF;

    SELECT v.plate_number INTO v_placa_straina
      FROM lde_active_assignments a
      JOIN vehicles v ON v.id = a.vehicle_id
     WHERE a.driver_id = p_driver_id
       AND a.valid_to IS NULL
       AND NOT (COALESCE(v.directions, ARRAY[]::text[]) @> ARRAY['camioane']::text[])
     LIMIT 1
     FOR UPDATE OF a;
    IF v_placa_straina IS NOT NULL THEN
      RAISE EXCEPTION 'in_afara_flotei:%', v_placa_straina USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE lde_active_assignments SET valid_to = p_azi
   WHERE vehicle_id = p_vehicle_id AND valid_to IS NULL;

  IF p_driver_id IS NULL THEN
    RETURN 'scos';
  END IF;

  UPDATE lde_active_assignments SET valid_to = p_azi
   WHERE driver_id = p_driver_id AND valid_to IS NULL;

  INSERT INTO lde_active_assignments (driver_id, vehicle_id, valid_from, notes)
  VALUES (p_driver_id, p_vehicle_id, p_azi,
          'atribuit din dispeceratul de camioane de ' || COALESCE(p_actor, '?'));

  RETURN 'atribuit';
END $$;

REVOKE ALL ON FUNCTION lde_atribuie_sofer_camion(uuid, uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION lde_atribuie_sofer_camion(uuid, uuid, text, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_atribuie_sofer_camion(uuid, uuid, text, date) TO service_role;

COMMIT;
