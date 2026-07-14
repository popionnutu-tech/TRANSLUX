-- ============================================================================
-- LDE — interviu camioane + șoferi (Clava, 2026-07-14)
-- Sursă: LDE-interviu-camioane-si-soferi.md completat de Clava.
-- 1) lde_vehicle_norms primește coloana «loaded» (consum încărcat = max interval).
--    Pentru camioane: measured = gol (min), loaded = încărcat (max).
--    Pragul alertelor DT devine COALESCE(loaded, measured, type.loaded, type.norm).
-- 2) Tip nou ACTROS (reper 26/34) + norme pentru 29 camioane care lucrează.
--    Cele 11 «nu lucrează» NU primesc rând în lde_vehicle_norms (rămân în afara DT).
-- 3) Șoferi camioane (16 noi + Docuciaev Dumitru Dumitru = rename al lui
--    «Docuciaev Dmitrii» existent, confirmat de Ion) + atribuiri active.
-- 4) Uzine: 2 plecați (dezactivați), 10 șoferi noi cu lde_driver_extras.
-- ============================================================================

BEGIN;

-- ── 1. Coloana «loaded» pe override-ul per mașină ──
ALTER TABLE lde_vehicle_norms
  ADD COLUMN IF NOT EXISTS measured_consumption_l_per_100km_loaded numeric(5,2);

COMMENT ON COLUMN lde_vehicle_norms.measured_consumption_l_per_100km_loaded IS
  'Doar camioane: consum măsurat încărcat (max interval). measured = gol (min). Pragul DT = COALESCE(loaded, measured, type).';

-- ── 2. Tip ACTROS + norme camioane ──
INSERT INTO lde_vehicle_types (id, display_name, category, norm_l_per_100km, norm_l_per_100km_loaded, notes)
VALUES ('ACTROS', 'Actros (camion)', 'camion_marfa', 26.00, 34.00, 'Reper din interviul camioane 2026-07: gol 26 / încărcat 34')
ON CONFLICT (id) DO NOTHING;

-- LJN075 lipsea din vehicles (restul de 39 există deja)
INSERT INTO vehicles (plate_number, active, is_lde)
SELECT 'LJN075', true, true
WHERE NOT EXISTS (SELECT 1 FROM vehicles WHERE plate_number = 'LJN075');

-- Norme per camion: measured = gol (min), loaded = încărcat (max)
INSERT INTO lde_vehicle_norms
  (vehicle_id, vehicle_type_id, measured_consumption_l_per_100km, measured_consumption_l_per_100km_loaded,
   measurement_date, override_reason, override_notes)
SELECT v.id, 'ACTROS', t.gol, t.incarcat, DATE '2026-07-14', 'actualizare_norma', 'Interviu camioane Clava 2026-07'
FROM (VALUES
  ('ANT344', 25, 36), ('ANT347', 25, 31), ('BNQ069', 26, 39), ('BNQ085', 25, 35),
  ('DKE248', 25, 37), ('HMK135', 25, 35), ('HMK139', 25, 35), ('IIC230', 26, 39),
  ('IIC263', 25, 37), ('KWX620', 25, 31), ('KYK692', 26, 39), ('KYK742', 25, 38),
  ('KYK784', 26, 40), ('LJN075', 25, 36), ('LJN076', 25, 37), ('LJN080', 25, 34),
  ('LML973', 26, 39), ('MOW214', 25, 36), ('QDQ348', 25, 37), ('QDQ357', 26, 40),
  ('QDQ364', 26, 39), ('QDQ375', 26, 41), ('QDQ395', 26, 39), ('QDQ396', 26, 39),
  ('QDQ419', 26, 40), ('QDQ714', 26, 40), ('RWN169', 29, 41), ('RWN193', 29, 41),
  ('YJX724', 26, 39)
) AS t(plate, gol, incarcat)
JOIN vehicles v ON v.plate_number = t.plate
ON CONFLICT (vehicle_id) DO UPDATE SET
  vehicle_type_id = EXCLUDED.vehicle_type_id,
  measured_consumption_l_per_100km = EXCLUDED.measured_consumption_l_per_100km,
  measured_consumption_l_per_100km_loaded = EXCLUDED.measured_consumption_l_per_100km_loaded,
  measurement_date = EXCLUDED.measurement_date,
  override_reason = EXCLUDED.override_reason,
  override_notes = EXCLUDED.override_notes,
  updated_at = now();

-- ── 3. Șoferi camioane ──
-- «Docuciaev Dmitrii» existent = Docuciaev Dumitru Dumitru (KYK742), confirmat de Ion
UPDATE drivers
SET full_name = 'Docuciaev Dumitru Dumitru', is_lde = true
WHERE id = '2abd6e43-ac18-435b-9160-6d2c4801abb7' AND full_name = 'Docuciaev Dmitrii';

