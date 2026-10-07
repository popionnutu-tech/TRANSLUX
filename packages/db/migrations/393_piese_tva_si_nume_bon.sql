-- 393: TVA pe piesă, numele scurt de bon și cecul completat cu ce cere legea.
--
-- HG 141/2019 cere, pentru fiecare marfă de pe bonul fiscal: denumirea, costul ȘI CODUL COTEI TVA,
-- cantitatea (dacă nu e 1) și prețul; iar pe bon, modul de plată. Din toate astea lipseau trei: TVA-ul
-- (deloc în modul), o denumire care să încapă pe bon, și modul de plată + încasat + rest pe cec — acestea
-- din urmă existau pe document din migr. 380-381, dar funcția cecului nu le întorcea.
--
-- ── TVA ──
-- Cota decisă de Mariana: 20%, cea standard. Coloană pe PIESĂ, nu constantă în cod: cota e un atribut al
-- mărfii, iar ziua în care apare o poziție cu altă cotă nu trebuie să ceară o migrație. Implicit 20, deci
-- pentru piesele existente nu se schimbă nimic.
--
-- IPOTEZĂ DE CONFIRMAT CU CONTABILA: prețul de raft e tratat ca fiind CU TVA INCLUS, deci pe bon TVA-ul se
-- EXTRAGE din preț (suma × cota / (100 + cota)), nu se adaugă peste. Așa se afișează prețurile cu
-- amănuntul și așa tipăresc aparatele fiscale. Dacă ipoteza e greșită, toate prețurile din magazin sunt cu
-- 20% prea mici — de aceea e scrisă aici explicit, nu ascunsă într-o formulă. Datele nu puteau decide
-- singure: totalul de control al facturii coincide exact cu suma liniilor pe toate recepțiile, deci baza e
-- consecventă, dar nu se vede dacă e cu sau fără TVA.
ALTER TABLE piese_parts ADD COLUMN IF NOT EXISTS tva_cota numeric(5,2) NOT NULL DEFAULT 20;

-- ── Numele de bon ──
-- Aparatele fiscale taie denumirea la o limită fixă. Din cele 84 de poziții cu stoc în magazin, denumirea
-- are în medie 32 de caractere, 52 trec de 30, cea mai lungă are 49. Dacă nu decidem noi unde se taie,
-- taie aparatul de unde apucă, iar clientul primește „Прокладка всасывающего колек".
--
-- Ce se scoate: CODUL (articol + OEM). Ce RĂMÂNE: modelul. Decizia e luată pe cifre: dacă s-ar scoate și
-- modelul, din 84 de poziții ar rămâne 67 de denumiri distincte — 17 bonuri din 84 cu un nume care nu
-- spune ce s-a vândut. Cu modelul păstrat rămân 4 ciocniri, iar una din ele, „Фонарь задний" stânga vs
-- dreapta, arată de ce câmpul trebuie să rămână corectabil de om.
--
-- Funcția PROPUNE, nu impune: `nume_bon` scris de om bate propunerea. Coloana rămâne NULL implicit —
-- „nestabilit" înseamnă „folosește propunerea", nu „gol pe bon". Așa nu avem 10 000 de rânduri de text
-- generat care se învechesc la prima redenumire.
ALTER TABLE piese_parts ADD COLUMN IF NOT EXISTS nume_bon text;

