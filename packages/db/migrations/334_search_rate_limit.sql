-- 334: limită de căutări per sursă (anti-scraper)
--
-- De ce: din 02.09.2026 un script (UA «X11; Linux … Chrome/126», ip_hash
-- b18ebcb8ac3037e1) descarcă zilnic la ~05:45 orarul de mâine: 178 de căutări în
-- 78 s, 89 de localități × 2 direcții. Același actor ca pe 14.08 și 24.08 (migr. 282).
-- Decizia lui Ion 09.09: peste 10 căutări în 10 minute de la aceeași sursă,
-- căutarea întoarce listă goală.
--
-- Site-ul public lucrează cu cheia anon, care are DOAR insert pe search_log
-- (migr. 076). Numărătoarea trece printr-o funcție SECURITY DEFINER care întoarce
-- doar un număr — anon tot nu poate citi rândurile.

CREATE INDEX IF NOT EXISTS idx_search_log_ip_hash_created
  ON search_log (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cautari_recente(p_ip_hash text, p_minute integer DEFAULT 10)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM search_log
  WHERE ip_hash = p_ip_hash
    AND created_at >= now() - make_interval(mins => p_minute);
$$;

COMMENT ON FUNCTION public.cautari_recente(text, integer) IS
  'Câte căutări a făcut sursa (ip_hash) în ultimele p_minute minute. Pentru limita anti-scraper din searchTrips (migr. 334).';

REVOKE ALL ON FUNCTION public.cautari_recente(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.cautari_recente(text, integer) TO anon, authenticated, service_role;
