-- ============================================================================
--  ██  DEMO / TEST ONLY — NU RULA PE PRODUCȚIE DECÂT INTENȚIONAT  ██
-- ============================================================================
--  Fișier de date DEMO/TEST pentru modulul LDE (autopark autobuze).
--  Scop: să «zgândare» TOT softul LDE — alerte DT (galben/roșu), tabloul zilnic,
--  salarii, acte de recepție, experimente — pe ~60 de zile, ca Ion să vadă
--  sistemul VIU FĂRĂ a avea încă integrarea reală GPS / Benzol.
--
--  CUM SE RULEAZĂ (MANUAL, local):
--    psql "$DATABASE_URL" -f packages/db/seeds/lde_demo_test_data.sql
--    sau lipit în Supabase → SQL Editor → Run.
--
--  NU este în packages/db/migrations/ — deci runner-ul de migrări NU îl aplică
--  automat pe prod. Rulează-l doar tu, manual, când vrei date de demo.
--
--  PRECONDIȚII: migrările 203-213 + seed 204 (plate-uri, norme, șoferi) deja aplicate.
--
--  IDEMPOTENT: tot pe ON CONFLICT (DO UPDATE / DO NOTHING) — re-rularea NU dă erori
--  și NU dublează rânduri. Datele se «alunecă» mereu pe ultimele 60 de zile
--  (relativ la CURRENT_DATE), deci rămân mereu recente.
--
--  CURĂȚARE (șterge DOAR datele demo, lasă datele reale neatinse):
--    DELETE FROM lde_fuel_alimentari      WHERE source = 'demo';
--    DELETE FROM lde_fuel_alimentari_cash WHERE statie LIKE 'DEMO %';
--    DELETE FROM lde_vehicle_gps_daily    WHERE data_source = 'demo';
--    DELETE FROM lde_uzina_billing        WHERE notes LIKE 'DEMO%';   -- opțional
--  (alertele DT / salariile / actele se regenerează din UI din aceste date brute,
--   deci nu trebuie inserate aici — apar singure când rulezi motoarele din panou.)
--
--  CE FACE SOFTUL CU ACESTE DATE (de ce e «viu»):
--    • Tabloul zilnic (lde/tablou-zilnic)  ← gps_daily + alimentări (benzol+numerar)
--    • Alerte DT galben/roșu (lde/alerte)   ← litri lunari vs km lunari vs norma efectivă
--    • Indicații soft «numerar_des» (lde/indicatii) ← >1 alimentare numerar/lună
--    • Acte de recepție (lde/acte)          ← km/curse/pasageri × tarif uzină (lde_uzina_billing)
--    • Experimente (lde/experimente)        ← agregate litri/lei/km pe set de vehicule
--    Salariile (lde/salarii) folosesc km din gps_daily pentru pragurile cat 1/2.
--
--  PRINCIPIU DE GENERARE (determinist, fără random — re-rulabil identic):
--    km_ziua(plate,date) = 150 + abs(hashtext(plate || date)) % 120   → 150..269 km/zi
--    Pentru alimentări, litrii se calculează ca:
--        litri = km_acumulați_în_fereastră × consum_demo / 100
--    unde consum_demo per mașină:
--        • mașini «curate»  → = norma efectivă        ⇒ перерасход ~0 ⇒ VERDE (fără alertă)
--        • mașini «galbene» → = norma efectivă + ~1.2  ⇒ перерасход +1.2 ⇒ GALBEN
--        • mașini «roșii»   → = norma efectivă + ~3.0  ⇒ перерасход +3.0 ⇒ ROȘU
--    (praguri motor lde-dt-calc: ≤0.3 verde / 0.3..2.0 galben / >2.0 roșu)
--
--  Norma efectivă = COALESCE(lde_vehicle_norms.measured, lde_vehicle_types.norm).
--  Toate cele ~10 mașini de mai jos au rând în lde_vehicle_norms (seed 204),
--  deci norma efectivă e cunoscută și deterministă.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. SETUL DE MAȘINI DEMO + «profilul» lor de consum
-- ============================================================================
-- Definim o singură dată setul de plate-uri demo + consum_demo + flag numerar.
-- Toate plate-urile există în `vehicles` și au normă în `lde_vehicle_norms` (seed 204).
-- profil:
--   'curat'  → consum = norma  (VERDE, fără alertă)   — majoritatea
--   'galben' → consum = norma + 1.2 (GALBEN)
--   'rosu'   → consum = norma + 3.0 (ROȘU)
-- cash_per_month: câte alimentări numerar pe lună (>1 ⇒ indicație «numerar_des»).
--
-- NB: e un TEMP TABLE — există doar pe durata acestei tranzacții, se curăță singur.
CREATE TEMP TABLE _lde_demo_fleet (
  plate            text PRIMARY KEY,
  uzina_id         text NOT NULL,
  profil           text NOT NULL,   -- 'curat' | 'galben' | 'rosu'
  cash_per_month   int  NOT NULL DEFAULT 0
) ON COMMIT DROP;

