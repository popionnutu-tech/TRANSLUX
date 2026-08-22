-- 262: același sat scris în două feluri → cursa dispărea de pe site
--
-- localities, crm_stop_fares și tariful v2 nr. 4 scriu «Șirăuți», «Slobozia Șirăuți»,
-- «Bădragii Noi», «Bădragii Vechi» (ortografia oficială).
-- Tarifele v2 nr. 2 și 5 scriau «Șărăuți», «Slobozia Șărăuți», «Bădrajii Noi/Vechi».
--
-- normalize_stop_name() nu împacă cele două forme → nu exista pereche km →
-- căutarea publică ascundea cursele 17 și 18 pentru aceste sate.
-- Trafic real în 60 de zile: Bădrajii Vechi 1206 pasageri, Bădrajii Noi 1065.

UPDATE interurban_v2_stops SET name_ro = 'Șirăuți'          WHERE id IN (46, 174);
UPDATE interurban_v2_stops SET name_ro = 'Slobozia Șirăuți' WHERE id IN (47, 175);
UPDATE interurban_v2_stops SET name_ro = 'Bădragii Noi'     WHERE id = 181;
UPDATE interurban_v2_stops SET name_ro = 'Bădragii Vechi'   WHERE id = 182;

-- Notă: counting_entries păstrează denumirile istorice («Șărăuți», «Bădrajii …»).
-- Nu se modifică — sunt înregistrări de fapt. Rapoartele pe denumire rămân împărțite
-- până la o curățare separată.
