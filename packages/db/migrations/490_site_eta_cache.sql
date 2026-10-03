-- 490: cache-ul precalculat al orei estimate de pe harta «Acum» (ION-206)
--
-- Ion, 03.10.2026 («site ultrafast», punctul 7): /api/asistent-site/acum pe o instanță rece dura
-- 5,7 s, fiindcă ritmul rutei (14 zile de lde_gps_stops + daily_assignments) și trecerile pe opriri
-- (route_stop_passes) se calculau la cerere și trăiau doar în memoria instanței Vercel.
--
-- Cronul /api/cron/site-eta-cache (VPS, noaptea, după stop-times.mjs) scrie aici, cu aceleași
-- funcții din bus-eta.ts:
--   pace:fleet        {pace: minute/km ale flotei interurbane | null}
--   pace:r<rută>      {pace: minute/km ale rutei | null}
--   passes:<rută>:n|s {rows: [{date, stop_order, passed_at, offset_min}]} — ultimele 14 zile, pe sens
-- /acum doar citește (preloadEtaCache); cheia lipsă sau mai veche de 36 h = calculul vechi, la cerere.
-- Tabelă mică (3 rânduri pe rută, ~30 de rute); valoarea e jsonb ca formulele să poată cere altceva
-- fără altă migrație.

CREATE TABLE IF NOT EXISTS site_eta_cache (
  key          text PRIMARY KEY,
  value        jsonb NOT NULL,
  computed_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE site_eta_cache IS
  'Precalculul orei estimate de pe harta «Acum» (ION-206): ritmul rutelor și trecerile pe opriri, '
  'scrise noaptea de /api/cron/site-eta-cache și citite de /api/asistent-site/acum. '
  'Chei: pace:fleet, pace:r<rută>, passes:<rută>:n|s.';

ALTER TABLE site_eta_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON site_eta_cache FROM anon, authenticated;
