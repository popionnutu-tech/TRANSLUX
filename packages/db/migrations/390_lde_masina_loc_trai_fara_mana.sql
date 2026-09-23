-- 389: locul de trai al mașinii se scoate din GPS, nu se scrie cu mâna
--
-- Ion, 23.09.2026: «de mine nimeni niciodată nu va introduce», apoi «scoate scrisul cu mâna
-- în general».
--
-- Migrația 388, de acum o oră, adăugase patru coloane ca omul să poată scrie satul, șoferul
-- și data. Greșeala era în premisă, nu în coloane: satul unde doarme mașina se vede în
-- fiecare noapte din `lde_gps_stops.is_base`, scris de `gps-worker.mjs` la 03:00. O coloană
-- care dublează o măsurătoare automată și așteaptă să fie completată rămâne goală pentru
-- totdeauna, iar prezența ei face restul coloanei să pară nesigură — «poate cineva trebuia
-- să scrie ceva aici și n-a scris».
--
-- Verificat înainte de a le șterge: cu_sat 0, cu_sofer 0, cu_data 0, cu_nota 0, din 177 de
-- rânduri. Nimeni n-a apucat să scrie nimic, deci nu se pierde nimic.
--
-- Mutarea se vede acum din două ferestre peste aceleași opriri de bază: ultimele 7 zile
-- față de ultimele 30. Când se despart, mașina a început să doarmă în alt loc — semn că
-- s-a schimbat șoferul. Nimic de completat, nicăieri.

ALTER TABLE lde_vehicle_norms
  DROP COLUMN IF EXISTS home_locality,
  DROP COLUMN IF EXISTS home_driver,
  DROP COLUMN IF EXISTS home_since,
  DROP COLUMN IF EXISTS home_note;
