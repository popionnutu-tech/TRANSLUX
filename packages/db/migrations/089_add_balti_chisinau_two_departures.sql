-- 089_add_balti_chisinau_two_departures.sql
-- Adaugă în raportul Bălți și la operatorul de peron Bălți 2 plecări Bălți → Chișinău,
-- corespunzătoare ULTIMELOR 2 rute adăugate (care trec prin Bălți spre Chișinău):
--   08:15 → ruta 59 (Ocnița 05:30 → Chișinău) — trece prin Bălți la 08:15
--   19:30 → ruta 58 (Otaci 16:25 → Chișinău) — trece prin Bălți la 19:30
--
-- Operatorul Bălți (point BALTI) marchează plecările pe direcția BALTI_CHISINAU
-- (route_id comun = d6e2f95e-baea-4c72-b1b2-4a18c67980ed). Botul și raportul citesc
-- direct din `trips`, deci modificarea intră în vigoare imediat, fără redeploy.
--
-- Note de siguranță:
--   - Ambele ore (08:15, 19:30) sunt libere pe direcția BALTI_CHISINAU — fără conflict.
--   - crm_route_id leagă slotul de rută (identificare în raport). La Bălți NU declanșează
--     preasignare de șofer/mașină (asta se întâmplă doar la Chișinău) — operatorul alege manual.

BEGIN;

INSERT INTO trips (route_id, direction, departure_time, crm_route_id, active)
VALUES
  ('d6e2f95e-baea-4c72-b1b2-4a18c67980ed', 'BALTI_CHISINAU', '08:15', 59, true),  -- Ocnița (ruta 59)
  ('d6e2f95e-baea-4c72-b1b2-4a18c67980ed', 'BALTI_CHISINAU', '19:30', 58, true);  -- Otaci  (ruta 58)

COMMIT;
