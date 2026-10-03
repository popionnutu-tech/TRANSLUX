-- 495: «Locuri în Bălți» pe Mobilet + Numărare (ION-216). Ion, 03.10: «noi doar am identificat clienți adiționali față de
-- Mobilet în primul raport […] clienții aceștia separați deja identificați + clienții Mobilet și verificare simplă
-- 20 − numărare la ieșire din Bălți».
--
-- Zilele = zilele numărate (count_leg_daily eligibil, picior nord_chisinau) cu Bălți pe drum; o zi × rută CRM = un autobuz.
-- Oamenii = biletele Mobilet atribuite rutei și zilei (tiki_ticket_attr) + clienții fără bilet deja identificați din
-- Numărare (tiki_ceilalti_od). Ordinea opririlor: tiki_route_stops.
--   tranzit = urcați înainte de Bălți, coborâți după; urca = urcați în Bălți;
--   libere = 20 − tranzit (fără să scadă sub 0); «mai putem vinde» = libere − urca, în client;
--   la_plecare = încărcarea numărată la ieșirea din Bălți (leg_segment_load) → verificarea 20 − la_plecare.
-- Septembrie: 757 de zile × rută; tranzit + urca = la_plecare exact în 561, la 1–2 oameni în 159, peste 2 în 37;
-- 260 din 27.851 de bilete fără oprire potrivită pe rută.
-- Cheia rutei devine crm_route_id (era eticheta Mobilet, migr. 480–494).

CREATE OR REPLACE FUNCTION public.get_tiki_balti(p_from date, p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
  WITH zile AS (                                   -- zilele numărate, cu Bălți pe picior
    SELECT c.zi, c.crm_route_id, l.stop_order AS ord_b, l.incarcare_numarata AS la_plecare
    FROM count_leg_daily c
    JOIN leg_segment_load l ON l.zi = c.zi AND l.crm_route_id = c.crm_route_id AND l.leg = c.leg
                           AND tiki_stop_norm(l.stop_name) = 'balti'
    WHERE c.zi BETWEEN p_from AND p_to AND c.leg = 'nord_chisinau' AND c.eligibil
  ),
  ord AS (SELECT crm_route_id, stop_norm, min(stop_order) AS o FROM tiki_route_stops WHERE leg = 'nord_chisinau' GROUP BY 1, 2),
  mob AS (                                         -- biletele Mobilet legate de rută și zi
    SELECT z.zi, z.crm_route_id, z.ord_b, od.o AS o_de, os.o AS o_spre, 1::numeric AS n
    FROM zile z
    JOIN tiki_ticket_attr a ON a.zi = z.zi AND a.crm_route_id = z.crm_route_id AND a.leg = 'nord_chisinau' AND NOT a.is_anulare
    JOIN tiki_tickets t ON t.ticket_key = a.ticket_key
    LEFT JOIN tiki_stop_map md ON md.statie_norm = tiki_stop_norm(t.from_station)
    LEFT JOIN tiki_stop_map ms ON ms.statie_norm = tiki_stop_norm(t.to_station)
    LEFT JOIN ord od ON od.crm_route_id = z.crm_route_id AND od.stop_norm = coalesce(md.stop_norm, tiki_stop_norm(t.from_station))
    LEFT JOIN ord os ON os.crm_route_id = z.crm_route_id AND os.stop_norm = coalesce(ms.stop_norm, tiki_stop_norm(t.to_station))
  ),
  ext AS (                                         -- clienții fără bilet, deja identificați din Numărare
    SELECT z.zi, z.crm_route_id, z.ord_b, o.de_la_ord AS o_de, o.pana_la_ord AS o_spre, o.oameni AS n
    FROM zile z JOIN tiki_ceilalti_od o ON o.zi = z.zi AND o.crm_route_id = z.crm_route_id AND o.leg = 'nord_chisinau'
  ),
  x AS (
    SELECT zi, crm_route_id,
           coalesce(sum(n) FILTER (WHERE o_de < ord_b AND o_spre > ord_b), 0) AS tranzit,
           coalesce(sum(n) FILTER (WHERE o_de = ord_b), 0) AS urca
    FROM (SELECT * FROM mob UNION ALL SELECT * FROM ext) u
    GROUP BY 1, 2
  ),
  z AS (
    SELECT z.zi, z.crm_route_id, 1 AS n,
           greatest(20 - coalesce(x.tranzit, 0), 0) AS libere, coalesce(x.urca, 0) AS urca, z.la_plecare
    FROM zile z LEFT JOIN x USING (zi, crm_route_id)
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
      SELECT jsonb_agg(jsonb_build_object('r', crm_route_id::text, 'd', zi, 'n', n, 'libere', round(libere, 1), 'urca', round(urca, 1),
                                          'la_plecare', la_plecare) ORDER BY zi, crm_route_id)
      FROM z), '[]')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.get_tiki_balti(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tiki_balti(date, date) TO service_role;
