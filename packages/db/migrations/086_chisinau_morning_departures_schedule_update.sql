-- 086_chisinau_morning_departures_schedule_update.sql
-- Decalează 3 plecări de dimineață din Chișinău (direcția CHISINAU_BALTI):
--   09:30 → 09:25 (crm_route_id=15)
--   10:10 → 10:00 (crm_route_id=14)
--   10:40 → 10:30 (crm_route_id=16)
--
-- Ca și migrarea 085: afectează DOAR botul operatorului din Chișinău și raportul
-- zilnic de întârzieri (ambele citesc direct din `trips`, fără redeploy).
-- NU se ating: site-ul public (crm_routes / crm_stop_fares) și direcția
-- BALTI_CHISINAU — toate condițiile filtrează după direction='CHISINAU_BALTI'.
--
-- Cheie: crm_route_id + ora curentă (atinge exact rândul vizat).
-- Verificat înainte: fiecare oră sursă are exact 1 rând; orele țintă
-- (09:25 / 10:00 / 10:30) sunt libere pe direcția CHISINAU_BALTI.

BEGIN;

UPDATE trips SET departure_time = '09:25'
  WHERE direction = 'CHISINAU_BALTI' AND crm_route_id = 15 AND departure_time = '09:30';

UPDATE trips SET departure_time = '10:00'
  WHERE direction = 'CHISINAU_BALTI' AND crm_route_id = 14 AND departure_time = '10:10';

UPDATE trips SET departure_time = '10:30'
  WHERE direction = 'CHISINAU_BALTI' AND crm_route_id = 16 AND departure_time = '10:40';

COMMIT;