-- Limita implicită 30 e o presupunere până avem aparatul; e parametru tocmai ca s-o schimbăm dintr-un
-- singur loc când aflăm limita reală.
CREATE OR REPLACE FUNCTION piese_nume_bon_propus(p_nume text, p_art text, p_oem text, p_limita int DEFAULT 30)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $fn$
  WITH curatat AS (
    SELECT btrim(regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(COALESCE(p_nume, ''),
                   -- codul se scoate oriunde ar fi în denumire, insensibil la litere mari/mici; metacaracterele
                   -- din cod se neutralizează, altfel un articol ca „0393(LL)" ar fi interpretat ca expresie
                   CASE WHEN COALESCE(p_art,'') <> '' THEN regexp_replace(p_art, '([\\^$.|?*+()\[\]{}])', '\\\1', 'g') ELSE '\x00' END, '', 'gi'),
                 CASE WHEN COALESCE(p_oem,'') <> '' THEN regexp_replace(p_oem, '([\\^$.|?*+()\[\]{}])', '\\\1', 'g') ELSE '\x00' END, '', 'gi'),
               '\s+', ' ', 'g'),
             '[\s.\-–—/,:]+$', ''), ' .-') AS s
  ), taiat AS (
    SELECT s, btrim(regexp_replace(left(s, p_limita + 1), '\s\S*$', ''), ' .-') AS pe_cuvant FROM curatat
  )
  SELECT CASE
    -- Denumirea era doar codul: mai bine numele întreg scurtat decât un bon gol.
    WHEN btrim(s) = '' THEN left(btrim(COALESCE(p_nume,'')), p_limita)
    WHEN length(s) <= p_limita THEN s
    -- Tăierea pe cuvânt e preferată, DAR nu cu orice preț: când ultimul cuvânt e lung, arunca prea mult —
    -- „Прокладка крышки клапанов-OM602" devenea „Прокладка крышки", fără „клапанов", adică fără piesă.
    -- Sub 70% din limită, taie dur: un cuvânt ciuntit spune mai mult decât un cuvânt lipsă.
    WHEN length(pe_cuvant) >= (p_limita * 7) / 10 THEN pe_cuvant
    ELSE btrim(left(s, p_limita), ' .-')
  END FROM taiat;
$fn$;

-- Numele care ajunge efectiv pe bon: ce a scris omul, altfel propunerea.
CREATE OR REPLACE FUNCTION piese_nume_bon(p_part bigint, p_limita int DEFAULT 30)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $fn$
  SELECT COALESCE(NULLIF(btrim(p.nume_bon), ''),
                  piese_nume_bon_propus(COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long),
                                        p.article_code, p.oem_code, p_limita))
    FROM piese_parts p WHERE p.id = p_part;
$fn$;

