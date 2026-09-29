-- 439_analytics_vizitatori_unici.sql — câți OAMENI, nu doar câte evenimente, și sursele anormale (ION-142).
-- Ion, 29.09.2026, pe fila Site din /analytics: «nu se înțelege câte unice», apoi «și dacă este anomalie
-- de pe un IP, să fie în analitică» și «sau multe căutări zilnice».
--
-- `vizitator` = SHA-256(sare + IP + user-agent), primele 16 hex, scris de translux.md (apps/web/src/lib/visitor.ts).
-- Sarea fixă și proprie (VIZITATOR_SALT, doar în Vercel): fără cookie, adresa nu se citește înapoi, dar aceeași
-- sursă se recunoaște de la o zi la alta — altfel «multe căutări zilnice» nu s-ar putea vedea. Rândurile de
-- dinainte de 29.09 n-au vizitator: unicii lor nu se pot reface (unique_since spune de când se numără).
-- ip_hash rămâne neatins (anti-scraperul cautari_recente, migr. 334).
--
-- Anomalie, două feluri (pragurile din search_log 16–29.09: o sursă făcea median 1 căutare/zi, p99 = 13,
-- p99,9 = 25; maximul, 381, era botul e-orar.md):
--   'zi'     — o sursă într-o zi cu ≥ 30 de căutări, ≥ 60 de vizite sau user-agent de bot;
--   'zilnic' — o sursă activă în ≥ 5 zile din perioadă, cu ≥ 5 căutări pe zi în medie (pe 14 zile: 3 surse,
--              între ele una cu 21/zi în 5 zile și una în 13 zile din 14; omul care revine face 3–5/zi).
-- Sursa = vizitator; căutările vechi fără el cad pe ip_hash, ca anomaliile de dinainte să se vadă.
BEGIN;

ALTER TABLE page_views  ADD COLUMN IF NOT EXISTS vizitator text;
ALTER TABLE search_log  ADD COLUMN IF NOT EXISTS vizitator text;
ALTER TABLE call_clicks ADD COLUMN IF NOT EXISTS vizitator text;

COMMENT ON COLUMN page_views.vizitator IS
  'SHA-256(sare + IP + user-agent)[0:16] — oamenii unici, fără cookie (ION-142).';
COMMENT ON COLUMN search_log.vizitator IS
  'Ca page_views.vizitator (ION-142). Separat de ip_hash, pe care îl folosește anti-scraperul.';
COMMENT ON COLUMN call_clicks.vizitator IS 'Ca page_views.vizitator (ION-142).';

-- Anon scrie direct prin PostgREST (WITH CHECK true): măcar forma amprentei e fixă, ca un rând
-- inventat să nu poată pune text oarecare în tabelul «Surse anormale».
ALTER TABLE page_views  ADD CONSTRAINT page_views_vizitator_forma  CHECK (vizitator IS NULL OR vizitator ~ '^[0-9a-f]{16}$');
ALTER TABLE search_log  ADD CONSTRAINT search_log_vizitator_forma  CHECK (vizitator IS NULL OR vizitator ~ '^[0-9a-f]{16}$');
ALTER TABLE call_clicks ADD CONSTRAINT call_clicks_vizitator_forma CHECK (vizitator IS NULL OR vizitator ~ '^[0-9a-f]{16}$');
ALTER TABLE search_log  ADD CONSTRAINT search_log_user_agent_lung  CHECK (char_length(user_agent) <= 200) NOT VALID;

-- De când se numără oamenii (unique_since) și golirea de noapte: fără indexul parțial, amândouă
-- ar parcurge tot istoricul fără amprentă al page_views (tabela n-are termen de păstrare).
CREATE INDEX IF NOT EXISTS page_views_vizitator_created  ON page_views  (created_at) WHERE vizitator IS NOT NULL;
CREATE INDEX IF NOT EXISTS call_clicks_vizitator_created ON call_clicks (created_at) WHERE vizitator IS NOT NULL;

-- Amprenta nu stă mai mult decât search_log (180 de zile, migr. 284): page_views și call_clicks n-au
-- termen de păstrare, deci aici se golește doar coloana; rândul rămâne pentru cifrele de vizite/apeluri.
SELECT cron.schedule(
  'vizitator-retentie',
  '20 3 * * *',
  $$UPDATE page_views  SET vizitator = NULL WHERE vizitator IS NOT NULL AND created_at < now() - interval '180 days';
    UPDATE call_clicks SET vizitator = NULL WHERE vizitator IS NOT NULL AND created_at < now() - interval '180 days'$$
);