INSERT INTO drivers (full_name, active, is_lde)
SELECT t.nume, true, true
FROM (VALUES
  ('Bisericanu Iurii'), ('Burduja Iurii'), ('Cretu Serghei'), ('Ciornii Serghei'),
  ('Burlacu Iurii'), ('Matievici Serghei'), ('Lavric Vladimir'), ('Popov Serghei'),
  ('Pislaru Victor'), ('Lavric Dorian'), ('Albu Gheorghe'), ('Ciornii Ivan'),
  ('Docuciaev Dumitru Petru'), ('Sicic Alexandru'), ('Lavric Vladimir Vladimir'), ('Lupu Ivan')
) AS t(nume)
WHERE NOT EXISTS (SELECT 1 FROM drivers d WHERE d.full_name = t.nume);

-- Atribuiri active șofer → camion (route/shift NULL: camioanele nu au curse uzină)
INSERT INTO lde_active_assignments (driver_id, vehicle_id, valid_from, notes)
SELECT d.id, v.id, DATE '2026-07-14', 'Interviu camioane Clava 2026-07'
FROM (VALUES
  ('Bisericanu Iurii', 'ANT344'), ('Burduja Iurii', 'ANT347'), ('Cretu Serghei', 'BNQ085'),
  ('Ciornii Serghei', 'DKE248'), ('Burlacu Iurii', 'HMK135'), ('Matievici Serghei', 'HMK139'),
  ('Lavric Vladimir', 'IIC230'), ('Popov Serghei', 'IIC263'), ('Pislaru Victor', 'KWX620'),
  ('Lavric Dorian', 'KYK692'), ('Docuciaev Dumitru Dumitru', 'KYK742'), ('Albu Gheorghe', 'LJN076'),
  ('Ciornii Ivan', 'LJN080'), ('Docuciaev Dumitru Petru', 'LML973'), ('Sicic Alexandru', 'MOW214'),
  ('Lavric Vladimir Vladimir', 'QDQ395'), ('Lupu Ivan', 'LJN075')
) AS t(nume, plate)
JOIN drivers d ON d.full_name = t.nume
JOIN vehicles v ON v.plate_number = t.plate
WHERE NOT EXISTS (SELECT 1 FROM lde_active_assignments a WHERE a.driver_id = d.id AND a.valid_to IS NULL)
  AND NOT EXISTS (SELECT 1 FROM lde_active_assignments a
                  WHERE a.vehicle_id = v.id AND COALESCE(a.shift_number, 0) = 0 AND a.valid_to IS NULL);

-- ── 4. Uzine: plecați + noi ──
-- Plecați: Balanici Gheorghe (Draxelmaier), Gheorghiță Efim (LEAR Florești)
UPDATE lde_active_assignments SET valid_to = DATE '2026-07-14'
WHERE valid_to IS NULL AND driver_id IN (
  'fa2e2f3b-24c2-4b07-a023-426efff26790',
  'ad99645c-2025-436b-bc60-aec6aacbb58c'
);

UPDATE drivers SET active = false
WHERE id IN (
  'fa2e2f3b-24c2-4b07-a023-426efff26790',  -- Balanici Gheorghe
  'ad99645c-2025-436b-bc60-aec6aacbb58c'   -- Gheorghiță Efim
);

-- Șoferi noi pe uzine
INSERT INTO drivers (full_name, active, is_lde)
SELECT t.nume, true, true
FROM (VALUES
  ('Sosna Victor'), ('Rohac Gheorghe'), ('Dabija Mihail'), ('Stici Ion'), ('Botnari Grigore'),
  ('Iovita Ion'), ('Popescu Alexandru'),
  ('Dzegan Alexandru'), ('Popov Petru'),
  ('Cojocari Andrei')
) AS t(nume)
WHERE NOT EXISTS (SELECT 1 FROM drivers d WHERE d.full_name = t.nume);

INSERT INTO lde_driver_extras (driver_id, uzina_id)
SELECT d.id, t.uzina
FROM (VALUES
  ('Sosna Victor', 'DRAXELMAIER_BALTI'), ('Rohac Gheorghe', 'DRAXELMAIER_BALTI'),
  ('Dabija Mihail', 'DRAXELMAIER_BALTI'), ('Stici Ion', 'DRAXELMAIER_BALTI'),
  ('Botnari Grigore', 'DRAXELMAIER_BALTI'),
  ('Iovita Ion', 'SEBN_ORHEI'), ('Popescu Alexandru', 'SEBN_ORHEI'),
  ('Dzegan Alexandru', 'LEAR_UNGHENI'), ('Popov Petru', 'LEAR_UNGHENI'),
  ('Cojocari Andrei', 'LEAR_FLORESTI')
) AS t(nume, uzina)
JOIN drivers d ON d.full_name = t.nume
ON CONFLICT (driver_id) DO UPDATE SET uzina_id = EXCLUDED.uzina_id, updated_at = now();

COMMIT;
