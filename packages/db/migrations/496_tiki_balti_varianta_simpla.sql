-- 496: «Locuri în Bălți», varianta simplă (ION-217). Ion, 03.10: «da, fă varianta simplă» — fără perechile estimate ale
-- clienților fără bilet (tiki_ceilalti_od împarte oamenii pe perechi cu fracții: Numărarea nu știe cine unde coboară).
--
-- Pe zilele numărate (count_leg_daily eligibil, picior nord_chisinau), o zi × rută CRM = un autobuz:
--   la_plecare = oamenii numărați în autobuz la ieșirea din Bălți (leg_segment_load);
--   urca       = biletele Mobilet ale rutei din acea zi (tiki_ticket_attr) cu urcarea în Bălți;
--   libere     = 20 − max(la_plecare − urca, 0)  (cei din nord care merg mai departe = numărați − urcați în Bălți).
-- Exemplu 06:17 Corjeuți 18.09: 16 numărați, 14 urcă → 2 merg mai departe, 18 libere, 4 de vândut.

CREATE OR REPLACE FUNCTION public.get_tiki_balti(p_from date, p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
  WITH zile AS (
    SELECT c.zi, c.crm_route_id, l.incarcare_numarata AS la_plecare
    FROM count_leg_daily c
    JOIN leg_segment_load l ON l.zi = c.zi AND l.crm_route_id = c.crm_route_id AND l.leg = c.leg
                           AND tiki_stop_norm(l.stop_name) = 'balti'
    WHERE c.zi BETWEEN p_from AND p_to AND c.leg = 'nord_chisinau' AND c.eligibil
  ),
  u AS (
    SELECT a.zi, a.crm_route_id, count(*) AS urca
    FROM zile z
    JOIN tiki_ticket_attr a ON a.zi = z.zi AND a.crm_route_id = z.crm_route_id AND a.leg = 'nord_chisinau' AND NOT a.is_anulare
    JOIN tiki_tickets t ON t.ticket_key = a.ticket_key
    WHERE tiki_stop_norm(t.from_station) = 'balti'
    GROUP BY 1, 2
  ),
  z AS (
    SELECT z.zi, z.crm_route_id, 1 AS n, coalesce(u.urca, 0) AS urca, z.la_plecare,
           20 - greatest(z.la_plecare - coalesce(u.urca, 0), 0) AS libere
    FROM zile z LEFT JOIN u USING (zi, crm_route_id)
  )
  SELECT jsonb_build_object(
    'rute', coalesce((
      SELECT jsonb_agg(jsonb_build_object('cheie', r.id::text, 'ora', r.ora, 'nume', r.nume, 'curse', r.curse) ORDER BY tiki_min(r.ora), r.nume)
      FROM (
        SELECT cr.id, split_part(cr.time_nord, ' ', 1) AS ora,
               trim(regexp_replace(cr.dest_from_ro, '\s*-\s*Chișinău\s*$', '')) AS nume, count(*) AS curse
        FROM z JOIN crm_routes cr ON cr.id = z.crm_route_id
        GROUP BY cr.id, cr.time_nord, cr.dest_from_ro
      ) r), '[]'),
    'zile', coalesce((
      SELECT jsonb_agg(jsonb_build_object('r', crm_route_id::text, 'd', zi, 'n', n, 'libere', greatest(libere, 0), 'urca', urca,
                                          'la_plecare', la_plecare) ORDER BY zi, crm_route_id)
      FROM z), '[]')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.get_tiki_balti(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tiki_balti(date, date) TO service_role;
