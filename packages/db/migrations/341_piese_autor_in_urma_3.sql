-- 341: Autorul în urmă — tranșa a treia și ultima (recepția, corectarea ei, inventarierea).
--
-- Aceeași transformare ca la migr. 340. Cu asta, toate cele zece funcții care își scriau singure urma prin
-- `user_id` — coloana veche pentru utilizatorii Telegram, pe care aplicația o trimite mereu NULL — scriu
-- acum autorul real. Jurnalul nu mai are rânduri anonime pentru fapte noi.

-- SE APLICĂ O SINGURĂ DATĂ. Spre deosebire de restul migrațiilor din modul, care sînt `CREATE OR REPLACE`
-- idempotente, blocul ăsta transformă ce găsește: la a doua rulare ar adăuga încă o pereche de argumente și
-- ar cădea cu „parameter name used more than once". Eșec zgomotos, deci sigur — dar de știut.
DO $mig$
DECLARE r record; def text; sig text; n int;
BEGIN
  FOR r IN
    SELECT oid, proname, pg_get_functiondef(oid) AS d,
           pg_get_function_identity_arguments(oid) AS args
      FROM pg_proc
     WHERE proname IN ('piese_create_receipt','piese_replace_receipt','piese_inventory_count')
       AND pronamespace = 'public'::regnamespace
  LOOP
    def := r.d;

    -- (1) antetul: `regexp_replace` fără flagul `g` atinge DOAR prima potrivire, adică sfârșitul listei de
    --     argumente — nu vreun `) RETURNS` care ar apărea în corp.
    def := regexp_replace(def, E'\\)\n RETURNS',
                          ', p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL)' || E'\n RETURNS');

    -- (2) rândul de urmă: aceleași valori, plus autorul. Funcțiile scriu cu spații diferite după virgulă,
    --     de aceea se încearcă ambele forme.
    def := replace(def,
      'INSERT INTO piese_audit_log(user_id,action,entity,entity_id,detail) VALUES(p_user,',
      'INSERT INTO piese_audit_log(user_id,admin_id,actor_label,action,entity,entity_id,detail) VALUES(p_user,p_admin,p_actor,');
    def := replace(def,
      'INSERT INTO piese_audit_log(user_id, action, entity, entity_id, detail)',
      'INSERT INTO piese_audit_log(user_id, admin_id, actor_label, action, entity, entity_id, detail)');
    def := replace(def, 'VALUES(p_user, ''', 'VALUES(p_user, p_admin, p_actor, ''');

    -- Exact două apariții: una în antet, una în rândul de jurnal. Mai puține ar însemna că textul nu s-a
    -- potrivit și că am fi recreat funcția fără să schimbăm nimic — tăcut.
    n := (length(def) - length(replace(def, 'p_admin', ''))) / length('p_admin');
    IF n < 2 THEN
      RAISE EXCEPTION 'Transformare eșuată pentru % (doar % apariții)', r.proname, n;
    END IF;

    -- Vechea semnătură dispare: altfel ar rămâne ca suprasarcină, cu grantul implicit dat de
    -- `ALTER DEFAULT PRIVILEGES` lui anon/authenticated.
    sig := 'public.' || quote_ident(r.proname) || '(' || r.args || ')';
    EXECUTE def;
    EXECUTE 'DROP FUNCTION ' || sig;
  END LOOP;
END $mig$;
