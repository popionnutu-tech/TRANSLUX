-- 448: Bilete aparat (446) — cheia biletului și recalculul (ION-156, 01.10).
--
-- 1. Aparatul TIKI refolosește numerele de bilet: «31-12-155» e un bilet pe 13.11.2025 (64,88 lei) și altul
--    pe 28.02.2026 (11,52 lei). Cu ticket_no ca cheie, al doilea se arunca drept «dublură» — pe exporturile
--    din 01.10: 555.083 de numere, 555.749 de bilete, 666 pierdute. Biletul = număr + cursă + mașină + șofer + preț
--    (ora nu: același bilet apare în exporturi diferite cu un minut diferență). Aceeași cheie ca ticketKey() din
--    ticketParse.ts. Rândurile existente rămân; reimportul adaugă doar biletele care lipseau.
-- 2. tiki_rebuild_price_map cădea cu «DELETE requires a WHERE clause» (pg_safeupdate) — și din buton, și din script.

ALTER TABLE tiki_tickets
  ADD COLUMN ticket_key text GENERATED ALWAYS AS (
    ticket_no || '|' || route_raw || '|' || coalesce(vehicle, '') || '|' || coalesce(driver_name, '') || '|' || price::text
  ) STORED;

ALTER TABLE tiki_tickets DROP CONSTRAINT tiki_tickets_pkey;
ALTER TABLE tiki_tickets ADD CONSTRAINT tiki_tickets_pkey PRIMARY KEY (ticket_key);
CREATE INDEX tiki_tickets_ticket_no ON tiki_tickets (ticket_no);

CREATE OR REPLACE FUNCTION public.tiki_rebuild_price_map()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_days int; v_keys int;
BEGIN
  DELETE FROM tiki_day_index WHERE true;
  INSERT INTO tiki_day_index (sale_date, modal_price, factor)
  SELECT sale_date, p, 99.75 / p
  FROM (
    SELECT sale_date, mode() WITHIN GROUP (ORDER BY price) AS p
    FROM tiki_tickets
    WHERE from_station = 'Chisinau' AND to_station = 'Balti' AND price > 0
    GROUP BY sale_date
    HAVING count(*) >= 5
  ) x;
  GET DIAGNOSTICS v_days = ROW_COUNT;

  DELETE FROM tiki_price_pair_map WHERE true;
  WITH dfac AS (
    SELECT d.sale_date,
           coalesce(
             (SELECT i.factor FROM tiki_day_index i WHERE i.sale_date <= d.sale_date ORDER BY i.sale_date DESC LIMIT 1),
             (SELECT i.factor FROM tiki_day_index i WHERE i.sale_date > d.sale_date ORDER BY i.sale_date ASC LIMIT 1),
             1) AS factor
    FROM (SELECT DISTINCT sale_date FROM tiki_tickets WHERE pair_source = 'statii') d
  ),
  src AS (
    SELECT t.route_name, t.pair, round(t.price * f.factor, 2) AS base
    FROM tiki_tickets t JOIN dfac f USING (sale_date)
    WHERE t.pair_source = 'statii' AND t.pair IS NOT NULL AND t.price > 0
  )
  INSERT INTO tiki_price_pair_map (route_key, base_price, pair, n)
  SELECT route_name, base, pair, count(*) FROM src GROUP BY route_name, base, pair
  UNION ALL
  SELECT '*', base, pair, count(*) FROM src GROUP BY base, pair;
  GET DIAGNOSTICS v_keys = ROW_COUNT;

  RETURN jsonb_build_object('zile_indice', v_days, 'chei', v_keys);
END $function$;

REVOKE EXECUTE ON FUNCTION public.tiki_rebuild_price_map() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiki_rebuild_price_map() TO service_role;

-- 3. Pe 555.749 de bilete tabela preț → pereche durează 6–24 s, peste limita de 8 s a API-ului (service_role):
--    recalculul cădea cu «statement timeout». Limita se ridică doar pe funcțiile de recalcul (verificat prin RPC: 22,8 s, trece).
ALTER FUNCTION public.tiki_rebuild_price_map() SET statement_timeout = '120s';
ALTER FUNCTION public.tiki_deduce_pairs(date, date) SET statement_timeout = '120s';
ALTER FUNCTION public.tiki_refresh_agg(date, date) SET statement_timeout = '120s';
