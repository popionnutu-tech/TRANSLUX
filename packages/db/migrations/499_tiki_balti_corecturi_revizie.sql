-- 499: «Locuri în Bălți» — corecturile reviziei Claude + GPT (ION-220, Ion 03.10: «rezolvă»).
-- Pe fiecare zi × rută interurbană numărată (sesiune completed sau tur_done, direcția tur = spre Chișinău):
--   la_plecare = oamenii numărați la ieșirea din Bălți; zilele în care tot drumul spre Chișinău e 0 (nenumărat) ies.
--   vinde (cifra mare) = max(20 − la_plecare, 0) — doar din Numărare, nu mai depinde de bilete.
--   urca = biletele Mobilet ale rutei cu urcarea în Bălți, FĂRĂ biletele altui autobuz: se scot biletele cu mașina
--          diferită de mașina sesiunii numărate (TWK 683 pe ruta 20, RQR 330 pe ruta 3 — atribuire «eticheta_luna»)
--          și cele cu ora din etichetă la peste 30 min de plecarea rutei (AKD 686 «Lipcani 14:10» pe ruta 24 de 07:25).
--   urca = NULL (necunoscut) când pe acea zi × rută nu rămâne niciun bilet atribuit pe drumul spre Chișinău
--          (atribuirea încă nefăcută sau biletele lipsă), nu 0.
--   libere = 20 − max(la_plecare − urca, 0), doar când urca e cunoscut.
--   program = zilele × rute din grafic (tiki_plecari_daily) ale rutelor cu Bălți, pentru totalul de jos.

CREATE OR REPLACE FUNCTION public.get_tiki_balti(p_from date, p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
  WITH ses AS (
    SELECT s.id, s.assignment_date AS zi, s.crm_route_id, tiki_plate_key(v.plate_number) AS skey,
           tiki_min(split_part(cr.time_nord, ' ', 1)) AS min_plecare
    FROM counting_sessions s
    JOIN crm_routes cr ON cr.id = s.crm_route_id AND cr.route_type = 'interurban'
    LEFT JOIN vehicles v ON v.id = s.vehicle_id
    WHERE s.assignment_date BETWEEN p_from AND p_to AND s.status IN ('completed', 'tur_done')
  ),
  zile AS (
    SELECT ses.zi, ses.crm_route_id, ses.skey, ses.min_plecare,
           max(e.total_passengers) FILTER (WHERE tiki_stop_norm(e.stop_name_ro) = 'balti') AS la_plecare
    FROM ses JOIN counting_entries e ON e.session_id = ses.id AND e.direction = 'tur'
    GROUP BY 1, 2, 3, 4
    HAVING count(*) FILTER (WHERE tiki_stop_norm(e.stop_name_ro) = 'balti') > 0 AND sum(e.total_passengers) > 0
  ),
  b AS (
    SELECT z.zi, z.crm_route_id, tiki_stop_norm(t.from_station) = 'balti' AS din_balti
    FROM zile z
    JOIN tiki_ticket_attr a ON a.zi = z.zi AND a.crm_route_id = z.crm_route_id AND a.leg = 'nord_chisinau' AND NOT a.is_anulare
    JOIN tiki_tickets t ON t.ticket_key = a.ticket_key
    WHERE (a.vkey IS NULL OR a.vkey = '' OR z.skey IS NULL OR z.skey = '' OR a.vkey = z.skey)
      AND (substring(a.label FROM '\d{1,2}:\d{2}') IS NULL OR z.min_plecare IS NULL
           OR least(abs(tiki_min(substring(a.label FROM '\d{1,2}:\d{2}')) - z.min_plecare),
                    1440 - abs(tiki_min(substring(a.label FROM '\d{1,2}:\d{2}')) - z.min_plecare)) <= 30)
  ),
  u AS (SELECT zi, crm_route_id, count(*) AS bilete, count(*) FILTER (WHERE din_balti) AS urca FROM b GROUP BY 1, 2),
  z AS (
    SELECT z.zi, z.crm_route_id, z.la_plecare,
           greatest(20 - z.la_plecare, 0) AS vinde,
           CASE WHEN coalesce(u.bilete, 0) > 0 THEN u.urca END AS urca,
           CASE WHEN coalesce(u.bilete, 0) > 0 THEN 20 - greatest(z.la_plecare - u.urca, 0) END AS libere
    FROM zile z LEFT JOIN u USING (zi, crm_route_id)
  ),
  rb AS (SELECT DISTINCT crm_route_id FROM tiki_route_stops WHERE leg = 'nord_chisinau' AND stop_norm = 'balti'),
  prog AS (
    SELECT p.zi, p.crm_route_id FROM tiki_plecari_daily p JOIN rb USING (crm_route_id)
    JOIN crm_routes cr ON cr.id = p.crm_route_id AND cr.route_type = 'interurban'
    WHERE p.zi BETWEEN p_from AND p_to AND p.leg = 'nord_chisinau' AND p.plecari > 0
    UNION SELECT zi, crm_route_id FROM z
  )
  SELECT jsonb_build_object(
    'rute', coalesce((
      SELECT jsonb_agg(jsonb_build_object('cheie', r.id::text, 'ora', r.ora, 'nume', r.nume, 'curse', r.curse) ORDER BY tiki_min(r.ora), r.nume)
      FROM (
        SELECT cr.id, split_part(cr.time_nord, ' ', 1) AS ora,
               CASE WHEN tiki_stop_norm(cr.dest_from_ro) = 'chisinau' THEN cr.dest_to_ro
                    ELSE trim(regexp_replace(cr.dest_from_ro, '\s*-\s*Chișinău\s*$', '')) END AS nume,
               count(z.zi) AS curse
        FROM (SELECT DISTINCT crm_route_id FROM prog) pr
        JOIN crm_routes cr ON cr.id = pr.crm_route_id
        LEFT JOIN z ON z.crm_route_id = pr.crm_route_id
        GROUP BY cr.id, cr.time_nord, cr.dest_from_ro, cr.dest_to_ro
      ) r), '[]'),
    'zile', coalesce((
      SELECT jsonb_agg(jsonb_build_object('r', crm_route_id::text, 'd', zi, 'la_plecare', la_plecare, 'vinde', vinde,
                                          'urca', urca, 'libere', libere) ORDER BY zi, crm_route_id)
      FROM z), '[]'),
    'program', coalesce((
      SELECT jsonb_agg(jsonb_build_object('r', crm_route_id::text, 'd', zi) ORDER BY zi, crm_route_id) FROM prog), '[]')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.get_tiki_balti(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tiki_balti(date, date) TO service_role;
