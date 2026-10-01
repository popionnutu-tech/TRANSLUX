-- 461: Bilete aparat — triggerele pe Numărare nu mai pot bloca salvarea din GO (ION-159 / ION-167, 01.10).
--
-- Triggerele din 452 scriau direct în tiki_refresh_queue (PK luna) și count_refresh_queue (PK zi, rută) cu ON CONFLICT.
-- tiki_refacere_pas șterge rândul din coadă la începutul unei tranzacții care ține ~70 s (06:30 și 08:00, după import);
-- o inserție ON CONFLICT pe aceeași cheie NU dă eroare, ci AȘTEAPTĂ să se termine tranzacția aceea — deci salvarea unei
-- sesiuni în GO putea atârna până la ~70 s sau cădea la limita de 8 s, iar EXCEPTION WHEN OTHERS nu prinde așteptarea
-- (senior-backend, ION-167 runda 3). Acum triggerele scriu într-un jurnal fără nicio cheie unică (nicio așteptare), iar
-- tiki_refacere_pas mută jurnalul în cozi la început.

CREATE TABLE IF NOT EXISTS tiki_refresh_log (
  luna          date,
  zi            date,
  crm_route_id  integer,
  pus_la        timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE tiki_refresh_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE tiki_refresh_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE tiki_refresh_log TO service_role;

CREATE OR REPLACE FUNCTION public.count_enqueue_session()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      INSERT INTO tiki_refresh_log (luna, zi, crm_route_id)
      VALUES (date_trunc('month', OLD.assignment_date)::date, OLD.assignment_date, OLD.crm_route_id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      INSERT INTO tiki_refresh_log (luna, zi, crm_route_id) VALUES (NULL, NEW.assignment_date, NEW.crm_route_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.count_enqueue_entry()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    INSERT INTO tiki_refresh_log (luna, zi, crm_route_id)
    SELECT NULL, s.assignment_date, s.crm_route_id FROM counting_sessions s
    WHERE s.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.session_id ELSE NEW.session_id END;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NULL;
END $function$;

-- tiki_refacere_pas: întâi jurnalul → cozi (în aceeași tranzacție cu lacătul; nimeni altcineva nu scrie în cozi cu așteptare)
CREATE OR REPLACE FUNCTION public.tiki_refacere_pas()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '120s'
AS $function$
DECLARE v_luna date; v_attr jsonb; v_rows int; v_zile int := 0; r record; v_pana timestamptz := clock_timestamp();
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('tiki_refacere')) THEN
    RETURN jsonb_build_object('ocupat', true);
  END IF;

  INSERT INTO tiki_refresh_queue (luna, motiv)
  SELECT DISTINCT luna, 'jurnal' FROM tiki_refresh_log WHERE luna IS NOT NULL AND pus_la <= v_pana
  ON CONFLICT DO NOTHING;
  INSERT INTO count_refresh_queue (zi, crm_route_id)
  SELECT DISTINCT zi, crm_route_id FROM tiki_refresh_log WHERE zi IS NOT NULL AND crm_route_id IS NOT NULL AND pus_la <= v_pana
  ON CONFLICT DO NOTHING;
  DELETE FROM tiki_refresh_log WHERE pus_la <= v_pana;

  DELETE FROM tiki_refresh_queue
   WHERE luna = (SELECT luna FROM tiki_refresh_queue ORDER BY luna DESC LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING luna INTO v_luna;
  IF v_luna IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM tiki_route_stops) OR v_luna >= date_trunc('month', current_date - 40) THEN
      PERFORM tiki_rebuild_route_stops();
    END IF;
    v_attr := tiki_attr_month(v_luna);
    v_rows := tiki_aggr_month(v_luna);
    INSERT INTO count_refresh_queue (zi, crm_route_id)
    SELECT DISTINCT s.assignment_date, s.crm_route_id FROM counting_sessions s
    WHERE s.assignment_date BETWEEN v_luna AND (v_luna + interval '1 month - 1 day')::date
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('luna', v_luna, 'atribuire', v_attr, 'plecari', v_rows,
                              'ramase', (SELECT count(*) FROM tiki_refresh_queue));
  END IF;

  FOR r IN DELETE FROM count_refresh_queue
            WHERE (zi, crm_route_id) IN (SELECT zi, crm_route_id FROM count_refresh_queue ORDER BY pus_la LIMIT 60
                                         FOR UPDATE SKIP LOCKED)
           RETURNING zi, crm_route_id LOOP
    PERFORM count_aggr_days(r.zi, r.zi, r.crm_route_id);
    v_zile := v_zile + 1;
  END LOOP;
  RETURN jsonb_build_object('numarare_zile', v_zile, 'ramase', (SELECT count(*) FROM count_refresh_queue));
END $function$;

REVOKE EXECUTE ON FUNCTION public.tiki_refacere_pas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiki_refacere_pas() TO service_role;