CREATE OR REPLACE FUNCTION analytics_site(since_ts timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH
  pv AS (SELECT (created_at AT TIME ZONE 'UTC')::date d, device, country, vizitator v FROM page_views WHERE created_at >= since_ts),
  sl AS (SELECT (created_at AT TIME ZONE 'UTC')::date d, mod, from_locality f, to_locality t, vizitator v,
                COALESCE(vizitator, 'ip:' || ip_hash) src, user_agent ua
         FROM search_log WHERE created_at >= since_ts),
  cc AS (SELECT (created_at AT TIME ZONE 'UTC')::date d, mod, from_locality f, to_locality t, vizitator v, country, device
         FROM call_clicks WHERE created_at >= since_ts),
  rs AS (SELECT f, t, d, extract(isodow FROM d)::int - 1 w, count(*) n FROM sl GROUP BY 1, 2, 3),
  rc AS (SELECT f, t, d, extract(isodow FROM d)::int - 1 w, count(*) n FROM cc GROUP BY 1, 2, 3),
  top AS (SELECT f, t, sum(n) n FROM rs GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20),
  dows AS (SELECT generate_series(0, 6) w),
  -- medii pe (rută, zi a săptămânii) doar pentru top 20, dintr-o trecere; NULL-urile rutei se potrivesc între ele
  sw AS (SELECT rs.f, rs.t, rs.w, round(sum(rs.n)::numeric / count(DISTINCT rs.d)) a
         FROM rs JOIN top ON rs.f IS NOT DISTINCT FROM top.f AND rs.t IS NOT DISTINCT FROM top.t GROUP BY 1, 2, 3),
  cw AS (SELECT rc.f, rc.t, rc.w, sum(rc.n) n, round(sum(rc.n)::numeric / count(DISTINCT rc.d)) a
         FROM rc JOIN top ON rc.f IS NOT DISTINCT FROM top.f AND rc.t IS NOT DISTINCT FROM top.t GROUP BY 1, 2, 3),
  rt AS (SELECT top.f, top.t, top.n,
                COALESCE(sum(cw.n), 0) calls,
                jsonb_agg(COALESCE(sw.a, 0) ORDER BY dows.w) day_counts,
                jsonb_agg(COALESCE(cw.a, 0) ORDER BY dows.w) day_calls
         FROM top CROSS JOIN dows
         LEFT JOIN sw ON sw.f IS NOT DISTINCT FROM top.f AND sw.t IS NOT DISTINCT FROM top.t AND sw.w = dows.w
         LEFT JOIN cw ON cw.f IS NOT DISTINCT FROM top.f AND cw.t IS NOT DISTINCT FROM top.t AND cw.w = dows.w
         GROUP BY 1, 2, 3),
  dt AS (SELECT w, round(sum(n)::numeric / count(DISTINCT d)) a FROM rs GROUP BY 1),
  upv AS (SELECT d, count(DISTINCT v) u FROM pv GROUP BY 1),
  -- Fiecare sursă pe zi, din toate trei tabelele; căutările vechi fără vizitator vin pe ip_hash.
  zi AS (
    SELECT d, src, sum(cautari) cautari, sum(rute) rute, sum(vizite) vizite, sum(apeluri) apeluri,
           max(ua) ua, bool_or(bot) bot, max(country) country, max(device) device
    FROM (
      -- Botul se prinde pe ORICARE rând al zilei: e-orar.md a trimis 24.09 și un user-agent de browser.
      SELECT d, src, count(*) cautari, count(DISTINCT f || '>' || t) rute, 0 vizite, 0 apeluri,
             max(ua) ua, bool_or(ua ~* '(bot|crawl|spider|curl|wget|python|scrap|headless|http)') bot,
             NULL::text country, NULL::text device
      FROM sl WHERE src IS NOT NULL GROUP BY 1, 2
      UNION ALL
      SELECT d, v, 0, 0, count(*), 0, NULL, false, max(country), max(device) FROM pv WHERE v IS NOT NULL GROUP BY 1, 2
      UNION ALL
      SELECT d, v, 0, 0, 0, count(*), NULL, false, max(country), max(device) FROM cc WHERE v IS NOT NULL GROUP BY 1, 2) x
    GROUP BY 1, 2),
  an_zi AS (
    SELECT 'zi' kind, d::text zi, 1 zile, src, cautari, rute, vizite, apeluri, ua, country, device FROM zi
    WHERE cautari >= 30 OR vizite >= 60 OR bot),
  an_zilnic AS (
    SELECT 'zilnic' kind, min(d)::text || ' – ' || max(d)::text zi, count(*)::int zile, src,
           sum(cautari) cautari, sum(rute) rute, sum(vizite) vizite, sum(apeluri) apeluri,
           max(ua) ua, max(country) country, max(device) device
    FROM zi WHERE cautari > 0 GROUP BY src
    HAVING count(*) >= 5 AND sum(cautari)::numeric / count(*) >= 5),
  an AS (SELECT * FROM an_zi UNION ALL SELECT * FROM an_zilnic)
  SELECT jsonb_build_object(
    'views_per_day', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', x.d, 'count', x.n, 'unique', COALESCE(upv.u, 0)) ORDER BY x.d)
      FROM (SELECT d, count(*) n FROM pv GROUP BY 1) x LEFT JOIN upv ON upv.d = x.d), '[]'::jsonb),
    'searches_per_day', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', d, 'acum', a, 'mai_tarziu', m) ORDER BY d)
      FROM (SELECT d, count(*) FILTER (WHERE mod = 'acum') a, count(*) FILTER (WHERE mod IS DISTINCT FROM 'acum') m
            FROM sl GROUP BY 1) x), '[]'::jsonb),
    'totals', jsonb_build_object(
      'views', (SELECT count(*) FROM pv),
      'searches', (SELECT count(*) FROM sl),
      'searches_acum', (SELECT count(*) FROM sl WHERE mod = 'acum'),
      'calls', (SELECT count(*) FROM cc),
      'calls_acum', (SELECT count(*) FROM cc WHERE mod = 'acum'),
      'views_unique', (SELECT count(DISTINCT v) FROM pv),
      'searches_unique', (SELECT count(DISTINCT v) FROM sl),
      'searches_acum_unique', (SELECT count(DISTINCT v) FROM sl WHERE mod = 'acum'),
      'calls_unique', (SELECT count(DISTINCT v) FROM cc),
      'calls_acum_unique', (SELECT count(DISTINCT v) FROM cc WHERE mod = 'acum'),
      'unique_since', (SELECT min(created_at)::date FROM page_views WHERE vizitator IS NOT NULL),
      -- Cât din căutări vine de la sursele anormale (o sursă numărată o dată, chiar dacă e în ambele feluri).
      'anomaly_searches', (SELECT COALESCE(sum(cautari), 0) FROM zi
                           WHERE src IN (SELECT src FROM an_zilnic) OR (d::text, src) IN (SELECT zi, src FROM an_zi))),
    'anomalies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('kind', kind, 'period', zi, 'days', zile,
                                          'source', left(regexp_replace(src, '^ip:', ''), 8),
                                          'searches', cautari, 'routes', rute, 'views', vizite, 'calls', apeluri,
                                          'user_agent', left(ua, 120), 'country', country, 'device', device)
                       ORDER BY cautari + vizite DESC)
      FROM (SELECT * FROM an ORDER BY cautari + vizite DESC LIMIT 25) x), '[]'::jsonb),
    'devices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('device', k, 'count', n) ORDER BY n DESC)
      FROM (SELECT COALESCE(device, 'unknown') k, count(*) n FROM pv GROUP BY 1) x), '[]'::jsonb),
    'countries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('country', k, 'count', n) ORDER BY n DESC)
      FROM (SELECT COALESCE(country, '??') k, count(*) n FROM pv GROUP BY 1 ORDER BY 2 DESC LIMIT 10) x), '[]'::jsonb),
    'routes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('from_locality', f, 'to_locality', t, 'count', n, 'calls', calls,
                                          'day_counts', day_counts, 'day_calls', day_calls) ORDER BY n DESC)
      FROM rt), '[]'::jsonb),
    'day_totals', (SELECT jsonb_agg(COALESCE(dt.a, 0) ORDER BY dows.w) FROM dows LEFT JOIN dt ON dt.w = dows.w)
  );
$$;

REVOKE EXECUTE ON FUNCTION analytics_site(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_site(timestamptz) TO service_role;

COMMIT;
