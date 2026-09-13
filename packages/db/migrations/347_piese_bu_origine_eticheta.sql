-- 347: Eticheta piesei-origine, plus două ascuțiri la modelul б/у.
--
-- DEFECT: formularul deschidea o piesă б/у deja legată cu câmpul „corespunde piesei noi" GOL. Legătura
-- exista în bază, dar combobox-ul în mod async își ia textul din `selectedLabel`, iar apelantul n-avea de
-- unde să-l ia. Omul ar fi crezut că legătura lipsește și ar fi rescris-o — sau ar fi salvat fără ea,
-- rupând sugestia de valoare fără să observe. Eticheta vine acum din vedere, fără o citire în plus.
--
-- Plus un index parțial minuscul (zeci de rânduri): numărătoarea din ecranul „Donor" și căutarea pieselor
-- uzate nu mai parcurg tot catalogul de 9500 de piese.
CREATE OR REPLACE VIEW piese_catalog_rows AS
  SELECT p.id, p.group_id, p.name_long, p.manufacturer, p.model, p.article_code, p.oem_code,
    p.barcode, p.unit, p.is_for_sale, p.active, p.created_at,
    g.name_ro AS group_name, p.name_ro, p.barcodes_all, p.markup_pct,
    p.is_used, p.origin_part_id,
    -- Aceeași formă ca `partLabel` din aplicație, pe cât se poate în SQL. Nu e o a doua sursă de adevăr
    -- pentru etichete — e doar textul pe care formularul îl afișează pentru o legătură deja făcută.
    (SELECT COALESCE(NULLIF(btrim(o.name_ro), ''), o.name_long)
            || COALESCE(' — ' || NULLIF(btrim(COALESCE(o.manufacturer, '')), ''), '')
            || COALESCE(' (' || NULLIF(btrim(COALESCE(o.model, '')), '') || ')', '')
       FROM piese_parts o WHERE o.id = p.origin_part_id) AS origin_label
  FROM piese_parts p
  JOIN piese_part_groups g ON g.id = p.group_id
  WHERE p.active;

REVOKE ALL ON piese_catalog_rows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON piese_catalog_rows TO service_role;

CREATE INDEX IF NOT EXISTS idx_pparts_used ON piese_parts (id) WHERE is_used AND active;
