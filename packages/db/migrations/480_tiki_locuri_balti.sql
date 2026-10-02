-- 480: Bilete aparat — «Locuri în Bălți» (ION-181, 02.10). Ion: «pe fiecare grafic, cu câți oameni de obicei per zi de
-- săptămână în mediu are locuri libere spre Chișinău din Bălți (după ce se dau jos oamenii de nord) și câți oameni fizic
-- urcă în Bălți»; a treia cifră «câte locuri mai putem vinde la această cursă din Bălți».
--
-- Pe fiecare cursă Mobilet spre Chișinău (tiki_trips, route_name «… - Chisinau»), pe ziua cursei, din biletele legate de
-- cursă (trip_id), fără «Anulare», doar cursele cu cel puțin un bilet:
--   libere = locurile din Mobilet (18 pe toate cursele) − biletele de la nord de Bălți spre o stație la sud de Bălți
--            (cei care trec prin Bălți fără să coboare); nu scade sub 0;
--   urca   = biletele cu stația de plecare Bălți, oriunde ar coborî.
-- Clientul face mediile pe zi / săptămână / lună / zi a săptămânii și cifra «mai putem vinde» = libere − urca.
-- Se văd doar biletele bătute; oamenii luați fără bilet nu apar.

CREATE OR REPLACE FUNCTION public.get_tiki_balti(p_from date, p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
  WITH tr AS (
    SELECT trip_id, trip_date, route_name, coalesce(seats, 18) AS seats
    FROM tiki_trips
    WHERE trip_date BETWEEN p_from AND p_to AND route_name ILIKE '%chisinau'
  ),
  k AS (
    SELECT t.trip_id,
           count(*) FILTER (WHERE tiki_stop_norm(t.from_station) <> 'balti'
                              AND tiki_stop_norm(t.to_station) IN ('chisinau', 'orhei', 'prepelita', 'singerei', 'bilicenii vechi',
                                                                    'zahareuca', 'peresecina', 'copaceni', 'ratus', 'banesti')) AS tranzit,
           count(*) FILTER (WHERE tiki_stop_norm(t.from_station) = 'balti') AS urca
    FROM tiki_tickets t JOIN tr USING (trip_id)
    WHERE NOT t.is_anulare
    GROUP BY t.trip_id
  ),
  z AS (
    SELECT tr.route_name, tr.trip_date, count(*) AS n,
           sum(greatest(tr.seats - k.tranzit, 0)) AS libere, sum(k.urca) AS urca
    FROM tr JOIN k USING (trip_id)
    GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'rute', coalesce((
      SELECT jsonb_agg(jsonb_build_object('cheie', route_name, 'ora', ora, 'nume', nume, 'curse', curse) ORDER BY tiki_min(ora), nume)
      FROM (
        SELECT route_name,
               regexp_replace(route_name, '^\s*(\d{1,2}:\d{2}).*$', '\1') AS ora,
               trim(regexp_replace(regexp_replace(route_name, '^\s*\d{1,2}:\d{2}\s*', ''), '\s*-\s*chisinau\s*$', '', 'i')) AS nume,
               sum(n) AS curse
        FROM z GROUP BY route_name
      ) r), '[]'),
    'zile', coalesce((
      SELECT jsonb_agg(jsonb_build_object('r', route_name, 'd', trip_date, 'n', n, 'libere', libere, 'urca', urca)
                       ORDER BY trip_date, route_name)
      FROM z), '[]')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.get_tiki_balti(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tiki_balti(date, date) TO service_role;
