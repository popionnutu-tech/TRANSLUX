-- 398: Ultimele 7 mașini — redenumite după contabil, dublurile scoase. Acum toate sunt legate de 1C.
--
-- Contabilul a confirmat că cele 7 rămase există la el, dar scrise altfel. Verificate una câte una în
-- nomenclatorul «Виды деятельности», au ieșit trei situații diferite:
--
-- 1) DUBLURI LA NOI. `314BRAZ`, `526WVW` și `998TOP` existau în baza noastră PE LÂNGĂ variantele corecte
--    `314BRAT`, `526WDW`, `998TCP` — care erau deja legate de 1C din migr. 396. Nu erau mașini lipsă, erau
--    gemene scrise greșit. Niciuna n-avea vreun document, deci se scot. Garda din DELETE cere ca varianta
--    corectă să existe ȘI să fie legată: dacă n-ar exista, ștergerea ar lăsa mașina deloc în sistem.
--    ATENȚIE: ambele variante sunt și în `vehicles` (evidența parcului, modulul lui Ion) — acolo curățenia
--    rămâne de făcut de el.
--
-- 2) LITERE GREȘITE LA NOI. `725YOZ` → `725YZO`, `745RSN` → `745RZN`, `768RSN` → `768RZN`. Mariana a
--    confirmat că ea le-a introdus greșit. Se REDENUMESC, nu se șterg: pe `745RSN` Eduard eliberase deja
--    două documente, iar e aceeași mașină fizică — ștergerea ar fi rupt legătura cu ele.
--
-- 3) NUMĂR SCHIMBAT. `061COY` nu lipsea din nomenclator: mașina și-a schimbat numărul și e acum
--    `685 AKD`. Rândul nostru n-avea niciun document, deci s-a redenumit și legat.
--
-- Rezultat: 203 din 203 de mașini active legate de 1C. Niciuna nu mai blochează descărcarea unei eliberări.
UPDATE piese_vehicles SET plate = '685AKD', guid_1c_activitate = '025cb846-4197-11ea-80ea-2cfda1bbfecf'::uuid
 WHERE plate = '061COY' AND NOT EXISTS (SELECT 1 FROM piese_vehicles x WHERE x.plate = '685AKD');

WITH corect(vechi, nou, guid) AS (VALUES
  ('725YOZ','725YZO','d3775d12-41b2-11ea-80ea-2cfda1bbfecf'),
  ('745RSN','745RZN','818a79fa-df0b-11f0-816b-2cfda1bbfecf'),
  ('768RSN','768RZN','ae451831-df3f-11f0-816b-2cfda1bbfecf'))
UPDATE piese_vehicles v SET plate = c.nou, guid_1c_activitate = c.guid::uuid
  FROM corect c
 WHERE v.plate = c.vechi AND NOT EXISTS (SELECT 1 FROM piese_vehicles x WHERE x.plate = c.nou);

DELETE FROM piese_vehicles v
 WHERE v.plate IN ('314BRAZ','526WVW','998TOP')
   AND NOT EXISTS (SELECT 1 FROM piese_stock_documents d WHERE d.vehicle_id = v.id)
   AND NOT EXISTS (SELECT 1 FROM piese_stock_movements m WHERE m.vehicle_id = v.id)
   AND EXISTS (SELECT 1 FROM piese_vehicles ok
                WHERE ok.guid_1c_activitate IS NOT NULL
                  AND ok.plate IN ('314BRAT','526WDW','998TCP')
                  AND left(ok.plate,3) = left(v.plate,3));
