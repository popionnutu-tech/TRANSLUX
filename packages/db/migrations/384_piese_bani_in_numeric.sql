-- 384: Banii trec din virgulă mobilă în `numeric`.
--
-- Costurile și prețurile erau ținute ca `real` (float4, ~7 cifre semnificative). Un preț ca 1410,05 nu se
-- poate reprezenta exact în binar, iar abaterea se adună la fiecare înmulțire și fiecare sumă.
--
-- Măsurat pe datele reale, înainte de schimbare:
--   calculat în virgulă mobilă : 117 071,00 lei
--   calculat în numeric        : 117 071,41 lei
--   diferență                  :       0,41 lei, din 156 de mișcări
--
-- Patruzeci și unu de bani pe 117 mii. Pare puțin, dar e exact nepotrivirea care face ca raportul de zi
-- să nu se închidă cu banda fiscală — iar atunci cineva trebuie s-o explice. Și crește cu fiecare document.
--
-- Problema era deja cunoscută și ocolită o dată: `lib/piese-receipt.ts` adună rotunjind PE LINIE tocmai
-- fiindcă „`unit_cost` e REAL (float4) în bază". Ocolul rămâne valid, dar nu mai e singura apărare.
--
-- DE CE ACUM: tabelele sunt mici — 156 de mișcări, 77 de linii, 30 de alocări. Magazinul urmează să treacă
-- integral pe program; peste un an aceeași operație ar cere o fereastră de mentenanță.
--
-- Partea de aplicație a fost verificată ÎNAINTE: PostgREST poate întoarce `numeric` ca text, iar o adunare
-- pe text ar concatena în loc să adune. Toate locurile de consum folosesc deja `Number(...)`.
--
-- ATENȚIE: migrația asta e PE JUMĂTATE singură — vezi 385. `real × numeric` se rezolvă în Postgres prin
-- ridicarea ambelor la virgulă mobilă, deci cantitățile trebuie convertite și ele.
CREATE TEMP TABLE _vdef AS
  SELECT c.relname AS nume, pg_get_viewdef(c.oid, true) AS def
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.relname LIKE 'piese\_%';

DROP VIEW IF EXISTS piese_cost_per_vehicle, piese_current_stock, piese_last_supplier,
  piese_movement_ledger, piese_overconsumption, piese_part_sale_price, piese_sale_invoices CASCADE;

ALTER TABLE piese_stock_movements      ALTER COLUMN unit_cost  TYPE numeric(14,4);
ALTER TABLE piese_stock_document_lines ALTER COLUMN unit_cost  TYPE numeric(14,4);
ALTER TABLE piese_stock_document_lines ALTER COLUMN unit_price TYPE numeric(14,4);
ALTER TABLE piese_fifo_alloc           ALTER COLUMN unit_cost  TYPE numeric(14,4);

-- Refacerea e o buclă care reîncearcă până le prinde pe toate — așa nu depinde de ordinea în care
-- vederile sunt scrise unele în altele.
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
        -- Drepturile NU se moștenesc la recreare: fără liniile astea, modulul ar da „permission denied".
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
