-- 449: Bilete aparat — «Tipuri bilet & direcții» din totaluri zilnice, istoricul importurilor fără repetări (ION-156, 01.10).
--
-- 1. get_tiki_pairs citea toate biletele: pe 2025-01-01 – 2026-09-30 (555.749 de bilete) trecea de limita de 8 s a API-ului
--    și vederea rămânea goală. Acum citește tiki_daily_pair, ținută de tiki_refresh_agg ca tiki_daily_trip.
-- 2. Istoricul: aceleași fișiere importate de 2–3 ori (01.10, înainte și după cheia din 448) apăreau de 2–3 ori.
--    Rămâne un rând pe fișier (cel mai vechi), biletele trec pe el, «bilete noi» se adună.

CREATE TABLE IF NOT EXISTS tiki_daily_pair (
  sale_date    date NOT NULL,
  route_name   text NOT NULL,
  driver_name  text NOT NULL DEFAULT '',
  pair         text NOT NULL,                 -- 'Nedeterminat' când nu se știe
  direction    text NOT NULL,
  pair_source  text NOT NULL,
  tickets      integer NOT NULL,
  lei          numeric(12,2) NOT NULL,
  PRIMARY KEY (sale_date, route_name, driver_name, pair, direction, pair_source)
);
ALTER TABLE tiki_daily_pair ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE tiki_daily_pair FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE tiki_daily_pair TO service_role;

CREATE OR REPLACE FUNCTION public.tiki_refresh_agg(p_from date, p_to date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '120s'
AS $function$
DECLARE v_n int;
BEGIN
  DELETE FROM tiki_daily_trip WHERE sale_date BETWEEN p_from AND p_to;
  INSERT INTO tiki_daily_trip
  SELECT sale_date, route_name, coalesce(route_time, ''), direction, coalesce(driver_name, ''), coalesce(vehicle, ''),
         is_anulare, count(*), sum(price),
         count(*) FILTER (WHERE payment ILIKE 'card%'),
         count(*) FILTER (WHERE pair_source = 'dedus_pret'),
         count(*) FILTER (WHERE pair_source = 'nedeterminat')
  FROM tiki_tickets
  WHERE sale_date BETWEEN p_from AND p_to
  GROUP BY 1, 2, 3, 4, 5, 6, 7;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  DELETE FROM tiki_daily_pair WHERE sale_date BETWEEN p_from AND p_to;
  INSERT INTO tiki_daily_pair
  SELECT sale_date, route_name, coalesce(driver_name, ''), coalesce(pair, 'Nedeterminat'), direction, pair_source,
         count(*), sum(price)
  FROM tiki_tickets
  WHERE sale_date BETWEEN p_from AND p_to
  GROUP BY 1, 2, 3, 4, 5, 6;

  RETURN v_n;
END $function$;

CREATE OR REPLACE FUNCTION public.get_tiki_pairs(p_from date, p_to date, p_route text DEFAULT NULL, p_driver text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'pair', pair, 'tickets', tickets, 'lei', lei, 'tur', tur, 'retur', retur, 'fara_sens', fara_sens,
    'statii', statii, 'dedus', dedus
  ) ORDER BY tickets DESC), '[]')
  FROM (
    SELECT pair, sum(tickets) tickets, sum(lei) lei,
           coalesce(sum(tickets) FILTER (WHERE direction = 'tur'), 0) tur,
           coalesce(sum(tickets) FILTER (WHERE direction = 'retur'), 0) retur,
           coalesce(sum(tickets) FILTER (WHERE direction = 'necunoscut'), 0) fara_sens,
           coalesce(sum(tickets) FILTER (WHERE pair_source = 'statii'), 0) statii,
           coalesce(sum(tickets) FILTER (WHERE pair_source = 'dedus_pret'), 0) dedus
    FROM tiki_daily_pair
    WHERE sale_date BETWEEN p_from AND p_to
      AND (p_route IS NULL OR route_name = p_route)
      AND (p_driver IS NULL OR driver_name = p_driver)
    GROUP BY 1
  ) z;
$function$;

REVOKE EXECUTE ON FUNCTION public.tiki_refresh_agg(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiki_refresh_agg(date, date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_tiki_pairs(date, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tiki_pairs(date, date, text, text) TO service_role;

-- Istoricul: un rând pe fișier. Indexul pe import_batch_id ține mutarea și ON DELETE SET NULL departe de
-- parcurgerea întregii tabele (fără el, 94 de bilete mutate = 47 s). Pe 01.10 s-a aplicat pas cu pas
-- (18→5, 19→6, 20→7: 666 de bilete), ca tranzacțiile mici să nu expire.
CREATE INDEX IF NOT EXISTS tiki_tickets_batch ON tiki_tickets (import_batch_id);

WITH keep AS (SELECT file_name, min(id) id FROM tiki_import_batches GROUP BY 1),
dup AS (SELECT b.id, k.id keep_id FROM tiki_import_batches b JOIN keep k USING (file_name) WHERE b.id <> k.id)
UPDATE tiki_tickets t SET import_batch_id = d.keep_id FROM dup d WHERE t.import_batch_id = d.id;

WITH keep AS (SELECT file_name, min(id) id FROM tiki_import_batches GROUP BY 1),
s AS (SELECT file_name, sum(rows_inserted) ins, max(rows_sent) sent FROM tiki_import_batches GROUP BY 1)
UPDATE tiki_import_batches b SET rows_inserted = s.ins, rows_sent = s.sent
FROM keep k JOIN s USING (file_name) WHERE b.id = k.id;

DELETE FROM tiki_import_batches b
WHERE b.id <> (SELECT min(id) FROM tiki_import_batches x WHERE x.file_name = b.file_name);
