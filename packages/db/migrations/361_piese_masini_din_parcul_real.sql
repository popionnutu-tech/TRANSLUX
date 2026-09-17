-- 361: Modulul Piese cunoaște tot parcul, nu doar 56 de mașini.
--
-- Cerut de Mariana (17.09): «aduci toate masinile, pe viitor pot fi alte masini in reparatie».
-- Piesele se pot pune pe orice mașină a firmei, iar lista scurtă de până acum bloca tocmai cazurile
-- neprevăzute — exact cele pentru care se scot piese din depozit.
--
-- Sursa e `vehicles` (parcul real, folosit de modulul LDE), nu o listă nouă: o a doua listă de mașini ar
-- fi început să diveargă din prima zi.

-- (1) Două numere scrise greșit, confirmate de Mariana. NU se șterg — au istoric (029 are 82 de mișcări);
--     se redenumesc, iar istoricul rămâne legat de aceeași mașină.
--       „029"    era trunchiat  → 029BRAS
--       „TWK654" era inversat   → 654TWK
UPDATE piese_vehicles SET plate = '029BRAS' WHERE plate = '029'
  AND NOT EXISTS (SELECT 1 FROM piese_vehicles v2 WHERE v2.plate = '029BRAS');
UPDATE piese_vehicles SET plate = '654TWK' WHERE plate = 'TWK654'
  AND NOT EXISTS (SELECT 1 FROM piese_vehicles v2 WHERE v2.plate = '654TWK');

-- (2) Restul parcului.
--
-- ATENȚIE, aici e greșeala pe care am făcut-o și pe care o repară migr. 362: verificarea de mai jos
-- compară numărul normalizat cu `plate` AȘA CUM E STOCAT. Un rând vechi scris cu spațiu („692 TWK") nu e
-- găsit, iar mașina se inserează a doua oară. Forma corectă e să se normalizeze AMBELE părți. Migrația se
-- păstrează așa cum a fost aplicată; 362 curăță urmarea și normalizează tabelul.
INSERT INTO piese_vehicles (plate, model, active)
SELECT DISTINCT upper(replace(replace(btrim(v.plate_number), ' ', ''), '-', '')),
       'Autobuz/microbuz', COALESCE(v.active, true)
  FROM vehicles v
 WHERE NULLIF(btrim(v.plate_number), '') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM piese_vehicles p
      WHERE p.plate = upper(replace(replace(btrim(v.plate_number), ' ', ''), '-', '')))
ON CONFLICT (plate) DO NOTHING;
