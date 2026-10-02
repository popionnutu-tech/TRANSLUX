-- 466 (aplicată în bază pe 02.10 sub numele «463_piata_potentiala», prin MCP, înainte de regula db-migrate.sh; renumerotată
-- fiindcă ION-166 a intrat pe main cu 463–465 în același timp). Secțiunea «tiki_refacere_pas» de aici a fost SCOASĂ: ea a
-- suprascris din greșeală funcția în pași mici a lui ION-166 (migr. 463–465); versiunea corectă, cu marcajul lunilor murdare, e 468.

-- 463: Bilete aparat — coloana «Piața» pe pereche de stații (ION-171, plan docs/plans/2026-10-01-piata-potentiala-bilete.md,
-- 3 runde Claude + Codex, răspunsurile lui Ion din 02.10).
--
-- Ion (01.10): «pe fiecare tip bilet să identificăm pentru această locație potențiali câți clienți pot fi totali, ca să
-- înțelegem adâncimea pieții». Pe fiecare pereche, pe LUNĂ ÎNCHEIATĂ (ziua cursei, ≥ 05.2026 — locurile din grafic există
-- din 04.04.2026), în bilete:
--   piața    = bilete observate + concurenți (interval 5/7…7/7 din zile — foaia ANTA n-are zilele de circulație)
--   omiși    = estimare separată (tiki_ceilalti_od reconstruiește perechea omisului; nu intră în nicio regulă «≥»)
--   concurenți (regula lui Ion, 02.10): o cursă străină îmbarcă pe pereche 40 % din cât îmbarcă o cursă de-a noastră pe
--              aceeași pereche și sens la o oră similară (profilul NOSTRU de îmbarcare pe oră, ±60 min); luna de bază
--              09.2026, lunile următoare se mișcă cu delta noastră față de bază; o cursă = 1 plecare/zi pe fiecare sens
--              care are oră; sensul din ordinea opririlor (seq), nu «dep_tur = tur»; Chișinău–Bălți: doar cursele cu
--              capătul Bălți, cele care trec mai departe cu 10 %; perechile cu capătul pe trunchi (Orhei, Strășeni,
--              Călărași, Sîngerei, Soroca) și cele fără Chișinău nu primesc concurenți.
--   oraș / bazin = RPL 2024 (BNS) pe localitate; bazin = + satele fără stație proprie din 10 km (piata_statii, din
--              scriptul apps/admin/scripts/piata/bns-import.mts); afordabilitatea = preț dus-întors ÷ net raion.
-- Calculul rulează NOAPTEA, un apel = o lună «murdară» (piata_pas), nu în tiki-refacere (NANO, ION-166).
-- Toate funcțiile: REVOKE EXECUTE FROM PUBLIC (memoria migr. 355/356).

-- ─── Tabele ───
CREATE TABLE IF NOT EXISTS piata_localitati (
  id        serial PRIMARY KEY,
  cod_bns   text NOT NULL,
  nivel     text NOT NULL,            -- Raioane / Comune / Localitati
  nume      text NOT NULL,
  raion     text NOT NULL,            -- «Raionul Briceni», «Mun. Bălți»
  total     integer NOT NULL,
  v0_14     integer,
  v15_64    integer,
  v65       integer,
  lat       double precision,
  lon       double precision,
  UNIQUE (cod_bns, nivel, nume)
);
COMMENT ON TABLE piata_localitati IS 'Recensământul 2024 (BNS, Anexa_Localitati_RPL2024.xlsx, foile 8.3 + 8.4), încărcat de scripts/piata/bns-import.mts; coordonatele din anta_localities (Wikidata).';

CREATE TABLE IF NOT EXISTS piata_statii (
  statie_norm   text PRIMARY KEY,     -- tiki_stop_norm (după tiki_stop_map) al stației TIKI / Numărare
  localitate_id integer REFERENCES piata_localitati(id),
  nume          text NOT NULL,
  raion         text,                 -- raion scurt: «Briceni», «Edineț», «mun. Bălți»
  oras          integer,              -- populația localității singure
  bazin         integer,              -- + satele fără stație proprie din raza R (fiecare sat o singură dată)
  bazin_echiv   numeric,              -- 15–64 × 1,0 + 65+ × 1,0 + 0–14 × 0,2 (Ion, 02.10: pensionarii pondere 1)
  sate          jsonb NOT NULL DEFAULT '[]',
  manual        boolean NOT NULL DEFAULT false,
  nota          text
);
COMMENT ON TABLE piata_statii IS 'Legarea stației TIKI → localitatea BNS + bazinul (R = 10 km, Ion 02.10). Editabilă: manual=true nu se rescrie la import.';

