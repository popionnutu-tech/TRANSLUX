-- 266: Tețcani pe ruta 6 (Corjeuți – Chișinău 06:17)
--
-- Ruta 6 pornește din Tețcani la 06:10 și ajunge în Corjeuți la 06:17 —
-- oprirea există în crm_stop_fares (id 199) cu ore reale, dar tariful
-- «Corjeuti/Edinet» (v2 id 6) începe abia la Caracușenii Vechi.
-- După migrația 261 nu mai exista pereche km pentru Tețcani, deci cursa
-- dispărea din căutare exact pentru satul din care pleacă.
--
-- Se adaugă Tețcani ca stop_order 0, la −2 km față de Caracușenii Vechi
-- (Tețcani → Corjeuți = 10 km, conform tarifului 2; Corjeuți = 8 km aici).
-- Perechile km sunt diferențe, deci valoarea negativă nu deranjează nimic.
--
-- stop_order 0 ține oprirea în afara numărării: ruta 25 pornește de la
-- start_stop_order = 1 (Caracușenii Vechi), ruta 6 de la 2 (Corjeuți).
-- Dacă șoferul rutei 6 chiar încasează în Tețcani, start_stop_order al rutei 6
-- trebuie mutat pe 0 — decizie separată, schimbă formularul de numărare.

INSERT INTO interurban_v2_stops (tariff_id, branch, stop_order, name_ro, km_from_start, district)
SELECT 6, 'main', 0, 'Tețcani', -2.00, 'briceni'
WHERE NOT EXISTS (
  SELECT 1 FROM interurban_v2_stops
  WHERE tariff_id = 6 AND branch = 'main' AND normalize_stop_name(name_ro) = 'tetcani'
);
