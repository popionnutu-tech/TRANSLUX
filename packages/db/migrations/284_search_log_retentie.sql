-- 283: search_log nu mai crește la nesfârșit
--
-- De ce acum: migrația 282 a adăugat ip_hash și user_agent, iar rândul a crescut
-- de la 72 la ~201 baiți. Creșterea trece de la ~42 MB/an la ~111 MB/an, iar o zi
-- de scraping (150 căutări/minut) scrie 43 MB într-o singură zi.
--
-- 180 de zile: analiza de pe /analytics citește cel mult 30 de zile, deci rămâne
-- un tampon de șase ori mai mare decât fereastra folosită.

SELECT cron.schedule(
  'search-log-retentie',
  '15 3 * * *',
  $$DELETE FROM search_log WHERE created_at < now() - interval '180 days'$$
);
