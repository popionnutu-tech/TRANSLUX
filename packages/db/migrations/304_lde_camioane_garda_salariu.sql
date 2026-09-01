-- ============================================================================
-- LDE camioane — gardianul corect: categoria de salariu, nu atribuirea curentă
-- (01.09.2026, audit business runda 2)
--
-- Migrația 303 întreba «șoferul e atribuit ACUM pe o mașină din afara flotei?».
-- Salariul nu întreabă asta. El pornește de la lde_driver_extras: categoria 1-5
-- plus uzina. Pe prod, 34 de șoferi salariați NU au nicio atribuire activă —
-- pentru ei gardianul din 303 tăcea, iar mutarea lor pe un camion le rescria
-- luna din km-ul camionului.
--
-- Al doilea gol: gardienii se uitau doar la șoferul care INTRĂ. Titularul dat
-- afară de pe camion nu era verificat de nimeni. Azi impactul e zero (niciunul
-- dintre cei 16 nu are categorie), dar un administrator poate pune oricând un
-- șofer salariat pe un camion din /lde/atribuiri — de atunci dispecerul îi
-- ștergea luna cu un clic.
-- ============================================================================
BEGIN;

-- Discriminatorul adevărat al «șoferului de uzină»: cel după care se face
-- salarizarea (lde/salarii citește exact această pereche de câmpuri).
CREATE OR REPLACE FUNCTION lde_e_sofer_salarizat(p_driver_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM lde_driver_extras
     WHERE driver_id = p_driver_id
       AND lde_salary_category BETWEEN 1 AND 5
       AND uzina_id IS NOT NULL
  );
$$;
COMMENT ON FUNCTION lde_e_sofer_salarizat(uuid) IS 'true = șoferul intră în calculul de salariu pe categorie și uzină. Dispeceratul de camioane nu are voie să-i atingă atribuirea: din ea se ia km-ul lunii.';

-- Urma de audit pe atribuiri: tabela decide baza de calcul a salariului, dar era
-- singura din lanț fără trigger. Fără ea, o schimbare de atribuire nu are autor.
DROP TRIGGER IF EXISTS trg_lde_active_assignments_audit ON lde_active_assignments;
CREATE TRIGGER trg_lde_active_assignments_audit
  AFTER INSERT OR UPDATE OR DELETE ON lde_active_assignments
  FOR EACH ROW EXECUTE FUNCTION lde_truck_audit();

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

  -- Titularul dat afară: dacă e salariat pe categorie, plecarea lui de pe mașină
  -- îi duce luna la zero km. Nu e treaba acestui ecran.
  IF v_curent IS NOT NULL AND lde_e_sofer_salarizat(v_curent) THEN
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

-- Jurnalul pierdea rândul din nomenclator: cheia lui e driver_id, iar funcția
-- căuta doar id și vehicle_id, deci entity_id ieșea NULL la fiecare scriere.
CREATE OR REPLACE FUNCTION lde_truck_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor uuid;
  actor_email text;
BEGIN
  actor_email := NULLIF(current_setting('app.actor_email', true), '');
  IF actor_email IS NULL THEN
    actor_email := COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) ->> 'updated_by' END,
      CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ->> 'created_by' ELSE to_jsonb(NEW) ->> 'created_by' END
    );
  END IF;
  SELECT id INTO actor FROM admin_accounts WHERE email = actor_email;

  INSERT INTO lde_audit_log (actor_admin_id, action, entity, entity_id, before_data, after_data, notes)
  VALUES (
    actor,
    lower(TG_OP),
    TG_TABLE_NAME,
    COALESCE(to_jsonb(NEW) ->> 'id', to_jsonb(OLD) ->> 'id',
             to_jsonb(NEW) ->> 'vehicle_id', to_jsonb(OLD) ->> 'vehicle_id',
             to_jsonb(NEW) ->> 'driver_id', to_jsonb(OLD) ->> 'driver_id'),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    CASE WHEN actor IS NULL AND actor_email IS NOT NULL THEN 'autor: ' || actor_email END
  );
  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE ALL ON FUNCTION lde_atribuie_sofer_camion(uuid, uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION lde_atribuie_sofer_camion(uuid, uuid, text, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_atribuie_sofer_camion(uuid, uuid, text, date) TO service_role;
REVOKE ALL ON FUNCTION lde_e_sofer_salarizat(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION lde_e_sofer_salarizat(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_e_sofer_salarizat(uuid) TO service_role;

COMMIT;
