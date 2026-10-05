-- 507: rândul manual intră în documentul zilei în care a fost INTRODUS.
--
-- Ce s-a întâmplat (Ion, 05.10.2026): casierul a introdus azi 29 de foi, dar a schimbat din
-- greșeală data din antetul documentului între reprize. Rândurile s-au împrăștiat pe patru
-- documente — 2 pe 02.10, 8 pe 03.10, 7 pe 04.10, 12 pe 05.10 — deși toate au fost tastate
-- pe 05.10. Nimic nu s-a pierdut, dar documentul unei zile nu mai corespunde cu ce a încasat
-- casierul în ziua aceea, iar la închiderea casei cifrele nu se potrivesc cu banii din sertar.
--
-- Regula, de acum: ziua documentului NU se mai ia de la client, se citește din ceasul
-- serverului. Tot ce se introduce pe parcursul zilei intră în documentul zilei respective,
-- orice dată ar fi selectată pe ecran.
--
-- Ziua FOII (data_foaie) rămâne separată și liberă — ea e motivul pentru care documentul de
-- azi conține foi de pe 01–04.10, și așa trebuie să fie. Se schimbă doar `ziua`.
--
-- DOAR pentru viitor: rândurile existente nu se ating. Cele 17 deja rătăcite rămân unde sunt;
-- dacă vor fi mutate, se face separat și deliberat.
--
-- De ce în trigger și nu în server action: regula ține de adevărul documentului, nu de un
-- ecran. Pusă aici, nicio cale de scriere — nici o importare viitoare, nici un script — n-o
-- poate ocoli. Codul care trimite `ziua` nu trebuie schimbat: valoarea lui e pur și simplu
-- ignorată, deci migrația asta e completă singură, fără deploy.

-- Ora Chișinăului, nu UTC: un rând tastat la 01:30 noaptea aparține documentului zilei locale.
ALTER TABLE public.casier_manual_rows
  ALTER COLUMN ziua SET DEFAULT (now() AT TIME ZONE 'Europe/Chisinau')::date;

CREATE OR REPLACE FUNCTION public.casier_manual_ziua_introducerii()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.ziua := (now() AT TIME ZONE 'Europe/Chisinau')::date;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.casier_manual_ziua_introducerii() IS
  'Ziua documentului de casier = ziua (Chișinău) în care rândul a fost introdus. Vezi migr. 507.';

-- Numai la INSERT. La UPDATE `ziua` rămâne neatinsă, dar nici blocată: o corectare deliberată
-- de date (mutarea unui rând greșit în documentul potrivit) trebuie să rămână posibilă.
-- Un UPDATE obișnuit din interfață nu trimite `ziua`, deci nu o schimbă oricum.
DROP TRIGGER IF EXISTS trg_casier_manual_ziua ON public.casier_manual_rows;
CREATE TRIGGER trg_casier_manual_ziua
  BEFORE INSERT ON public.casier_manual_rows
  FOR EACH ROW EXECUTE FUNCTION public.casier_manual_ziua_introducerii();

COMMENT ON COLUMN public.casier_manual_rows.ziua IS
  'Ziua documentului de casier: ziua în care rândul a fost INTRODUS la casă (ora Chișinăului), nu ziua foii. Scrisă de trigger la INSERT, nu de client — vezi migr. 507. Ziua foii de parcurs e data_foaie.';
