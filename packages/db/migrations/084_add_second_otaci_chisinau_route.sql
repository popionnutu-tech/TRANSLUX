-- 084_add_second_otaci_chisinau_route.sql
-- Adaugă a DOUA rută Otaci–Chișinău (cursa de după-amiază/dimineață) și face
-- toate stațiile vizibile pe AMBELE rute Otaci–Chișinău (cea veche id=21 și cea nouă id=58).
--
-- Ruta nouă:
--   spre Chișinău: pleacă Otaci 16:25 → ajunge Chișinău 21:30
--   spre nord:     pleacă Chișinău 11:00 → ajunge Otaci 15:20
-- Orele pe stații = orele rutei 21 decalate: +3h50m (spre Chișinău) / −7h55m (spre nord).
-- Km și prețuri se moștenesc automat prin tariff_id=7 (tur=122, retur=120) — NU se ating.
--
-- Pași:
--   0. Backup vizibilitate ruta 21 (pentru rollback)
--   1. crm_routes id=58 (clonă a rutei 21, doar orele noi)
--   2. crm_stop_fares id 1537–1573 (37 stații, ordine Otaci→Chișinău, toate vizibile)
--   3. interurban_v2_routes id=29 (clonă a rândului 26 — necesar pt. modulul de numărare)
--   4. UPDATE vizibilitate: toate stațiile rutei 21 devin vizibile
--   5. setval pe secvențele crm_routes / interurban_v2_routes (id-uri inserate explicit)

BEGIN;

-- 0. Backup vizibilitate ruta 21
CREATE TABLE IF NOT EXISTS crm_stop_fares_visibility_backup_084 AS
  SELECT id, is_visible FROM crm_stop_fares WHERE crm_route_id = 21;

-- 1. Ruta nouă în crm_routes
INSERT INTO crm_routes
  (id, dest_from_ro, dest_from_ru, dest_to_ro, dest_to_ru,
   time_nord, time_chisinau, sunday_nord, sunday_chisinau, active,
   tariff_id_tur, tariff_id_retur, route_type, retur_uses_route_id, retur_disabled)
VALUES
  (58, 'Chișinău', 'Кишинёв', 'Otaci', 'Отачь',
   '16:25 - 21:30', '11:00 - 15:20', false, false, true,
   122, 120, 'interurban', NULL, false);

-- 2. Cele 37 de stații (hour_from_nord = spre Chișinău; hour_from_chisinau = spre nord)
INSERT INTO crm_stop_fares
  (id, crm_route_id, name_ro, name_ru, hour_from_nord, hour_from_chisinau,
   price_from_nord, price_from_chisinau, is_visible)
