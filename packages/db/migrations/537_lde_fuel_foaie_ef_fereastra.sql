-- 537: «E dublură» în vederea lde_fuel_foaie_ef folosește aceeași fereastră ca acoperirea (migr. 536): ±1 zi la autobuze,
-- ±4 zile la camioane (536 punea ±4 la toate; testul cu ROLLBACK «anularea ultimului import → foaia revine» a prins-o).
CREATE OR REPLACE VIEW lde_fuel_foaie_ef AS
SELECT f.id, f.vehicle_id, f.zi, x.litri_ef AS litri, f.foaie, f.external_id, f.sofer, f.km_total, f.imported_at
FROM lde_fuel_foaie f
LEFT JOIN lde_fuel_foaie_acoperire a ON a.foaie_external_id = f.external_id
CROSS JOIN LATERAL (
  SELECT CASE WHEN EXISTS (SELECT 1 FROM vehicles v WHERE v.id = f.vehicle_id AND 'camioane' = ANY (v.directions)) THEN 4 ELSE 1 END AS w
) fw
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN lde_fuel_foaie_sursa(f.foaie) IS NOT NULL AND EXISTS (
           SELECT 1 FROM lde_fuel_foaie_decizie d
           WHERE d.vehicle_id = f.vehicle_id AND d.zi = f.zi AND d.sursa = lde_fuel_foaie_sursa(f.foaie)
             AND EXISTS (SELECT 1 FROM lde_fuel_import_rand r
                         WHERE r.vehicle_id = f.vehicle_id AND r.sursa = d.sursa AND r.stare = 'legat' AND r.este_dt
                           AND r.zi_local BETWEEN f.zi - fw.w AND f.zi + fw.w AND lde_fuel_rand_activ(r.external_id)))
      THEN 0::numeric
    ELSE greatest(f.litri - coalesce(a.acoperit, 0), 0) END AS litri_ef
) x
WHERE x.litri_ef > 0.005;
REVOKE ALL ON lde_fuel_foaie_ef FROM anon, authenticated;
