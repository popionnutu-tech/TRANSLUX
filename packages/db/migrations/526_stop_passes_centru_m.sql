-- 526: distanța până la oprirea REALĂ, pentru opririle unde contează centrul (Sîngerei).
--
-- Ion, 07.10.2026: «mașina trebuie să treacă prin centrul Sîngerei, nu pe centură».
--
-- route_stop_passes.distance_m se măsoară față de oprirea MUTATĂ pe linia rutei (stop-times.mjs,
-- snapToShape) — corect pentru orele de pe site, unde satul e la 0,5–2 km de drumul mare. Dar linia
-- rutei trece pe centura Sîngereiului, deci orice autobuz de pe centură ieșea «trecut la 17 m».
-- Măsurat pe GPS-ul brut: pe 06.10, 63 de treceri pe centură (~950 m de oprirea din centru) și 7 prin
-- centru; la fel în iulie, august, septembrie.
--
-- centru_m = cât de aproape a ajuns urma brută de punctul real al opririi (route_shapes.stops), în
-- ±15 min de trecere. Se scrie doar pentru opririle din CENTRU_OBLIGATORIU în stop-times.mjs (azi:
-- Sîngerei); NULL în rest. Verificarea neconformităților judecă Sîngerei pe ea.
ALTER TABLE public.route_stop_passes ADD COLUMN IF NOT EXISTS centru_m integer;

COMMENT ON COLUMN public.route_stop_passes.centru_m IS
  'Distanța minimă (m) a urmei GPS brute față de punctul REAL al opririi (nu cel mutat pe linia rutei), în ±15 min de trecere. Doar la opririle unde ruta trebuie să intre în centru (Sîngerei). NULL = nemăsurat. Vezi migr. 526.';
