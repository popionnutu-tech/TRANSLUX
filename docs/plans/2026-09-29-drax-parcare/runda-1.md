# ION-136 — parcarea propusă (1–2 locuri) în locul zilei ideale (runda 1)

## Decizia lui Ion (nu se dezbate)
Ion, 29.09.2026: «auto de la Sărata Veche să fie parcată la Fălești, ținând că sunt 2 ture orientativ în aceeași zonă — mai mare optimizare eu nu
văd»; «hai maximele teoretice să le scoatem, ele nu pot fi realizate în realitate»; «cum putem aceste reguli aplica pentru toate mașinile cu 2 rute
capăt diferit?»; «da, pornește, poți oferi 2 locuri propuneri, pe hartă ele să fie evidențiate clar».
Se dezbate doar metoda de calcul. Ziua ideală (§8.8) rămâne în cod ca bază (legături, plimbat, obligatorii), dar nu mai e cifra din raport.

## Metoda (vps/parcare.mjs; rulare vps/rulare-14.09.txt)
1. Curse cu oameni pe zi (economie-zile.json), capetele din urma GPS (primul punct ≥ t0, ultimul ≤ t1; staționările cu t0/t1).
2. Drumuri de acoperit: între două curse ale zilei cu locuri > 3 km (tur și retur la uzină: nimic) și noaptea (ultimul capăt → primul capăt al
   zilei următoare cu curse, circular ca ziua ideală). Nopțile în Bălți și pauzele > 1 zi (separat în ziua ideală) nu intră.
3. Candidați: satele / orașele OSM la ≤ 15 km de un capăt, parcul Bălți, casa șoferului; preselecție pe linie dreaptă, primii 10 (+ casa).
4. Cost prin loc P = drumul direct al zilei ideale pe acel gol / noapte (GPS median sau Valhalla × 1,05, `intervale[].leg`, `jumatati.legNoapte`)
   + max(0, V(a,P) + V(P,b) − V(a,b)), V = Valhalla × 1,05. Astfel propunerea nu poate ieși sub ideal din cauza modelului de drum.
5. Un loc = minimul pe candidați; două locuri = perechea care minimizează Σ min(cost prin P1, cost prin P2) — al doilea loc doar dacă scade ≥ 20 km
   pe săptămână (zile măsurate). Noaptea cântărește ½ pe fiecare zi.
6. Pe zi: real = gps − obligatorii − nopțile separate (ca ziua ideală); propus = drumurile prin loc + plimbatul pe loc (muncă, ION-133);
   economia mașinii = max(0, Σ real − Σ propus) pe zilele măsurate, adusă la 5 zile ca în raport.

## Rezultatul 14.09
Flota: 4.335,6 km/săpt. (3.881,2 măsurat) față de ideal 4.811,6; 11 mașini cu două locuri; 17 peste 100 km.
925FTI 415 (Ilenuța; Fălești dă 424 după calculul separat vps/falesti.mjs); 457BRAX 255 (Slobozia-Recea + Limbenii Vechi, ideal 301);
912RNK 257 (Popovca + acasă Dumbrăvița); 302YEK 194 (Baroncea + Căinarii Vechi); 186OMM 13,8 (ideal 37,1); 826GXP 8 (ideal 57).
Nicio mașină peste ideal (447ASB = ideal, 165,9).

## Întrebări
1. Cost = drum direct ideal + ocol Valhalla: corect ca să nu favorizeze propunerea?
2. Candidații: raza 15 km, primii 10 — pot rata locul bun? Casa șoferului inclusă — acceptabil?
3. Pragul pentru al doilea loc (20 km/săpt.) și noaptea ½ / ½.
4. Economia mașinii max(0, …) și aducerea la 5 zile — ca ziua ideală.
