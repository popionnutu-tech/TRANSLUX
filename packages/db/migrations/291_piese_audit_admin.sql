-- 291: Cine a modificat un document — urma care lipsea.
--
-- Problema: `piese_stock_documents` se poate modifica retroactiv (antetul, în fereastra de corecție a
-- contului; liniile, cât marfa nu e consumată), dar NIMIC nu spunea cine a schimbat și ce era înainte:
--   • `updateReceiptHeader` e un UPDATE direct, fără nicio scriere în jurnal;
--   • `piese_replace_receipt` scrie în jurnal, dar aplicația îi trimite mereu `p_user = null`.
-- Verificat în bază: toate cele 3 rânduri EDIT/receipt existente au autorul NULL.
--
-- Cu fereastra de corecție lărgită (migr. 287), asta înseamnă că furnizorul sau numărul unei facturi de
-- acum câteva săptămâni — deja consumată și trecută în contabilitate — se putea rescrie fără urmă.
--
-- De ce o coloană nouă și nu `user_id`: acela e BIGINT (utilizatori Telegram), iar conturile
-- administrative sunt UUID. Nu se pot amesteca; `user_id` rămâne pentru istoricul existent.

alter table piese_audit_log
  add column if not exists admin_id uuid references admin_accounts(id) on delete set null;

comment on column piese_audit_log.admin_id is
  'Contul administrativ care a făcut acțiunea (UUID). user_id rămâne pentru utilizatorii Telegram (BIGINT).';

-- Căutarea reală e „ce s-a întâmplat cu documentul ăsta" — ordonată descrescător, ca în ecranul de modificare.
create index if not exists idx_paudit_entity
  on piese_audit_log (entity, entity_id, created_at desc);

-- Și „ce a făcut omul ăsta", pentru verificările punctuale.
create index if not exists idx_paudit_admin
  on piese_audit_log (admin_id, created_at desc)
  where admin_id is not null;
