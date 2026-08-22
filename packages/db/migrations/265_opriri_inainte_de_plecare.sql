-- 265: opririle dinaintea orei oficiale de plecare
--
-- Ion a confirmat (22.08.2026): autobuzele pornesc mai devreme decât ora afișată,
-- iar satele de dinaintea primei opriri trebuie să apară pe site.
-- Traseul e cel din interurban_v2_stops (folosit la numărare); se adaugă doar
-- opririle unde counting_entries arată pasageri reali în ultimele 60 de zile.
--
--   ruta 1  Grimăncăuți 03:00 → Caracușenii Noi 348, Beleavinți 219, Hlina 193 pas.
--   ruta 2  Briceni 05:45     → Cotiujeni 82, Larga 50, Hlina 109 pas.
--   ruta 20 Coteala 06:15     → Hlina 188, Lipcani 121 pas.
--   ruta 26 Corjeuți 08:00    → Tețcani 451 pas.
--   ruta 29 Ocnița 09:50      → S. Ocnița 269, Briceni 216, Hădărăuți 205 pas.
--
-- ORELE SUNT CALCULATE, nu confirmate de dispecer: intervalele sunt luate de pe
-- rutele care parcurg deja aceleași tronsoane (7, 10, 16, 22, 27 pentru
-- Criva Vama–Briceni; ruta 20 pentru Coteala–Cotiujeni). Pentru ruta 29 nu există
-- rută-etalon, deci orele vin din viteza medie a traseului — de verificat.
--
-- Nu se adaugă: Grimăncăuți pe rutele 7–16/22/23/27/28 și satele Otaci–Ocnița pe
-- rutele 3 și 59 — acolo counting nu arată niciun pasager, deci autobuzul nu oprește.

-- 1) «S. Ocnița» → «Ocnița-Sat»
-- Normalizarea din TypeScript șterge punctul («s ocnita»), cea din SQL nu
-- («s. ocnita») — numele nu s-ar fi potrivit niciodată. În plus «Ocnița (sat)»
-- s-ar fi normalizat în «ocnita» și s-ar fi ciocnit cu orașul.
UPDATE interurban_v2_stops SET name_ro = 'Ocnița-Sat' WHERE name_ro = 'S. Ocnița';

-- 2) Localitățile noi pentru lista de căutare
INSERT INTO localities (name_ro, name_ru, is_major, sort_order, active)
SELECT v.name_ro, v.name_ru, false, 0, true
FROM (VALUES
  ('Trebisăuți', 'Требисэуць'),
  ('Corestăuți', 'Корестэуць'),
  ('Hădărăuți',  'Хэдэрэуць'),
  ('Ocnița-Sat', 'Окница (село)')
) AS v(name_ro, name_ru)
WHERE NOT EXISTS (
  SELECT 1 FROM localities l WHERE normalize_stop_name(l.name_ro) = normalize_stop_name(v.name_ro)
);

-- 3) Opririle
INSERT INTO crm_stop_fares
  (id, crm_route_id, stop_order, name_ro, name_ru, hour_from_nord, hour_from_chisinau,
   price_from_nord, price_from_chisinau, is_visible)
VALUES
  -- ruta 1: Criva Vama 0 km → … → Grimăncăuți 40 km (03:00 / 15:30)
  (1623,  1, 3, 'Criva Vama',      'Крива Таможня',   '02:05', '16:10', 0, 0, false),
  (1624,  1, 4, 'Criva',           'Крива',           '02:10', '16:05', 0, 0, false),
  (1625,  1, 5, 'Drepcăuți',       'Дрепкэуць',       '02:15', '16:00', 0, 0, false),
  (1626,  1, 6, 'Lipcani',         'Липкань',         '02:35', '15:55', 0, 0, false),
  (1627,  1, 7, 'Hlina',           'Хлина',           '02:40', '15:45', 0, 0, false),
  (1628,  1, 8, 'Beleavinți',      'Белявинцы',       '02:45', '15:40', 0, 0, false),
  (1629,  1, 9, 'Caracușenii Noi', 'Новые Каракушены','02:55', '15:35', 0, 0, false),

  -- ruta 2: Criva Vama 0 km → … → Briceni 54.5 km (05:45 / 21:40)
  (1630,  2, 2, 'Criva Vama',      'Крива Таможня',   '04:25', '23:00', 0, 0, false),
  (1631,  2, 3, 'Criva',           'Крива',           '04:30', '22:55', 0, 0, false),
  (1632,  2, 4, 'Drepcăuți',       'Дрепкэуць',       '04:35', '22:50', 0, 0, false),
  (1633,  2, 5, 'Lipcani',         'Липкань',         '04:55', '22:30', 0, 0, false),
  (1634,  2, 6, 'Hlina',           'Хлина',           '05:00', '22:25', 0, 0, false),
  (1635,  2, 7, 'Coteala',         'Котяла',          '05:10', '22:15', 0, 0, false),
  (1636,  2, 8, 'Larga',           'Ларга',           '05:15', '22:10', 0, 0, false),
  (1637,  2, 9, 'Cotiujeni',       'Котюжень',        '05:25', '22:00', 0, 0, false),

  -- ruta 20: Criva Vama 0 km → … → Coteala 28.5 km (06:15 / 17:05)
  (1638, 20, 5, 'Criva Vama',      'Крива Таможня',   '05:30', '17:50', 0, 0, false),
  (1639, 20, 6, 'Criva',           'Крива',           '05:35', '17:45', 0, 0, false),
  (1640, 20, 7, 'Drepcăuți',       'Дрепкэуць',       '05:40', '17:40', 0, 0, false),
  (1641, 20, 8, 'Lipcani',         'Липкань',         '06:00', '17:20', 0, 0, false),
  (1642, 20, 9, 'Hlina',           'Хлина',           '06:05', '17:15', 0, 0, false),

  -- ruta 26: Tețcani 34.5 km → Corjeuți 44.5 km (08:00 / 21:25)
  (1643, 26, 9, 'Tețcani',         'Тецканы',         '07:45', '21:40', 0, 0, false),

  -- ruta 29: Briceni 0 km → … → Ocnița 47 km (09:50 / 22:00) — ore de verificat
  (1644, 29, 5, 'Briceni',         'Бричень',         '08:30', '23:10', 0, 0, false),
  (1645, 29, 6, 'Trebisăuți',      'Требисэуць',      '09:01', '22:39', 0, 0, false),
  (1646, 29, 7, 'Corestăuți',      'Корестэуць',      '09:12', '22:30', 0, 0, false),
  (1647, 29, 8, 'Hădărăuți',       'Хэдэрэуць',       '09:25', '22:20', 0, 0, false),
  (1648, 29, 9, 'Ocnița-Sat',      'Окница (село)',   '09:39', '22:09', 0, 0, false);
