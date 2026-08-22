-- 264: opriri pe care autobuzul le deservește, dar care lipseau de pe site
--
-- Sursă: interurban_v2_stops (itinerariul folosit la numărare) + counting_entries
-- (pasageri reali în ultimele 60 de zile). Opririle de mai jos lipseau din
-- crm_stop_fares, deci căutarea publică nu găsea cursa din satul respectiv.
--
-- Se adaugă DOAR opririle aflate ÎNTRE două opriri cu oră cunoscută — orele sunt
-- interpolate liniar după km_from_start. Opririle din afara intervalului cunoscut
-- (rutele 1, 2, 20, 26, 29) rămân pentru decizia dispecerului: acolo ar trebui
-- inventată ora de plecare, nu calculată.
--
-- Trafic real / 60 zile: ruta 21 — Valcinet 408, Mereseuca 368, Birnova 359,
-- Lencauti 342, Frunza 355 pasageri.

-- 1) Localitățile noi pentru lista de căutare a site-ului
INSERT INTO localities (name_ro, name_ru, is_major, sort_order, active)
SELECT v.name_ro, v.name_ru, false, 0, true
FROM (VALUES
  ('Vălcineț',  'Вэлчинец'),
  ('Mereșeuca', 'Мерешеука'),
  ('Lencăuți',  'Ленкэуць'),
  ('Frunză',    'Фрунзэ'),
  ('Bîrnova',   'Бырнова'),
  ('Grimești',  'Гримешть')
) AS v(name_ro, name_ru)
WHERE NOT EXISTS (
  SELECT 1 FROM localities l WHERE normalize_stop_name(l.name_ro) = normalize_stop_name(v.name_ro)
);

-- 2) Opririle propriu-zise
-- ruta 21 (Otaci 12:35 → Ocnița 13:40) și ruta 58 (Otaci 16:25 → Ocnița 17:05):
--   Otaci 0 km → Valcinet 4 → Mereseuca 9 → Lencauti 12 → Frunza 16 → Birnova 21 → Ocnița 26
-- ruta 5 și 13: Pererita 11 km → Tețcani 17 → Grimești 23 → Bezeda 28
INSERT INTO crm_stop_fares
  (id, crm_route_id, stop_order, name_ro, name_ru, hour_from_nord, hour_from_chisinau,
   price_from_nord, price_from_chisinau, is_visible)
VALUES
  (1610, 21, 11, 'Vălcineț',  'Вэлчинец',  '12:45', '23:12', 0, 0, false),
  (1611, 21, 12, 'Mereșeuca', 'Мерешеука', '12:57', '23:08', 0, 0, false),
  (1612, 21, 13, 'Lencăuți',  'Ленкэуць',  '13:05', '23:06', 0, 0, false),
  (1613, 21, 14, 'Frunză',    'Фрунзэ',    '13:15', '23:03', 0, 0, false),
  (1614, 21, 15, 'Bîrnova',   'Бырнова',   '13:27', '22:59', 0, 0, false),

  (1615, 58, 11, 'Vălcineț',  'Вэлчинец',  '16:31', '15:17', 0, 0, false),
  (1616, 58, 12, 'Mereșeuca', 'Мерешеука', '16:39', '15:13', 0, 0, false),
  (1617, 58, 13, 'Lencăuți',  'Ленкэуць',  '16:43', '15:11', 0, 0, false),
  (1618, 58, 14, 'Frunză',    'Фрунзэ',    '16:50', '15:08', 0, 0, false),
  (1619, 58, 15, 'Bîrnova',   'Бырнова',   '16:57', '15:04', 0, 0, false),

  (1620,  5, 41, 'Tețcani',   'Тецканы',   '10:32', '22:23', 0, 0, false),
  (1621,  5, 42, 'Grimești',  'Гримешть',  '10:34', '22:22', 0, 0, false),

  (1622, 13, 51, 'Grimești',  'Гримешть',  '15:33', '14:14', 0, 0, false);