CREATE TABLE IF NOT EXISTS piata_salarii_raion (
  raion      text PRIMARY KEY,        -- scurt, ca piata_statii.raion
  an         integer NOT NULL,
  brut       numeric NOT NULL,
  salariati  integer,
  pensie     numeric,                 -- neverificat la 02.10; null = se ia parametrul «pensie_tara»
  sursa      text NOT NULL
);

CREATE TABLE IF NOT EXISTS piata_parametri (
  cheie    text NOT NULL,
  valoare  jsonb NOT NULL,
  versiune integer NOT NULL DEFAULT 1,
  de_la    date NOT NULL DEFAULT current_date,
  nota     text,
  PRIMARY KEY (cheie, versiune)
);
INSERT INTO piata_parametri (cheie, valoare, nota) VALUES
  ('pondere_imbarcare', '0.40', 'Ion, 02.10: o cursă străină îmbarcă 40 % din cât îmbarcă o cursă de-a noastră la oră similară'),
  ('fereastra_ora_min', '60', 'plecările noastre din ±60 min dau profilul de îmbarcare la ora cursei străine'),
  ('luna_baza', '"2026-09-01"', 'luna în care se fixează 40 %; lunile următoare se mișcă cu delta noastră față de ea'),
  ('zile_min', '0.7142857', '5/7: foaia ANTA n-are zilele de circulație'),
  ('zile_max', '1', '7/7'),
  ('tranzit_balti', '0.10', 'Ion: cursele care trec mai departe de Bălți iau din gara Bălți ~10 %'),
  ('raza_bazin_km', '10', 'Ion, 02.10: satele din jur, 10 km'),
  ('pondere_65', '1.0', 'Ion, 02.10: pensionarii pondere 1'),
  ('pondere_0_14', '0.2', 'copiii'),
  ('net_factor', '0.79', 'net ≈ brut × 0,79 (12 % impozit + 9 % CASS; cu scutirea personală ≈ 0,83)'),
  ('pensie_tara', '3650', 'pensia medie pe țară, de înlocuit cu valoarea pe raion când e extrasă (neverificat)'),
  ('raioane_regula_40', '["Briceni","Edineț"]', 'raioanele pentru care Ion a dat regula 40 %; în celelalte se aplică la fel, cu steagul «regula40_extinsa»'),
  ('trunchi', '["orhei","straseni","calarasi","singerei","soroca"]', 'capete de trunchi (memoria 21.09): fără concurenți; Bălți are regula lui'),
  ('prima_luna', '"2026-05-01"', 'locurile din grafic există din 04.04.2026; lunile dinainte arată «—»')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS piata_luni_murdare (
  luna       date PRIMARY KEY,
  marcata_la timestamptz NOT NULL DEFAULT now(),
  motiv      text
);

CREATE TABLE IF NOT EXISTS piata_pereche_luna (
  luna          date NOT NULL,
  cheie         text NOT NULL,         -- piata_cheie(de_la, pana_la)
  de_la         text NOT NULL,
  pana_la       text NOT NULL,
  tip           text NOT NULL,         -- coada / balti / trunchi / local
  capat         text,                  -- statie_norm al capătului mic
  bilete        integer NOT NULL,
  bilete_tur    integer NOT NULL,
  bilete_retur  integer NOT NULL,
  lei           numeric NOT NULL,
  omisi         numeric,               -- extrapolați la zilele lunii (estimare)
  omisi_acoperire numeric,             -- zile numărate ÷ zile lună
  conc_min      numeric NOT NULL DEFAULT 0,
  conc_max      numeric NOT NULL DEFAULT 0,
  piata_min     numeric NOT NULL,
  piata_max     numeric NOT NULL,
  cota          numeric,               -- bilete ÷ mijlocul intervalului
  oras          integer,
  bazin         integer,
  bazin_echiv   numeric,
  aford_net     numeric,               -- preț mediu dus-întors ÷ net raion
  aford_pensie  numeric,
  steaguri      text[] NOT NULL DEFAULT '{}',
  detalii       jsonb NOT NULL DEFAULT '{}',   -- cursele străine cu ora, sensul, bpp, contribuția
  anta_version  text,
  calculat_la   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (luna, cheie)
);

