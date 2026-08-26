-- 282: sursa căutării în search_log
--
-- De ce: pe 14.08.2026 și 24.08.2026 search_log a primit mii de rânduri într-o oră
-- (perechi × date, în ordinea listei de localități) — un script care descarcă orarul.
-- Tabela avea doar rută, dată și oră, deci autorul nu putea fi identificat: logurile
-- Supabase văd doar IP-urile serverelor Vercel, iar logurile Vercel se șterg în 3 zile.
--
-- ip_hash = SHA-256(sare + IP), nu IP-ul. Distinge sursele între ele fără să
-- păstreze adresa. user_agent rămâne întreg — e amprenta clientului.

ALTER TABLE search_log
  ADD COLUMN IF NOT EXISTS ip_hash    text,
  ADD COLUMN IF NOT EXISTS user_agent text;

COMMENT ON COLUMN search_log.ip_hash IS
  'SHA-256(IP_HASH_SALT + IP client), primele 16 caractere. Nu conține adresa.';
COMMENT ON COLUMN search_log.user_agent IS
  'User-agent brut al clientului, trunchiat la 200 caractere.';
