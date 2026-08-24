-- 271_sebn_straseni_ruta28.sql
-- Cursa nouă Vatici → SEBN MD2 Strășeni (Alexei, 24.08): fabrica rămâne SEBN Orhei,
-- destinația e filiala a doua din Strășeni. Două schimburi (1 și 2), 20 persoane fiecare.
--
-- Verificarea GPS compară opririle cu city-ul uzinei + gps_localities; fără Strășeni în
-- listă, cursa asta ar da nepotrivire în FIECARE zi (mașina ajunge la Strășeni, nu la
-- Orhei/Bucuria). Lista e ADITIVĂ pentru toată uzina — restul curselor SEBN acceptă de
-- acum și Strășeni ca punct de sosire valid.

-- 1) localitatea filialei a doua, pentru verificarea GPS a atribuirilor
UPDATE lde_uzine
   SET gps_localities = array(SELECT DISTINCT unnest(gps_localities || ARRAY['Strășeni']))
 WHERE id = 'SEBN_ORHEI';

-- 2) cursa (route_number 28 = primul liber; 1–27 ocupate)
INSERT INTO lde_factory_routes
  (uzina_id, route_number, stops_in_order, total_passengers, has_shift1, has_shift2, has_shift3, rotation_note)
VALUES
  ('SEBN_ORHEI', 28, 'Vatici → SEBN MD2 Strășeni', NULL, true, true, false, 'filiala 2 SEBN, la Strășeni')
ON CONFLICT (uzina_id, route_number) DO NOTHING;

-- 3) schimburile — OBLIGATORII: ensureDaysMaterialized() citește cursele PRIN
--    lde_factory_route_shifts, iar o cursă fără rânduri de schimb nu se materializează
--    niciodată în graficul zilnic (apps/admin/src/lib/atribuiri/core.ts)
INSERT INTO lde_factory_route_shifts (route_id, shift_number, passengers_count, notes)
SELECT r.id, s.shift_number, 20, NULL
  FROM lde_factory_routes r
 CROSS JOIN (VALUES (1), (2)) AS s(shift_number)
 WHERE r.uzina_id = 'SEBN_ORHEI' AND r.route_number = 28
ON CONFLICT (route_id, shift_number) DO NOTHING;
