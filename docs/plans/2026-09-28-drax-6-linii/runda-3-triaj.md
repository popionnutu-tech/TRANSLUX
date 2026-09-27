# ION-112 — runda 3: triajul părții Claude și candidatul corectat (pentru Codex, runda 3)

## Pozițiile Claude, runda 3 (rapoartele: r3/verificator-raport.md, r3/r3-business.md, r3/r3-analist.md)
| linie | verificator (6,5; 9,0 după corecții) | business (8,5) | analist (6,5) | Codex r2 |
|---|---|---|---|---|
| Nihoreni R3 | 44,2 × 2 (retrage 47,2) | 44,2 × 2 | 44,2 × 2 | 44,2 × 2 provizoriu |
| Zarojeni R18 | 28,9 × 1 | 28,9 × 1 | 28,5 × 1 (acceptă 28,9) | × 1, km provizoriu 28,9 |
| Bocancea Schit R36 | 53,3 (retrage 54,5) | 53,3 | 53,3 | 53,3 |
| Prajila R17 | 41,3 × 2 | 41,3 × 2 | 41,3 × 2 | 41,3 × 2 provizoriu |
| Sturzovca R27 | 23,9 × 2 | 23,9 × 2 | 23,9 × 2 | 23,9 × 2 |
| Florești / Vărvăreuca / Trifănești | 36,5 / 42,8 / 40,2 × 2 | la fel | la fel | acord |
| H4 | 348KAJ iese; 763LYY diagnostic până îi ies picioarele din Prajila | 348KAJ iese; 763LYY «atribuire greșită» | toate ies; 763LYY de reetichetat | 348KAJ, 763LYY diagnostic |
Dovezi noi r3 (viteza în noduri × 1,852 peste tot): Nihoreni — pe aceeași poartă D și EZ merg pe același drum (tur 44,6 / 45,0), diferența din export vine de la poarta de intrare (EZ VEST 18/18, D EST 19/19). Zarojeni — returul EZ nu ajunge la capăt (0/8, se termină la Gura Căinarului), turul oprește 6/7; 348KAJ oprește 1,5–6,5 min în Zarojeni 5/5 zile după plecarea de acasă → cursă cu oameni, nu parcare. Prajila — 713IZX și 487NPL se înlocuiesc (o mașină pe zi); 763LYY nu oprește la Prajila în nicio zi lucrătoare din septembrie, picioarele lui «R17» sunt serviciul Zarojeni/Gura Căinarului (07–18.09) și Moara de Piatră (din 21.09).

## Triaj
- ACCEPTAT (verificator high): candidatul avea Zarojeni × 2 și Prajila × 3 (+140 km/zi fictivi). Reparat: card-gps.mjs — la «card-vechi» km din cardul sigilat ideal-v3, ture/zi MĂSURATE (cerința Codex r2 «cardul păstrează turele vechi»); decizia cu steag null = linie închisă, fără «diagnostic cerut».
- decizii-v3.json v4.3: scoase card-vechi Sturzovca, Bocancea Schit (GPS dă 23,9 × 2 și 53,3 × 1); Zarojeni card-vechi 28,9 cu ture măsurate (1); Nihoreni card-vechi 44,2 × 2 fără steag; Prajila poarta-sensului fără 763LYY → 41,3 × 2 (GPS, nu scris).
- Lanțul v4.3 rulat (r9): deciziile se reproduc ±0,1 km; diagnostic cerut 0; card 5.864 → 5.667 km/zi (Zarojeni −57,8, Prajila −82,6, Sturzovca −53,8, Bocancea −2,4). Blocantele (a) rămase: Putinești, Iabloana (linii comasate, §1.4, migr. 415, registrul le explică).
- 763LYY: scos din populația Prajila prin decizie (nu reetichetat pe altă linie; Zarojeni rămâne × 1 — tzE sept 1). Rămâne în H4? Propunere: iese din H4 ca «capăt atins prin parcare», intră în registru «atribuire greșită, scos din Prajila (decizie)».
- RESPINS: Zarojeni 28,5 (analist) — 1,4 % față de 28,9, aceeași convenție plin + rază ca restul cardurilor dă 28,9 (business); nu se schimbă o linie pe altă convenție.
- DESCHIS pentru Ion, neblocant: Rîșcani-Vest (1,7 km dincolo de Nihoreni) ca punct real de pornire (§4.1) → linia ar urca la ~48–50 km.

## Întrebări pentru Codex, runda 3
1. Accepți valorile finale pe cele 6 linii + Prajila (tabelul de mai sus, coloana majorității)?
2. Accepți regula «card-vechi = km sigilat, ture măsurate; steag null = linie închisă»?
3. H4: 348KAJ iese; 763LYY iese ca parcare și e explicat în registru ca atribuire greșită scoasă din Prajila — de acord?
4. Ceva blocant înainte de GATA + verificatorul vN + activare?
Fișiere: r3/vps/card-gps.mjs, r3/vps/decizii-v3.json, r3/vps/card-gps-raport.txt.
