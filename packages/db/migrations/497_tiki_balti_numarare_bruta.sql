-- 497: «Locuri în Bălți» din numărarea brută (ION-218). Ion, 03.10: «foarte multe date absente sunt».
-- Migr. 496 lua «numărați la ieșirea din Bălți» din count_leg_daily / leg_segment_load, agregate refăcute doar noaptea
-- (instanța NANO): coada count_refresh_queue avea 6.458 de zile, iar din săptămâna 28.09 erau agregate 76 de zile din 123
-- numărate. Acum zilele și «numărați» vin direct din counting_entries (sesiuni completed, direcția tur = spre Chișinău,
-- oprirea Bălți, încărcarea după oprire), disponibile imediat ce operatorul termină; «urcă» rămâne din tiki_ticket_attr.
-- Numele rutei: rutele 3, 21, 30 au dest_from_ro = «Chișinău» și capătul în dest_to_ro (pagina scria «Chișinău – Chișinău»).

CREATE OR REPLACE FUNCTION public.get_tiki_balti(p_from date, p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
  WITH zile AS (
    SELECT s.assignment_date AS zi, s.crm_route_id, max(e.total_passengers) AS la_plecare
    FROM counting_sessions s
    JOIN counting_entries e ON e.session_id = s.id
    WHERE s.assignment_date BETWEEN p_from AND p_to AND s.status = 'completed'
      AND e.direction = 'tur' AND tiki_stop_norm(e.stop_name_ro) = 'balti'
    GROUP BY 1, 2
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
               CASE WHEN tiki_stop_norm(cr.dest_from_ro) = 'chisinau' THEN cr.dest_to_ro
                    ELSE trim(regexp_replace(cr.dest_from_ro, '\s*-\s*Chișinău\s*$', '')) END AS nume,
               count(*) AS curse
        FROM z JOIN crm_routes cr ON cr.id = z.crm_route_id
        GROUP BY cr.id, cr.time_nord, cr.dest_from_ro, cr.dest_to_ro
      ) r), '[]'),
    'zile', coalesce((
      SELECT jsonb_agg(jsonb_build_object('r', crm_route_id::text, 'd', zi, 'n', n, 'libere', greatest(libere, 0), 'urca', urca,
                                          'la_plecare', la_plecare) ORDER BY zi, crm_route_id)
      FROM z), '[]')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.get_tiki_balti(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tiki_balti(date, date) TO service_role;
