-- 399: LEAR Florești intră în analiza săptămânală a regulilor (ION-59)
--
-- Ion, 25.09.2026: «aplică regulile livrare și regulile km/liber și brambura de la LEAR și aici».
-- lear-analiza.mjs rulează acum și cu --uzina LEAR_FLORESTI (lunea, din lear-saptamanal.sh). Îi
-- trebuie ce are și Ungheniul în bază: ferestrele de ceas (copia mașinală a §3.3) și regula
-- livrării, în cuvinte, pe /lde/livrare-reguli.
--
-- Ferestrele vin din histograma sosirilor și plecărilor la poartă pe 100 de zile (16.06–23.09.2026):
-- schimbul 1 sosește la ~05:00 și pleacă la ~14:00; schimbul 2 sosește 13:00–16:00 și pleacă la
-- ~23:00. Sunt cele cu care s-a tăiat scheletul (floresti/cod/taie.mjs, FER), nu altele.

INSERT INTO lde_uzina_ferestre_ceas (uzina_id, sens, shift_number, de_la_min, pana_la_min, sursa) VALUES
  ('LEAR_FLORESTI', 'tur',   1,  180,  450, 'GPS 16.06–23.09.2026'),   -- sosire 03:00–07:30
  ('LEAR_FLORESTI', 'tur',   2,  660,  990, 'GPS 16.06–23.09.2026'),   -- sosire 11:00–16:30
  ('LEAR_FLORESTI', 'retur', 1,  810, 1005, 'GPS 16.06–23.09.2026'),   -- plecare 13:30–16:45
  ('LEAR_FLORESTI', 'retur', 2, 1290,  150, 'GPS 16.06–23.09.2026')    -- plecare 21:30–02:30
ON CONFLICT DO NOTHING;

UPDATE lde_uzine SET reguli_livrare_la = now(), reguli_livrare = $reguli$REGULILE LIVRĂRII — LEAR FLOREȘTI (formalizate 25.09.2026, după regulile de la Ungheni dictate de Ion 18–25.09)

1. SURSE DE ADEVĂR
1.1 Graficul (lde_atribuiri_zilnice, active_assignments) NU se folosește: driver_id e gol, legătura șofer–autobuz nu există în bază.
1.2 Cine lucrează la LEAR Florești se decide din urma GPS: mașina intră dacă a fost la poartă (47.89645, 28.29982; rază 0,7 km) ≥ 4 zile pe săptămână. Sub prag → «de verificat», nu dispare.
1.3 Nomenclatorul rutelor = actul de recepție săptămânal către Î.C.S Lear Corporation (nr. 36.1, 01–06.09.2026): tura A 5 rute (A1, A2, A3, A5, A6; 100 locuri), tura B 4 rute (B1–B4; 80 locuri), toate de 20 de locuri. Denumirea rutei e textul din act; din act se iau DOAR rutele, nu km-ii (Ion, 24.09).
1.4 Lista rută-pe-mașină (tabelul lui Ion, 23.09): 849BRAN A1/B2, 894BRAX A2/B3, 603BRAS A3/B1, 035BRAT A5/B4, 279BRAT doar A6. Bate potrivirea automată.
1.5 Listele spun doar CE face o mașină care a lucrat; niciodată DACĂ aparține uzinei. 894BRAX e trecut în bază pe SEBN Orhei, dar lucrează la Florești — urma decide.

2. ORELE UZINEI
2.1 Schimbul 1: sosire ~05:00, plecare ~14:00. Schimbul 2: sosire 13:00–16:00, plecare ~23:00. Schimbul 3 nu există la Florești.
2.2 Lucrează luni–sâmbătă; duminica nu. Rotație săptămânală: aceeași mașină face tura A în schimbul 1 într-o săptămână și în schimbul 2 în următoarea (035BRAT: Soroca dimineața o săptămână, după-amiaza cealaltă).
2.3 Până în iunie 2026 orele erau altele (sosiri 07/16, plecări 16/01); programul de acum e din vară.
2.4 Ziua de lucru ține 03:00 → 03:00 (ora locală).

3. TUR ȘI RETUR
3.1 TUR = cursa care ADUCE oameni din sate la poartă; schimbul după ora SOSIRII. RETUR = cursa care DUCE oameni de la poartă; schimbul după ora PLECĂRII.
3.2 Ferestre de ceas: tur s1 sosire 03:00–07:30 · tur s2 sosire 11:00–16:30 · retur s1 plecare 13:30–16:45 · retur s2 plecare 21:30–02:30 (lde_uzina_ferestre_ceas).
3.3 O cursă deja potrivită pe o rută a mașinii nu se aruncă după lista de sate: în săptămâna rotită ruta B4 cade în schimbul 2 (Ion, 24.09, la 035BRAT).
3.4 Cursa se termină la LEAR sau la o staționare > 25 min.