ALTER TABLE piata_localitati    ENABLE ROW LEVEL SECURITY;
ALTER TABLE piata_statii        ENABLE ROW LEVEL SECURITY;
ALTER TABLE piata_salarii_raion ENABLE ROW LEVEL SECURITY;
ALTER TABLE piata_parametri     ENABLE ROW LEVEL SECURITY;
ALTER TABLE piata_luni_murdare  ENABLE ROW LEVEL SECURITY;
ALTER TABLE piata_pereche_luna  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE piata_localitati, piata_statii, piata_salarii_raion, piata_parametri, piata_luni_murdare, piata_pereche_luna
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE piata_localitati, piata_statii, piata_salarii_raion, piata_parametri, piata_luni_murdare, piata_pereche_luna
  TO service_role;
REVOKE ALL ON SEQUENCE piata_localitati_id_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE piata_localitati_id_seq TO service_role;

-- ─── Ajutătoare ───
CREATE OR REPLACE FUNCTION public.piata_param(p_cheie text) RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT valoare FROM piata_parametri WHERE cheie = p_cheie ORDER BY versiune DESC LIMIT 1
$$;

-- Numele stației, comparabil (alias-urile din tiki_stop_map: «beleavineti» → «beleavinti»).
CREATE OR REPLACE FUNCTION public.piata_norm(x text) RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT coalesce((SELECT m.stop_norm FROM tiki_stop_map m WHERE m.statie_norm = tiki_stop_norm(x)), tiki_stop_norm(x))
$$;

CREATE OR REPLACE FUNCTION public.piata_cheie(a text, b text) RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT least(piata_norm(a), piata_norm(b)) || '|' || greatest(piata_norm(a), piata_norm(b))
$$;

