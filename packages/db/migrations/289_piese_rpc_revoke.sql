-- 289: Apărare în adâncime — restul RPC-urilor modulului „Piese" nu mai sunt apelabile de anon/authenticated.
--
-- Migrația 244 a făcut asta pentru `piese_replace_receipt`, cu motivul scris acolo:
--   „Proiectul are ALTER DEFAULT PRIVILEGES care acordă EXECUTE pe funcțiile noi din `public` DIRECT lui
--    anon+authenticated → REVOKE FROM PUBLIC singur NU e suficient".
-- Restul funcțiilor au rămas însă deschise. Verificat în bază înainte de această migrație: 12 din 13
-- `piese_*` erau EXECUTE-abile de `anon`.
--
-- Ce însemna concret: un apel direct prin PostgREST la `piese_create_receipt` / `piese_create_sale` /
-- `piese_inventory_count` / `piese_recost` ocolea TOATE gărzile aplicației — rolul (RECEIPT_ROLES),
-- legarea de depozit (assertWarehouseAllowed), fereastra de corecție și suma de control. Autorizarea
-- reală trăiește în server actions; asta e plasa de sub ea.
--
-- Cheia anon NU e expusă în browser (env fără prefix NEXT_PUBLIC_), deci nu era exploatabilă public —
-- dar cheile anon Supabase sunt prin design tratate ca publicabile, iar depozitul e public.
--
-- `service_role` (rolul aplicației) își păstrează EXECUTE explicit, deci nimic nu se rupe.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'piese\_%'
      and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
