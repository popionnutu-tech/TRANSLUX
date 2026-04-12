-- Migration 028: Update route 6 (Corjeuți - Chișinău) schedule times
-- Old: 11:25 Corjeuți → Chișinău 15:15 / 18:45 Chișinău → Corjeuți 22:00
-- New: 6:17 Corjeuți → Chișinău 10:20 / 11:43 Chișinău → Corjeuți 15:00
-- Reference times taken from crm_stop_prices; intermediate stops interpolated from route 3 pattern

BEGIN;

-- ============================================================
-- A) Update crm_routes id=6: display time strings
-- ============================================================
UPDATE crm_routes SET
  time_nord     = '6:17 - 10:20',
  time_chisinau = '11:43 - 15:45'
WHERE id = 6;

-- ============================================================
-- B) Replace crm_stop_fares for route 6
--    Same stops, prices, names, visibility — only hours changed
-- ============================================================
DELETE FROM crm_stop_fares WHERE crm_route_id = 6;

INSERT INTO crm_stop_fares (id, crm_route_id, price_from_chisinau, hour_from_chisinau, name_ro, name_ru, hour_from_nord, price_from_nord, is_visible) VALUES
(195, 6, 6,  '15:45', 'Lipcani',              'Липканы',              '5:42',  0,  false),
(196, 6, 1,  '15:40', 'Şirăuţi',             'Ширеуцы',             '5:52',  6,  true),
(197, 6, 3,  '15:35', 'Slobozia Şirăuţi',    'Слободка Ширеуцы',    '6:02',  1,  false),
(198, 6, 4,  '15:30', 'Pererita',             'Перерыта',            '6:07',  3,  false),
(199, 6, 7,  '15:20', 'Teţcani',              'Тецканы',             '6:17',  4,  false),
(200, 6, 5,  '15:00', 'Corjeuți',             'Коржеуць',            '6:17',  7,  true),
(201, 6, 1,  '15:00', 'Trinca',               'Тринка',              '6:32',  5,  false),
(202, 6, 5,  '14:55', 'Tîrnova',              'Тырнова',             '6:42',  1,  false),
(203, 6, 9,  '14:45', 'Gordineștii Noi',      'Новые Гординешты',    '6:52',  5,  false),
(204, 6, 4,  '14:40', 'Edineț',               'Единцы',              '7:05',  9,  true),
(205, 6, 2,  '14:30', 'Cupcini',              'Калининск',           '7:20',  4,  true),
(206, 6, 3,  '14:25', 'Brătușeni',            'Братушаны',           '7:25',  2,  false),
(207, 6, 4,  '14:20', 'Brătușenii Noi',       'Брэтушений Ной',     '7:30',  3,  false),
(208, 6, 8,  '14:20', 'Mihailenii Noi',       'Михэйлений Ной',     '7:30',  4,  false),
(209, 6, 0,  '14:15', 'Petrom Rîșcani',       'Petrom Рышканы',      '7:40',  8,  false),
(210, 6, 8,  '14:15', 'Intersecția Rîșcani',  'Пересечение Рышканы', '7:40',  0,  true),
(211, 6, 7,  '14:05', 'Recea',                'Реча',                '7:45',  8,  false),
(212, 6, 5,  '14:00', 'Intersecția Pelenia',  'Пересечение Пелиния', '7:50',  7,  false),
(213, 6, 8,  '13:55', 'Corlateni',            'Корлатены',           '8:00',  5,  false),
(214, 6, 6,  '13:40', 'Bălți',                'Бельцы',              '8:20',  8,  true),
(215, 6, 5,  '13:25', 'Bilicenii Noi',        'Биличений Ной',      '8:25',  6,  false),
(216, 6, 11, '13:20', 'Bilicenii Vechi',       'Биличений Векь',      '8:30',  5,  false),
(217, 6, 2,  '13:10', 'Sîngerei',             'Сынжерея',            '8:40',  11, true),
(218, 6, 1,  '13:05', 'Grigorăuca',           'Григорьевка',         '8:45',  2,  false),
(219, 6, 10, '13:05', 'Copăceni',             'Копэчень',            '8:50',  1,  false),
(220, 6, 3,  '13:00', 'Prepelița',            'Препелица',           '8:55',  10, false),
(221, 6, 8,  '12:55', 'Bănești',              'Бэнешть',             '9:00',  3,  false),
(222, 6, 6,  '12:50', 'Ratuș',                'Ратуш',               '9:00',  8,  false),
(223, 6, 1,  '12:45', 'Intersecția Soroca',   'Пересечение Сороки',  '9:05',  6,  true),
(224, 6, 3,  '12:40', 'Zăhăreuca',            'Захареука',           '9:10',  1,  false),
(225, 6, 9,  '12:30', 'Ciocîlteni',           'Чокылтяны',           '9:20',  3,  false),
(226, 6, 12, '12:25', 'Orhei',                'Орхей',               '9:25',  9,  true),
(227, 6, 6,  '12:15', 'Peresecina',           'Пересечина',          '9:30',  12, false),
(228, 6, 2,  '12:05', 'Pașcani',              'Пашканы',             '9:35',  6,  false),
(229, 6, 4,  '12:00', 'Măgdăceşti',           'Магдачешты',          '9:45',  2,  false),
(230, 6, 6,  '11:55', 'Stăuceni',             'Ставчены',            '10:00', 4,  false),
(231, 6, 0,  '11:43', 'Chișinău',             'Кишинёв',             '10:20', 6,  true);

