-- ============================================================================
-- Merge 3 dubluri-șoferi create de seed-ul LDE 204 în șoferii preexistenți.
-- Pattern identic cu 111/112 (unire double-uri șoferi). Confirmat de Ion 23.06.
--   Gusevatîi Anatolii -> Gusevatii Anatolii   (diacritică î/i)
--   Costaș Vitalie     -> Costas Vitalii        (ș/s + ie/ii)
--   Ganciar Roman      -> Goncear Roman          (rus/mol: Ганчар/Гончар)
-- Direcția: dup (LDE nou, fără istoric) -> keep (preexistent, 110-166 referințe).
-- Keep rămâne is_lde=false (face și muncă non-LDE → vizibil în toate pickerele).
-- Toate referințele LDE repointate (în practică doar lde_driver_extras avea rânduri).
-- ============================================================================

BEGIN;

UPDATE lde_driver_extras       e SET driver_id = m.keep FROM (VALUES
  ('b8b996c2-ac0d-419c-af87-ebf03b8f0a07'::uuid,'8f31ced8-1e1f-4f8d-86e1-f5101a88f7b7'::uuid),
  ('5ec53e74-4aa4-4cd0-bea3-46ce8326781a'::uuid,'78e633ab-0940-4a8e-bc62-0e50d527cbb8'::uuid),
  ('9641163e-6259-4f2a-b67c-5578daea7202'::uuid,'871c0466-9336-44e9-acd8-328e9d631363'::uuid)
) AS m(dup,keep) WHERE e.driver_id = m.dup;

UPDATE lde_active_assignments  t SET driver_id = m.keep FROM (VALUES
  ('b8b996c2-ac0d-419c-af87-ebf03b8f0a07'::uuid,'8f31ced8-1e1f-4f8d-86e1-f5101a88f7b7'::uuid),
  ('5ec53e74-4aa4-4cd0-bea3-46ce8326781a'::uuid,'78e633ab-0940-4a8e-bc62-0e50d527cbb8'::uuid),
  ('9641163e-6259-4f2a-b67c-5578daea7202'::uuid,'871c0466-9336-44e9-acd8-328e9d631363'::uuid)
) AS m(dup,keep) WHERE t.driver_id = m.dup;

UPDATE lde_daily_route_execution t SET driver_id = m.keep FROM (VALUES
  ('b8b996c2-ac0d-419c-af87-ebf03b8f0a07'::uuid,'8f31ced8-1e1f-4f8d-86e1-f5101a88f7b7'::uuid),
  ('5ec53e74-4aa4-4cd0-bea3-46ce8326781a'::uuid,'78e633ab-0940-4a8e-bc62-0e50d527cbb8'::uuid),
  ('9641163e-6259-4f2a-b67c-5578daea7202'::uuid,'871c0466-9336-44e9-acd8-328e9d631363'::uuid)
) AS m(dup,keep) WHERE t.driver_id = m.dup;

UPDATE lde_deviation_events     t SET driver_id = m.keep FROM (VALUES
  ('b8b996c2-ac0d-419c-af87-ebf03b8f0a07'::uuid,'8f31ced8-1e1f-4f8d-86e1-f5101a88f7b7'::uuid),
  ('5ec53e74-4aa4-4cd0-bea3-46ce8326781a'::uuid,'78e633ab-0940-4a8e-bc62-0e50d527cbb8'::uuid),
  ('9641163e-6259-4f2a-b67c-5578daea7202'::uuid,'871c0466-9336-44e9-acd8-328e9d631363'::uuid)
) AS m(dup,keep) WHERE t.driver_id = m.dup;

UPDATE lde_dt_drivers_window    t SET driver_id = m.keep FROM (VALUES
  ('b8b996c2-ac0d-419c-af87-ebf03b8f0a07'::uuid,'8f31ced8-1e1f-4f8d-86e1-f5101a88f7b7'::uuid),
  ('5ec53e74-4aa4-4cd0-bea3-46ce8326781a'::uuid,'78e633ab-0940-4a8e-bc62-0e50d527cbb8'::uuid),
  ('9641163e-6259-4f2a-b67c-5578daea7202'::uuid,'871c0466-9336-44e9-acd8-328e9d631363'::uuid)
) AS m(dup,keep) WHERE t.driver_id = m.dup;

