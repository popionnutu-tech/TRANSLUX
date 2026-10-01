-- 454: Bilete aparat — numărul mașinii scris doar din cifre în terminal (ION-159, 01.10).
--
-- Ruta 8 (Criva 12:30 / 20:00): în grafic BXI 819, în terminalul TIKI «819». Potrivirea pe plăcuță eșua, iar regula
-- etichetei a dus biletele pe ruta 6 (după mașina de rezervă BZP 145) → Orarul arăta ruta 8 cu 0 bilete pe 61 de plecări.
-- Acum: un număr TIKI doar din cifre se potrivește pe cifrele plăcuței, dacă în ziua aceea e o singură mașină în grafic
-- cu acele cifre; biletul legat pe mașină păstrează plăcuța din grafic (c.vkey), ca plecările «cu bilete» să se numere.

CREATE OR REPLACE FUNCTION public.tiki_attr_month(p_month date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '120s'
AS $function$
DECLARE v_from date := date_trunc('month', p_month)::date;
        v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
        v_n int;
BEGIN
  DELETE FROM tiki_ticket_attr WHERE luna = v_from;

  DROP TABLE IF EXISTS _t, _c, _r;
  CREATE TEMP TABLE _t ON COMMIT DROP AS
  SELECT t.ticket_key, t.trip_id, t.price, t.is_anulare, t.direction AS label_dir,
         trim(t.route_name || ' ' || coalesce(t.route_time, '')) AS label,
         t.route_time, t.from_station, t.to_station, t.pair,
         CASE WHEN c.trip_date BETWEEN t.sale_date - 60 AND t.sale_date + 1 THEN c.trip_date ELSE t.sale_date END AS zi,
         CASE WHEN c.trip_date BETWEEN t.sale_date - 60 AND t.sale_date + 1 THEN 'cursa' ELSE 'vanzare' END AS zi_sursa,
         tiki_plate_key(coalesce(c.vehicle, t.vehicle)) AS vkey,
         CASE WHEN tiki_stop_norm(t.from_station) = 'chisinau' THEN 'chisinau_nord'
              WHEN tiki_stop_norm(t.to_station) = 'chisinau' THEN 'nord_chisinau'
              WHEN t.direction = 'tur' THEN 'chisinau_nord'
              WHEN t.direction = 'retur' THEN 'nord_chisinau' END AS leg
  FROM tiki_tickets t LEFT JOIN tiki_trips c USING (trip_id)
  WHERE t.sale_date BETWEEN v_from - 1 AND v_to + 62;
  DELETE FROM _t WHERE zi < v_from OR zi > v_to;

  -- candidații din grafic: (zi, mașină) → rută + picior + ora de plecare a piciorului
  CREATE TEMP TABLE _c ON COMMIT DROP AS
  SELECT d.assignment_date AS zi, tiki_plate_key(v.plate_number) AS vkey, d.crm_route_id, 'nord_chisinau'::text AS leg,
         tiki_min(split_part(r.time_nord, ' - ', 1)) AS t0
  FROM daily_assignments d JOIN vehicles v ON v.id = d.vehicle_id JOIN crm_routes r ON r.id = d.crm_route_id
  WHERE d.assignment_date BETWEEN v_from AND v_to AND r.route_type = 'interurban'
  UNION
  SELECT d.assignment_date, tiki_plate_key(v.plate_number), coalesce(d.retur_route_id, d.crm_route_id), 'chisinau_nord',
         tiki_min(split_part(r2.time_chisinau, ' - ', 1))
  FROM daily_assignments d JOIN vehicles v ON v.id = coalesce(d.vehicle_id_retur, d.vehicle_id)
  JOIN crm_routes r2 ON r2.id = coalesce(d.retur_route_id, d.crm_route_id)
  WHERE d.assignment_date BETWEEN v_from AND v_to AND r2.route_type = 'interurban' AND NOT coalesce(r2.retur_disabled, false)
  UNION
  -- mașina sesiunii Numărării (corectată de operator) pe ambele picioare
  SELECT s.assignment_date, tiki_plate_key(v.plate_number), s.crm_route_id, p.leg,
         tiki_min(split_part(CASE WHEN p.leg = 'nord_chisinau' THEN r.time_nord ELSE r.time_chisinau END, ' - ', 1))
  FROM counting_sessions s JOIN vehicles v ON v.id = s.vehicle_id JOIN crm_routes r ON r.id = s.crm_route_id
  CROSS JOIN (VALUES ('nord_chisinau'), ('chisinau_nord')) p(leg)
  WHERE s.assignment_date BETWEEN v_from AND v_to AND r.route_type = 'interurban';

  -- 0) corectura ADMIN pe etichetă × lună
  INSERT INTO tiki_ticket_attr (ticket_key, zi, luna, zi_sursa, trip_id, vkey, label, label_dir, leg, crm_route_id, sursa,
                                lei, is_anulare)
  SELECT t.ticket_key, t.zi, v_from, t.zi_sursa, t.trip_id, t.vkey, t.label, t.label_dir, o.leg, o.crm_route_id, 'override',
         t.price, t.is_anulare
  FROM _t t JOIN tiki_label_override o ON o.label = t.label AND o.label_dir = t.label_dir AND o.luna = v_from;

  -- 1) mașina în grafic, același picior; la două rute, cea mai apropiată oră de plecare de ora etichetei
  INSERT INTO tiki_ticket_attr (ticket_key, zi, luna, zi_sursa, trip_id, vkey, label, label_dir, leg, crm_route_id, sursa,
                                lei, is_anulare)
  SELECT DISTINCT ON (t.ticket_key) t.ticket_key, t.zi, v_from, t.zi_sursa, t.trip_id, c.vkey, t.label, t.label_dir,
         c.leg, c.crm_route_id, 'masina', t.price, t.is_anulare
  FROM _t t JOIN _c c ON c.zi = t.zi AND c.leg = t.leg
   AND (c.vkey = t.vkey
        -- terminalul scrie uneori doar cifrele («819» pentru BXI 819): potrivire pe cifre, dacă e o singură mașină în zi
        OR (t.vkey ~ '^[0-9]+$' AND regexp_replace(c.vkey, '[A-Z]', '', 'g') = t.vkey
            AND (SELECT count(DISTINCT c2.vkey) FROM _c c2 WHERE c2.zi = t.zi
                   AND regexp_replace(c2.vkey, '[A-Z]', '', 'g') = t.vkey) = 1))
  WHERE t.vkey <> '' AND NOT EXISTS (SELECT 1 FROM tiki_ticket_attr a WHERE a.ticket_key = t.ticket_key)
  ORDER BY t.ticket_key,
           coalesce(least(abs(c.t0 - tiki_min(t.route_time)), 1440 - abs(c.t0 - tiki_min(t.route_time))), 9999),
           c.crm_route_id;

  -- 2) regula etichetei: majoritatea biletelor legate pe mașină în aceeași lună; înainte de 04.2026 — din 04.2026 încoace
  CREATE TEMP TABLE _r ON COMMIT DROP AS
  SELECT DISTINCT ON (label, label_dir, leg) label, label_dir, leg, crm_route_id
  FROM (
    SELECT a.label, a.label_dir, a.leg, a.crm_route_id, count(*) n
    FROM tiki_ticket_attr a
    WHERE a.sursa = 'masina' AND NOT a.is_anulare
      AND CASE WHEN v_from >= DATE '2026-04-01' THEN a.luna = v_from ELSE a.luna >= DATE '2026-04-01' END
    GROUP BY 1, 2, 3, 4
  ) x ORDER BY label, label_dir, leg, n DESC, crm_route_id;

  INSERT INTO tiki_ticket_attr (ticket_key, zi, luna, zi_sursa, trip_id, vkey, label, label_dir, leg, crm_route_id, sursa,
                                lei, is_anulare)
  SELECT t.ticket_key, t.zi, v_from, t.zi_sursa, t.trip_id, t.vkey, t.label, t.label_dir, r.leg, r.crm_route_id,
         CASE WHEN v_from >= DATE '2026-04-01' THEN 'eticheta_luna' ELSE 'eticheta_2026' END, t.price, t.is_anulare
  FROM _t t JOIN _r r ON r.label = t.label AND r.label_dir = t.label_dir AND r.leg = t.leg
  WHERE NOT t.is_anulare AND NOT EXISTS (SELECT 1 FROM tiki_ticket_attr a WHERE a.ticket_key = t.ticket_key);

  -- 3) restul: Anulare (vânzări fără cursă) și nelegate
  INSERT INTO tiki_ticket_attr (ticket_key, zi, luna, zi_sursa, trip_id, vkey, label, label_dir, leg, crm_route_id, sursa,
                                lei, is_anulare)
  SELECT t.ticket_key, t.zi, v_from, t.zi_sursa, t.trip_id, t.vkey, t.label, t.label_dir, t.leg, NULL,
         CASE WHEN t.is_anulare THEN 'anulare' ELSE 'nelegat' END, t.price, t.is_anulare
  FROM _t t WHERE NOT EXISTS (SELECT 1 FROM tiki_ticket_attr a WHERE a.ticket_key = t.ticket_key);

  -- km-ii biletului pe ruta atribuită (stații reale sau perechea dedusă din preț, orientată după picior)
  UPDATE tiki_ticket_attr a
     SET km_from = tiki_stop_km(a.crm_route_id, a.leg, x.f), km_to = tiki_stop_km(a.crm_route_id, a.leg, x.d)
    FROM (
      SELECT t.ticket_key,
             coalesce(t.from_station, CASE WHEN t.leg = 'chisinau_nord' AND split_part(t.pair, ' - ', 1) ILIKE 'chisinau%'
                                            THEN split_part(t.pair, ' - ', 1) ELSE split_part(t.pair, ' - ', 2) END) AS f,
             coalesce(t.to_station, CASE WHEN t.leg = 'chisinau_nord' AND split_part(t.pair, ' - ', 1) ILIKE 'chisinau%'
                                          THEN split_part(t.pair, ' - ', 2) ELSE split_part(t.pair, ' - ', 1) END) AS d
      FROM _t t
    ) x
   WHERE a.ticket_key = x.ticket_key AND a.luna = v_from AND a.crm_route_id IS NOT NULL;

  SELECT count(*) INTO v_n FROM tiki_ticket_attr WHERE luna = v_from;
  RETURN (SELECT jsonb_object_agg(sursa, n) || jsonb_build_object('total', v_n)
          FROM (SELECT sursa, count(*) n FROM tiki_ticket_attr WHERE luna = v_from GROUP BY 1) s);
END $function$;

REVOKE EXECUTE ON FUNCTION public.tiki_attr_month(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiki_attr_month(date) TO service_role;

-- refacerea tuturor lunilor cu noua potrivire
INSERT INTO tiki_refresh_queue (luna, motiv)
SELECT DISTINCT date_trunc('month', trip_date)::date, 'migr. 454' FROM tiki_trips WHERE trip_date >= DATE '2024-12-01'
ON CONFLICT DO NOTHING;