4. RUTA ȘI CAPĂTUL
4.1 Ruta = de la capăt până la poartă. Capătul = PRIMUL sat din denumirea rutei, ACELAȘI la tur și la retur; tăietura se face pe urmă (prima apropiere la tur, ultima la retur).
4.2 Capăt fixat pe GPS: A2 → Cuhureștii de Sus. Denumirea din act (Unchitești–Cuhureștii de Sus–Cunicea) e ruta de până în iulie (~53 km pe sens); din august 894BRAX vine de la Pohoarna prin Cunicea fără să oprească și strânge de la Cuhureștii de Sus (~29 km pe sens). Cunicea are pasager ocazional (9 opriri în 100 de zile), nu e capăt.
4.3 Sate din act fără opriri în 100 de zile: Ciutulești (B2, mașina nu trece pe acolo — merge prin Sîrbești), Trifănești (A5, doar trece), Florești-oraș (B1). Nu-s capete și nu se numără.
4.4 Puncte de încărcare regulate care NU sunt în act: Soroca Nouă (B4, 64% din curse; bucla adaugă ~12 km pe sens), Hîrtop și Bobulești (A2, 83% și 57%), Scăieni și Bezeni (A5, între Căinarii Vechi și Frumușica), Sevirova (A5), Sîrbești (B2). Sunt muncă a rutei, nu brambura.
4.5 279BRAT face în schimbul 2 o rută care nu e în act (Țîra → Racovăț → Parcani → Redi-Cereșnovăț → LEAR, ~77 km pe sens, cu oameni). Se arată ca «drum în afara rutelor din act», nu ca drum acasă și nu ca timp liber.
4.6 Satul intră în cursă dacă autobuzul a coborât sub 8 km/h în raza de 0,8 km și a stat ≥ 20 s sub 15 km/h; durata numără și golul dinaintea primului punct lent (punctele vin la ~30 s).

5. CATEGORII DE KM
5.1 CU OAMENI: capăt ↔ poartă. Nu se optimizează. 5.2 GOL PE RUTĂ: e al uzinei. 5.3 GOL EVITABIL: casă → capăt și plimbările între ture. Se optimizează. 5.4 SERVICE: drumul la Parcul Bălți (31 km de poartă) — «la service», nu anomalie. 5.5 NAVETA ȘOFERULUI nu se numără (Ion, 24.09). 5.6 Km-ii zilei din urma GPS brută (03:00–03:00, salt > 5 km aruncat).

6. ETALONUL (SCHELETUL, fixat 25.09.2026, apps/admin/public/lde/schelet-floresti.json)
6.1 O zi intră în etalon doar cu tur ȘI retur până la capăt, cu urma întreagă (trece prin satele în care ruta oprește de obicei — ≥ 50% din curse) și cu turul egal cu returul (≤ 18%: A5 face tur ~28,7 / retur ~24,4 pe drumuri diferite). Etalonul = MEDIANA zilelor bune din ultima lună (ruta de acum, nu cea veche: A5 s-a scurtat cu 10 km pe sens în august).
6.2 Km-ii vin din urma lipită pe drum cu Valhalla, legată de poartă pe șosea, nu din km bruți: pe Soroca–Florești tracker-ul are goluri de peste 5 km (B4: brut 45, urmă 59).
6.3 Scheletul arată doar drumul cu oameni; golul nu e în schelet (Ion, 25.09).

7. UNDE DOARME MAȘINA
7.1 Casa = din urmă, zilele de lucru, staționări ≥ 2 h; poarta și parcul excluse. 849BRAN Cașunca, 894BRAX Pohoarna, 279BRAT Țîra, 603BRAS Țepilova/Prajila, 035BRAT la capătul rutei din schimbul 2 (Căinarii Vechi sau Soroca Nouă/Zastînca, după săptămână; șoferul probabil la Bulboci).
7.2 Corridoarele se inversează săptămânal, deci locul unde doarme mașina se schimbă odată cu ele.

8. REGULILE DE ECONOMIE (ca la Ungheni; măsurate pe ziua desenată, pauză cu pauză, drumuri Valhalla)
R1 doarme la uzină, 4 drumuri pe rută · R2 realocarea rutelor între mașini de aceeași capacitate (toate 20 de locuri: 894BRAX ↔ 279BRAT schimbă A2 ↔ A6, −42 km/zi) · R3 nu pleacă acasă între ture (−211 km/zi pe flotă) · noaptea la capătul rutei (−108 km/zi, peste R3). R1 o cuprinde pe R3.
8.1 Tipul mașinilor de la Florești nu e în bază: raportul le arată fără lei până le dă Ion.

9. TIMP LIBER ȘI BRAMBURA — ca la Ungheni, §11 din regula LEAR Ungheni: lanțul muncii ancorat la poarta Florești în ferestrele de la 3.2; reparație = orice oprire la depozitul din Bălți; altă uzină = poarta altei uzine din lde_uzine_gates (Ungheni, Drăxlmaier, SEBN, Trox); liber și brambura separat, steag la 50 km pe săptămână pe mașină. Mesajul de luni către ADMIN rămâne deocamdată doar pentru Ungheni.

ORA GPS: trackerul scrie UTC fără fus; workerul o trece în ora Moldovei (Europe/Chisinau).$reguli$
WHERE id = 'LEAR_FLORESTI';