INSERT INTO _lde_demo_fleet (plate, uzina_id, profil, cash_per_month) VALUES
  -- ── curate (consum = normă, fără alertă) ──
  ('217RST',  'LEAR_UNGHENI',      'curat',  0),   -- SPRINTER_315 norm 12.5
  ('283BRAT', 'LEAR_UNGHENI',      'curat',  0),   -- SPRINTER_412 norm 12.8
  ('388ASB',  'DRAXELMAIER_BALTI', 'curat',  0),   -- DAF          norm 28.5
  ('522BRAT', 'SEBN_ORHEI',        'curat',  1),   -- SPRINTER_312 norm 12.0  (1 numerar/lună = OK)
  ('281BRAT', 'TROX_BRICENI',      'curat',  0),   -- SPRINTER_312 norm 11.3
  -- ── galbene (перерасход +1.2 ⇒ alertă GALBEN) ──
  ('549RNK',  'DRAXELMAIER_BALTI', 'galben', 0),   -- CRAFTER      norm 13.5
  ('319BRAT', 'SEBN_ORHEI',        'galben', 0),   -- SPRINTER_312 norm 12.2
  -- ── roșii (перерасход +3.0 ⇒ alertă ROȘU) ──
  ('823MUM',  'SEBN_ORHEI',        'rosu',   0),   -- DAF          norm 30.0
  ('503BRAR', 'SEBN_ORHEI',        'rosu',   0),   -- SPRINTER_518 norm 15.2
  -- ── mașină cu pattern «numerar des» (3 alimentări numerar/lună ⇒ indicație) ──
  ('602BRAS', 'SEBN_ORHEI',        'curat',  3);   -- SPRINTER_312 norm 12.0

-- Vedem norma efectivă + uuid + consum_demo + driver_id (primul șofer al uzinei).
-- Materializăm într-un al doilea TEMP table ca să-l refolosim ușor în INSERT-uri.
CREATE TEMP TABLE _lde_demo_veh AS
SELECT
  f.plate,
  f.uzina_id,
  f.profil,
  f.cash_per_month,
  v.id AS vehicle_id,
  -- norma efectivă (override măsurat sau norma tipului)
  COALESCE(n.measured_consumption_l_per_100km, t.norm_l_per_100km)::numeric(6,2) AS norm_eff,
  -- consum demo după profil
  (COALESCE(n.measured_consumption_l_per_100km, t.norm_l_per_100km)
     + CASE f.profil WHEN 'galben' THEN 1.2 WHEN 'rosu' THEN 3.0 ELSE 0 END
  )::numeric(6,2) AS consum_demo,
  -- un driver plauzibil al uzinei (primul după nume) — pentru driver_id pe alimentări
  (SELECT d.id
     FROM lde_driver_extras de
     JOIN drivers d ON d.id = de.driver_id
    WHERE de.uzina_id = f.uzina_id
    ORDER BY d.full_name
    LIMIT 1) AS driver_id,
  -- statia demo derivată din uzină (pentru benzol)
  CASE f.uzina_id
    WHEN 'TROX_BRICENI'      THEN 'BRICENI'
    WHEN 'DRAXELMAIER_BALTI' THEN 'BALTI'
    WHEN 'LEAR_UNGHENI'      THEN 'UNGHENI'
    WHEN 'SEBN_ORHEI'        THEN 'ORHEI'
    WHEN 'LEAR_FLORESTI'     THEN 'PETROM'
    ELSE 'PETROM'
  END AS statie
FROM _lde_demo_fleet f
JOIN vehicles v          ON v.plate_number = f.plate
LEFT JOIN lde_vehicle_norms n ON n.vehicle_id = v.id
LEFT JOIN lde_vehicle_types t ON t.id = n.vehicle_type_id;

