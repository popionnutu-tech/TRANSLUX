-- 451: Bilete aparat — importul automat zilnic din cabinetul Mobilet (ION-160, 01.10).
--
-- Ion, 01.10: «fă ca o dată în zi, pe ziua de ieri, să lucreze automatizarea: să intre pe site și să colecteze datele de
-- bilete». Cabinetul (cabinet-v2.mobilet.md) are în spate API-ul webapi.goticket.md; /api/cron/tiki-mobilet ia vânzările
-- (aceleași rânduri ca exportul CSV, aceeași cheie ticket_key din 448) și cursele.
--
-- 1. Fiecare vânzare din API are `id` (al vânzării) și `tripId` (cursa concretă). Cursa are data ei reală: în perioadele
--    sincronizate în bloc (12.2025–01.2026, 04.2026) vânzarea e datată pe ziua sincronizării, cursa nu
--    (/reports/carrier/reports/trips pe 01–24.04.2026: 600–1.050 de bilete în fiecare zi; CSV-ul: ~0 pe 06–22.04).
-- 2. Cursele (tiki_trips): ruta, ora reală de plecare, mașina, șoferul, starea, bilete vândute, locuri.
-- 3. Istoricul importurilor arată și rulările automate, cu eroarea lor.

ALTER TABLE tiki_tickets
  ADD COLUMN IF NOT EXISTS mobilet_id bigint,
  ADD COLUMN IF NOT EXISTS trip_id    bigint;
CREATE INDEX IF NOT EXISTS tiki_tickets_trip ON tiki_tickets (trip_id);

ALTER TABLE tiki_import_batches ADD COLUMN IF NOT EXISTS error text;

CREATE TABLE IF NOT EXISTS tiki_trips (
  trip_id         bigint PRIMARY KEY,
  trip_date       date NOT NULL,
  dep_time        text,                      -- '02:50' (ora reală de plecare din Mobilet)
  route_name      text NOT NULL,             -- '2:35 Lipcani - Chisinau', ca în vânzări
  from_point      text,
  to_point        text,
  vehicle         text,
  driver_name     text,
  state           integer,                   -- starea cursei în Mobilet
  tickets_sold    integer,
  seats           integer,
  planned_org     text,
  actual_org      text,
  swap            text,
  withdraw_reason text,
  fetched_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tiki_trips_date ON tiki_trips (trip_date);
ALTER TABLE tiki_trips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE tiki_trips FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE tiki_trips TO service_role;

-- Leagă biletele deja importate (din CSV) de vânzarea și cursa Mobilet, după ticket_key; doar unde lipsesc.
CREATE OR REPLACE FUNCTION public.tiki_set_trip_ids(p jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '120s'
AS $function$
DECLARE v_n int;
BEGIN
  UPDATE tiki_tickets t
     SET mobilet_id = x.mobilet_id, trip_id = x.trip_id
    FROM jsonb_to_recordset(p) AS x(ticket_key text, mobilet_id bigint, trip_id bigint)
   WHERE t.ticket_key = x.ticket_key
     AND (t.mobilet_id IS DISTINCT FROM x.mobilet_id OR t.trip_id IS DISTINCT FROM x.trip_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

REVOKE EXECUTE ON FUNCTION public.tiki_set_trip_ids(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiki_set_trip_ids(jsonb) TO service_role;
