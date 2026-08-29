-- 288: Suma de control a facturii la recepție (prihod).
--
-- Cerută de Eduard, ca în programul precedent (ИНТЕЛЛЕКТ): la introducerea unei recepții se tastează
-- totalul de pe factura furnizorului, iar programul refuză salvarea dacă suma liniilor nu se potrivește.
-- Prinde exact greșeala care costă cel mai mult mai târziu — o cantitate sau un preț tastat greșit,
-- care altfel intră în stoc și în costul FIFO și se descoperă abia la inventariere.
--
-- Câmpul e OPȚIONAL: NULL = recepție introdusă fără sumă de control (comportamentul de până acum,
-- și singurul posibil pentru cele 337 de documente existente). Verificarea se aplică doar când e completat.

alter table piese_stock_documents
  add column if not exists invoice_total numeric;

-- Totalul nu poate fi negativ. Zero e permis (retur integral / factură de corecție).
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'piese_stock_documents_invoice_total_ck'
                   and conrelid = 'piese_stock_documents'::regclass) then
    alter table piese_stock_documents
      add constraint piese_stock_documents_invoice_total_ck
      check (invoice_total is null or invoice_total >= 0);
  end if;
end $$;

comment on column piese_stock_documents.invoice_total is
  'Suma de control de pe factura furnizorului (prihod). NULL = necompletată. Când e completată, suma liniilor trebuie să coincidă cu toleranță de 1 ban.';