-- ============================================================================
-- 1. TARIFE UZINE (lde_uzina_billing) — valori test plauzibile
-- ============================================================================
-- Un model diferit per uzină ca să se vadă toate cele 4 cazuri în actele de recepție:
--   per_pasager (35 lei/pasager), per_cursa (1200 lei/cursă),
--   per_km (18 lei/km), fix_saptamanal (40000 lei/săpt).
INSERT INTO lde_uzina_billing (uzina_id, billing_model, rate_lei, active, notes) VALUES
  ('DRAXELMAIER_BALTI', 'per_pasager',    35.00,    true, 'DEMO tarif test'),
  ('LEAR_UNGHENI',      'per_cursa',      1200.00,  true, 'DEMO tarif test'),
  ('SEBN_ORHEI',        'per_km',         18.00,    true, 'DEMO tarif test'),
  ('TROX_BRICENI',      'fix_saptamanal', 40000.00, true, 'DEMO tarif test'),
  ('LEAR_FLORESTI',     'per_pasager',    32.00,    true, 'DEMO tarif test')
ON CONFLICT (uzina_id) DO UPDATE SET
  billing_model = EXCLUDED.billing_model,
  rate_lei      = EXCLUDED.rate_lei,
  active        = EXCLUDED.active,
  notes         = EXCLUDED.notes,
  updated_at    = now();

-- ============================================================================
-- 2. GPS ZILNIC (lde_vehicle_gps_daily) — ultimele 60 de zile × setul demo
-- ============================================================================
-- km determinist: 150 + abs(hashtext(plate||date)) % 120  → 150..269 km/zi.
-- data_source = 'demo' (marcaj pentru curățare).
INSERT INTO lde_vehicle_gps_daily (vehicle_id, date, km_total, data_source, imported_at)
SELECT
  dv.vehicle_id,
  d::date,
  (150 + (abs(hashtext(dv.plate || d::text)) % 120))::numeric(8,2) AS km_total,
  'demo',
  now()
FROM _lde_demo_veh dv
CROSS JOIN generate_series(CURRENT_DATE - 60, CURRENT_DATE - 1, interval '1 day') AS g(d)
ON CONFLICT (vehicle_id, date) DO UPDATE SET
  km_total    = EXCLUDED.km_total,
  data_source = EXCLUDED.data_source,
  imported_at = now();

-- ============================================================================
-- 3. ALIMENTĂRI BENZOL (lde_fuel_alimentari) — la fiecare ~6 zile per mașină
-- ============================================================================
-- Pentru fiecare «punct de alimentare» (la 6 zile), litrii = suma km din blocul
-- precedent de 6 zile × consum_demo / 100. Astfel TOTALUL lunar litri/km dă fix
-- consum_demo → mașinile 'galben'/'rosu' depășesc norma și generează alerte DT.
--
-- external_id = 'demo-<plate>-<data>'  (UNIQUE pe (source,external_id), dedup la re-import).
-- is_full = true la PRIMA alimentare a lunii calendaristice (semnal «plin» pt. metoda A);
--           restul false. (Două is_full în aceeași lună ⇒ și ferestre plin→plin.)
-- source = 'demo'.
WITH points AS (
  -- punctele de alimentare: ziua de start a fiecărui bloc de 6 zile (ultimele 60 zile)
  SELECT
    dv.*,
    p::date AS aliment_date
  FROM _lde_demo_veh dv
  CROSS JOIN generate_series(CURRENT_DATE - 60, CURRENT_DATE - 1, interval '6 day') AS gp(p)
),
with_litri AS (
  SELECT
    pt.*,
    -- suma km determinist pe blocul [aliment_date, aliment_date+5] (același formular ca GPS)
    (
      SELECT COALESCE(SUM(150 + (abs(hashtext(pt.plate || dd::text)) % 120)), 0)
      FROM generate_series(pt.aliment_date, pt.aliment_date + 5, interval '1 day') AS gb(dd)
    ) AS km_block
  FROM points pt
)
INSERT INTO lde_fuel_alimentari
  (vehicle_id, driver_id, alimentat_at, litri, suma_lei, statie, is_full, source, external_id, imported_at, notes)
SELECT
  wl.vehicle_id,
  wl.driver_id,
  (wl.aliment_date + time '09:30')::timestamptz AS alimentat_at,
  GREATEST(ROUND(wl.km_block * wl.consum_demo / 100.0, 2), 1)::numeric(8,2) AS litri,
  -- suma lei ~ litri × 24 lei/litru (motorină ~24 lei)
  ROUND(GREATEST(ROUND(wl.km_block * wl.consum_demo / 100.0, 2), 1) * 24.0, 2)::numeric(10,2) AS suma_lei,
  wl.statie,
  -- is_full = true dacă e prima alimentare din luna ei calendaristică pt. mașina respectivă
  (wl.aliment_date = (
      SELECT MIN(p2::date)
      FROM generate_series(CURRENT_DATE - 60, CURRENT_DATE - 1, interval '6 day') AS gp2(p2)
      WHERE date_trunc('month', p2) = date_trunc('month', wl.aliment_date)
  )) AS is_full,
  'demo' AS source,
  'demo-' || wl.plate || '-' || wl.aliment_date::text AS external_id,
  now(),
  'DEMO benzol (' || wl.profil || ', consum ' || wl.consum_demo || ' L/100, normă ' || wl.norm_eff || ')'
