-- ============================================================================
-- LDE camioane — gardianul privește TOATE atribuirile active ale mașinii
-- (01.09.2026, audit business runda 3)
--
-- Indexul unic e pe (vehicle_id, COALESCE(shift_number,0)): o mașină poate avea
-- legal trei atribuiri active, câte una pe schimb. Gardianul lua titularul cu
-- LIMIT 1, dar UPDATE-ul le închide pe toate. Un titular salarizat aflat pe alt
-- schimb scăpa de verificare și tot i se rupea luna.
--
-- Azi niciun vehicul nu are mai mult de o atribuire activă, iar camioanele au
-- shift_number NULL peste tot. Reparăm înainte să conteze, nu după.
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

  SELECT true INTO v_este_camion
    FROM vehicles
   WHERE id = p_vehicle_id
     AND active AND is_lde
     AND directions @> ARRAY['camioane']::text[];
  IF v_este_camion IS NOT TRUE THEN
    RAISE EXCEPTION 'nu_e_camion' USING ERRCODE = 'P0001';
  END IF;

  SELECT driver_id INTO v_curent
    FROM lde_active_assignments
   WHERE vehicle_id = p_vehicle_id AND valid_to IS NULL
   LIMIT 1;

  IF p_driver_id IS NOT NULL AND v_curent IS NOT DISTINCT FROM p_driver_id THEN
    RETURN 'neschimbat';
  END IF;

  -- Oricare dintre titularii activi ai mașinii, nu doar primul găsit.
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
     LIMIT 1;
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
