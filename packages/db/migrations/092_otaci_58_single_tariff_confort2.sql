-- 092_otaci_58_single_tariff_confort2.sql
-- Excepție (temporară) la NUMĂRARE pentru cursa Otaci–Chișinău 16:25 / retur 11:00 (crm_route_id=58).
--
-- Cerință client: această cursă să se numere DOAR la tariful interurban confort II
-- (rate_interurban_long, ~0,91 lei/km) pe TOATĂ ruta, fără al doilea tarif raional
-- (rate_suburban, ~1,17 lei/km) aplicat pe porțiunea din raionul Ocnița (Otaci→Slobozca).
--
-- Mecanism: numărarea aplică tariful raional doar dacă ruta are `start_district` setat
-- (citit prin getRouteStartDistrict → CountingForm → calculateDirection). Punând NULL,
-- districtAware=false → totul se numără la confort II.
--
-- Izolare verificată:
--   - Afectează DOAR numărarea rutei 58. Cealaltă cursă Otaci (id=21) rămâne cu start_district='ocnita'.
--   - NU afectează prețurile publice/voice/trips-search: acelea folosesc view-ul
--     v_interurban_v2_km_pairs, care derivă start_district din interurban_v2_stops
--     (districtul primei stații), NU din interurban_v2_routes.
--   - interurban_v2_stops NU se atinge.
--
-- Reversibil: UPDATE interurban_v2_routes SET start_district='ocnita' WHERE crm_route_id=58;

BEGIN;

-- 1. Excepția propriu-zisă: ruta 58 nu mai are district de start → numărarea aplică doar confort II.
UPDATE interurban_v2_routes
SET start_district = NULL
WHERE crm_route_id = 58;

-- 2. Corectare istorică: cele 2 curse deja numărate pe ruta 58 (1 și 2 iunie 2026), care fuseseră
--    numărate cu „două tarife" (raional 1,17 pe segmentele Ocnița + confort II 0,91 pe rest),
--    sunt recalculate la confort II pur (0,91 pe toată ruta). Sesiunile au 0 pasageri scurți,
--    deci recalculul din counting_entries e exact. (Rate la acea dată: long=0,91 / suburban=1,17.)
--      1 iunie  (db0ddfcb…): tur 4782→4588, retur 3537→3414
--      2 iunie  (09bf8972…): tur 1567→1520, retur 5031→4944
UPDATE counting_sessions
SET tur_total_lei = 4588, tur_single_lei = 4588, retur_total_lei = 3414, retur_single_lei = 3414
WHERE id = 'db0ddfcb-b7ac-42d7-955e-2232fe5e2957';

UPDATE counting_sessions
SET tur_total_lei = 1520, tur_single_lei = 1520, retur_total_lei = 4944, retur_single_lei = 4944
WHERE id = '09bf8972-74f1-4978-aa6a-170c85d37cdd';

COMMIT;
