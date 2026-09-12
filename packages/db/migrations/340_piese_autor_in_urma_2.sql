-- 340: Autorul în urmă — tranșa a doua (mutările).
--
-- Continuarea migr. 339. Aceleași două argumente opționale, `p_admin` și `p_actor`, scrise în coloanele pe
-- care le citește jurnalul (migr. 338). Corpul funcțiilor rămâne NEATINS.
--
-- Mutările erau cazul cel mai vizibil din tot jurnalul: documentul 417, cel din incidentul de la Briceni,
-- apărea drept „Mutare #417 · creat" cu autor necunoscut, deși fusese trimis de un om identificabil.
--
-- Transformarea se face pe definițiile CURENTE din bază, nu pe corpuri rescrise de mână. Patru funcții de
-- câte o sută de linii, copiate manual ca să schimbi două rânduri în fiecare, e felul în care se strecoară
-- o diferență pe care n-o vede nimeni. Aici se schimbă exact antetul și rândul de audit, verificat.

DO $mig$
DECLARE r record; def text; sig text; n int;
BEGIN
  FOR r IN
    SELECT oid, proname, pg_get_functiondef(oid) AS d,
           pg_get_function_identity_arguments(oid) AS args
      FROM pg_proc
     WHERE proname IN ('piese_transfer_send','piese_transfer_receive',
                       'piese_transfer_cancel','piese_transfer_receive_to_vehicle')
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

REVOKE ALL ON FUNCTION piese_transfer_send(bigint, bigint, jsonb, bigint, bigint, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_transfer_send(bigint, bigint, jsonb, bigint, bigint, bigint, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION piese_transfer_receive(bigint, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_transfer_receive(bigint, bigint, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION piese_transfer_cancel(bigint, bigint, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_transfer_cancel(bigint, bigint, bigint, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION piese_transfer_receive_to_vehicle(bigint, bigint, bigint, bigint, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_transfer_receive_to_vehicle(bigint, bigint, bigint, bigint, bigint, uuid, text) TO service_role;
