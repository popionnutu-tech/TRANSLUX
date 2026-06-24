-- 078_etolon_route_km_pairs.sql
-- Применение единого этолона км для всех 28 маршрутов (тарифы 98, 104, 106, 110, 111, 115, 122)
-- См. план: /Users/ionpop/.claude/plans/vad-ca-este-descrepanta-lazy-piglet.md
--
-- ВАЖНО: перед применением сделать бэкап таблицы route_km_pairs
-- CREATE TABLE route_km_pairs_backup_pre_etolon AS SELECT * FROM route_km_pairs;
--
-- ⚠ Конфликты внутри тарифов (Corjeuți, Beleavinți, Caracușenii Noi) НЕ устранены этой миграцией.
-- Требует архитектурного решения (per-route override или split tariff).

BEGIN;

-- ============================================================================
-- TARIFF 98 (routes 6, 17, 26 — Corjeuți/Criva-Tețcani)
-- ============================================================================

UPDATE route_km_pairs SET km=235.4 WHERE tariff_id=98 AND from_stop='colicauti' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=227.7 WHERE tariff_id=98 AND from_stop='intersectia trestieni' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=223.7 WHERE tariff_id=98 AND from_stop='halahora de sus' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=197.5 WHERE tariff_id=98 AND from_stop='cupcini' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=55   WHERE tariff_id=98 AND from_stop='ciocilteni' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=48   WHERE tariff_id=98 AND from_stop='orhei' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=18.6 WHERE tariff_id=98 AND from_stop='pascani' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=15.7 WHERE tariff_id=98 AND from_stop='magdacesti' AND to_stop='chisinau';

INSERT INTO route_km_pairs (tariff_id, from_stop, to_stop, km, price) VALUES
  (98, 'trinca',            'chisinau', 226.5, 206),
  (98, 'tirnova',           'chisinau', 224,   204),
  (98, 'gordinesti',        'chisinau', 211.7, 193),
  (98, 'intersectia tabani','chisinau', 234.1, 213),
  (98, 'hlinaia',           'chisinau', 215.1, 196),
  (98, 'bratuseni',         'chisinau', 193.5, 176),
  (98, 'bratusenii noi',    'chisinau', 184.7, 168),
  (98, 'mihailenii noi',    'chisinau', 180,   164),
  (98, 'banesti',           'chisinau', 88,    80),
  (98, 'ratus',              'chisinau', 80,    73),
  (98, 'stauceni',          'chisinau', 9.3,   8);

-- ⚠ Corjeuți: остаётся 236 (route 6). Для route 17/26 фактическое значение 255.3 — не записывается.

-- ============================================================================
-- TARIFF 104 (routes 19, 20, 24 — Lipcani alt / Criva-Larga)
-- ============================================================================

UPDATE route_km_pairs SET km=235.4 WHERE tariff_id=104 AND from_stop='colicauti' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=227.7 WHERE tariff_id=104 AND from_stop='intersectia trestieni' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=223.7 WHERE tariff_id=104 AND from_stop='halahora de sus' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=18.6 WHERE tariff_id=104 AND from_stop='pascani' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=15.7 WHERE tariff_id=104 AND from_stop='magdacesti' AND to_stop='chisinau';

INSERT INTO route_km_pairs (tariff_id, from_stop, to_stop, km, price) VALUES
  (104, 'criva vama',        'chisinau', 291.1, 265),
  (104, 'intersectia tabani','chisinau', 234.1, 213),
  (104, 'hlinaia',           'chisinau', 215.1, 196),
  (104, 'bratuseni',         'chisinau', 193.5, 176),
  (104, 'bratusenii noi',    'chisinau', 184.7, 168),
  (104, 'mihailenii noi',    'chisinau', 180,   164),
  (104, 'banesti',           'chisinau', 88,    80),
  (104, 'ratus',              'chisinau', 80,    73),
  (104, 'stauceni',          'chisinau', 9.3,   8);

-- ⚠ Beleavinți/Caracușenii Noi: конфликт route 19 (262.5/248.1) vs route 24 (257.5/254.7). Не вставляем.

-- ============================================================================
-- TARIFF 106 (routes 1, 2, 7-12, 14-16, 22-23, 27-28 — основные Lipcani/Criva/Briceni)
-- ============================================================================

UPDATE route_km_pairs SET km=243.5 WHERE tariff_id=106 AND from_stop='grimancauti' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=235.4 WHERE tariff_id=106 AND from_stop='colicauti' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=184.7 WHERE tariff_id=106 AND from_stop='bratusenii noi' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=18.6 WHERE tariff_id=106 AND from_stop='pascani' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=15.7 WHERE tariff_id=106 AND from_stop='magdacesti' AND to_stop='chisinau';

INSERT INTO route_km_pairs (tariff_id, from_stop, to_stop, km, price) VALUES
  (106, 'criva vama',        'chisinau', 280.1, 255),
  (106, 'intersectia tabani','chisinau', 234.1, 213),
  (106, 'hlinaia',           'chisinau', 215.1, 196),
  (106, 'stauceni',          'chisinau', 9.3,   8);

-- ============================================================================
-- TARIFF 110 (routes 5, 13 — Șirăuți, Lipcani-Rîșcani)
-- ============================================================================

UPDATE route_km_pairs SET km=278.5 WHERE tariff_id=110 AND from_stop='pererita' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=199.9 WHERE tariff_id=110 AND from_stop='druta' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=176.5 WHERE tariff_id=110 AND from_stop='riscani' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=171.5 WHERE tariff_id=110 AND from_stop='petrom riscani' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=171.5 WHERE tariff_id=110 AND from_stop='intersectia riscani' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=163.5 WHERE tariff_id=110 AND from_stop='recea' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=55   WHERE tariff_id=110 AND from_stop='ciocilteni' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=48   WHERE tariff_id=110 AND from_stop='orhei' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=18.6 WHERE tariff_id=110 AND from_stop='pascani' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=15.7 WHERE tariff_id=110 AND from_stop='magdacesti' AND to_stop='chisinau';

