-- 317: Curățarea nomenclatoarelor de producători și mărci — redenumire care mută piesele, plus ascundere.
--
-- Migrația 312 a adus nomenclatoarele, dar le-a populat din datele existente — deci a preluat și ce era
-- deja scris greșit: „111", „Scoda Octavia 2020", „HIGER NOU". Fără o cale de corecție, greșelile n-au
-- fost eliminate, ci PROMOVATE: dintr-un câmp liber au devenit sugestii oficiale, propuse tuturor.
--
-- Un catalog în care se poate DOAR adăuga se murdărește la fiecare tastare greșită. De aceea curățarea nu
-- e un lux, ci partea care face ca cererea lui Eduard („то что вносил уже раз одно выдавать") să
-- funcționeze și peste un an, nu doar în ziua livrării.

-- ── Redenumirea trebuie să miște ȘI piesele ───────────────────────────────────
-- Dacă s-ar redenumi doar rândul din nomenclator, piesele ar rămâne pe ortografia veche, iar filtrul din
-- ecranul „Stoc" (care listează valorile DISTINCTE ale pieselor) ar arăta din nou două intrări pentru
-- același producător — exact starea din care migrația 312 tocmai a ieșit.
--
-- Iar dacă noul nume EXISTĂ deja, operațiunea nu e redenumire, ci CONTOPIRE. Fără ea, „Trw" → „TRW" ar fi
-- lovit indexul unic și n-ar fi existat nicio cale de a uni două variante ale aceluiași nume — adică
-- tocmai defectul de reparat. Se face într-o singură tranzacție: rândul și piesele nu au voie să ajungă
-- desincronizate dacă ceva pică la mijloc.
CREATE OR REPLACE FUNCTION piese_rename_lookup(p_kind text, p_id bigint, p_new text)
RETURNS jsonb LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_old text; v_target text; v_target_id bigint; v_target_active boolean;
        v_moved int := 0; v_merged boolean := false;
BEGIN
  IF p_kind NOT IN ('manufacturer','carModel') THEN RAISE EXCEPTION 'BAD_KIND'; END IF;
  IF p_new IS NULL THEN RAISE EXCEPTION 'EMPTY_NAME'; END IF;
  -- Normalizare ca în aplicație (`String.trim()` taie TOT spațiul Unicode). `btrim` cu un argument taie
  -- doar U+0020, deci „TRW\n" sau „<NBSP>TRW" ar fi trecut ca valori DISTINCTE de „TRW" — exact perechea
  -- de duplicate pe care ecranul o repară.
  p_new := btrim(regexp_replace(p_new, '\s+', ' ', 'g'));
  IF p_new = '' THEN RAISE EXCEPTION 'EMPTY_NAME'; END IF;
  IF length(p_new) > 80 THEN RAISE EXCEPTION 'TOO_LONG'; END IF;

  IF p_kind = 'manufacturer' THEN
    SELECT name INTO v_old FROM piese_manufacturers WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NO_ROW'; END IF;
    SELECT id, name, active INTO v_target_id, v_target, v_target_active FROM piese_manufacturers
     WHERE lower(name) = lower(p_new) AND id <> p_id FOR UPDATE;
    IF FOUND THEN
      -- Contopirea într-o intrare ASCUNSĂ ar muta piesele pe o valoare care nu se mai propune, ștergând
      -- totodată singurul rând vizibil. Se refuză explicit, în loc să se întâmple tăcut.
      IF NOT v_target_active THEN RAISE EXCEPTION 'TARGET_HIDDEN:%', v_target; END IF;
      v_merged := true;
      -- Potrivire INSENSIBILĂ la litere: ținta e găsită tot așa, iar unicitatea din migr. 312 la fel.
      -- Cu potrivire exactă, o piesă scrisă „trw" n-ar fi fost mutată, iar `DELETE`-ul de mai jos i-ar fi
      -- șters singurul rând prin care mai putea fi corectată — valoare orfană, nerecuperabilă din ecran.
      UPDATE piese_parts SET manufacturer = v_target WHERE lower(manufacturer) = lower(v_old);
      GET DIAGNOSTICS v_moved = ROW_COUNT;
      DELETE FROM piese_manufacturers WHERE id = p_id;
    ELSE
      UPDATE piese_manufacturers SET name = p_new WHERE id = p_id;
      UPDATE piese_parts SET manufacturer = p_new WHERE lower(manufacturer) = lower(v_old);
      GET DIAGNOSTICS v_moved = ROW_COUNT;
    END IF;
  ELSE
    SELECT name INTO v_old FROM piese_car_models WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NO_ROW'; END IF;
    SELECT id, name, active INTO v_target_id, v_target, v_target_active FROM piese_car_models
     WHERE lower(name) = lower(p_new) AND id <> p_id FOR UPDATE;
    IF FOUND THEN
      IF NOT v_target_active THEN RAISE EXCEPTION 'TARGET_HIDDEN:%', v_target; END IF;
      v_merged := true;
      UPDATE piese_parts SET model = v_target WHERE lower(model) = lower(v_old);
      GET DIAGNOSTICS v_moved = ROW_COUNT;
      DELETE FROM piese_car_models WHERE id = p_id;
    ELSE
      UPDATE piese_car_models SET name = p_new WHERE id = p_id;
      UPDATE piese_parts SET model = p_new WHERE lower(model) = lower(v_old);
      GET DIAGNOSTICS v_moved = ROW_COUNT;
    END IF;
  END IF;

  -- `moved` se întoarce ca să poată fi arătat omului: e o modificare în masă, iar diferența dintre
  -- „1 piesă" și „300 de piese" trebuie văzută. `target_id` iese ca urma să se poată lega și de intrarea
  -- SUPRAVIEȚUITOARE: altfel istoricul lui „TRW" n-ar spune nimic despre piesele sosite prin contopire,
  -- iar `subject_id` ar arăta spre un rând deja șters.
  RETURN jsonb_build_object('old', v_old, 'new', COALESCE(v_target, p_new),
                            'moved', v_moved, 'merged', v_merged, 'target_id', v_target_id);
END $$;

REVOKE ALL ON FUNCTION piese_rename_lookup(text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_rename_lookup(text, bigint, text) TO service_role;

-- ── Lista pentru ecranul de administrare ──────────────────────────────────────
-- Numărul de piese e ceea ce face decizia posibilă: „111 — 1 piesă" față de „TRW — 11 piese". Fără cifră,
-- nimeni nu poate spune ce e greșeală de tastare și ce e producător real.
--
-- Numărătoarea folosește ACELAȘI predicat ca `UPDATE`-ul de mai sus (insensibil la litere, fără filtru pe
-- `active`): cifra arătată trebuie să fie cifra care se mută. Altfel o intrare afișată „0 piese" ar putea
-- rescrie tăcut rânduri arhivate.
--
-- Numărarea se face printr-o SINGURĂ agregare, nu printr-o subinterogare corelată per intrare. Diferența
-- nu e cosmetică: nomenclatorul crește singur, din text liber, deci costul ar fi fost intrări × piese.
-- Măsurat pe 26 de intrări și 10.523 de piese: 145 ms și 9.647 de blocuri cu forma corelată, față de
-- 2 ms și 372 cu cea de mai jos — iar forma nouă nu mai crește deloc cu numărul de intrări.
CREATE OR REPLACE FUNCTION piese_lookup_admin(p_kind text)
RETURNS TABLE(id bigint, name text, active boolean, parts_count bigint)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.name, m.active, COALESCE(a.n, 0)
    FROM piese_manufacturers m
    LEFT JOIN (SELECT lower(manufacturer) AS k, count(*) AS n
                 FROM piese_parts WHERE manufacturer IS NOT NULL GROUP BY 1) a
      ON a.k = lower(m.name)
   WHERE p_kind = 'manufacturer'
  UNION ALL
  SELECT c.id, c.name, c.active, COALESCE(b.n, 0)
    FROM piese_car_models c
    LEFT JOIN (SELECT lower(model) AS k, count(*) AS n
                 FROM piese_parts WHERE model IS NOT NULL GROUP BY 1) b
      ON b.k = lower(c.name)
   WHERE p_kind = 'carModel'
  ORDER BY 4 DESC, 2;
$$;

REVOKE ALL ON FUNCTION piese_lookup_admin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_lookup_admin(text) TO service_role;

-- Ștergerea NU e oferită: o intrare folosită de piese n-are ce să dispară — s-ar întoarce singură la
-- prima salvare a unei piese care o poartă. Se redenumește (și piesele o urmează) sau se dezactivează
-- (rămâne pe piese, dar nu se mai propune la introducere).
