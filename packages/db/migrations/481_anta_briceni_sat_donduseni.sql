-- 481: Concurența — opririle ANTA scrise «or. X» care sunt de fapt sate cu nume de oraș de raion (ION-185, 02.10).
-- Ion, pe cursa Chișinău GA Nord – Otaci GA (IR000057, 17:55): «aici e Briceni raionul Dondușeni». Fișierul ANTA scrie
-- «or. Briceni» și pentru satul Briceni din Dondușeni (între Moșana și Sauca, km 243), iar regula «or. X = centrul
-- raionului X» l-a pus în raionul Briceni, deci cursa apărea la Chișinău → orașul Briceni. Regula e corectată în
-- lib/anta/district.ts (geometria bate prefixul); aici doar rândurile verificate în bază, cu WHERE pe valorile vechi:
--   IR000057 seq 14 și IR000880 seq 5 (4 curse Dondușeni GA – Otaci GA): or. Briceni/Briceni → s. Briceni/Dondușeni;
--   IR001566 (Chișinău GA Centru – Baimaclia): «or. Taraclia» după Sălcuța Nouă (km 86) e satul Taraclia din Căușeni,
--   iar Baimaclia (km 89) căzuse în Cantemir din cauza lui → ambele Căușeni.
-- Fără reimport; următorul import face asta singur (villageName).

UPDATE anta_course_stops s SET name = 's. Briceni', district = 'Dondușeni'
FROM anta_courses c
WHERE c.id = s.course_id AND c.code IN ('IR000057', 'IR000880') AND s.name = 'or. Briceni' AND s.district = 'Briceni';

UPDATE anta_course_stops s SET name = 's. Taraclia', district = 'Căușeni'
FROM anta_courses c
WHERE c.id = s.course_id AND c.code = 'IR001566' AND s.seq = 5 AND s.name = 'or. Taraclia' AND s.district = 'Taraclia';

UPDATE anta_course_stops s SET district = 'Căușeni'
FROM anta_courses c
WHERE c.id = s.course_id AND c.code = 'IR001566' AND s.seq = 6 AND s.name = 's. Baimaclia' AND s.district = 'Cantemir';