INSERT INTO route_km_pairs (tariff_id, from_stop, to_stop, km, price) VALUES
  (110, 'hancauti',  'chisinau', 237.7, 216),
  (110, 'dumeni',    'chisinau', 213.1, 194),
  (110, 'banesti',   'chisinau', 88,    80),
  (110, 'ratus',      'chisinau', 80,    73),
  (110, 'stauceni',  'chisinau', 9.3,   8),
  (110, 'tetcani',   'chisinau', 273,   248);

-- ============================================================================
-- TARIFF 111 (route 18 — Lipcani Viișoara)
-- ============================================================================

UPDATE route_km_pairs SET km=18.6 WHERE tariff_id=111 AND from_stop='pascani' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=15.7 WHERE tariff_id=111 AND from_stop='magdacesti' AND to_stop='chisinau';

INSERT INTO route_km_pairs (tariff_id, from_stop, to_stop, km, price) VALUES
  (111, 'sarauti',         'chisinau', 261,   237),
  (111, 'slobozia sarauti','chisinau', 259,   236),
  (111, 'badragii noi',    'chisinau', 233,   212),
  (111, 'badragii vechi',  'chisinau', 229,   208),
  (111, 'edinet',          'chisinau', 204,   186),
  (111, 'bratuseni',       'chisinau', 193.5, 176),
  (111, 'bratusenii noi',  'chisinau', 184.7, 168),
  (111, 'mihailenii noi',  'chisinau', 180,   164),
  (111, 'banesti',         'chisinau', 88,    80),
  (111, 'ratus',            'chisinau', 80,    73),
  (111, 'stauceni',        'chisinau', 9.3,   8);

-- ============================================================================
-- TARIFF 115 (route 25 — Caracușenii Vechi)
-- ============================================================================

UPDATE route_km_pairs SET km=171.5 WHERE tariff_id=115 AND from_stop='petrom riscani' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=171.5 WHERE tariff_id=115 AND from_stop='intersectia riscani' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=18.6 WHERE tariff_id=115 AND from_stop='pascani' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=15.7 WHERE tariff_id=115 AND from_stop='magdacesti' AND to_stop='chisinau';

INSERT INTO route_km_pairs (tariff_id, from_stop, to_stop, km, price) VALUES
  (115, 'gordinestii noi','chisinau', 211.7, 193),
  (115, 'bratuseni',      'chisinau', 193.5, 176),
  (115, 'bratusenii noi', 'chisinau', 184.7, 168),
  (115, 'banesti',        'chisinau', 88,    80),
  (115, 'ratus',           'chisinau', 80,    73),
  (115, 'stauceni',       'chisinau', 9.3,   8);

-- ============================================================================
-- TARIFF 122 (routes 3, 21, 29 — Ocnița/Otaci) — после auth Ocnița
-- ============================================================================

UPDATE route_km_pairs SET km=240 WHERE tariff_id=122 AND from_stop='ocnita' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=222 WHERE tariff_id=122 AND from_stop='grinauti-raia' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=220 WHERE tariff_id=122 AND from_stop='birladeni' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=218 WHERE tariff_id=122 AND from_stop='paladea' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=214 WHERE tariff_id=122 AND from_stop='ruseni' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=204 WHERE tariff_id=122 AND from_stop='edinet' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=226.2 WHERE tariff_id=122 AND from_stop='mihalaseni' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=123 WHERE tariff_id=122 AND from_stop='bilicenii noi' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=118 WHERE tariff_id=122 AND from_stop='bilicenii vechi' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=18.6 WHERE tariff_id=122 AND from_stop='pascani' AND to_stop='chisinau';
UPDATE route_km_pairs SET km=15.7 WHERE tariff_id=122 AND from_stop='magdacesti' AND to_stop='chisinau';

INSERT INTO route_km_pairs (tariff_id, from_stop, to_stop, km, price) VALUES
  (122, 'dingeni',       'chisinau', 228.5, 208),
  (122, 's. ocnita',     'chisinau', 233,   212),
  (122, 'slobotca',      'chisinau', 211.3, 192),
  (122, 'bratuseni',     'chisinau', 193.5, 176),
  (122, 'bratusenii noi','chisinau', 184.7, 168),
  (122, 'grigorauca',    'chisinau', 102,   93),
  (122, 'copaceni',      'chisinau', 100,   91),
  (122, 'banesti',       'chisinau', 88,    80),
  (122, 'ratus',          'chisinau', 80,    73),
  (122, 'stauceni',      'chisinau', 9.3,   8),
  -- Route 29 уникальные (Briceni → Ocnița путь).
  -- Внимание: эти Briceni/Trebisauti/Corestauti/Hadarauti в тарифе 122 РАЗНЫЕ от trunk-Briceni 239.
  -- Если на сайте пассажир ищет "Briceni → Chișinău", тариф 122 даст 273, тариф 106 даст 239.
  (122, 'trebisauti',    'chisinau', 255,   232),
  (122, 'corestauti',    'chisinau', 248.3, 226),
  (122, 'hadarauti',     'chisinau', 241,   219);

-- ВАЖНО: цены (price) в этой миграции рассчитаны при rate=0.91 (текущий).
-- Сайт автоматически пересчитывает price = ROUND(km × rate) из tariff_periods,
-- так что эти значения служат fallback и применятся только если tariff_periods не найдены.

COMMIT;
