# Drăxlmaier — planul de schimb al liniilor, v1 (ION-108 A), săptămâna 14–20.09.2026

Stare: model construit, plan calculat, controale rulate, JSON scris pe VPS. **NU** s-au atins `saptamanal.sh`, `scrie-analiza.mjs`
și rândul 14.09 din `lde_analiza_reguli` (oprire cerută de sesiune: 3 runde de revizie întâi).

- Cod VPS: `/root/lde-worker/drax/cod/plan-schimb/{model.mjs,plan-schimb.mjs,test.mjs}` (dosar nou; nimic altceva atins)
- Ieșire VPS: `/root/lde-worker/drax/date/plan-schimb/2026-09-14.json` (+ `valhalla-cache.json` propriu; cache-ul săptămânii doar citit)
- Copii: `scratchpad/p108/plan-2026-09-14.json`, `scratchpad/p108/cod/`, și în arborele ION-108
  `docs/plans/2026-09-27-drax-plan-schimb/` (fără commit)
- Rulare: `node plan-schimb.mjs <ECON_D> [--out f.json]` — fără `--out` nu scrie nimic (așa s-a făcut proba pe 07.09)

## 1. Modelul, în cuvinte simple

1. **Sarcina** = ce face azi o mașină pe un schimb: linia turului (dimineața s1 / după-amiaza s2, de la capăt la poartă) + linia
   returului (15:52 s1 / 00:15 s2, de la poartă la capăt), în zilele în care a făcut-o. Luată din rândul săptămânii
   (`economie-zile.json`, bucățile «cu oameni»): pe fiecare zi cursa cea mai lungă a jumătății, apoi linia cea mai frecventă pe
   săptămână. Sub 2 zile = neregulat, rămâne pe loc (29 de cazuri, listate în JSON la `neregulate`).
   14.09: 38 de mașini, 67 de sarcini.
2. **O sarcină se mută întreagă** (tur + retur + zilele ei) de la o mașină la alta. Km cu oameni nu se schimbă — aceleași curse se
   fac oricum.
3. **Km goi ai unei mașini pe zi** = casă → începutul primei curse + golurile dintre curse + sfârșitul ultimei curse → casă, pe șosea
   (Valhalla localhost:8002, costing bus). Ordinea zilei Drăxlmaier e fixă: tur s1 (~05–06:15) → tur s2 (~13–14:45) → retur s1
   (15:52) → retur s2 (00:15). Golurile:
   - tur s2 → retur s1 (~1 h, ambele la poartă): drumul direct poartă → poartă;
   - celelalte goluri (≥ 3 h): **prin casă dacă mașina merge azi acasă în golul de felul acesta**, altfel drumul direct.
     «Merge acasă» se măsoară pe GPS, pe fiecare mașină și fel de gol (dimineață ts1→ts2, seară rs1→rs2, tur→retur la mașina de un
     schimb): în gol e un ocol pe acasă (`ocol` din rând) SAU km GPS ai golului ≥ 0,8 × (capăt/poartă → casă → capăt/poartă) pe
     șosea; decide majoritatea zilelor. E obiceiul mașinii (al șoferului), rămâne la ea după mutare.
4. **Casa** = locul nopții din rând (`economie.json → masini[].casa`).
5. **Condițiile**: fiecare sarcină acoperită exact o dată; mașina de două schimburi primește tot un s1 și un s2, cea de un schimb
   tot unul, pe același schimb; aceeași formă (tur + retur / doar tur / doar retur — ca să nu «economisim» o jumătate nedetectată);
   **clasa**: mașina poate lua sarcina dacă clasa ei = locurile liniei SAU = clasa mașinii care o face azi. Clasa mașinii = cele mai
   multe locuri dintre liniile pe care le face azi (în bază nu există numărul de locuri al mașinii; e o margine de jos, deci
   restricția e prudentă). Mașinile fără casă nu se mută (14.09: niciuna).
6. **Repartizarea comună**: algoritmul ungar pe fiecare schimb (costul = km goi pe săptămână ai mașinii cu sarcina dată și
   celălalt schimb fixat), alternat s1 / s2 până nu mai scade, apoi schimburi două câte două pe tot (prind legătura dintre
   schimburi prin poartă). O penalitate de 0,5 km pe mutare împiedică mutările fără câștig. Sarcinile cu aceleași linii pe același
   schimb sunt interschimbabile: dacă o mașină a primit «aceeași» sarcină ca a ei, își ia înapoi sarcina proprie (altfel textul ar
   spune «A lasă Prajila lui B; B lasă Prajila lui A»).