-- ============================================================
-- C) Replace crm_stop_prices for route 6
--    Ensures live DB gets correct km + time data
-- ============================================================
DELETE FROM crm_stop_prices WHERE crm_route_id = 6;

INSERT INTO crm_stop_prices (id, crm_route_id, km_from_chisinau, time_from_chisinau, hour_from_chisinau, name_ro, name_ru, hour_from_nord, time_from_nord, km_from_nord, is_visible) VALUES
(1208, 6, 6,     6,  '15:00', 'Corjeuți',             'Коржеуць',            '6:17',  0,  0,     true),
(1209, 6, 5.12,  5,  '15:00', 'Trinca',               'Тринка',              '6:32',  6,  6,     false),
(1210, 6, 8.96,  8,  '14:55', 'Tîrnova',              'Тырнова',             '6:42',  5,  5.12,  false),
(1211, 6, 12.8,  11, '14:45', 'Gordinești',           'Новые Гординешты',    '6:52',  8,  8.96,  false),
(1212, 6, 10.24, 9,  '14:40', 'Edineț',               'Единцы',              '7:05',  11, 12.8,  true),
(1213, 6, 15.5,  14, '14:30', 'Cupcini',              'Калининск',           '7:20',  9,  10.24, true),
(1214, 6, 13,    12, '14:20', 'Mihailenii Noi',       'Михэйлений Ной',     '7:30',  14, 15.5,  false),
(1215, 6, 10.24, 9,  '14:15', 'Intersecția Rîșcani',  'Пересечение Рышканы', '7:40',  12, 13,    false),
(1216, 6, 21.12, 19, '14:05', 'Recea',                'Реча',                '7:45',  9,  10.24, false),
(1217, 6, 13,    12, '13:55', 'Corlateni',            'Корлатены',           '8:00',  19, 21.12, false),
(1218, 6, 16,    14, '13:40', 'Bălți',                'Бельцы',              '8:20',  12, 13,    true),
(1219, 6, 15.36, 14, '13:20', 'Bilicenii vechi',      'Биличений Векь',      '8:30',  14, 16,    false),
(1220, 6, 6,     6,  '13:10', 'Sîngerei',             'Сынжерея',            '8:40',  14, 15.36, true),
(1221, 6, 8,     7,  '13:05', 'Copăceni',             'Копэчень',            '8:50',  6,  6,     false),
(1222, 6, 22,    19, '13:00', 'Prepelița',            'Препелица',           '8:55',  7,  8,     false),
(1223, 6, 28.16, 25, '12:40', 'Zăhăreuca',            'Захареука',           '9:10',  19, 22,    false),
(1224, 6, 24.32, 21, '12:25', 'Orhei',                'Орхей',               '9:25',  25, 28.16, true),
(1225, 6, 29,    25, '12:15', 'Peresecina',           'Пересечино',          '9:30',  21, 24.32, false),
(1226, 6, 0,     0,  '11:43', 'Chișinău',             'Кишинёв',             '10:20', 25, 29,    true);

-- ============================================================
-- D) crm_route_links — already correct (verified)
--    id=21: '6.17---Corjeuti - Chisinau---11.43', crm_route_id=6
-- ============================================================

COMMIT;
