-- 356: Obiectele noi din schema public nu mai pleacă cu drepturi pentru anon
--
-- Problema. Baza avea ALTER DEFAULT PRIVILEGES IN SCHEMA public care dădea automat,
-- lui anon și authenticated, pe ORICE obiect nou: tabele și vederi arwdDxtm (citire
-- plus scriere completă), funcții EXECUTE, secvențe rwU. Adică fiecare migrație pleca
-- cu obiecte deschise, iar securitatea depindea de faptul că autorul și-a amintit să
-- scrie REVOKE. Uitat deja de mai multe ori: migr. 244 reparat în 289, migr. 341 în
-- 342, modulul LDE în 313. De fiecare dată prins din întâmplare.
--
-- Regula era pusă de DOI grantori, postgres și supabase_admin. Aici se închide doar
-- cea a lui postgres: rolul din care rulează migrațiile nu e membru în supabase_admin
-- și primește «permission denied to change default privileges».
--
-- În practică asta acoperă tot ce ne aparține. Toate cele 183 de tabele, 38 de vederi
-- și 52 de secvențe din public sunt deținute de postgres. Singurele obiecte create
-- vreodată de supabase_admin sunt 219 funcții, toate din extensiile btree_gist și
-- pg_trgm, niciuna SECURITY DEFINER.
--
-- NU se atinge niciun obiect existent. ALTER DEFAULT PRIVILEGES afectează exclusiv ce
-- se creează de acum înainte. Verificat înainte și după: citirea anon pe crm_routes și
-- localities, INSERT anon pe page_views, search_log și call_clicks, EXECUTE anon pe
-- cautari_recente, cele 47 de secvențe cu USAGE pentru anon — toate neschimbate.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- ATENȚIE, LIMITĂ REALĂ: pentru FUNCȚII asta NU e suficient și nu poate fi făcut
-- suficient. PostgreSQL adaugă întotdeauna implicitul din acldefault(), care dă
-- EXECUTE către PUBLIC, iar anon e membru în PUBLIC. Verificat pe viu: după migrația
-- asta, o funcție nouă creată în public primește tot «=X/postgres» și anon o poate
-- executa. Testat și izolat, într-o schemă goală, inclusiv cu REVOKE ... FROM PUBLIC
-- în default privileges — implicitul revine oricum. Deci:
--
--   ORICE migrație care creează o funcție în public TREBUIE să scrie ea însăși
--     REVOKE EXECUTE ON FUNCTION public.<nume>(<semnătura>) FROM PUBLIC, anon, authenticated;
--
-- Tabelele și secvențele sunt însă efectiv închise de aici înainte. Verificat pe viu
-- cu obiecte de probă, apoi șterse: tabel nou — SELECT, INSERT și DELETE pentru anon
-- și authenticated toate false; secvență nouă — USAGE pentru anon false; service_role
-- și postgres neatinse.
--
-- Două cazuri care de acum cer GRANT scris de mână:
--   * tabel în care scrie site-ul public are nevoie și de USAGE pe secvența cheii;
--   * funcție chemată prin supabase.rpc() cu cheia anon are nevoie de EXECUTE explicit.

-- Înapoi, dacă e nevoie:
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON TABLES TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON SEQUENCES TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
