-- 355: Vederile publice nu mai pot fi scrise cu cheia anon
--
-- Problema. public_drivers_view și public_vehicles_view sunt deținute de postgres
-- și au security_invoker oprit, deci rulează cu drepturile proprietarului și ocolesc
-- RLS-ul de pe drivers și vehicles. Tabelele de dedesubt sunt corect închise (zero
-- drepturi pentru anon, RLS pornit, zero politici), dar vederile aveau pentru anon
-- și authenticated INSERT, UPDATE și DELETE. Fiind vederi simple, PostgreSQL le face
-- automat actualizabile, deci lacătul de pe tabele nu ținea.
--
-- Drepturile nu au fost acordate de nimeni explicit. Vin din ALTER DEFAULT PRIVILEGES
-- IN SCHEMA public, pus de doi grantori (postgres și supabase_admin), care dă lui anon
-- și authenticated arwdDxtm pe orice obiect nou. Regula implicită NU se schimbă aici;
-- asta e o decizie separată.
--
-- v_interurban_v2_km_pairs are security_invoker pornit, deci scrierea prin ea se
-- lovea oricum de RLS. O includem ca să nu rămână o excepție tăcută.
--
-- SELECT rămâne neatins pe toate trei. Site-ul public (apps/web, cheia anon, doar pe
-- server) citește din primele două în actions.ts, inclusiv coloana phone, folosită
-- pentru butonul de apel către șofer din rezultatele de rută.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.public_drivers_view,
     public.public_vehicles_view,
     public.v_interurban_v2_km_pairs
  FROM anon, authenticated;

-- Înapoi, dacă e nevoie:
--   GRANT INSERT, UPDATE, DELETE ON public.public_drivers_view,
--     public.public_vehicles_view, public.v_interurban_v2_km_pairs
--     TO anon, authenticated;
