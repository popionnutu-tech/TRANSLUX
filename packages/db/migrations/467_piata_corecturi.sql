-- 467 (aplicată în bază pe 02.10 ca «464_piata_corecturi», prin db-migrate.sh; renumerotată din cauza coliziunii cu ION-166).

-- 464: corecturi la 463 (ION-171, 02.10, după prima rulare pe mai–septembrie 2026):
-- 1) o cursă ANTA cu două opriri «Chișinău» (ex. Lipcani GA – Tiraspol GA trece prin Chișinău GA Nord și Chișinău) intra de
--    două ori pe fiecare pereche — se ia o singură oprire Chișinău și una pentru capăt (cea mai din față) pe cursă;
-- 2) steagul «model_sub_observat» (bilete + ~omiși > piața) are sens doar unde există concurenți (coada / Bălți);
--    pe «trunchi» și «fără Chișinău» piața = bilete prin construcție și steagul apărea mereu.
-- Doar CREATE OR REPLACE pe piata_calc_luna; lunile se recalculează de jobul de noapte (sunt marcate murdare la final).

CREATE OR REPLACE FUNCTION public.piata_calc_luna(p_luna date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '60s'
AS $function$
DECLARE
  v_baza date := (piata_param('luna_baza') #>> '{}')::date;
  v_pond numeric := (piata_param('pondere_imbarcare') #>> '{}')::numeric;
  v_fer  integer := (piata_param('fereastra_ora_min') #>> '{}')::int;
  v_zmin numeric := (piata_param('zile_min') #>> '{}')::numeric;
  v_zmax numeric := (piata_param('zile_max') #>> '{}')::numeric;
  v_tranz numeric := (piata_param('tranzit_balti') #>> '{}')::numeric;
  v_net  numeric := (piata_param('net_factor') #>> '{}')::numeric;
  v_pens numeric := (piata_param('pensie_tara') #>> '{}')::numeric;
  v_r40  text[] := ARRAY(SELECT jsonb_array_elements_text(piata_param('raioane_regula_40')));
  v_trunchi text[] := ARRAY(SELECT jsonb_array_elements_text(piata_param('trunchi')));
  v_zile integer := extract(day FROM (p_luna + interval '1 month - 1 day'))::int;
  v_zile_baza integer := extract(day FROM (v_baza + interval '1 month - 1 day'))::int;
  v_anta text;
  v_n integer;
BEGIN
  SELECT md5(count(*)::text || coalesce(max(imported_at)::text, '')) INTO v_anta FROM anta_courses WHERE source = 'anta';

  -- 1. biletele noastre pe pereche × sens × etichetă (oră), în luna cerută ȘI în luna de bază
  DROP TABLE IF EXISTS _pb;
  CREATE TEMP TABLE _pb ON COMMIT DROP AS
  SELECT a.luna, piata_cheie(split_part(t.pair, ' - ', 1), split_part(t.pair, ' - ', 2)) cheie,
         min(split_part(t.pair, ' - ', 1)) de_la_raw, min(split_part(t.pair, ' - ', 2)) pana_la_raw,
         coalesce(a.leg, CASE WHEN t.direction = 'tur' THEN 'chisinau_nord' WHEN t.direction = 'retur' THEN 'nord_chisinau' END) leg,
         a.label,
         piata_ora(coalesce(min(tr.dep_time), a.label)) ora,
         sum(a.bilete) bilete, sum(a.lei) lei, count(DISTINCT a.zi) zile_cu_bilete
  FROM tiki_ticket_attr a
  JOIN tiki_tickets t ON t.ticket_key = a.ticket_key
  LEFT JOIN tiki_trips tr ON tr.trip_id = a.trip_id
  WHERE a.luna IN (p_luna, v_baza) AND NOT a.is_anulare AND t.pair IS NOT NULL AND t.pair LIKE '% - %'
  GROUP BY a.luna, 2, 5, a.label;

  -- 2. perechile lunii: capete, tip, bazin
  DROP TABLE IF EXISTS _per;
  CREATE TEMP TABLE _per ON COMMIT DROP AS
  SELECT p.cheie,
         split_part(p.cheie, '|', 1) n1, split_part(p.cheie, '|', 2) n2,
         (SELECT de_la_raw FROM _pb x WHERE x.luna = p_luna AND x.cheie = p.cheie ORDER BY bilete DESC LIMIT 1) de_la,
         (SELECT pana_la_raw FROM _pb x WHERE x.luna = p_luna AND x.cheie = p.cheie ORDER BY bilete DESC LIMIT 1) pana_la,
         sum(bilete) FILTER (WHERE luna = p_luna) bilete,
         sum(bilete) FILTER (WHERE luna = p_luna AND leg = 'chisinau_nord') tur,
         sum(bilete) FILTER (WHERE luna = p_luna AND leg = 'nord_chisinau') retur,
         sum(lei) FILTER (WHERE luna = p_luna) lei,
         sum(bilete) FILTER (WHERE luna = v_baza) bilete_baza
  FROM _pb p GROUP BY p.cheie
  HAVING sum(bilete) FILTER (WHERE luna = p_luna) > 0;

  ALTER TABLE _per ADD COLUMN capat text, ADD COLUMN tip text, ADD COLUMN raion text;
  UPDATE _per SET capat = CASE WHEN n1 = 'chisinau' THEN n2 WHEN n2 = 'chisinau' THEN n1 END;
  UPDATE _per p SET raion = s.raion FROM piata_statii s WHERE s.statie_norm = p.capat;
  UPDATE _per SET tip = CASE
    WHEN capat IS NULL THEN 'local'
    WHEN capat = 'balti' THEN 'balti'
    WHEN capat = ANY (v_trunchi) THEN 'trunchi'
    ELSE 'coada' END;

  -- 3. cursele străine (fără intersecții), cu numele normalizat și ordinea opririlor
  DROP TABLE IF EXISTS _cs;
  CREATE TEMP TABLE _cs ON COMMIT DROP AS
  SELECT c.id course_id, c.code, c.operator, c.route_name, c.dep_tur, c.dep_retur,
         s.seq, piata_anta_norm(s.name) n, s.district,
         max(s.seq) OVER (PARTITION BY c.id) seq_max, min(s.seq) OVER (PARTITION BY c.id) seq_min
  FROM anta_courses c JOIN anta_course_stops s ON s.course_id = c.id
  WHERE c.source = 'anta' AND s.name NOT ILIKE '%intersec%';

  -- 4. concurenții pe pereche (tip coada / balti): o cursă × un sens = 1 plecare/zi dacă sensul are oră
  DROP TABLE IF EXISTS _conc;
  CREATE TEMP TABLE _conc ON COMMIT DROP AS
  WITH cp AS (
    SELECT p.cheie, p.capat, p.tip, p.raion,
           ch.course_id, ch.code, ch.operator, ch.route_name, ch.dep_tur, ch.dep_retur,
           ch.seq seq_c, f.seq seq_f, ch.seq_min, ch.seq_max
    FROM _per p
    JOIN (SELECT DISTINCT ON (course_id) * FROM _cs WHERE n = 'chisinau' ORDER BY course_id, seq) ch ON true
    JOIN (SELECT DISTINCT ON (course_id, n) * FROM _cs ORDER BY course_id, n, seq) f
         ON f.course_id = ch.course_id AND f.n = p.capat
        AND (p.raion IS NULL OR f.district IS NULL OR piata_fold(f.district) = piata_fold(p.raion))
    WHERE p.tip IN ('coada', 'balti')
  ), sens AS (
    -- sensul din ordinea opririlor: Chișinău înaintea capătului → dep_tur e chisinau_nord
    SELECT cp.*, 'chisinau_nord' leg,
           piata_ora(CASE WHEN seq_c < seq_f THEN dep_tur ELSE dep_retur END) ora,
           CASE WHEN tip = 'balti' AND NOT (seq_f IN (seq_min, seq_max)) THEN v_tranz ELSE 1 END pond_tranzit
    FROM cp
    UNION ALL
    SELECT cp.*, 'nord_chisinau',
           piata_ora(CASE WHEN seq_c < seq_f THEN dep_retur ELSE dep_tur END),
           CASE WHEN tip = 'balti' AND NOT (seq_f IN (seq_min, seq_max)) THEN v_tranz ELSE 1 END
    FROM cp
  ), bpp AS (
    -- profilul nostru de îmbarcare la ora cursei străine: bilete pe plecare în luna de bază, ±fereastră; altfel cea mai apropiată
    SELECT s.cheie, s.course_id, s.leg, s.ora, s.pond_tranzit, s.code, s.operator, s.route_name,
           coalesce(
             (SELECT sum(b.bilete)::numeric / nullif(sum(b.zile_cu_bilete), 0) FROM _pb b
               WHERE b.luna = v_baza AND b.cheie = s.cheie AND b.leg = s.leg AND b.ora IS NOT NULL AND abs(b.ora - s.ora) <= v_fer),
             (SELECT b.bilete::numeric / nullif(b.zile_cu_bilete, 0) FROM _pb b
               WHERE b.luna = v_baza AND b.cheie = s.cheie AND b.leg = s.leg AND b.ora IS NOT NULL
               ORDER BY abs(b.ora - s.ora) LIMIT 1),
             (SELECT sum(b.bilete)::numeric / nullif(sum(b.zile_cu_bilete), 0) FROM _pb b
               WHERE b.luna = v_baza AND b.cheie = s.cheie AND b.leg = s.leg)
           ) bilete_pe_plecare
    FROM sens s WHERE s.ora IS NOT NULL
  )
  SELECT cheie, course_id, leg, ora, pond_tranzit, code, operator, route_name, bilete_pe_plecare,
         v_pond * coalesce(bilete_pe_plecare, 0) * pond_tranzit * v_zile_baza AS conc_baza_luna
  FROM bpp;

  -- 5. omișii (estimare), extrapolați pe rută la zilele lunii
  DROP TABLE IF EXISTS _om;
  CREATE TEMP TABLE _om ON COMMIT DROP AS
  WITH zr AS (
    SELECT crm_route_id, count(DISTINCT zi) zile FROM count_leg_daily
    WHERE zi >= p_luna AND zi < p_luna + interval '1 month' AND eligibil GROUP BY crm_route_id
  )
  SELECT piata_cheie(o.de_la, o.pana_la) cheie,
         sum(o.oameni * v_zile::numeric / greatest(zr.zile, 1)) omisi,
         max(zr.zile)::numeric / v_zile acoperire
  FROM tiki_ceilalti_od o JOIN zr ON zr.crm_route_id = o.crm_route_id
  WHERE o.zi >= p_luna AND o.zi < p_luna + interval '1 month'
  GROUP BY 1;

  -- 6. scriem luna
  DELETE FROM piata_pereche_luna WHERE luna = p_luna;
  INSERT INTO piata_pereche_luna (luna, cheie, de_la, pana_la, tip, capat, bilete, bilete_tur, bilete_retur, lei,
                                  omisi, omisi_acoperire, conc_min, conc_max, piata_min, piata_max, cota,
                                  oras, bazin, bazin_echiv, aford_net, aford_pensie, steaguri, detalii, anta_version)
  SELECT p.luna, p.cheie, p.de_la, p.pana_la, p.tip, p.capat, p.bilete, coalesce(p.tur, 0), coalesce(p.retur, 0), p.lei,
         o.omisi, o.acoperire,
         p.conc * v_zmin, p.conc * v_zmax,
         p.bilete + p.conc * v_zmin, p.bilete + p.conc * v_zmax,
         CASE WHEN p.tip IN ('coada', 'balti') THEN p.bilete / nullif(p.bilete + p.conc * (v_zmin + v_zmax) / 2, 0) END,
         s.oras, s.bazin, s.bazin_echiv,
         CASE WHEN p.bilete > 0 AND sal.brut IS NOT NULL THEN (p.lei / p.bilete) * 2 / (sal.brut * v_net) END,
         CASE WHEN p.bilete > 0 THEN (p.lei / p.bilete) * 2 / coalesce(sal.pensie, v_pens) END,
         ARRAY_REMOVE(ARRAY[
           CASE WHEN p.tip IN ('coada', 'balti') AND p.bilete_baza IS NULL THEN 'fara_baza' END,
           CASE WHEN p.tip = 'coada' AND NOT (piata_fold(p.raion) = ANY (SELECT piata_fold(x) FROM unnest(v_r40) x)) THEN 'regula40_extinsa' END,
           CASE WHEN p.tip IN ('coada', 'balti') AND s.statie_norm IS NULL THEN 'fara_bazin' END,
           CASE WHEN p.tip IN ('coada', 'balti') AND o.omisi IS NOT NULL AND p.bilete + o.omisi > p.bilete + p.conc * v_zmax THEN 'model_sub_observat' END,
           CASE WHEN p.tip IN ('coada', 'balti') AND p.n_curse = 0 THEN 'fara_concurenti' END
         ], NULL),
         jsonb_build_object(
           'raion', p.raion, 'bilete_baza', p.bilete_baza, 'delta', p.delta, 'zile', v_zile,
           'curse', coalesce((SELECT jsonb_agg(jsonb_build_object('firma', c.operator, 'cursa', c.route_name, 'sens', c.leg,
                                     'ora', lpad((c.ora / 60)::text, 2, '0') || ':' || lpad((c.ora % 60)::text, 2, '0'),
                                     'bpp', round(c.bilete_pe_plecare, 1), 'tranzit', c.pond_tranzit,
                                     'luna', round(c.conc_baza_luna * p.delta * v_zile / v_zile_baza)) ORDER BY c.leg, c.ora)
                               FROM _conc c WHERE c.cheie = p.cheie), '[]')),
         v_anta
  FROM (
    SELECT q.*, p_luna luna,
           coalesce(c.n, 0) n_curse,
           CASE WHEN q.bilete_baza > 0 THEN q.bilete::numeric / q.bilete_baza ELSE 1 END delta,
           coalesce(c.conc_baza, 0) * (CASE WHEN q.bilete_baza > 0 THEN q.bilete::numeric / q.bilete_baza ELSE 1 END)
             * v_zile / v_zile_baza conc
    FROM _per q
    LEFT JOIN (SELECT cheie, count(*) n, sum(conc_baza_luna) conc_baza FROM _conc GROUP BY cheie) c ON c.cheie = q.cheie
  ) p
  LEFT JOIN _om o ON o.cheie = p.cheie
  LEFT JOIN piata_statii s ON s.statie_norm = p.capat
  LEFT JOIN piata_salarii_raion sal ON piata_fold(sal.raion) = piata_fold(coalesce(p.raion, s.raion));
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('luna', p_luna, 'perechi', v_n, 'anta_version', v_anta,
                            'curse_straine', (SELECT count(DISTINCT course_id) FROM _conc));
END $function$;

REVOKE EXECUTE ON FUNCTION public.piata_calc_luna(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.piata_calc_luna(date) TO service_role;

INSERT INTO piata_luni_murdare (luna, motiv)
SELECT DISTINCT luna, 'migr. 464' FROM piata_pereche_luna
ON CONFLICT (luna) DO UPDATE SET marcata_la = now(), motiv = 'migr. 464';
