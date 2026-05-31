-- 085_chisinau_departures_schedule_update.sql
-- Actualizează orarul de plecări din Chișinău (direcția CHISINAU_BALTI), intervalul
-- 11:00–17:25, conform noului grafic cerut de client ("Cum trebuie sa fie").
--
-- Schimbările afectează DOAR munca operatorului în botul Telegram și raportul zilnic
-- de întârzieri — ambele citesc direct din tabela `trips` (fără redeploy).
-- NU se ating:
--   - site-ul public (crm_routes / crm_stop_fares),
--   - direcția BALTI_CHISINAU (are ore care se suprapun) — de aceea TOATE condițiile
--     filtrează după direction='CHISINAU_BALTI'.
--
-- route_id comun pentru plecările din Chișinău: fd3b0679-bb26-4233-9baf-6d3e451c90fa
--
-- Pași:
--   1. 10 UPDATE-uri pe crm_route_id (cheie stabilă — se schimbă doar ora).
--   2. 2 INSERT-uri (plecări care nu existau în bot):
--        11:00 → Otaci  (crm_route_id=58, ruta adăugată de migrarea 084)
--        13:10 → Ocnița (crm_route_id=NULL — doar bot; operatorul alege manual șoferul/mașina)
--
-- Note de siguranță:
--   - Toate orele finale în interval sunt unice → fără conflicte.
--   - Se modifică aceleași rânduri (id-urile curselor NU se schimbă) → marcajele deja
--     făcute azi rămân atașate curselor lor.
--   - Fiecare crm_route_id este unic pe direcția CHISINAU_BALTI (verificat) → fiecare
--     UPDATE atinge exact un rând.

BEGIN;

-- 1. Decalări de oră (direcția din Chișinău)
UPDATE trips SET departure_time = '11:28' WHERE direction = 'CHISINAU_BALTI' AND crm_route_id = 1;   -- Grimăncăuți       11:20 → 11:28
UPDATE trips SET departure_time = '12:20' WHERE direction = 'CHISINAU_BALTI' AND crm_route_id = 20;  -- Larga             12:30 → 12:20
UPDATE trips SET departure_time = '12:45' WHERE direction = 'CHISINAU_BALTI' AND crm_route_id = 18;  -- Lipcani (Viișoara) 13:00 → 12:45
UPDATE trips SET departure_time = '13:35' WHERE direction = 'CHISINAU_BALTI' AND crm_route_id = 22;  -- Lipcani           13:30 → 13:35
UPDATE trips SET departure_time = '14:00' WHERE direction = 'CHISINAU_BALTI' AND crm_route_id = 17;  -- Criva (Tețcani)   13:55 → 14:00
UPDATE trips SET departure_time = '14:25' WHERE direction = 'CHISINAU_BALTI' AND crm_route_id = 19;  -- Lipcani           14:20 → 14:25
UPDATE trips SET departure_time = '16:05' WHERE direction = 'CHISINAU_BALTI' AND crm_route_id = 3;   -- Ocnița            15:55 → 16:05
UPDATE trips SET departure_time = '16:30' WHERE direction = 'CHISINAU_BALTI' AND crm_route_id = 25;  -- Caracuseni        16:20 → 16:30
UPDATE trips SET departure_time = '16:55' WHERE direction = 'CHISINAU_BALTI' AND crm_route_id = 28;  -- Criva             16:45 → 16:55
UPDATE trips SET departure_time = '17:25' WHERE direction = 'CHISINAU_BALTI' AND crm_route_id = 26;  -- Corjeuți (Briceni) 17:20 → 17:25

-- 2. Plecări noi (nu existau în bot)
INSERT INTO trips (route_id, direction, departure_time, crm_route_id, active)
VALUES
  ('fd3b0679-bb26-4233-9baf-6d3e451c90fa', 'CHISINAU_BALTI', '11:00', 58,   true),  -- Otaci
  ('fd3b0679-bb26-4233-9baf-6d3e451c90fa', 'CHISINAU_BALTI', '13:10', NULL, true);  -- Ocnița (doar bot)

COMMIT;