UPDATE lde_extra_orders         t SET driver_id = m.keep FROM (VALUES
  ('b8b996c2-ac0d-419c-af87-ebf03b8f0a07'::uuid,'8f31ced8-1e1f-4f8d-86e1-f5101a88f7b7'::uuid),
  ('5ec53e74-4aa4-4cd0-bea3-46ce8326781a'::uuid,'78e633ab-0940-4a8e-bc62-0e50d527cbb8'::uuid),
  ('9641163e-6259-4f2a-b67c-5578daea7202'::uuid,'871c0466-9336-44e9-acd8-328e9d631363'::uuid)
) AS m(dup,keep) WHERE t.driver_id = m.dup;

UPDATE lde_fuel_alimentari      t SET driver_id = m.keep FROM (VALUES
  ('b8b996c2-ac0d-419c-af87-ebf03b8f0a07'::uuid,'8f31ced8-1e1f-4f8d-86e1-f5101a88f7b7'::uuid),
  ('5ec53e74-4aa4-4cd0-bea3-46ce8326781a'::uuid,'78e633ab-0940-4a8e-bc62-0e50d527cbb8'::uuid),
  ('9641163e-6259-4f2a-b67c-5578daea7202'::uuid,'871c0466-9336-44e9-acd8-328e9d631363'::uuid)
) AS m(dup,keep) WHERE t.driver_id = m.dup;

UPDATE lde_fuel_alimentari_cash t SET driver_id = m.keep FROM (VALUES
  ('b8b996c2-ac0d-419c-af87-ebf03b8f0a07'::uuid,'8f31ced8-1e1f-4f8d-86e1-f5101a88f7b7'::uuid),
  ('5ec53e74-4aa4-4cd0-bea3-46ce8326781a'::uuid,'78e633ab-0940-4a8e-bc62-0e50d527cbb8'::uuid),
  ('9641163e-6259-4f2a-b67c-5578daea7202'::uuid,'871c0466-9336-44e9-acd8-328e9d631363'::uuid)
) AS m(dup,keep) WHERE t.driver_id = m.dup;

UPDATE lde_marsrut_repeat_alert t SET driver_id = m.keep FROM (VALUES
  ('b8b996c2-ac0d-419c-af87-ebf03b8f0a07'::uuid,'8f31ced8-1e1f-4f8d-86e1-f5101a88f7b7'::uuid),
  ('5ec53e74-4aa4-4cd0-bea3-46ce8326781a'::uuid,'78e633ab-0940-4a8e-bc62-0e50d527cbb8'::uuid),
  ('9641163e-6259-4f2a-b67c-5578daea7202'::uuid,'871c0466-9336-44e9-acd8-328e9d631363'::uuid)
) AS m(dup,keep) WHERE t.driver_id = m.dup;

UPDATE lde_salary_uzine_monthly t SET driver_id = m.keep FROM (VALUES
  ('b8b996c2-ac0d-419c-af87-ebf03b8f0a07'::uuid,'8f31ced8-1e1f-4f8d-86e1-f5101a88f7b7'::uuid),
  ('5ec53e74-4aa4-4cd0-bea3-46ce8326781a'::uuid,'78e633ab-0940-4a8e-bc62-0e50d527cbb8'::uuid),
  ('9641163e-6259-4f2a-b67c-5578daea7202'::uuid,'871c0466-9336-44e9-acd8-328e9d631363'::uuid)
) AS m(dup,keep) WHERE t.driver_id = m.dup;

UPDATE lde_speed_events         t SET driver_id = m.keep FROM (VALUES
  ('b8b996c2-ac0d-419c-af87-ebf03b8f0a07'::uuid,'8f31ced8-1e1f-4f8d-86e1-f5101a88f7b7'::uuid),
  ('5ec53e74-4aa4-4cd0-bea3-46ce8326781a'::uuid,'78e633ab-0940-4a8e-bc62-0e50d527cbb8'::uuid),
  ('9641163e-6259-4f2a-b67c-5578daea7202'::uuid,'871c0466-9336-44e9-acd8-328e9d631363'::uuid)
) AS m(dup,keep) WHERE t.driver_id = m.dup;

DELETE FROM drivers WHERE id IN (
  'b8b996c2-ac0d-419c-af87-ebf03b8f0a07',
  '5ec53e74-4aa4-4cd0-bea3-46ce8326781a',
  '9641163e-6259-4f2a-b67c-5578daea7202'
);

COMMIT;
