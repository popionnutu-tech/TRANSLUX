-- Migration 029: Fix route 21 (Otaci - Chișinău) stops and add Otaci to localities
-- Route 21 had incorrect Şirăuţi-based stops from old import.
-- Actual route: Otaci → Ocnița → Edineț → ... → Chișinău (same stops as route 3/29)
-- TUR:   12:35 Otaci → 17:40 Chișinău
-- RETUR: 18:55 Chișinău → ~23:20 Otaci
-- Times derived from route 3 (Ocnița 8:00) + 5:00h offset for nord, +3:00h for chisinau

BEGIN;

-- ============================================================
-- A) Add Otaci to localities (if not exists)
-- ============================================================
INSERT INTO localities (name_ro, name_ru, is_major, sort_order, active)
SELECT 'Otaci', 'Отачь', true, 11, true
WHERE NOT EXISTS (SELECT 1 FROM localities WHERE name_ro = 'Otaci');

-- ============================================================
-- B) Update crm_routes id=21: fix dest_to_ro format
-- ============================================================
UPDATE crm_routes SET
  dest_to_ro   = 'Otaci',
  dest_to_ru   = 'Отачь',
  dest_from_ro = 'Chișinău',
  dest_from_ru = 'Кишинёв'
WHERE id = 21;

-- ============================================================
-- C) Replace crm_stop_fares for route 21
--    Based on route 3 stops (Ocnița 8:00) with time offsets:
--    hour_from_nord + 5:00, hour_from_chisinau + 3:00
--    Otaci added as first stop (25 min before Ocnița)
-- ============================================================
DELETE FROM crm_stop_fares WHERE crm_route_id = 21;

INSERT INTO crm_stop_fares (id, crm_route_id, price_from_chisinau, hour_from_chisinau, name_ro, name_ru, hour_from_nord, price_from_nord, is_visible) VALUES
(1500, 21, 0,  '23:20', 'Otaci',                'Отачь',                '12:35', 0,  true),
(1501, 21, 5,  '22:55', 'Ocnița',               'Окница',               '13:00', 0,  true),
(1502, 21, 5,  '22:40', 'Dîngeni',              'Дынжаны',              '13:15', 5,  false),
(1503, 21, 2,  '22:35', 'Mihălășeni',           'Михалашаны',           '13:20', 5,  true),
(1504, 21, 2,  '22:30', 'Grinăuți-Raia',        'Гринауцы-Рая',        '13:25', 2,  false),
(1505, 21, 1,  '22:25', 'Bîrlădeni',            'Бырладяны',            '13:25', 2,  true),
(1506, 21, 4,  '22:20', 'Paladea',              'Паладя',               '13:30', 1,  false),
(1507, 21, 1,  '22:15', 'Ruseni',               'Русяны',               '13:35', 4,  false),
(1508, 21, 6,  '22:00', 'Slobotca',             'Слободка',             '13:45', 1,  false),
(1509, 21, 4,  '21:55', 'Edineț',               'Единцы',               '14:25', 6,  true),
(1510, 21, 2,  '21:35', 'Cupcini',              'Калининск',            '14:30', 4,  true),
(1511, 21, 3,  '21:30', 'Brătușeni',            'Братушаны',            '14:35', 2,  false),
(1512, 21, 4,  '21:25', 'Brătușenii Noi',       'Брэтушений Ной',      '14:40', 3,  false),
(1513, 21, 8,  '21:20', 'Mihailenii Noi',       'Михэйлений Ной',      '14:40', 4,  false),
(1514, 21, 0,  '21:15', 'Petrom Rîșcani',       'Petrom Рышканы',       '14:45', 8,  false),
(1515, 21, 8,  '21:15', 'Intersecția Rîșcani',  'Пересечение Рышканы',  '14:45', 0,  true),
(1516, 21, 7,  '21:10', 'Recea',                'Реча',                 '14:55', 8,  false),
(1517, 21, 5,  '21:05', 'Intersecția Pelenia',  'Пересечение Пелиния',  '15:00', 7,  false),
(1518, 21, 8,  '21:00', 'Corlateni',            'Корлатены',            '15:05', 5,  false),
(1519, 21, 6,  '20:45', 'Bălți',                'Бельцы',               '15:30', 8,  true),
(1520, 21, 5,  '20:40', 'Bilicenii Noi',        'Биличений Ной',        '15:40', 6,  false),
(1521, 21, 11, '20:35', 'Bilicenii Vechi',       'Биличений Векь',       '15:40', 5,  false),
(1522, 21, 2,  '20:30', 'Sîngerei',             'Сынжерея',             '15:50', 11, true),
(1523, 21, 1,  '20:25', 'Grigorăuca',           'Григорьевка',          '15:55', 2,  false),
(1524, 21, 10, '20:20', 'Copăceni',             'Копэчень',             '16:00', 1,  false),
(1525, 21, 3,  '20:15', 'Prepelița',            'Препелица',            '16:05', 10, false),
(1526, 21, 8,  '20:10', 'Bănești',              'Бэнешть',              '16:10', 3,  false),
(1527, 21, 6,  '20:05', 'Ratuș',                'Ратуш',                '16:15', 8,  false),
(1528, 21, 1,  '20:00', 'Intersecția Soroca',   'Пересечение Сороки',   '16:35', 6,  true),
(1529, 21, 3,  '19:55', 'Zăhăreuca',            'Захареука',            '16:40', 1,  false),
(1530, 21, 9,  '19:50', 'Ciocîlteni',           'Чокылтяны',            '16:45', 3,  false),
(1531, 21, 12, '19:45', 'Orhei',                'Орхей',                '16:50', 9,  true),
(1532, 21, 6,  '19:35', 'Peresecina',           'Пересечина',           '16:55', 12, false),
(1533, 21, 2,  '19:25', 'Pașcani',              'Пашканы',              '17:00', 6,  false),
(1534, 21, 4,  '19:15', 'Măgdăcești',           'Магдачешты',           '17:10', 2,  false),
(1535, 21, 6,  '19:10', 'Stăuceni',             'Ставчены',             '17:25', 4,  false),
(1536, 21, 0,  '18:55', 'Chișinău',             'Кишинёв',              '17:40', 6,  true);

COMMIT;
