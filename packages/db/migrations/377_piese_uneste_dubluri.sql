-- 377: Unirea propriu-zisă a dublurilor.
--
-- Piesa păstrată primește de la celelalte ce ea n-are: codurile de bare (o piesă POATE avea mai multe —
-- aceeași piesă vine de la furnizori diferiți, cu ambalaje diferite, migr. 312) și câmpurile goale.
-- Celelalte se dezactivează, cu `merged_into` scris, ca o căutare veche să poată spune unde au plecat.
--
-- GĂRZILE sunt miezul, nu o formalitate. Mișcările de stoc sunt append-only și NU se pot muta între piese
-- (trg_pmov_immutable). Deci o piesă cu istoric nu poate fi desființată: istoricul ei ar rămâne agățat de
-- un rând invizibil. Azi situația e prielnică — în niciun grup nu există istoric pe mai multe piese — dar
-- garda trebuie să țină și peste un an, când nu va mai fi așa.
CREATE OR REPLACE FUNCTION piese_uneste(
  p_keep bigint, p_drop bigint[], p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE d bigint; v_nume text; v_coduri int := 0; v_total_coduri int := 0; v_sterse int := 0; v_motiv text;
BEGIN
  IF p_keep IS NULL OR COALESCE(array_length(p_drop, 1), 0) = 0 THEN RAISE EXCEPTION 'NIMIC_DE_UNIT'; END IF;
  IF p_keep = ANY (p_drop) THEN RAISE EXCEPTION 'KEEP_IN_DROP'; END IF;

  SELECT COALESCE(NULLIF(btrim(name_ro), ''), name_long) INTO v_nume
    FROM piese_parts WHERE id = p_keep AND active AND merged_into IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KEEP_INVALID'; END IF;

  FOREACH d IN ARRAY p_drop LOOP
    PERFORM 1 FROM piese_parts WHERE id = d AND active AND merged_into IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DROP_INVALID:%', d; END IF;

    -- Motivele pentru care o piesă NU poate fi desființată. Mesajul spune CARE e, ca omul să știe ce are
    -- de făcut — nu doar că nu se poate.
    v_motiv := NULL;
    IF EXISTS (SELECT 1 FROM piese_stock_movements m WHERE m.part_id = d) THEN v_motiv := 'are mișcări de stoc';
    ELSIF EXISTS (SELECT 1 FROM piese_stock_document_lines l WHERE l.part_id = d) THEN v_motiv := 'apare pe documente';
    ELSIF EXISTS (SELECT 1 FROM piese_parts o WHERE o.origin_part_id = d) THEN v_motiv := 'e originea unei piese б/у';
    ELSIF EXISTS (SELECT 1 FROM piese_inventory_session_lines s WHERE s.part_id = d) THEN v_motiv := 'e într-o numărătoare deschisă';
    END IF;
    IF v_motiv IS NOT NULL THEN RAISE EXCEPTION 'NU_SE_POATE:%:%', d, v_motiv; END IF;

    -- Codurile trec la piesa păstrată. `is_primary = false`: principalul rămâne cel al piesei păstrate
    -- (indicele unic parțial permite un singur principal per piesă).
    UPDATE piese_part_barcodes SET part_id = p_keep, is_primary = false WHERE part_id = d;
    GET DIAGNOSTICS v_coduri = ROW_COUNT;
    v_total_coduri := v_total_coduri + v_coduri;

    -- Câmpurile pe care piesa păstrată le are goale se completează de la cea desființată. Nimic nu se
    -- SUPRASCRIE: ce a ales omul să păstreze rămâne cum e.
    UPDATE piese_parts k SET
        oem_code     = COALESCE(NULLIF(btrim(k.oem_code), ''),     NULLIF(btrim(s.oem_code), '')),
        manufacturer = COALESCE(NULLIF(btrim(k.manufacturer), ''), NULLIF(btrim(s.manufacturer), '')),
        model        = COALESCE(NULLIF(btrim(k.model), ''),        NULLIF(btrim(s.model), '')),
        name_ro      = COALESCE(NULLIF(btrim(k.name_ro), ''),      NULLIF(btrim(s.name_ro), '')),
        article_code = COALESCE(NULLIF(btrim(k.article_code), ''), NULLIF(btrim(s.article_code), ''))
      FROM piese_parts s WHERE k.id = p_keep AND s.id = d;

    UPDATE piese_parts SET active = false, merged_into = p_keep, is_for_sale = false WHERE id = d;
    v_sterse := v_sterse + 1;

    INSERT INTO piese_audit_log(user_id, admin_id, actor_label, action, entity, entity_id, detail)
    VALUES (NULL, p_admin, p_actor, 'MERGE', 'part', d,
            format('Unită cu #%s (%s); %s coduri de bare mutate', p_keep, v_nume, v_coduri));
  END LOOP;

  -- Oglinda codului principal (migr. 312) se reface după mutări.
  UPDATE piese_parts p SET barcode = (SELECT b.barcode FROM piese_part_barcodes b
                                       WHERE b.part_id = p.id ORDER BY b.is_primary DESC, b.id LIMIT 1)
   WHERE p.id = p_keep;

  RETURN jsonb_build_object('pastrata', p_keep, 'desfiintate', v_sterse, 'coduri_mutate', v_total_coduri);
END $$;

REVOKE ALL ON FUNCTION piese_uneste(bigint, bigint[], uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_uneste(bigint, bigint[], uuid, text) TO service_role;
