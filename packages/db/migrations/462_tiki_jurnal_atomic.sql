-- 462: corecturi la 461 (critic Codex, ION-167 runda 3, 01.10).
-- 1) Jurnalul se mută în cozi ATOMIC: un singur DELETE … RETURNING alimentează ambele cozi (o singură imagine a datelor).
--    În 461 citirea (două INSERT) și ștergerea erau instrucțiuni separate: un eveniment confirmat între ele era șters
--    fără să fi ajuns în coadă.
-- 2) Triggerul sesiunilor pune în coadă și luna NOUĂ (inserare / mutare între luni), nu doar pe cea veche, și se
--    declanșează și la schimbarea șoferului (driver_id; legarea pe șofer din 457 îl folosește).
-- Doar definiții de funcții / trigger — nimic greu nu rulează la aplicare.

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
      INSERT INTO tiki_refresh_log (luna, zi, crm_route_id)
      VALUES (date_trunc('month', NEW.assignment_date)::date, NEW.assignment_date, NEW.crm_route_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NULL;
END $function$;

CREATE OR REPLACE TRIGGER count_enqueue_session
  AFTER INSERT OR DELETE OR UPDATE OF status, vehicle_id, driver_id, crm_route_id, assignment_date ON public.counting_sessions
  FOR EACH ROW EXECUTE FUNCTION count_enqueue_session();

CREATE OR REPLACE FUNCTION public.tiki_refacere_pas()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '120s'
AS $function$
DECLARE v_luna date; v_attr jsonb; v_rows int; v_zile int := 0; r record;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('tiki_refacere')) THEN
    RETURN jsonb_build_object('ocupat', true);
  END IF;

  WITH ev AS (DELETE FROM tiki_refresh_log RETURNING luna, zi, crm_route_id),
       l AS (INSERT INTO tiki_refresh_queue (luna, motiv)
             SELECT DISTINCT luna, 'jurnal' FROM ev WHERE luna IS NOT NULL
             ON CONFLICT DO NOTHING)
  INSERT INTO count_refresh_queue (zi, crm_route_id)
  SELECT DISTINCT zi, crm_route_id FROM ev WHERE zi IS NOT NULL AND crm_route_id IS NOT NULL
  ON CONFLICT DO NOTHING;

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