-- ── Cecul ──
-- Cheile vechi rămân neatinse, ca ecranul să nu se rupă; se ADAUGĂ `nume_bon`, `cota_tva` și `tva` pe linie,
-- plus `tva_total`, `plata`, `incasat` și `rest` pe document.
CREATE OR REPLACE FUNCTION public.piese_cec(p_doc bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $function$
  SELECT jsonb_build_object(
    'doc_id',       d.id,
    'warehouse_id', d.warehouse_id,
    'serie',        COALESCE(d.invoice_series, ''),
    'numar',        COALESCE(d.invoice_number, ''),
    -- Ora locală, nu UTC: un cec emis după ora 21 ar fi purtat ziua următoare pe hârtie.
    'data',         to_char(d.created_at AT TIME ZONE 'Europe/Chisinau', 'DD.MM.YYYY HH24:MI'),
    'client',       COALESCE(cl.name, ''),
    'depozit',      COALESCE(w.name, ''),
    'linii',        COALESCE((
       SELECT jsonb_agg(jsonb_build_object(
                'nume', COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long),
                'nume_bon', piese_nume_bon(p.id),
                'articol', COALESCE(p.article_code, ''),
                'um', COALESCE(p.unit, 'buc'),
                'cant', abs(l.qty),
                -- `unit_price`, NU `unit_cost`: pe linia de vânzare costul FIFO și prețul stau în coloane
                -- diferite, iar pe cec clientul trebuie să vadă prețul, nu cât ne-a costat pe noi.
                'pret', round(COALESCE(l.unit_price, 0)::numeric, 2),
                'suma', round((abs(l.qty) * COALESCE(l.unit_price, 0))::numeric, 2),
                'cota_tva', COALESCE(p.tva_cota, 20),
                'tva', round(abs(l.qty) * COALESCE(l.unit_price,0) * COALESCE(p.tva_cota,20)
                             / (100 + COALESCE(p.tva_cota,20)), 2))
              ORDER BY l.id)
         FROM piese_stock_document_lines l
         JOIN piese_parts p ON p.id = l.part_id
        WHERE l.document_id = d.id), '[]'::jsonb),
    'total',        COALESCE((SELECT round(SUM(abs(l.qty) * COALESCE(l.unit_price, 0))::numeric, 2)
                                FROM piese_stock_document_lines l WHERE l.document_id = d.id), 0),
    'tva_total',    COALESCE((SELECT round(SUM(abs(l.qty) * COALESCE(l.unit_price,0) * COALESCE(p.tva_cota,20)
                                              / (100 + COALESCE(p.tva_cota,20)))::numeric, 2)
                                FROM piese_stock_document_lines l JOIN piese_parts p ON p.id = l.part_id
                               WHERE l.document_id = d.id), 0),
    'plata',        COALESCE(d.plata, 'NUMERAR'),
    'incasat',      CASE WHEN d.incasat IS NULL THEN NULL ELSE round(d.incasat::numeric, 2) END,
    'rest',         CASE WHEN d.incasat IS NULL THEN NULL ELSE round(d.incasat::numeric
                      - COALESCE((SELECT SUM(abs(l.qty) * COALESCE(l.unit_price,0))
                                    FROM piese_stock_document_lines l WHERE l.document_id = d.id), 0), 2) END
  )
    FROM piese_stock_documents d
    LEFT JOIN piese_clients cl ON cl.id = d.client_id
    LEFT JOIN piese_warehouses w ON w.id = d.warehouse_id
   WHERE d.id = p_doc AND d.doc_type = 'SALE';
$function$;

-- Probat pe o vânzare fictivă într-o tranzacție anulată (780 lei, încasat 1000): TVA 130,00 exact,
-- rest 220,00, plata NUMERAR, nume pe bon „Фонарь задний". După anulare: 0 vânzări în bază, stocul
-- felinarului neatins.

-- Cele trei câmpuri intră și în rândurile catalogului. NU e cosmetic: formularul de piesă e un „replace
-- complet" al coloanelor editabile, deci un câmp care nu ajunge în prefill se GOLEȘTE la prima salvare
-- din Catalog. Exact așa s-ar fi pierdut un nume de bon scris de mână. Aceeași lecție ca la codurile de
-- bare, la adaos și la marcajul б/у.
--
-- Niciunul nu e sensibil: din cota TVA și din numele de bon nu se poate deduce costul de achiziție, deci
-- pot merge la toate rolurile care deschid formularul, spre deosebire de `markup_pct`.
CREATE OR REPLACE VIEW piese_catalog_rows AS
 SELECT p.id, p.group_id, p.name_long, p.manufacturer, p.model, p.article_code, p.oem_code,
    p.barcode, p.unit, p.is_for_sale, p.active, p.created_at,
    g.name_ro AS group_name, p.name_ro, p.barcodes_all, p.markup_pct, p.is_used, p.origin_part_id,
    ( SELECT (COALESCE(NULLIF(btrim(o.name_ro), ''::text), o.name_long) || COALESCE(' — '::text || NULLIF(btrim(COALESCE(o.manufacturer, ''::text)), ''::text), ''::text)) || COALESCE((' ('::text || NULLIF(btrim(COALESCE(o.model, ''::text)), ''::text)) || ')'::text, ''::text)
           FROM piese_parts o WHERE o.id = p.origin_part_id) AS origin_label,
    p.nume_bon,
    p.tva_cota,
    piese_nume_bon_propus(COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long), p.article_code, p.oem_code) AS nume_bon_propus
   FROM piese_parts p
     JOIN piese_part_groups g ON g.id = p.group_id
  WHERE p.active;