FROM with_litri wl
ON CONFLICT (source, external_id) DO NOTHING;

-- ============================================================================
-- 4. ALIMENTĂRI NUMERAR (lde_fuel_alimentari_cash) — câteva, cu pattern «numerar des»
-- ============================================================================
-- Mașinile cu cash_per_month > 0 primesc atâtea alimentări numerar pe lună.
-- statie text liber, prefixat 'DEMO ' (marcaj de curățare). litri/suma plauzibile,
-- fixe (40 L), la ore diferite. >1/lună ⇒ indicația soft «numerar_des» în UI.
--
-- Generăm o alimentare numerar la a (k*9+3)-a zi a fiecărei luni acoperite,
-- k = 0..cash_per_month-1, ca să iasă cash_per_month alimentări/lună, la zile distincte.
WITH months AS (
  -- lunile calendaristice atinse de fereastra de 60 zile
  SELECT DISTINCT date_trunc('month', d)::date AS month_start
  FROM generate_series(CURRENT_DATE - 60, CURRENT_DATE - 1, interval '1 day') AS g(d)
),
cash_rows AS (
  SELECT
    dv.vehicle_id,
    dv.driver_id,
    dv.plate,
    m.month_start
      + ((k * 9 + 3) || ' days')::interval
      + time '13:15'                                   AS at_ts,
    k AS k
  FROM _lde_demo_veh dv
  JOIN months m ON true
  CROSS JOIN generate_series(0, 5) AS gk(k)            -- max 6 pe lună (filtrăm sub)
  WHERE dv.cash_per_month > 0
    AND k < dv.cash_per_month
)
INSERT INTO lde_fuel_alimentari_cash
  (vehicle_id, driver_id, alimentat_at, litri, suma_lei, statie, notes, created_at)
SELECT
  cr.vehicle_id,
  cr.driver_id,
  cr.at_ts::timestamptz,
  40.00::numeric(8,2)        AS litri,
  ROUND(40.0 * 24.5, 2)::numeric(10,2) AS suma_lei,   -- ~24.5 lei/L
  'DEMO Lukoil Soroca'       AS statie,
  'DEMO numerar (pattern numerar_des dacă >1/lună)' AS notes,
  now()
FROM cash_rows cr
-- idempotent: nu re-inserăm dacă există deja o alimentare numerar demo pt. aceeași mașină+moment
WHERE NOT EXISTS (
  SELECT 1 FROM lde_fuel_alimentari_cash x
  WHERE x.vehicle_id = cr.vehicle_id
    AND x.alimentat_at = cr.at_ts::timestamptz
    AND x.statie LIKE 'DEMO %'
);

COMMIT;

-- ============================================================================
-- VERIFICARE RAPIDĂ (opțional — rulează manual după seed):
--   -- câte zile GPS demo per mașină (ar trebui 60):
--   SELECT v.plate_number, count(*) FROM lde_vehicle_gps_daily g
--     JOIN vehicles v ON v.id = g.vehicle_id
--    WHERE g.data_source='demo' GROUP BY 1 ORDER BY 1;
--
--   -- consum efectiv lunar vs normă (ar trebui ~consum_demo per profil):
--   SELECT v.plate_number,
--          round(sum(f.litri)*100/nullif(sum(gd.km),0),2) AS l_per_100km
--     FROM lde_fuel_alimentari f
--     JOIN vehicles v ON v.id=f.vehicle_id
--     JOIN (SELECT vehicle_id, sum(km_total) km FROM lde_vehicle_gps_daily
--             WHERE data_source='demo' GROUP BY 1) gd ON gd.vehicle_id=f.vehicle_id
--    WHERE f.source='demo' GROUP BY 1 ORDER BY 1;
--
--   -- DUPĂ ce rulezi «Generează alerte» din UI (lde/alerte) vor apărea galben/roșu
--   -- pentru 549RNK, 319BRAT (galben) și 823MUM, 503BRAR (roșu).
-- ============================================================================
