-- ION-173 — Atribuiri șofer–mașină pe uzine din foile de parcurs LDE (septembrie 2026)
--
-- Ion, 02.10.2026: «locul GPS ne permite să înțelegem care șofer lucra pe mașină, pentru a înțelege
-- norma la șofer». În lde_active_assignments lipsea șoferul la 36 din 100 de mașini de uzină, dar
-- foile LDE (raznareadca: pz_b Bălți, pz_c SEBN, pz_u Ungheni, pz_cd Florești, pz_s; coloana `sofer`)
-- îl au pe fiecare zi. Regula: un singur șofer cu ≥ 12 zile pe foi în septembrie și al doilea ≤ 3 zile,
-- pe o mașină fără nicio atribuire activă → atribuire din 2026-09-01. Verificat cu
-- /root/lde-worker/soferi-foi.mjs (VPS) și potrivirea numelor fără diacritice.
--
-- 1) Șofer nou: Iurcu Alexei (297LVY, 29 zile pe pz_b) — lipsea din drivers.
-- 2) 21 de atribuiri noi (idempotente: un șofer = o atribuire activă, o mașină = o atribuire activă).
-- 3) 725YOZ trece la SEBN_ORHEI (foi pz_c, noaptea la Olișcani, analiza de parcare SEBN o include).
-- Neatinse: cele 15 mașini deschise pentru interviul cu Clava (rezerve, mașini mutate, fără foi);
-- 397VKV rămâne fără atribuire (Dutca Boris are mai multe zile pe 804MUM).


-- ── 1. Șofer nou ──
INSERT INTO drivers (full_name, active, is_lde, directions)
SELECT 'Iurcu Alexei', true, true,
       COALESCE((SELECT directions FROM drivers WHERE full_name = 'Sosna Victor' LIMIT 1), '{}')
WHERE NOT EXISTS (SELECT 1 FROM drivers WHERE full_name = 'Iurcu Alexei');

INSERT INTO lde_driver_extras (driver_id, uzina_id, notes)
SELECT d.id, 'DRAXELMAIER_BALTI', 'ION-173: din foile LDE sept. 2026 (297LVY, 29 zile pe pz_b)'
FROM drivers d
WHERE d.full_name = 'Iurcu Alexei'
ON CONFLICT (driver_id) DO UPDATE SET uzina_id = EXCLUDED.uzina_id, updated_at = now();

-- ── 2. Atribuiri din foi ──
INSERT INTO lde_active_assignments (driver_id, vehicle_id, valid_from, notes)
SELECT d.id, v.id, DATE '2026-09-01', 'ION-173: ' || t.nota
FROM (VALUES
  ('189OMM', 'Sînger Valeriu',    'foi LDE sept. 2026: Singer Valeriu 22 zile (pz_u)'),
  ('319BRAT', 'Tabarcea Viorel',  'foi LDE sept. 2026: Tabarcea Viorel 26 zile (pz_s); șofer Trox, mașina probabil la Briceni — direcția de verificat'),
  ('320BRAT', 'Scutari Vasile',   'foi LDE sept. 2026: Scutari Vasile 24 zile (pz_u)'),
  ('345KAJ', 'Guzun Ivan',        'foi LDE sept. 2026: Guzun Ivan 23 zile (pz_b)'),
  ('441ASB', 'Iațco Mihail',      'foi LDE sept. 2026: Iatco Mihail 24 zile (pz_b)'),
  ('456BRAX', 'Rotaraș Vladimir', 'foi LDE sept. 2026: Rotaras Vladimir 22 zile (pz_u)'),
  ('504BRAR', 'Reșetnic Iurii',   'foi LDE sept. 2026: Resetnic Iurii 23 zile (pz_u)'),
  ('514BRAZ', 'Pangalos Simion',  'foi LDE sept. 2026: Pangalos Simion 26 zile (pz_c)'),
  ('537BRAT', 'Frunză Iurie',     'foi LDE sept. 2026: Frunza Iurie 22 zile (pz_u)'),
  ('602BRAS', 'Maliovanii Mihail','foi LDE sept. 2026: Maliovanii Mihail 26 zile (pz_c)'),
  ('725CWN', 'Crigan Veceslav',   'foi LDE sept. 2026: Crigan Veceslav 27 zile (pz_b)'),
  ('725YOZ', 'Șaptefrați Dionis', 'foi LDE sept. 2026: Saptefrati Dionis 20 zile (pz_c); mașina lucrează la SEBN (noaptea la Olișcani)'),
  ('804MUM', 'Dutca Boris',       'foi LDE sept. 2026: Dutca Boris 15 zile (pz_b); are și 13 zile pe 397VKV'),
  ('807MUM', 'Andrieș Iurii',     'foi LDE sept. 2026: Andries Iurii 22 zile (pz_u)'),
  ('808MUM', 'Apostol Vitalie',   'foi LDE sept. 2026: Apostol Vitalie 26 zile (pz_c)'),
  ('809MUM', 'Popov Petru',       'foi LDE sept. 2026: Popov Petru 22 zile (pz_u)'),
  ('820GXP', 'Magalu Grigore',    'foi LDE sept. 2026: Magalu Grigore 25 zile (pz_c)'),
  ('827MUM', 'Grăchilă Mihail',   'foi LDE sept. 2026: Grachila Mihail 22 zile (pz_u)'),
  ('894BRAX', 'Cojocaru Feodor',  'foi LDE sept. 2026: Cojocaru Feodor 23 zile (pz_c)'),
  ('942BRAZ', 'Pătrașcu Trifan',  'foi LDE sept. 2026: Patrascu Trifan 26 zile (pz_c)'),
  ('297LVY', 'Iurcu Alexei',      'foi LDE sept. 2026: Iurcu Alexei 29 zile (pz_b)')
) AS t(plate, nume, nota)
JOIN vehicles v ON v.plate_number = t.plate
JOIN drivers d ON d.full_name = t.nume AND d.active
WHERE NOT EXISTS (SELECT 1 FROM lde_active_assignments a WHERE a.driver_id = d.id AND a.valid_to IS NULL)
  AND NOT EXISTS (SELECT 1 FROM lde_active_assignments a WHERE a.vehicle_id = v.id AND a.valid_to IS NULL);

-- ── 3. 725YOZ lucrează la SEBN ──
UPDATE vehicles SET directions = '{SEBN_ORHEI}'
WHERE plate_number = '725YOZ' AND directions = '{LEAR_UNGHENI}';

