-- 456: Bilete aparat — pasul de refacere împărțit (ION-159, 01.10).
-- Un pas făcea atribuirea + agregatele + Numărarea lunii întregi și depășea 120 s (07.2026: «canceling statement due
-- to statement timeout», luna rămâne în coadă — tranzacția se anulează). Acum pasul lunii face doar atribuirea și
-- agregatele TIKI; zilele Numărării ale lunii intră în count_refresh_queue și se refac la pașii următori, câte 60.

CREATE OR REPLACE FUNCTION public.tiki_refacere_pas()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '120s'
AS $function$
DECLARE v_luna date; v_attr jsonb; v_rows int; v_zile int := 0; r record;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('tiki_refacere')) THEN
    RETURN jsonb_build_object('ocupat', true);
  END IF;

  DELETE FROM tiki_refresh_queue
   WHERE luna = (SELECT luna FROM tiki_refresh_queue ORDER BY luna DESC LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING luna INTO v_luna;
  IF v_luna IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM tiki_route_stops) OR v_luna >= date_trunc('month', current_date - 40) THEN
      PERFORM tiki_rebuild_route_stops();
    END IF;
    v_attr := tiki_attr_month(v_luna);
    v_rows := tiki_aggr_month(v_luna);
    -- Numărarea lunii are nevoie de atribuirea refăcută: zilele ei intră în coada proprie
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
