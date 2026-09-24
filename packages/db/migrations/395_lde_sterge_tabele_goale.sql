-- 395: tabelele goale ale paginilor LDE șterse (ION-53)
--
-- Ion, 24.09.2026: «goale sau moarte șterge» — întrebat explicit, a ales «Cod și tabele șterse».
-- Paginile Salarii, Comenzi & școlar, Alimentări numerar, Carduri, Acte recepție, Alerte DT,
-- Indicații AI și Experimente au fost scoase din cod în același tichet. Tabelele lor n-au avut
-- niciun rând de la creare (verificat 24.09), nicio vedere, funcție sau job pg_cron nu le citește,
-- iar codul rămas nu le mai pomenește.
--
-- Rămân: lde_vehicle_norms (177 de rânduri, normele de consum) și tot ce are date.
-- Calculele pure din packages/db (lde-salary-calc, lde-dt-calc, lde-receptie-calc) nu ating baza.
--
-- Garda: dacă între audit și aplicare a apărut vreun rând, migrația se oprește fără să șteargă nimic.
-- Fără CASCADE: dacă ceva neprevăzut depinde de o tabelă, DROP-ul eșuează în loc să-l ia cu el.

DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'lde_salary_audit', 'lde_salary_breakdown', 'lde_salary_uzine_monthly', 'lde_salary_runs',
    'lde_extra_orders', 'lde_school_periods',
    'lde_fuel_alimentari_cash',
    'lde_route_geometry',
    'lde_receptie_acts', 'lde_uzina_billing',
    'lde_dt_drivers_window', 'lde_dt_alerts',
    'lde_dt_indications',
    'lde_experiments'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      IF n > 0 THEN
        RAISE EXCEPTION 'migr. 395: % are % rânduri — nu se șterge nimic', t, n;
      END IF;
    END IF;
  END LOOP;
END $$;

-- În ordinea cheilor străine: întâi cele care trimit spre altele.
DROP TABLE IF EXISTS public.lde_salary_audit;
DROP TABLE IF EXISTS public.lde_salary_breakdown;
DROP TABLE IF EXISTS public.lde_salary_uzine_monthly;
DROP TABLE IF EXISTS public.lde_salary_runs;
DROP TABLE IF EXISTS public.lde_extra_orders;
DROP TABLE IF EXISTS public.lde_school_periods;
DROP TABLE IF EXISTS public.lde_fuel_alimentari_cash;
DROP TABLE IF EXISTS public.lde_route_geometry;
DROP TABLE IF EXISTS public.lde_receptie_acts;
DROP TABLE IF EXISTS public.lde_uzina_billing;
DROP TABLE IF EXISTS public.lde_dt_drivers_window;
DROP TABLE IF EXISTS public.lde_dt_alerts;
DROP TABLE IF EXISTS public.lde_dt_indications;
DROP TABLE IF EXISTS public.lde_experiments;