-- Fără diacritice și majuscule (raioanele vin scrise diferit în anta_course_stops, piata_statii, piata_salarii_raion).
CREATE OR REPLACE FUNCTION public.piata_fold(x text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(translate(coalesce(x, ''), 'ăâîșşțţĂÂÎȘŞȚŢ', 'aaisstt' || 'aaisstt'))
$$;

-- Prima oră «H:MM» dintr-un text (eticheta TIKI are ora la început sau la sfârșit).
CREATE OR REPLACE FUNCTION public.piata_ora(x text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN m[1] IS NOT NULL THEN m[1]::int * 60 + m[2]::int END
  FROM (SELECT regexp_match(coalesce(x, ''), '(\d{1,2}):(\d{2})') m) s
$$;

-- Numele unei opriri ANTA fără prefix («or. », «s. ») și fără mențiunea de intersecție.
CREATE OR REPLACE FUNCTION public.piata_anta_norm(x text) RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT piata_norm(regexp_replace(regexp_replace(coalesce(x, ''), '^(or\.|s\.|mun\.|com\.|st\.)\s*', ''), '\s*\(.*\)\s*$', ''))
$$;

-- ─── Calculul unei luni ───
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
    JOIN _cs ch ON ch.n = 'chisinau'
    JOIN _cs f ON f.course_id = ch.course_id AND f.n = p.capat
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
           CASE WHEN o.omisi IS NOT NULL AND p.bilete + o.omisi > p.bilete + p.conc * v_zmax THEN 'model_sub_observat' END,
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

-- ─── Pasul de noapte: cea mai veche lună încheiată murdară, sărită cât mai are zile de Numărare în coadă ───
CREATE OR REPLACE FUNCTION public.piata_pas()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '60s'
AS $function$
DECLARE v_luna date; v_prima date := (piata_param('prima_luna') #>> '{}')::date; v_res jsonb; v_sarite int := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('piata_luna')) THEN
    RETURN jsonb_build_object('ocupat', true);
  END IF;
  -- lunile de dinainte de prima lună cu locuri nu se calculează niciodată
  DELETE FROM piata_luni_murdare WHERE luna < v_prima;
  SELECT m.luna INTO v_luna FROM piata_luni_murdare m
  WHERE m.luna < date_trunc('month', current_date)
    AND NOT EXISTS (SELECT 1 FROM count_refresh_queue q WHERE q.zi >= m.luna AND q.zi < m.luna + interval '1 month')
    AND NOT EXISTS (SELECT 1 FROM tiki_refresh_queue q WHERE q.luna = m.luna)
  ORDER BY m.luna LIMIT 1;
  SELECT count(*) INTO v_sarite FROM piata_luni_murdare m WHERE m.luna < date_trunc('month', current_date) AND (v_luna IS NULL OR m.luna <> v_luna);
  IF v_luna IS NULL THEN
    RETURN jsonb_build_object('luna', NULL, 'sarite', v_sarite, 'ramase', (SELECT count(*) FROM piata_luni_murdare));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tiki_plecari_daily d WHERE d.zi >= v_luna AND d.zi < v_luna + interval '1 month' AND d.locuri > 0) THEN
    DELETE FROM piata_luni_murdare WHERE luna = v_luna;
    RETURN jsonb_build_object('luna', v_luna, 'refuzata', 'fără locuri în grafic', 'ramase', (SELECT count(*) FROM piata_luni_murdare));
  END IF;
  v_res := piata_calc_luna(v_luna);
  DELETE FROM piata_luni_murdare WHERE luna = v_luna;
  RETURN v_res || jsonb_build_object('sarite', v_sarite, 'ramase', (SELECT count(*) FROM piata_luni_murdare));
END $function$;

-- ─── Citirea pentru pagină: lunile încheiate conținute în interval, cu rând calculat ───
CREATE OR REPLACE FUNCTION public.get_piata(p_from date, p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '20s' AS $$
  WITH luni AS (
    SELECT DISTINCT luna FROM piata_pereche_luna
    WHERE luna >= date_trunc('month', p_from) AND luna + interval '1 month - 1 day' <= p_to
      AND luna >= p_from
  )
  SELECT jsonb_build_object(
    'luni', coalesce((SELECT jsonb_agg(to_char(luna, 'YYYY-MM') ORDER BY luna) FROM luni), '[]'),
    'prima_luna', piata_param('prima_luna') #>> '{}',
    'parametri', (SELECT jsonb_object_agg(cheie, valoare) FROM (SELECT DISTINCT ON (cheie) cheie, valoare FROM piata_parametri ORDER BY cheie, versiune DESC) x),
    'perechi', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'cheie', cheie, 'de_la', de_la, 'pana_la', pana_la, 'tip', tip,
        'bilete', bilete, 'omisi', omisi, 'omisi_acoperire', acop,
        'conc_min', conc_min, 'conc_max', conc_max, 'piata_min', piata_min, 'piata_max', piata_max,
        'cota', CASE WHEN tip IN ('coada', 'balti') THEN bilete / nullif((piata_min + piata_max) / 2, 0) END,
        'oras', oras, 'bazin', bazin, 'bazin_echiv', bazin_echiv, 'aford_net', aford_net, 'aford_pensie', aford_pensie,
        'steaguri', steaguri, 'detalii', detalii, 'luni', n_luni) ORDER BY bilete DESC)
      FROM (
        SELECT r.cheie, min(r.de_la) de_la, min(r.pana_la) pana_la, min(r.tip) tip,
               sum(r.bilete) bilete, sum(r.omisi) omisi, avg(r.omisi_acoperire) acop,
               sum(r.conc_min) conc_min, sum(r.conc_max) conc_max, sum(r.piata_min) piata_min, sum(r.piata_max) piata_max,
               max(r.oras) oras, max(r.bazin) bazin, max(r.bazin_echiv) bazin_echiv,
               avg(r.aford_net) aford_net, avg(r.aford_pensie) aford_pensie,
               (SELECT array_agg(DISTINCT f) FROM piata_pereche_luna z, unnest(z.steaguri) f WHERE z.cheie = r.cheie AND z.luna IN (SELECT luna FROM luni)) steaguri,
               (SELECT z.detalii FROM piata_pereche_luna z WHERE z.cheie = r.cheie AND z.luna IN (SELECT luna FROM luni) ORDER BY z.luna DESC LIMIT 1) detalii,
               count(*) n_luni
        FROM piata_pereche_luna r WHERE r.luna IN (SELECT luna FROM luni)
        GROUP BY r.cheie
      ) t), '[]'))
$$;

REVOKE EXECUTE ON FUNCTION public.piata_param(text), public.piata_norm(text), public.piata_cheie(text, text), public.piata_ora(text),
  public.piata_fold(text), public.piata_anta_norm(text), public.piata_calc_luna(date), public.piata_pas(), public.get_piata(date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.piata_param(text), public.piata_norm(text), public.piata_cheie(text, text), public.piata_ora(text),
  public.piata_fold(text), public.piata_anta_norm(text), public.piata_calc_luna(date), public.piata_pas(), public.get_piata(date, date)
  TO service_role;

-- lunile de calculat la prima rulare (jobul de noapte le ia una câte una)
INSERT INTO piata_luni_murdare (luna, motiv)
SELECT d::date, 'initial' FROM generate_series(DATE '2026-05-01', date_trunc('month', current_date - 1)::date, interval '1 month') d
WHERE d::date < date_trunc('month', current_date)
ON CONFLICT DO NOTHING;
