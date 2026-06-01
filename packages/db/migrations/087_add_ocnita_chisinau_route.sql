-- 087_add_ocnita_chisinau_route.sql
-- Cursă nouă interurban: Ocnița ↔ Chișinău (un autobuz, dus-întors).
--   Tur   (Ocnița → Chișinău): Ocnița 05:30 → Edineț 06:26 → Bălți 08:15 → Chișinău 10:25
--   Retur (Chișinău → Ocnița): Chișinău 11:00 → ... → Ocnița 15:55
-- Orele intermediare = interpolare proporțională cu km-ul, ancorate pe cele 3 puncte date.
-- Km și prețuri se moștenesc automat prin tariff_id (interurban_v2, tariff 7, start_stop_order=7)
--   — interurban_v2_stops NU se atinge.
--
-- Timp dublu (cerință client):
--   - Site (pasageri) + Numărare: retur din Chișinău = 11:00 (oră publică).
--   - Raport intern + peron (operator): aceeași cursă = 13:10 — rândul existent „Ocnița 13:10"
--     (adăugat de migrarea 085, fără rută). Îl LEGĂM de ruta nouă (mapping trips ↔ crm_route).
--
-- Pași (model = migrarea 084):
--   1. crm_routes id=59           → apare în nomenclatorul „Rute" și pe site
--   2. crm_stop_fares 1574–1609   → 36 stații, TOATE vizibile (is_visible=true)
--   3. interurban_v2_routes id=30 → înregistrare în nomenclatorul interurban v2 (Numărare)
--   4. UPDATE trips 13:10         → crm_route_id=59 (mapping peron 13:10 ↔ rută)
--   5. setval pe crm_routes_id_seq și interurban_v2_routes_id_seq (NU pe crm_stop_fares — nu există)

BEGIN;

-- 1. Ruta nouă în crm_routes (id=59)
INSERT INTO crm_routes
  (id, dest_from_ro, dest_from_ru, dest_to_ro, dest_to_ru,
   time_nord, time_chisinau, sunday_nord, sunday_chisinau, active,
   tariff_id_tur, tariff_id_retur, route_type, retur_uses_route_id, retur_disabled)
VALUES
  (59, 'Ocnița - Chișinău', 'Окница - Кишинёв', 'Chișinău - Ocnița', 'Кишинёв - Окница',
   '05:30 - 10:25', '11:00 - 15:55', false, false, true,
   122, 120, 'interurban', NULL, false);

-- 2. Cele 36 de stații (hour_from_nord = Tur Ocnița→Chișinău; hour_from_chisinau = Retur Chișinău→Ocnița)
INSERT INTO crm_stop_fares
  (id, crm_route_id, name_ro, name_ru, hour_from_nord, hour_from_chisinau,
   price_from_nord, price_from_chisinau, is_visible)
