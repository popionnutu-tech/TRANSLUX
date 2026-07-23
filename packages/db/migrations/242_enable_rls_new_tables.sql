-- 242: Deny-all RLS pe tabelele create după valul RLS din 24.06.2026.
-- Alertă Supabase 12.07.2026 (rls_disabled_in_public): 5 tabele noi rămase fără RLS.
-- Același pattern ca restul schemei publice: RLS ON, fără politici — anon/authenticated
-- nu văd nimic; backend-urile (bot Railway, apps/admin Vercel) merg pe service_role
-- care ocolește RLS, deci nimic nu se strică. Aplicat pe prod prin MCP 15.07.2026.

ALTER TABLE public.casier_amount_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casier_manual_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lde_route_legs_coord ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.piese_propuneri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.piese_propuneri_backup ENABLE ROW LEVEL SECURITY;
