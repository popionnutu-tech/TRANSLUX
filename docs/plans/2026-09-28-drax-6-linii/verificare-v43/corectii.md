# Verificarea 15: corecții propuse (ideal-v4.3, schelet c541bb20…)

Nicio corecție nu schimbă un card sau turele din v4.3. Efectul pe km/zi GPS al corecțiilor de mai jos este 0 (card 5.667 km/zi). Registrul îl scrie sesiunea principală; eu dau doar textul.

## R. Textul propus pentru registru (re-semnare pe c541bb2036e8cdf3244a102a259ec80f4ddec12b484496c626b638530f7efd79)

Ce se semnează și ce nu:
- 5 intrări: C31 Putinești, C31 Iabloana, G1 Zarojeni, E1 Zarojeni, E1 Nihoreni.
- NU se re-semnează: G1 Sturzovca, pe sha-ul 629b0c1d. Explicația e moartă (X1): pe v4.3 G1 Sturzovca nu mai cade (card 23,9 = GPS 23,9, 15 zile).

### R-1 · R18 Zarojeni · G1 și E1
Textul primit se sprijină pe date adevărate, dar cifrele lui nu se reproduc exact (vezi Q4). Propun această formulare:

> «card 28,9 × 1, decizie explicită a dezbaterii (ION-112). Etalonul GPS al verificatorului (32,1 km, 4 zile) ia în calcul două perechi care nu sunt serviciul Zarojeni: 18.09 348KAJ pe Moara de Piatră / Cubolta (49,0 / 52,7) și 25.09 348KAJ grupa D pe Putinești / Țiplești (30,4 / 30,2), ambele fără oprire la Zarojeni. Fără ele rămân 2 perechi, deci etalonul e nedeterminat. Tururile EZ cu oprire la Zarojeni din septembrie sunt 13 valide (348KAJ 6 + 763LYY 7, etichetat R17; 09.09 are urmă ruptă), toate pe EST. Km-ul de la Zarojeni la poartă plus raza porții are mediana 27,8 (28,3 la oprire). Pe faze: faza A (seara) 27,6 (n 9), faza B (dimineața) 33,2 (n 4). Turul de dimineață trece la 15.09 și 18.09 printr-un ocol prin Elizaveta, sat al rutei R21 în act, iar atribuirea serviciului nu e dovedită. Media fazelor, fără scăderea ocolului, dă 30,4 (cu faza B pe 4 picioare). Se remăsoară când faza B are mai multe zile. Returul EZ al lui 348KAJ nu oprește la Zarojeni (0/6) și se termină la Gura Căinarului (24,3–25,0 km în faza A). C47 35 % vine din aceeași contaminare și din returul scurt; C47 față de card: tururi 9/14.»

Aceeași intrare acoperă E1: C47 35 %, fără steag «diagnostic» în schelet.

### R-2 · R3 Nihoreni · E1 (variante: poarta sensului 42,3 / orice poartă 45,8)
Textul primit NU se poate semna așa. Premisa «pe aceeași poartă D și EZ merg pe același drum (tur 45,0 / 44,6)» nu se reproduce pe urmă (diagnostic în judecata.json, R3 Nihoreni). Propun:

> «44,2 × 2, card sigilat, decizie a dezbaterii (ION-112). Pe poarta EST grupele D și EZ merg pe același drum până la Nihoreni (38,6 / 38,8 km de la poartă). Grupa D (186OMM) face după aceea o buclă de circa 12 km în zona Rîșcani și trece a doua oară prin Nihoreni: D tur EST 52,6, D retur EST 50,55; EZ tur VEST 42,75, EZ retur EST 42,6 (septembrie; la fel în mai–iulie). Cardul e un singur km pe linie (§6.1) și stă în 5 % de ambele etaloane: +4,5 % față de poarta sensului (42,3, 16 zile), −3,5 % față de orice poartă (45,8, 26 de zile). Dacă bucla D e cu oameni, se măsoară în F4 pe opriri (întrebarea Q1).»

