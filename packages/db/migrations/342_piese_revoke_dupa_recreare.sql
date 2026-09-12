-- 342: REVOKE după recrearea funcțiilor din migr. 341.
--
-- Greșeala mea: migr. 341 a făcut DROP + CREATE pe trei funcții, iar `ALTER DEFAULT PRIVILEGES` al
-- proiectului dă automat EXECUTE lui `anon` și `authenticated` pe orice funcție NOUĂ din `public`. Am pus
-- REVOKE la tranșa cu mutările și l-am uitat la asta. Verificat după aplicare: cele trei chiar aveau
-- `anon=X` și `authenticated=X` — exact gaura pe care migr. 289 a închis-o pentru restul modulului.
--
-- Se face o trecere peste TOT modulul, nu doar peste cele trei: dacă mecanismul a scăpat o dată, merită
-- verificat că n-a mai scăpat și altundeva. Bucla e idempotentă — pe funcțiile deja curate nu schimbă nimic.
DO $rev$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname LIKE 'piese\_%'
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || r.sig || ' FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.sig || ' TO service_role';
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Funcții curățate: %', n;

  -- Se AFIRMĂ rezultatul, nu se raportează. Un `NOTICE` printr-un POST la API e practic invizibil, iar
  -- criteriul de succes al unei migrații de securitate nu are voie să depindă de cine se uită în log.
  SELECT count(*) INTO n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'piese\_%'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF n > 0 THEN
    RAISE EXCEPTION 'Au rămas % funcții piese_* executabile de anon/authenticated', n;
  END IF;
END $rev$;