7. **Lanțurile** = ciclurile de mutări pe un schimb (A preia de la B, B de la C…, ultimul de la A); fiecare ciclu se poate aplica
   singur. Se aplică pe rând, cel mai bun întâi; economia unui lanț = câștigul lui peste lanțurile deja aplicate, deci Σ lanțuri =
   economia planului exact. Lanțurile sub 20 km/săpt. rămân deoparte, neaplicate.
8. **Lei** = km × lei/km al fiecărei mașini (`economie.json → leiKm`, norma înghețată a săptămânii), doar pe lanțurile în care toate
   mașinile au normă. Normele diferă mult (6,35 – 12,42 lei/km), deci un lanț care mută km de pe o mașină ieftină pe una scumpă
   poate câștiga km și pierde lei (vezi întrebarea 1).

## 2. Rezultatul 14–20.09

| | km goi/săpt. (model) |
|---|---|
| Înainte (repartizarea de azi) | 19.212,7 |
| După (planul) | 18.887,7 |
| **Economie** | **324,9 km/săpt. ≈ 605 lei** (lei doar pe lanțul 2; lanțurile 1 și 3 au mașini fără normă: 763LYY, 186OMM, 390ASB) |

Lanțurile aplicate (≥ 20 km/săpt.), cu textul generat:

1. **−148 km/săpt.** — «763LYY lasă R30 Coșernița (schimbul 2) lui 713IZX, care stă la Florești; 713IZX lasă R17 Prajila (schimbul 2)
   lui 763LYY, care stă la Băhrinești». 763LYY −306, 713IZX +158. Lei: — (763LYY fără normă).
2. **−101 km/săpt., +605 lei** — «830MUM lasă R19 Copăceni (schimbul 2) lui 725CWN, care stă la Sîngerei; 725CWN lasă R33 Iezărenii
   Vechi (schimbul 2) lui 830MUM, care stă la Sîngerei». 725CWN −107, 830MUM +6.
3. **−76 km/săpt.** — «186OMM lasă R3 Nihoreni (schimbul 2) lui 388ASB, care stă la Șuri; 388ASB lasă R12 Sofia (schimbul 2) lui
   390ASB, care stă la Pelinia; 390ASB lasă R4 Grinăuți (schimbul 2) lui 744ARF, care stă la Dacia; 744ARF lasă R19 Bilicenii Vechi
   (schimbul 2) lui 186OMM, care stă la Dacia». 186OMM −130, 744ARF −69, 388ASB +90, 390ASB +34. Lei: — (186OMM, 390ASB fără normă).

Deoparte (sub 20 km/săpt.): 447ASB ↔ 457BRAX (R27 Danu / R29 Ustia, s2) −19,7; 224BZP ↔ 144BRAZ (R36 Bocancea-Schit / R38 Glinjeni,
s2) −17,1. Au fost doar 3 lanțuri peste prag, deci «primele 5» = acestea 3 + cele 2 deoparte.

### Tabelul pe mașini (km goi pe zi de lucru; «=» = nu se schimbă)

