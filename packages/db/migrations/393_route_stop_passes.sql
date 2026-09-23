-- 393: când trece autobuzul, de fapt, prin fiecare oprire a rutei (ION-39)
--
-- Ion, 23.09.2026: «tu trebuie să estimezi între toate punctele posibile pe traseu timpul
-- — de exemplu, după engine ruta de seară era 23:00 din Edineț la Briceni, după real el a
-- trecut Edinețul mai devreme». Ora din grafic (crm_stop_fares) e o promisiune scrisă o
-- dată; ora reală o spune GPS-ul, zi de zi.
--
-- Un rând = o zi, o rută, un sens, o oprire: momentul în care mașina pusă pe cursă în
-- graficul zilei (daily_assignments) a trecut cel mai aproape de oprire (la cel mult
-- ~350 m), căutat în ±2 h față de ora din grafic. Scris noaptea de
-- lde-geo-worker/stop-times.mjs pe VPS, din urma brută a trackerului — lde_gps_stops nu
-- ajunge: ține doar staționările de peste 90 s, iar autobuzul trece prin sate fără să stea.
--
-- Citit de asistentul site-ului (lib/site-assistant/bus-eta.ts): abaterea mediană pe
-- oprire dă ora reală a cursei care n-a pornit, iar durata reală dintre două opriri dă
-- ora de sosire a autobuzului care e pe drum.

CREATE TABLE IF NOT EXISTS route_stop_passes (
  date          date        NOT NULL,
  crm_route_id  integer     NOT NULL,
  -- true = spre nord (din Chișinău, orele hour_from_chisinau), false = spre Chișinău.
  going_north   boolean     NOT NULL,
  stop_order    integer     NOT NULL,
  stop_name     text        NOT NULL,
  -- Ora din grafic la oprirea asta, «HH:MM», cum era în ziua respectivă.
  scheduled     text        NOT NULL,
  passed_at     timestamptz NOT NULL,
  -- Minute față de grafic: negativ = a trecut mai devreme.
  offset_min    integer     NOT NULL,
  -- Cât de aproape a trecut, în metri — ca să se vadă cât de sigur e rândul.
  distance_m    integer     NOT NULL,
  vehicle_id    uuid,
  PRIMARY KEY (date, crm_route_id, going_north, stop_order)
);

CREATE INDEX IF NOT EXISTS route_stop_passes_route
  ON route_stop_passes (crm_route_id, going_north, date DESC);

COMMENT ON TABLE route_stop_passes IS
  'Ora reală la care autobuzul cursei a trecut prin fiecare oprire (ION-39), din GPS-ul brut, '
  'scrisă noaptea de lde-geo-worker/stop-times.mjs. offset_min = abaterea față de crm_stop_fares.';

ALTER TABLE route_stop_passes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON route_stop_passes FROM anon, authenticated;