### R-3 · R18 Putinești și R27 Iabloana · C31
Textul primit se poate semna, cu o singură completare de fapt pentru Putinești, dacă sesiunea o vrea:

> «… Putinești de R32 Trifănești (146BRAZ) și, în mai–iulie, de R17 Prajila (763LYY); izolat în septembrie și în cursele lui 763LYY (11.09) și 348KAJ (24–25.09).»

## L. Corecții în lanț (propuneri; dosar nou `drax/date/ideal-v4.4/`, niciodată pe loc)

### L-1 · atribuirea pe opriri pentru toate mașinile
- **Fișierul:** `drax/cod/ideal/etalon.mjs`, filtrul «tranzit» / atribuirea liniei (§4.2).
- **Regula de azi:** testul de opriri («cel puțin două opriri în satele rutei sau una la capătul liniei») se aplică doar mașinilor din afara graficului liniei.
- **Propunerea:** testul se aplică oricărui picior. Piciorul fără nicio oprire în satele liniei nu intră în etalonul, turele și C47 ale liniei; se atribuie liniei ale cărei sate le oprește, altfel rămâne fără linie.
- **Cazuri văzute:**
  - 348KAJ 18.09 (Moara de Piatră) și 25.09 (Putinești / Țiplești), etichetate R18 Zarojeni;
  - 763LYY: 01–18.09 Zarojeni / Gura Căinarului, 22–25.09 Moara de Piatră, etichetat R17.
- **Efectul pe card:** 0 (cardurile Zarojeni și Prajila sunt decizii).
- **Efectul pe etalonul GPS Zarojeni:** 32,1 → nedeterminat (2 perechi). Cu regula de rezervă C20, pe toată fereastra, v12 dădea 30,7 pe 9 zile.
- **Efectul pe ture/zi:** 0 la Zarojeni (rămâne 1 pe zi). La Prajila, 0 pe mediană (763LYY e deja scos).
- **Înainte de aplicare:** rulare pe flotă (câte picioare mută pe fiecare linie) și verificare nouă.

### L-2 · harta pe zi bună GPS (C22, neschimbat față de v12)
- **Liniile:** R6 Mihăilenii Vechi (917FTI 08.09), R25 Hiliuți (912RNK 15.09), R37 Musteața (925FTI 25.09).
- **Starea:** ziua desenată nu e zi bună GPS. Cardul e corect (= GPS).
- **Propunerea:** la următoarea rulare a lanțului, ziua desenată se alege dintre zilele bune GPS.
- **Efectul:** 0 km/zi.

## Migrația 417 (neaplicată): ce trebuie schimbat înainte de aplicare
- **§6.6, fraza despre Nihoreni:** «la Nihoreni, pe aceeași poartă, D și EZ merg pe același drum (tur 45,0 / 44,6), deci un card, 44,2 × 2». Datele o contrazic. De înlocuit cu faptul din R-2: drum comun până la Nihoreni, bucla D de circa 12 km, un card pe linie.
- **§6.6, fraza despre Zarojeni:** «mediana celor 12 tururi EZ din septembrie (28,45 …) … 31,45». De înlocuit cu cifrele reproductibile din R-1 (27,8 / 28,3; 30,4) sau de scris metoda cu care au ieșit.
- **Restul textului pentru cele 6 linii se confirmă pe date:**
  - §1.4: v4.3.
  - §2.4 Sturzovca: schimbul grupei D, două mașini.
  - §6.3: 47 din 49 de linii din septembrie; Lazo și Popești pe toată fereastra.
  - §6.5: 29 × 1, 20 × 2, niciuna × 3; 5.667 km/zi; 763LYY 0 opriri la Prajila în zilele lucrătoare; 713IZX / 487NPL o mașină pe zi; Florești 518MHD 2 ture.