| Mașina | Casa | Clasa | Azi s1 | Azi s2 | km goi/zi azi | După s1 | După s2 | km goi/zi după | Δ km/săpt. |
|---|---|---|---|---|---|---|---|---|---|
| 763LYY | Băhrinești | 50 | R17 Prajila | R30 Coșernița | 138.8 | R17 Prajila | R17 Prajila | 77.5 | -306.2 |
| 186OMM | Dacia | 50 | R4 Grinăuți | R3 Nihoreni | 119.1 | R4 Grinăuți | R19 Bilicenii Vechi | 93.1 | -130.3 |
| 725CWN | Sîngerei | 50 | R19 Copăceni | R33 Iezărenii Vechi | 106.8 | R19 Copăceni | R19 Copăceni | 85.4 | -107.1 |
| 744ARF | Dacia | 50 | — | R19 Bilicenii Vechi | 56.7 | — | R4 Grinăuți | 42.9 | -69.2 |
| 925FTI | Sărata Veche | 20 | R26 Ilenuța | R37 Musteața | 195 | = | = | 195 | 0 |
| 024XKY | Șuri | 27 | R14 Baroncea (doar turul) | — | 59.5 | = | = | 59.5 | 0 |
| 912RNK | Dumbrăvița | 27 | R25 Hiliuți | R35 Cucioaia | 197.9 | = | = | 197.9 | 0 |
| 345KAJ | Zăicani | 27 | R6 Mihăileni | R8 Costești | 226.6 | = | = | 226.6 | 0 |
| 457BRAX | Hîjdieni | 50 | R3 Nihoreni | R29 Ustia | 186 | = | = | 186 | 0 |
| 302YEK | Căinarii Vechi | 27 | R14 Baroncea | R32 Căinarii Vechi | 127.9 | = | = | 127.9 | 0 |
| 760BXI | Hîjdieni | 20 | R26 Obreja Veche | R28 Cuhnești | 179.1 | = | = | 179.1 | 0 |
| 435ASB | Autogara | 50 | — | R34 Tăura Veche | 76.1 | = | = | 76.1 | 0 |
| 144BRAZ | Dacia | 20 | — | R38 Glinjeni | 67.7 | = | = | 67.7 | 0 |
| 518MHD | Izvoare | 20 | R32 Trifănești (tur) / R16 Vărvăreuca (retur) | R16 Florești (tur) / R32 Trifănești (retur) | 128.2 | = | = | 128.2 | 0 |
| 447ASB | Ciuciulea | 50 | R10 Ciuciulea | R27 Danu | 160.6 | = | = | 160.6 | 0 |
| 146BRAZ | Scăieni | 20 | R32 Trifănești | R32 Trifănești | 97.7 | = | = | 97.7 | 0 |
| 446ASB | Călugăr | 50 | R23 Scumpia | R23 Scumpia | 123.8 | = | = | 123.8 | 0 |
| 224BZP | Catranîc | 20 | R24 Catranîc | R36 Bocancea-Schit | 139 | = | = | 139 | 0 |
| 715IZX | Biruința | 50 | R21 Heciul Nou | R21 Heciul Nou | 44.7 | = | = | 44.7 | 0 |
| 402VKV | Hîjdieni | 50 | R9 Cobani | R9 Cobani | 135.2 | = | = | 135.2 | 0 |
| 041BRAU | Drăgănești | 20 | R20 Nicolaevca | R20 Nicolaevca | 83.6 | = | = | 83.6 | 0 |
| 206BZP | Rădoaia | 27 | R20 Rădoaia | R20 Rădoaia | 51.8 | = | = | 51.8 | 0 |
| 346KAJ | Țaul | 20 | — | R1 Dondușeni | 11.3 | = | = | 11.3 | 0 |
| 441ASB | Sturzovca | 50 | R11 Fundurii Vechi | R27 Sturzovca | 70.4 | = | = | 70.4 | 0 |
| 880RNK | Pelinia | 50 | R12 Pelinia | R12 Pelinia | 41.1 | = | = | 41.1 | 0 |
| 350KAJ | Florești | 20 | R16 Vărvăreuca | R16 Vărvăreuca | 76.4 | = | = | 76.4 | 0 |
| 710CWN | Petreni | 50 | R14 Dominteni | R14 Dominteni | 64.4 | = | = | 64.4 | 0 |
| 727CWN | Sturzovca | 50 | R27 Sturzovca | R27 Sturzovca | 59.1 | = | = | 59.1 | 0 |
| 293QVT | Cotiujenii Mari | 20 | — | R31 Cotiujenii Mari | 2.5 | = | = | 2.5 | 0 |
| 414ASB | Ciuciulea | 50 | — | R10 Ciuciulea | 3.7 | = | = | 3.7 | 0 |
| 826GXP | Dominteni | 50 | R14 Dominteni | — | 4.5 | = | = | 4.5 | 0 |
| 386PKP | Chiurt | 20 | — | R7 Ușurei | 87.6 | = | = | 87.6 | 0 |
| 549RNK | Edineț | 27 | R2 Stolniceni | R5 Aluniș (tur) / R2 Cupcini (retur) | 175.1 | = | = | 175.1 | 0 |
| 804MUM | Pământeni | 50 | R18 Putinești (tur) / R22 Țiplești (retur) | R22 Țiplești (doar turul) | 72.7 | = | = | 72.7 | 0 |
| 830MUM | Sîngerei | 50 | R19 Bilicenii Vechi | R19 Copăceni | 83.8 | R19 Bilicenii Vechi | R33 Iezărenii Vechi | 85 | 6.1 |
| 390ASB | Pelinia | 50 | R12 Sofia | R4 Grinăuți | 82 | R12 Sofia | R12 Sofia | 88.7 | 33.6 |
| 388ASB | Șuri | 50 | R15 Șuri | R12 Sofia | 148.7 | R15 Șuri | R3 Nihoreni | 166.7 | 90.0 |
| 713IZX | Florești | 50 | R17 Prajila | R17 Prajila | 112.4 | R17 Prajila | R30 Coșernița | 144 | 158.2 |

## 3. Controalele

