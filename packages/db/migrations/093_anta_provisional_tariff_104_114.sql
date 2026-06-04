-- 093_anta_provisional_flat_104.sql
-- ANTA a stabilit TARIFUL PLAFON PROVIZORIU pentru transportul interraional = 1,04 lei/km
-- pentru un pasager, în vigoare „începând cu 05.06.2026" (fără categorii de confort I/II).
-- Tariful RAIONAL (suburban) NU a fost coborât — rămâne 1,14 lei/km.
--
-- Cerință client:
--   - Interurban = 1,04; raional/suburban = 1,14 (două tarife).
--   - Pe rutele interurbane care trec printr-un raion, porțiunea raională se taxează la 1,14,
--     restul la 1,04 (mecanismul „două tarife" rămâne activ, prin start_district).
--   - EXCEPȚIE: cursa Otaci 16:25 / retur 11:00 (crm_route_id=58) se numără integral la 1,04
--     (vezi migrația 092 — start_district NULL pe ruta 58; NU se revine).
--
-- Sursă: https://anta.gov.md/content/tarifele-provizorii-pentru-serviciile-regulate-de-transport
--
-- Comutarea pe dată: site-ul și numărarea aleg tariful din tariff_periods după dată,
-- deci comută automat la 5 iunie. Păstrăm explicit săptămâna curentă la tarifele vechi
-- ca să nu se modifice prețurile/numărările pe date ≤ 4 iunie.

BEGIN;

-- 1. tariff_periods: săptămâna curentă (tarife vechi) + perioada provizorie 1,04 de la 5 iunie.
INSERT INTO tariff_periods (period_start, period_end, rate_interurban_long, rate_interurban_short, rate_suburban, source_url)
VALUES
  ('2026-05-29', '2026-06-05', 0.91, 1.03, 1.17, 'https://anta.gov.md/content/tarifele-provizorii-pentru-serviciile-regulate-de-transport'),
  ('2026-06-05', '2026-09-30', 1.04, 1.04, 1.14, 'https://anta.gov.md/content/tarifele-provizorii-pentru-serviciile-regulate-de-transport');

-- 2. „Două tarife" rămân active (1,04 interurban + 1,14 raional). Flag-ul e cosmetic acum
--    (numărarea/site-ul aplică raionalul prin start_district, nu prin acest flag), dar îl
--    setăm 'true' ca să reflecte realitatea.
UPDATE app_config SET value = 'true', updated_at = now() WHERE key = 'dual_interurban_tariff';

-- 3. Tarifele „curente" în app_config: interurban 1,04, raional/suburban 1,14.
--    NU folosim RPC update_prices_by_rate_v2: route_km_pairs a devenit view ne-actualizabil
--    (eroare „cannot update view"), iar route_km_pairs.price nu e citit de aplicație.
--    Site/bot/voce/numărare folosesc tariff_periods (real-time) — actualizat la pasul 1.
INSERT INTO app_config (key, value, updated_at) VALUES
  ('rate_per_km', '1.04', now()),
  ('rate_per_km_long', '1.04', now()),
  ('rate_per_km_short', '1.04', now()),
  ('rate_per_km_interurban_short', '1.04', now()),
  ('rate_per_km_suburban', '1.14', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 3b. Oferta Bălți–Chișinău la noul tarif: 133 km × 1,04 = 138, ofertă (−20) = 118.
UPDATE offers SET original_price = 138, offer_price = 118
WHERE LOWER(from_locality) = 'bălți' AND LOWER(to_locality) = 'chișinău';
INSERT INTO offers (from_locality, to_locality, original_price, offer_price, active)
SELECT 'Bălți', 'Chișinău', 138, 118, true
WHERE NOT EXISTS (
  SELECT 1 FROM offers WHERE LOWER(from_locality) = 'bălți' AND LOWER(to_locality) = 'chișinău'
);

-- 4. Snapshot nou de prețuri populare la 1,04 (pentru tab-ul „Tarife" din admin).
--    Replică logica saveNomenclator: preț = ROUND(km × 1,04), km = cel mai mic între opriri;
--    fallback 133 km pentru rutele din Chișinău fără pereche în view.
WITH pr(from_stop, to_stop, from_ro, to_ro, from_ru, to_ru) AS (
  VALUES
    ('chisinau','balti','Chișinău','Bălți','Кишинёв','Бэлць'),
    ('chisinau','edinet','Chișinău','Edineț','Кишинёв','Единец'),
    ('chisinau','singerei','Chișinău','Sîngerei','Кишинёв','Сынжерей'),
    ('chisinau','ocnita','Chișinău','Ocnița','Кишинёв','Окница'),
    ('chisinau','otaci','Chișinău','Otaci','Кишинёв','Отачь'),
    ('chisinau','briceni','Chișinău','Briceni','Кишинёв','Бричень'),
    ('chisinau','cupcini','Chișinău','Cupcini','Кишинёв','Купчинь'),
    ('chisinau','lipcani','Chișinău','Lipcani','Кишинёв','Липкань'),
    ('chisinau','corjeuti','Chișinău','Corjeuți','Кишинёв','Коржеуць'),
    ('chisinau','grimancauti','Chișinău','Grimăncăuți','Кишинёв','Гримэнкэуць'),
    ('chisinau','criva','Chișinău','Criva','Кишинёв','Крива'),
    ('chisinau','larga','Chișinău','Larga','Кишинёв','Ларга')
),
km AS (
  SELECT pr.*,
    (SELECT MIN(v.km) FROM v_interurban_v2_km_pairs v
      WHERE v.from_stop = pr.from_stop AND v.to_stop = pr.to_stop) AS km
  FROM pr
)
INSERT INTO price_nomenclator (rate_per_km, prices)
SELECT 1.04,
  jsonb_agg(jsonb_build_object(
    'from_ro', from_ro, 'to_ro', to_ro, 'from_ru', from_ru, 'to_ru', to_ru,
    'price', ROUND(CASE WHEN km > 0 AND km < 1000 THEN km * 1.04 ELSE 133 * 1.04 END)
  ) ORDER BY to_ro)
FROM km;

COMMIT;
