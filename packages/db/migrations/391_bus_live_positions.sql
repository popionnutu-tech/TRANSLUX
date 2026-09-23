-- 391: ultimul punct al autobuzelor de pe cursele interurbane de azi (ION-39)
--
-- Ion, 23.09.2026: asistentul de pe translux.md arată «unde e autobuzul», dar «doar la
-- mașina care e pe cursă», «doar rutele interurbane conform grafic și doar în orele de
-- lucru ale rutei», «fără viteză, ca punct în moment».
--
-- Trackerul autobuzelor (95.217.229.75:5432) nu e accesibil din afara VPS-ului, deci
-- central-hub nu-l poate citi direct. Cronul de pe VPS (lde-geo-worker/bus-live.mjs,
-- în fiecare minut) scrie aici un rând pe mașină: DOAR mașinile din daily_assignments
-- de azi, DOAR ultimul punct, fără viteză și fără istorie — rândul se suprascrie.
--
-- Regula «doar cursa clientului, doar în orele ei» NU stă aici: tabelul e intern, iar
-- poarta e în ruta asistentului (lib/site-assistant/bus-location.ts), care dă punctul
-- unei singure mașini, și numai între începutul și sfârșitul cursei din grafic.

CREATE TABLE IF NOT EXISTS bus_live_positions (
  plate       text PRIMARY KEY,
  lat         double precision NOT NULL,
  lon         double precision NOT NULL,
  -- Ora punctului, din tracker (UTC). Nu ora scrierii.
  at          timestamptz NOT NULL,
  -- Localitatea cea mai apropiată (OSM, places-index de pe VPS), pentru «acum lângă X».
  near        text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE bus_live_positions IS
  'Ultimul punct GPS al mașinilor atribuite azi pe curse interurbane (ION-39). Scris de '
  'cronul bus-live.mjs de pe VPS în fiecare minut. Fără viteză, fără istorie.';

ALTER TABLE bus_live_positions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bus_live_positions FROM anon, authenticated;