| Control | 14.09 | 07.09 (probă, fără scriere) |
|---|---|---|
| Fiecare sarcină acoperită exact o dată | TRECE (67/67) | TRECE (72/72) |
| Capacitate (clasa liniei sau clasa mașinii de azi) + aceeași formă | TRECE | TRECE |
| Schimbul păstrat, nicio mașină cu două linii pe același schimb (pe construcție: un loc s1 + un loc s2) | TRECE | TRECE |
| Σ înainte − Σ după = economie = Σ lanțuri | TRECE (324,9 = 325,0) | TRECE (759,6 = 759,7) |
| După ≤ înainte | TRECE | TRECE |
| Model «înainte» ↔ km goi GPS din rând, ±5 % | **PICĂ: −24,6 %** (19.213 vs 25.485) | **PICĂ: −20,8 %** (20.545 vs 25.952) |
| Teste pe funcțiile pure (`test.mjs`: ziua cu/fără casă, ungar, cicluri, bucăți) | trec | — |

Proba 07.09 (`_ciorna/2026-09-07-ion107`, instantaneul ION-107, fără `--out`): 40 de mașini, 72 de sarcini, economie 759,6 km/săpt.
≈ 923 lei pe lanțurile cu normă; 4 lanțuri, primul are **10 mutări** pe s1 (−512 km) — corect ca optim, dar greu de povestit
(întrebarea 3).

### De ce modelul nu reproduce km goi GPS (±5 %) — pe bucățile zilei, 14.09

| Bucata zilei | Model | GPS (rând) | Diferența | Ce e |
|---|---|---|---|---|
| casă → prima cursă | 2.532 | 3.317 | −785 | drumul real mai lung decât cel mai scurt pe șosea + ocoale dimineața |
| ultima cursă → casă | 2.895 | 4.186 | −1.292 | idem + mașini care după ultima cursă mai umblă (024XKY −522, 804MUM −436, 744ARF −434 pe săpt.) |
| gol dimineață ts1 → ts2 | 6.564 | 7.188 | −624 | ~9 %: traseul real față de cel mai scurt, oprirea la Parc |
| gol seară rs1 → rs2 | 6.550 | 7.307 | −757 | ~10 %, idem |
| tur → retur la mașina de un schimb | 385 | 2.099 | −1.714 | șoferii care NU merg acasă umblă totuși ~40–75 km în cele 9 h (ex. 293QVT: model 12, GPS 403 pe săpt.) |
| tur s2 → retur s1 (~1 h la poartă) | 287 | 1.273 | −987 | ~10 km pe zi-mașină: Parcul, cealaltă poartă, alimentarea |
| alte goluri | 0 | 115 | −115 | zile cu forma neobișnuită |

Concluzia: modelul socotește doar drumul necesar (cel mai scurt pe șosea, după obiceiul mașinii); GPS mai are ~6.300 km/săpt. de
umblat care nu țin de linia pe care o face mașina (rămân aceiași oricine ar face linia) — deci nu intră în economie. Singura parte
care ar putea crește economia e factorul de traseu (GPS ≈ +10 % față de model pe golurile prin casă).
Nu am umflat cifra cu factorul; e întrebarea 4.

## 4. Ce nu se poate schimba și de ce

- **Mărimea economiei e mică prin natura ei.** Cu regula «merge acasă între schimburi», km goi ai unei mașini se despart pe schimburi
  (casă ↔ capătul liniei s1 + casă ↔ capătul liniei s2), deci «capetele diferite» nu costă în sine — costă doar distanța casă ↔
  capăt. Liniile sunt deja date în mare mașinilor din apropiere. Sensibilitatea pe 14.09: fără condiția de clasă 732,7 km/săpt.;
  fără condiția de formă 382,4; fără amândouă 866,2 — deci nici fără nicio restricție schimbul de linii nu trece de ~870 km/săpt.
  (4,5 % din golul flotei). Cei 2.696 km/săpt. din «Ce faci» (R1b + R3) vin din drumul pe acasă între schimburi și din așteptare;
  se rezolvă cu așteptarea lângă uzină / la capăt (R1 / R3), nu cu schimbul de linii.
- **925FTI** (Sărata Veche, R26 Ilenuța + R37 Musteața, 195 km goi/zi, al treilea după 345KAJ și 912RNK): nicio mașină de clasa 20
  nu stă mai aproape de Musteața/Ilenuța, deci optimul n-o mută. La fel 912RNK (Dumbrăvița), 345KAJ (Zăicani), 549RNK (Edineț):
  stau departe de toate capetele clasei lor.
- **Mașinile de un schimb rămân pe schimbul lor** (condiția din brief); mutarea unei mașini de pe s2 pe s1 ar schimba orele
  șoferului.
