-- 287: Drepturi fine per cont administrativ (perioada de implementare a modulului Piese).
--
-- Contextul: regula de corectare a recepțiilor era binară — ADMIN modifică orice, ceilalți doar
-- documentele create AZI (prihod/actions.ts, canEditDay). La implementare asta blochează omul care
-- descoperă o greșeală de ieri. La fel, e-Factura era scoped rigid pe rol: GESTIONAR/VINZATOR vedeau
-- DOAR facturile lor, deci un implementator nu putea verifica facturile existente.
--
-- Ambele devin drepturi PER CONT, nu per rol — ca lărgirea să fie punctuală (un om, pe o perioadă),
-- nu o slăbire permanentă a rolului pentru toți cei care îl poartă.

-- Câte zile ÎN URMĂ poate contul să corecteze documente. 0 = doar ziua curentă (comportamentul de până acum).
-- ADMIN ignoră câmpul (are drept nelimitat, impus în cod).
alter table admin_accounts
  add column if not exists edit_window_days int not null default 0;

-- Vede TOATE facturile din e-Factura, nu doar cele emise de el.
-- ADMIN și CONTABIL le văd oricum pe toate (impus în cod); câmpul contează pentru VINZATOR/GESTIONAR.
alter table admin_accounts
  add column if not exists sees_all_invoices boolean not null default false;

-- Plafon de sanity: fereastra e pentru corecții operative, nu pentru rescrierea istoriei contabile.
-- 30 de zile, aliniat la MAX_EDIT_WINDOW_DAYS din apps/admin/src/lib/piese-roles.ts (aceeași sursă
-- pentru opțiunile din UI și validarea din server action). Un an ar traversa perioade contabile închise,
-- exporturi 1C și facturi deja trimise la SFS.
do $$
begin
  if exists (select 1 from pg_constraint
             where conname = 'admin_accounts_edit_window_days_ck'
               and conrelid = 'admin_accounts'::regclass) then
    alter table admin_accounts drop constraint admin_accounts_edit_window_days_ck;
  end if;
  alter table admin_accounts
    add constraint admin_accounts_edit_window_days_ck
    check (edit_window_days >= 0 and edit_window_days <= 30);
end $$;

comment on column admin_accounts.edit_window_days is
  'Zile în urmă în care contul poate corecta documente (0 = doar azi). ADMIN e nelimitat, ignoră câmpul.';
comment on column admin_accounts.sees_all_invoices is
  'true = vede toate facturile în e-Factura, nu doar cele emise de el. ADMIN/CONTABIL le văd oricum.';
