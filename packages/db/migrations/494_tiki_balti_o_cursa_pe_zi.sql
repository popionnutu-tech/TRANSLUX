-- 494: «Locuri în Bălți» — o zi × grafic = un autobuz; zilele fără bilete din nord ies din calcul (ION-215).
-- Ion, 03.10: «cum pot fi jumătate de om urcă, cum pot fi auto cu 20 locuri libere în Bălți».
-- Septembrie, 638 de zile × grafic:
--   * 190 au cursa împărțită în Mobilet pe 2–4 trip_id (2:35 Lipcani 18.09: 6 + 3 + 0 + 0 bilete). Migr. 480 lua
--     fiecare trip_id drept autobuz și media dădea 0,5 oameni într-o zi. Acum biletele zilei se adună pe grafic.
--   * 36 au doar bilete din Bălți, niciunul cu urcare la nord de Bălți (06:17 Corjeuți 18–20.09) → «20 libere».
--     Biletele din nord lipsesc din Mobilet în acele zile; ziua nu intră în calcul.
-- Locurile rămân 20 (migr. 493). «curse» din rute = zilele luate în calcul.

CREATE OR REPLACE FUNCTION public.get_tiki_balti(p_from date, p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
  WITH tr AS (
    SELECT trip_id, trip_date, route_name
    FROM tiki_trips
    WHERE trip_date BETWEEN p_from AND p_to AND route_name ILIKE '%chisinau'
  ),
  b AS (
    SELECT tr.route_name, tr.trip_date,
           tiki_stop_norm(t.from_station) AS de,
           tiki_stop_norm(t.to_station) AS spre
    FROM tiki_tickets t JOIN tr USING (trip_id)
    WHERE NOT t.is_anulare
  ),
  k AS (
    SELECT route_name, trip_date,
           count(*) FILTER (WHERE de <> 'balti' AND spre IN ('chisinau', 'orhei', 'prepelita', 'singerei', 'bilicenii vechi',
                                                             'zahareuca', 'peresecina', 'copaceni', 'ratus', 'banesti')) AS tranzit,
           count(*) FILTER (WHERE de = 'balti') AS urca,
           count(*) FILTER (WHERE de <> 'balti' AND de NOT IN ('chisinau', 'orhei', 'prepelita', 'singerei', 'bilicenii vechi',
                                                               'zahareuca', 'peresecina', 'copaceni', 'ratus', 'banesti')) AS nord
    FROM b
    GROUP BY 1, 2
  ),
  z AS (
    SELECT route_name, trip_date, 1 AS n, greatest(20 - tranzit, 0) AS libere, urca
    FROM k
    WHERE nord > 0
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
