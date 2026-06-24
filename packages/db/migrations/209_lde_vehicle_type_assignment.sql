-- ============================================================================
-- MODUL LDE — faza 6: vehicul→tip pentru TOATE mașinile (nu doar override-uri)
-- Norma efectivă = COALESCE(measured_consumption, type.norm_l_per_100km)
-- ============================================================================
BEGIN;

-- measured devine nullable: un vehicul poate avea tip atribuit FĂRĂ consum măsurat
-- (norma = a tipului). Doar cele 36 cu measurere reală au valoare.
ALTER TABLE lde_vehicle_norms ALTER COLUMN measured_consumption_l_per_100km DROP NOT NULL;

COMMENT ON TABLE lde_vehicle_norms IS 'Atribuire tip per vehicul LDE + override opțional. measured NULL = folosește norma tipului. Cele 36 cu measured = consum real măsurat (override). Norma efectivă = COALESCE(measured, type.norm_l_per_100km).';
COMMENT ON COLUMN lde_vehicle_norms.measured_consumption_l_per_100km IS 'NULL = nu s-a măsurat, folosește norma tipului. Valoare = consum real măsurat (override).';

COMMIT;