- **Formele «doar tur» / «doar retur»** (024XKY, 804MUM, 386PKP…) se schimbă doar între ele: altfel planul ar «economisi» jumătatea
  pe care GPS n-a văzut-o (în v1-ciornă, fără condiția asta, ieșea un fals lanț de −220 km: 744ARF lăsa o pereche întreagă și primea
  un tur de 3 zile).
- **Neregulatele** (29: curse o singură dată pe altă linie, sâmbăta 19.09, jumătăți rupte) rămân la mașina lor, nu intră în plan.

## 5. Ce poate strica cifra (pentru revizori)

1. Clasa mașinii e dedusă din liniile de azi (nu există locurile în bază); o mașină de 50 de locuri care face azi doar linii de 20
   e socotită 20 — restricția e mai strictă decât realitatea, niciodată mai laxă.
2. Obiceiul «merge acasă» e al mașinii, măsurat pe combinația de azi; cu altă linie șoferul ar putea face altfel.
3. Zilele se mută cu sarcina (o sarcină de 4 zile rămâne de 4 zile); diferențele de o zi între mașini sunt zgomot.
4. Optimalitatea: ungar pe schimb + schimburi două câte două; costul e aproape separabil pe schimburi (legătura doar prin golul
   poartă → poartă și obiceiuri), deci e optimul sau foarte aproape; nu e dovedit global (nu am rulat ILP).
5. Casa e cea din săptămână (725CWN: Sîngerei pe 14.09, Dacia pe 07.09) — planul se schimbă dacă se schimbă locul nopții.

## 6. Întrebări pentru Ion / revizori

1. **Obiectivul: km sau lei?** Normele sunt 6,35 – 12,42 lei/km; lanțul 3 câștigă 76 km dar mută 124 km pe 388ASB/390ASB (50 de
   locuri). Minimizăm km (cum e acum, brief) sau lei (km × norma mașinii; mașinile fără normă cu norma mediană a clasei)?
2. **Clasa**: e bine «clasa liniei sau clasa mașinii de azi», cu clasa mașinii dedusă? Sau Ion dă locurile reale ale celor 38 de
   mașini?
3. **Lanțurile lungi**: pe 07.09 optimul are un lanț de 10 mutări pe s1 (−512 km). Îl arătăm întreg, sau limităm lanțul la ≤ 3–4
   mașini (pierdem o parte din economie, dar se poate face)?
4. **Factorul de traseu**: raportăm economia pe cel mai scurt drum (325) sau corectată cu raportul GPS/model al golurilor prin casă
   (~+10 %)?
5. **Regula «merge acasă»**: o mașină care azi nu merge acasă între schimburi (casa departe: 549RNK din Edineț dimineața) —
   păstrăm obiceiul ei și după mutare (acum da)?

## 7. Forma câmpului pentru partea B (UI)

`planSchimb` (propunere; se scrie abia după revizie) = JSON-ul de mai jos, fără `modelVsGpsPeMasina`, `valhalla`, `rulat`:

```
{ sapt, pana, versiune,
  model: { unitate, km, goluri, clasa, pragLant },
  inainte: { kmGoiSapt }, dupa: { kmGoiSapt },
  economie: { kmSapt, leiSapt, leiNota, lanturiFaraLei, faraNorma: [m] },
  lanturi: [ { economieKmSapt, leiSapt|null, faraNorma: [m], masini: [m], peMasina: [ { m, kmSapt } ],
               mutari: [ { linie, tur, retur, schimb: 's1'|'s2', dela, la, zile } ], text } ],   // ordonate după economie
  deoparte: [ { economieKmSapt, text, mutari } ],
  masini: [ { m, casa, clasa, schimburi: 1|2, leiKm, acasa: { dim?, seara?, zi?, alt? }, acasaVot,
              inainte: { s1, s2, zile, kmGoiSapt, kmGoiZi }, dupa: { s1, s2, zile, kmGoiSapt, kmGoiZi } } ],
  neregulate: [ { m, schimb, sens?, linie?|tur?, retur?, zile, motiv } ], faraCasa: [m],
  control: { fiecareSarcinaOData, capacitate, schimbPastrat, oLiniePeSchimb, economie, modelVsGps: { …, peBucati } } }
```

`s1`/`s2` în `masini[]` sunt nume gata de afișat («R17 Prajila», «R32 Trifănești (tur) / R16 Vărvăreuca (retur)», «R14 Baroncea
(doar turul)»); `null` = mașina nu lucrează pe schimbul acela. `peMasina[].kmSapt` negativ = mașina merge mai puțin.