VALUES
  (1574, 59, 'Ocnița',               'Окница',               '05:30', '15:55', 0, 0, true),
  (1575, 59, 'Dîngeni',              'Дынжаны',              '05:47', '15:38', 0, 0, true),
  (1576, 59, 'Mihălășeni',           'Михалашаны',           '05:51', '15:34', 0, 0, true),
  (1577, 59, 'Grinăuți-Raia',        'Гринауцы-Рая',         '05:57', '15:28', 0, 0, true),
  (1578, 59, 'Bîrlădeni',            'Бырладяны',            '06:00', '15:25', 0, 0, true),
  (1579, 59, 'Paladea',              'Паладя',               '06:03', '15:22', 0, 0, true),
  (1580, 59, 'Ruseni',               'Русяны',               '06:11', '15:14', 0, 0, true),
  (1581, 59, 'Slobotca',             'Слободка',             '06:15', '15:10', 0, 0, true),
  (1582, 59, 'Edineț',               'Единцы',               '06:26', '14:59', 0, 0, true),
  (1583, 59, 'Cupcini',              'Калининск',            '06:35', '14:50', 0, 0, true),
  (1584, 59, 'Brătușeni',            'Братушаны',            '06:42', '14:43', 0, 0, true),
  (1585, 59, 'Brătușenii Noi',       'Брэтушений Ной',       '06:56', '14:29', 0, 0, true),
  (1586, 59, 'Mihailenii Noi',       'Михэйлений Ной',       '07:03', '14:22', 0, 0, true),
  (1587, 59, 'Petrom Rîșcani',       'Petrom Рышканы',       '07:16', '14:09', 0, 0, true),
  (1588, 59, 'Intersecția Rîșcani',  'Пересечение Рышканы',  '07:16', '14:09', 0, 0, true),
  (1589, 59, 'Recea',                'Реча',                 '07:28', '13:57', 0, 0, true),
  (1590, 59, 'Intersecția Pelenia',  'Пересечение Пелиния',  '07:46', '13:39', 0, 0, true),
  (1591, 59, 'Corlateni',            'Корлатены',            '07:53', '13:32', 0, 0, true),
  (1592, 59, 'Bălți',                'Бельцы',               '08:15', '13:10', 0, 0, true),
  (1593, 59, 'Bilicenii Noi',        'Биличений Ной',        '08:24', '13:01', 0, 0, true),
  (1594, 59, 'Bilicenii Vechi',      'Биличений Векь',       '08:29', '12:56', 0, 0, true),
  (1595, 59, 'Sîngerei',             'Сынжерея',             '08:41', '12:44', 0, 0, true),
  (1596, 59, 'Grigorăuca',           'Григорьевка',          '08:44', '12:41', 0, 0, true),
  (1597, 59, 'Copăceni',             'Копэчень',             '08:46', '12:39', 0, 0, true),
  (1598, 59, 'Prepelița',            'Препелица',            '08:55', '12:30', 0, 0, true),
  (1599, 59, 'Bănești',              'Бэнешть',              '08:59', '12:26', 0, 0, true),
  (1600, 59, 'Ratuș',                'Ратуш',                '09:07', '12:18', 0, 0, true),
  (1601, 59, 'Intersecția Soroca',   'Пересечение Сороки',   '09:13', '12:12', 0, 0, true),
  (1602, 59, 'Zăhăreuca',            'Захареука',            '09:18', '12:07', 0, 0, true),
  (1603, 59, 'Ciocîlteni',           'Чокылтяны',            '09:32', '11:53', 0, 0, true),
  (1604, 59, 'Orhei',                'Орхей',                '09:38', '11:47', 0, 0, true),
  (1605, 59, 'Peresecina',           'Пересечина',           '09:57', '11:28', 0, 0, true),
  (1606, 59, 'Pașcani',              'Пашканы',              '10:07', '11:18', 0, 0, true),
  (1607, 59, 'Măgdăcești',           'Магдачешты',           '10:10', '11:15', 0, 0, true),
  (1608, 59, 'Stăuceni',             'Ставчены',             '10:16', '11:09', 0, 0, true),
  (1609, 59, 'Chișinău',             'Кишинёв',              '10:25', '11:00', 0, 0, true);

-- 3. Înregistrare în nomenclatorul interurban v2 (necesar pentru Numărare; km de la Ocnița)
INSERT INTO interurban_v2_routes
  (id, tariff_id, crm_route_id, name_ro, name_ru,
   time_nord, time_chisinau, start_stop_order, start_branch,
   retur_tariff_id, active, notes, start_district)
VALUES
  (30, 7, 59, 'Ocnița - Chișinău (05:30)', NULL,
   '05:30 - 10:25', '11:00 - 15:55', 7, 'main',
   7, true, 'cursă nouă Ocnița 05:30 / retur Chișinău 11:00; site+numărare=11:00, peron/raport=13:10 (mapping)', 'ocnita');

-- 4. Mapping: legăm plecarea de peron 13:10 (creată de migrarea 085) la ruta nouă
UPDATE trips SET crm_route_id = 59
  WHERE direction = 'CHISINAU_BALTI' AND departure_time = '13:10' AND crm_route_id IS NULL;

-- 5. Aliniere secvențe (id-uri inserate explicit) — DOAR cele care există
SELECT setval('public.crm_routes_id_seq',           (SELECT max(id) FROM crm_routes));
SELECT setval('public.interurban_v2_routes_id_seq',  (SELECT max(id) FROM interurban_v2_routes));

COMMIT;
