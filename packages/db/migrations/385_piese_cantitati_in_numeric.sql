-- 385: Și cantitățile trec în `numeric` — altfel migr. 384 era pe jumătate.
--
-- Descoperit imediat după 384, la prima verificare: `round(SUM(qty_delta * unit_cost), 2)` a dat eroare,
-- fiindcă `real × numeric` se rezolvă în Postgres prin RIDICAREA ambelor la virgulă mobilă. Adică un cost
-- exact, înmulțit cu o cantitate ținută ca `real`, redevine aproximativ.
--
-- Costul exact singur nu ajută la nimic: banii se nasc din înmulțire, nu din coloană. Ori se face întreg
-- lanțul, ori n-are rost.
--
-- Cantitățile sunt oricum aproape mereu întregi (bucăți), iar întregii mici sunt exacți și în `real` —
-- dar TIPUL lor decide tipul produsului, și asta e tot ce contează aici.
CREATE TEMP TABLE _vdef AS
  SELECT c.relname AS nume, pg_get_viewdef(c.oid, true) AS def
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.relname LIKE 'piese\_%';

DROP VIEW IF EXISTS piese_cost_per_vehicle, piese_current_stock, piese_last_supplier,
  piese_movement_ledger, piese_overconsumption, piese_part_sale_price, piese_sale_invoices,
  piese_issue_line_net CASCADE;

ALTER TABLE piese_stock_movements      ALTER COLUMN qty_delta TYPE numeric(14,3);
ALTER TABLE piese_stock_document_lines ALTER COLUMN qty       TYPE numeric(14,3);
ALTER TABLE piese_fifo_alloc           ALTER COLUMN qty       TYPE numeric(14,3);

DO $$
DECLARE r record; ramase int; progres int; i int := 0;
BEGIN
  LOOP
    i := i + 1; progres := 0; ramase := 0;
    FOR r IN SELECT d.nume, d.def FROM _vdef d
             WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                                WHERE n.nspname = 'public' AND c.relname = d.nume AND c.relkind = 'v') LOOP
      BEGIN
        EXECUTE format('CREATE VIEW public.%I AS %s', r.nume, r.def);
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', r.nume);
        EXECUTE format('GRANT SELECT ON public.%I TO service_role', r.nume);
        progres := progres + 1;
      EXCEPTION WHEN others THEN ramase := ramase + 1;
      END;
    END LOOP;
    EXIT WHEN ramase = 0 OR progres = 0 OR i > 12;
  END LOOP;
  IF ramase > 0 THEN RAISE EXCEPTION 'nu am putut reface % vederi', ramase; END IF;
END $$;

DROP TABLE _vdef;
