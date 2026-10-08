-- 533_tomberon_transactions_by_ids.sql
-- Citirea plăților Tomberon după external_id, pentru tomberon-cashin-pull.mjs (VPS).
--
-- Ion, 08.10.2026: «fă ca terminalul să se descarce de 3 ori pe zi, nu o dată».
-- Scriptul nou trage plățile din baza `cash-in` a casei și trimite prin
-- tomberon_ingest DOAR pe cele care lipsesc (re-trimiterea ar muta synced_at și
-- ar da fals «plăți noi după confirmare» în get_incasare_report). Ca să știe ce
-- lipsește, trebuie să citească tomberon.transactions — schema nu e expusă în API.
--
-- Doar service_role. Funcția nouă e executabilă de PUBLIC implicit, deci REVOKE.

CREATE OR REPLACE FUNCTION public.tomberon_transactions_by_ids(ids text[])
 RETURNS SETOF tomberon.transactions
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'tomberon'
AS $function$
  SELECT * FROM tomberon.transactions WHERE external_id = ANY(ids);
$function$;

REVOKE EXECUTE ON FUNCTION public.tomberon_transactions_by_ids(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomberon_transactions_by_ids(text[]) TO service_role;