VALUES
  (1537, 58, 'Otaci',               'Отачь',                '16:25', '15:20', 0, 0, true),
  (1538, 58, 'Ocnița',              'Окница',               '17:20', '15:00', 0, 0, true),
  (1539, 58, 'Dîngeni',             'Дынжаны',              '17:30', '14:45', 0, 0, true),
  (1540, 58, 'Mihălășeni',          'Михалашаны',           '17:35', '14:40', 0, 0, true),
  (1541, 58, 'Grinăuți-Raia',       'Гринауцы-Рая',         '17:40', '14:35', 0, 0, true),
  (1542, 58, 'Bîrlădeni',           'Бырладяны',            '17:45', '14:30', 0, 0, true),
  (1543, 58, 'Paladea',             'Паладя',               '17:50', '14:25', 0, 0, true),
  (1544, 58, 'Ruseni',              'Русяны',               '17:53', '14:20', 0, 0, true),
  (1545, 58, 'Slobotca',            'Слободка',             '17:55', '14:13', 0, 0, true),
  (1546, 58, 'Edineț',              'Единцы',               '18:05', '14:05', 0, 0, true),
  (1547, 58, 'Cupcini',             'Калининск',            '18:20', '13:57', 0, 0, true),
  (1548, 58, 'Brătușeni',           'Братушаны',            '18:25', '13:52', 0, 0, true),
  (1549, 58, 'Brătușenii Noi',      'Брэтушений Ной',       '18:35', '13:50', 0, 0, true),
  (1550, 58, 'Mihailenii Noi',      'Михэйлений Ной',       '18:40', '13:40', 0, 0, true),
  (1551, 58, 'Petrom Rîșcani',      'Petrom Рышканы',       '18:40', '13:35', 0, 0, true),
  (1552, 58, 'Intersecția Rîșcani', 'Пересечение Рышканы',  '18:42', '13:35', 0, 0, true),
  (1553, 58, 'Recea',               'Реча',                 '18:50', '13:25', 0, 0, true),
  (1554, 58, 'Intersecția Pelenia', 'Пересечение Пелиния',  '18:57', '13:18', 0, 0, true),
  (1555, 58, 'Corlateni',           'Корлатены',            '19:00', '13:15', 0, 0, true),
  (1556, 58, 'Bălți',               'Бельцы',               '19:30', '13:05', 0, 0, true),
  (1557, 58, 'Bilicenii Noi',       'Биличений Ной',        '19:35', '12:55', 0, 0, true),
  (1558, 58, 'Bilicenii Vechi',     'Биличений Векь',       '19:40', '12:45', 0, 0, true),
  (1559, 58, 'Sîngerei',            'Сынжерея',             '19:50', '12:40', 0, 0, true),
  (1560, 58, 'Grigorăuca',          'Григорьевка',          '19:55', '12:40', 0, 0, true),
  (1561, 58, 'Copăceni',            'Копэчень',             '20:00', '12:35', 0, 0, true),
  (1562, 58, 'Prepelița',           'Препелица',            '20:10', '12:25', 0, 0, true),
  (1563, 58, 'Bănești',             'Бэнешть',              '20:15', '12:20', 0, 0, true),
  (1564, 58, 'Ratuș',               'Ратуш',                '20:17', '12:15', 0, 0, true),
  (1565, 58, 'Intersecția Soroca',  'Пересечение Сороки',   '20:20', '12:12', 0, 0, true),
  (1566, 58, 'Zăhăreuca',           'Захареука',            '20:22', '12:10', 0, 0, true),
  (1567, 58, 'Ciocîlteni',          'Чокылтяны',            '20:25', '12:05', 0, 0, true),
  (1568, 58, 'Orhei',               'Орхей',                '20:40', '11:50', 0, 0, true),
  (1569, 58, 'Peresecina',          'Пересечина',           '20:50', '11:35', 0, 0, true),
  (1570, 58, 'Pașcani',             'Пашканы',              '21:05', '11:17', 0, 0, true),
  (1571, 58, 'Măgdăcești',          'Магдачешты',           '21:10', '11:15', 0, 0, true),
  (1572, 58, 'Stăuceni',            'Ставчены',             '21:15', '11:10', 0, 0, true),
  (1573, 58, 'Chișinău',            'Кишинёв',              '21:30', '11:00', 0, 0, true);

-- 3. Ruta nouă în interurban_v2_routes (necesar pentru numărare)
INSERT INTO interurban_v2_routes
  (id, tariff_id, crm_route_id, name_ro, name_ru,
   time_nord, time_chisinau, start_stop_order, start_branch,
   retur_tariff_id, active, notes, start_district)
VALUES
  (29, 7, 58, 'Chișinău - Otaci (16:25)', NULL,
   '16:25 - 21:30', '11:00 - 15:20', 1, 'main',
   7, true, 'ruta secundară Otaci 16:25 / Chișinău 11:00', 'ocnita');

-- 4. Toate stațiile vizibile pe ruta veche (21)
UPDATE crm_stop_fares SET is_visible = true WHERE crm_route_id = 21;

-- 5. Aliniere secvențe (id-uri inserate explicit)
SELECT setval('public.crm_routes_id_seq',          (SELECT max(id) FROM crm_routes));
SELECT setval('public.interurban_v2_routes_id_seq', (SELECT max(id) FROM interurban_v2_routes));

COMMIT;
