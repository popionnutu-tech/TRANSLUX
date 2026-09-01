-- ============================================================================
-- LDE camioane — nomenclatorul șoferilor de camion + atribuire tranzacțională
-- (01.09.2026)
--
-- Ion: «Распределение водителя идет только в номенклатуру авто. Также должен
-- быть в номенклатуре водителей для этого диспетчера именно на фуры».
--
-- De ce e nevoie de tabelă, nu de un filtru:
--   lde_active_assignments e PARTAJATĂ cu uzinele. Un șofer are o singură
--   atribuire activă în tot sistemul (uq_..._one_per_driver, migr. 203). Dacă
--   dispecerul de camioane alegea din toți cei 114 șoferi LDE, mutarea unui
--   șofer de uzină pe un camion îi închidea tăcut atribuirea de autobuz: salariul
--   lunii se recalcula pe km-ul camionului, iar graficul uzinei rămânea fără
--   titular. Șoferii de camion NU au niciun semn propriu (directions e gol la
--   toți 16, verificat pe prod) — de aceea semnul se scrie explicit, aici.
--
-- Ce mai repară: atribuirea se făcea în trei scrieri PostgREST separate. O
-- cădere la a treia lăsa și camionul, și șoferul fără atribuire. Acum e o
-- singură funcție = o singură tranzacție.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS lde_camion_soferi (
  driver_id uuid PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
COMMENT ON TABLE lde_camion_soferi IS 'Nomenclatorul șoferilor de camion, ținut de dispecerul de camioane. Doar cine e aici poate fi atribuit pe un camion — bariera dintre flota de camioane și atribuirile de uzină.';

-- Pornim de la adevărul de azi: cine e deja atribuit pe un camion e șofer de camion.
INSERT INTO lde_camion_soferi (driver_id, created_by)
SELECT DISTINCT a.driver_id, 'migrare 303'
  FROM lde_active_assignments a
  JOIN vehicles v ON v.id = a.vehicle_id
 WHERE a.valid_to IS NULL
   AND v.directions @> ARRAY['camioane']::text[]
ON CONFLICT (driver_id) DO NOTHING;

ALTER TABLE lde_camion_soferi ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_lde_camion_soferi_audit ON lde_camion_soferi;
CREATE TRIGGER trg_lde_camion_soferi_audit
  AFTER INSERT OR UPDATE OR DELETE ON lde_camion_soferi
  FOR EACH ROW EXECUTE FUNCTION lde_truck_audit();

-- ---------------------------------------------------------------------------
-- Atribuirea șoferului pe camion: o singură tranzacție, cu gardienii înăuntru.
-- Întoarce 'atribuit' | 'scos' | 'neschimbat'. Erorile de business ies cu
-- SQLSTATE P0001 și un cod scurt pe care stratul TS îl traduce în română.
-- ---------------------------------------------------------------------------
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
  -- Autorul, pentru triggerul de audit al tabelelor atinse în această tranzacție.
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

  IF p_driver_id IS NOT NULL THEN
    PERFORM 1 FROM lde_camion_soferi WHERE driver_id = p_driver_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'nu_e_in_nomenclator' USING ERRCODE = 'P0001';
    END IF;

    -- Bariera: nu luăm un șofer de pe o mașină din afara flotei de camioane.
    -- Acolo atribuirea poartă route_id/shift_number, pe care acest ecran nu le
    -- poate pune la loc, iar salariul lunii se calculează din ea.
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

COMMENT ON FUNCTION lde_atribuie_sofer_camion(uuid, uuid, text, date) IS 'Atribuie/scoate șoferul de pe un camion într-o singură tranzacție. Refuză mașina care nu e camion, șoferul din afara nomenclatorului și șoferul atribuit pe o mașină din afara flotei de camioane.';

-- Doar backend-ul (service_role) o poate chema; anon/authenticated nu.
REVOKE ALL ON FUNCTION lde_atribuie_sofer_camion(uuid, uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION lde_atribuie_sofer_camion(uuid, uuid, text, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_atribuie_sofer_camion(uuid, uuid, text, date) TO service_role;

COMMIT;
